import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { QueueProducerService } from '../queue/queue-producer.service.js';
import { ResourcesService } from '../resources/resources.service.js';
import { AntiChannelingService } from '../anti-channeling/anti-channeling.service.js';
import { AntiCounterfeitCodePolicy, isSignedAntiCounterfeitCodeCandidate, type AntiCounterfeitCodeAssessment } from '../common/anti-counterfeit-code.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';
import { PublicVerificationSecurityService } from './public-verification-security.service.js';
import { ServerGeolocationService, type TrustedGeoEvidence } from './server-geolocation.service.js';

@Injectable()
export class QueryService {
  private readonly memoryRateBuckets = new Map<string, { count: number; resetAt: number }>();
  private readonly tableColumnsCache = new Map<string, Set<string>>();
  private readonly codePolicy = new AntiCounterfeitCodePolicy();
  private readonly codeVault = new AntiCounterfeitCodeVault();


  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly queue: QueueProducerService,
    private readonly resources: ResourcesService,
    private readonly antiChanneling: AntiChannelingService,
    private readonly verificationSecurity: PublicVerificationSecurityService,
    private readonly serverGeolocation: ServerGeolocationService,
  ) {}

  private asRecord(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  }

  private firstValue(...values: unknown[]) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
  }


  private normalizeQueryCode(value: unknown): string {
    let raw = String(value || '').trim().replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (!raw) return '';
    for (let i = 0; i < 2; i += 1) {
      try {
        const decoded = decodeURIComponent(raw).trim();
        if (decoded === raw) break;
        raw = decoded;
      } catch {
        break;
      }
    }
    const embedded = raw.match(/(?:^|\/)(?:verify|v)\/([^?#\s]+)/i)
      || raw.match(/[?&#](?:code|anti_fake_code|antiFakeCode|q|barcode|sn|c)=([^&#\s]+)/i);
    if (embedded?.[1]) return this.normalizeQueryCode(embedded[1]);
    return raw.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  }

  private isFirstScanAllowed(status: unknown) {
    if (String(this.config.get('PUBLIC_QUERY_ACCEPT_UNACTIVATED') || process.env.PUBLIC_QUERY_ACCEPT_UNACTIVATED || 'true').toLowerCase() === 'false') return false;
    return Number(status ?? 0) === 0;
  }

  /**
   * 已经落库的历史短码仍然可以通过数据库精确匹配完成验真。
   *
   * 签名码策略用于约束新码发行和阻止伪造的数字签名码；如果生产环境
   * 仅关闭了“任意旧格式码”验证，却仍保留历史已发行短码，不能在查询前
   * 就把这些真实库存码全部拦截。严格切换完成后可显式设为 false。
   */
  private allowRegisteredLegacyCodes() {
    const value = this.config.get('ANTI_FAKE_ALLOW_REGISTERED_LEGACY_CODES')
      ?? process.env.ANTI_FAKE_ALLOW_REGISTERED_LEGACY_CODES;
    if (value === undefined || value === null || String(value).trim() === '') return true;
    return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
  }

  private isAntiChannelingEnabled(code: Record<string, any> | null | undefined) {
    const value = code?.anti_channeling_enabled;
    if (value === undefined || value === null || value === '') return true;
    if (typeof value === 'boolean') return value;
    return !['0', 'false', 'no', 'off', '关闭', '停用'].includes(String(value).trim().toLowerCase());
  }

  private productSnapshotFromCode(code: Record<string, any> | null | undefined) {
    if (!code) return null;
    const snapshot = {
      id: code.product_id || null,
      product_code: code.product_code || null,
      product_name: code.product_name || null,
      batch_no: code.batch_no || null,
      category: code.category || null,
      brand: code.brand || null,
      specification: code.specification || null,
      unit: code.unit || null,
      production_place: code.production_place || null,
      manufacturer: code.manufacturer || code.company_name || null,
      company_name: code.company_name || code.manufacturer || null,
    };
    return Object.values(snapshot).some((value) => value !== null && value !== '') ? snapshot : null;
  }

  private publicAntiChannelingAlert(alert: any) {
    if (!alert || typeof alert !== 'object') return null;
    return {
      alert_type: alert.alert_type || alert.alertType || null,
      severity: alert.severity ?? null,
      authorized_region: alert.authorized_region || alert.authorizedRegion || null,
      authorized_province: alert.authorized_province || alert.authorizedProvince || null,
      authorized_city: alert.authorized_city || alert.authorizedCity || null,
      actual_location: alert.actual_location || alert.actualLocation || null,
      actual_province: alert.actual_province || alert.actualProvince || null,
      actual_city: alert.actual_city || alert.actualCity || null,
    };
  }

  async preflight(rawCode: unknown) {
    const code = this.normalizeQueryCode(rawCode);
    if (!code) throw new HttpException('防伪码不能为空', HttpStatus.BAD_REQUEST);
    const record = await this.safeFindCodeByCode(code);
    return {
      code,
      exists: Boolean(record),
      anti_channeling_enabled: this.isAntiChannelingEnabled(record),
      location_required: Boolean(record) && this.isAntiChannelingEnabled(record),
    };
  }

  private async tableColumns(tableName: string): Promise<Set<string>> {
    const normalized = String(tableName || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!normalized) return new Set<string>();
    const cached = this.tableColumnsCache.get(normalized);
    if (cached) return cached;
    try {
      const rows = await this.prisma.$queryRawUnsafe(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        normalized,
      ) as Array<{ COLUMN_NAME: string }>;
      const columns = new Set<string>(rows.map((row: { COLUMN_NAME: string }) => String(row.COLUMN_NAME)));
      this.tableColumnsCache.set(normalized, columns);
      return columns;
    } catch {
      return new Set<string>();
    }
  }

  private async hasColumn(tableName: string, columnName: string) {
    return (await this.tableColumns(tableName)).has(columnName);
  }

  private async jsonColumnValue(tableName: string, columnName: string) {
    return await this.hasColumn(tableName, columnName) ? `\`${columnName}\`` : 'NULL';
  }

  private async safeRawFindOne(tableName: string, baseColumns: string[], optionalColumns: string[], whereSql: string, params: unknown[] = []): Promise<Record<string, any> | null> {
    const columns = await this.tableColumns(tableName);
    if (!columns.size) return null;
    const selected = [...baseColumns, ...optionalColumns].filter((column) => columns.has(column));
    if (!selected.length) return null;
    const safeTable = tableName.replace(/[^a-zA-Z0-9_]/g, '');
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT ${selected.map((column) => `\`${column}\``).join(', ')} FROM \`${safeTable}\` WHERE ${whereSql} LIMIT 1`,
      ...params,
    ).catch(() => []) as Array<Record<string, any>>;
    return rows[0] || null;
  }

  private async safeFindCodeByCode(code: string) {
    if (await this.hasColumn('anti_fake_codes', 'code_hash')) {
      const byHash = await this.safeRawFindOne('anti_fake_codes', [
        'id', 'product_id', 'code', 'batch_no', 'status', 'query_count', 'created_at', 'updated_at',
      ], [
        'code_hash', 'box_id', 'box_no', 'product_code', 'product_name', 'category', 'brand', 'specification', 'unit',
        'production_place', 'manufacturer', 'province_code', 'city_code', 'province_name', 'city_name',
        'region_group', 'warehouse', 'distributor', 'agent_id', 'agent_name', 'company_name', 'box_bound_at',
        'ownership_at', 'activated_at', 'expires_at', 'anti_channeling_enabled', 'first_query_at', 'last_query_at',
        'code_ciphertext', 'code_iv', 'code_tag', 'code_key_id',
      ], '`code_hash` = ?', [this.codePolicy.hash(code)]);
      if (byHash) return this.codeVault.hydrate(byHash);
    }
    const legacy = await this.safeRawFindOne('anti_fake_codes', [
      'id', 'product_id', 'code', 'batch_no', 'status', 'query_count', 'created_at', 'updated_at',
    ], [
      'box_id', 'box_no', 'product_code', 'product_name', 'category', 'brand', 'specification', 'unit',
      'production_place', 'manufacturer', 'province_code', 'city_code', 'province_name', 'city_name',
      'region_group', 'warehouse', 'distributor', 'agent_id', 'agent_name', 'company_name', 'box_bound_at',
      'ownership_at', 'activated_at', 'expires_at', 'anti_channeling_enabled', 'first_query_at', 'last_query_at',
      'code_hash', 'code_ciphertext', 'code_iv', 'code_tag', 'code_key_id',
    ], 'BINARY `code` = BINARY ?', [code]);
    return legacy ? this.codeVault.hydrate(legacy) : null;
  }

  private async safeFindCodeById(id: number) {
    const row = await this.safeRawFindOne('anti_fake_codes', [
      'id', 'product_id', 'code', 'batch_no', 'status', 'query_count', 'created_at', 'updated_at',
    ], [
      'box_id', 'box_no', 'product_code', 'product_name', 'category', 'brand', 'specification', 'unit',
      'production_place', 'manufacturer', 'province_code', 'city_code', 'province_name', 'city_name',
      'region_group', 'warehouse', 'distributor', 'agent_id', 'agent_name', 'company_name', 'box_bound_at',
      'ownership_at', 'activated_at', 'expires_at', 'anti_channeling_enabled', 'first_query_at', 'last_query_at',
      'code_hash', 'code_ciphertext', 'code_iv', 'code_tag', 'code_key_id',
    ], '`id` = ?', [id]);
    return row ? this.codeVault.hydrate(row) : null;
  }

  private async safeFindBoxByCodeOrId(code: string) {
    const numericId = Number(code);
    const where = Number.isFinite(numericId) ? '(`box_no` = ? OR `id` = ?)' : '`box_no` = ?';
    const params = Number.isFinite(numericId) ? [code, numericId] : [code];
    return this.safeRawFindOne('boxes', [
      'id', 'product_id', 'box_no', 'batch_no', 'box_capacity', 'box_spec', 'box_type', 'codes', 'status', 'created_at', 'updated_at',
    ], [
      'product_code', 'product_name', 'category', 'brand', 'specification', 'unit', 'production_place', 'manufacturer',
      'province_code', 'city_code', 'province_name', 'city_name', 'region_group', 'warehouse', 'distributor',
      'agent_id', 'agent_name', 'company_name', 'ownership_at',
    ], where, params);
  }

  private async safeFindBoxById(id: number) {
    return this.safeRawFindOne('boxes', [
      'id', 'product_id', 'box_no', 'batch_no', 'box_capacity', 'box_spec', 'box_type', 'codes', 'status', 'created_at', 'updated_at',
    ], [
      'product_code', 'product_name', 'category', 'brand', 'specification', 'unit', 'production_place', 'manufacturer',
      'province_code', 'city_code', 'province_name', 'city_name', 'region_group', 'warehouse', 'distributor',
      'agent_id', 'agent_name', 'company_name', 'ownership_at',
    ], '`id` = ?', [id]);
  }

  private async safeFindProductById(id: number) {
    return this.safeRawFindOne('products', [
      'id', 'product_code', 'product_name', 'batch_no', 'category', 'brand', 'specification', 'unit', 'description', 'image_url', 'extra_fields', 'status', 'created_at', 'updated_at',
    ], ['production_date', 'production_place', 'manufacturer', 'shelf_life'], '`id` = ?', [id]);
  }

  private async safeFindProductByCode(productCode: string) {
    return this.safeRawFindOne('products', [
      'id', 'product_code', 'product_name', 'batch_no', 'category', 'brand', 'specification', 'unit', 'description', 'image_url', 'extra_fields', 'status', 'created_at', 'updated_at',
    ], ['production_date', 'production_place', 'manufacturer', 'shelf_life'], '`product_code` = ?', [productCode]);
  }

  private async safeUpdateCodeQueryState(code: any, isReal: boolean, now: Date) {
    if (!code?.id) return code;
    const updates: string[] = [];
    const params: unknown[] = [];
    if (await this.hasColumn('anti_fake_codes', 'status')) {
      updates.push('`status` = ?');
      params.push(isReal ? 4 : (code.status ?? 0));
    }
    if (await this.hasColumn('anti_fake_codes', 'query_count')) updates.push('`query_count` = COALESCE(`query_count`, 0) + 1');
    if (await this.hasColumn('anti_fake_codes', 'activated_at') && isReal && !code.activated_at) {
      updates.push('`activated_at` = ?');
      params.push(now);
    }
    if (await this.hasColumn('anti_fake_codes', 'first_query_at') && !code.first_query_at) {
      updates.push('`first_query_at` = ?');
      params.push(now);
    }
    if (await this.hasColumn('anti_fake_codes', 'last_query_at')) {
      updates.push('`last_query_at` = ?');
      params.push(now);
    }
    if (await this.hasColumn('anti_fake_codes', 'updated_at')) updates.push('`updated_at` = CURRENT_TIMESTAMP(3)');
    if (updates.length) {
      await this.prisma.$executeRawUnsafe(`UPDATE \`anti_fake_codes\` SET ${updates.join(', ')} WHERE \`id\` = ?`, ...params, Number(code.id)).catch(() => undefined);
    }
    return await this.safeFindCodeById(Number(code.id)) || { ...code, query_count: Number(code.query_count || 0) + 1, first_query_at: code.first_query_at || now, last_query_at: now };
  }

  private async safeProductFromCacheOrDb(productId?: number | null) {
    if (!productId) return null;
    const productCacheKey = `product:${productId}`;
    const cachedProduct = await this.redis.get(productCacheKey).catch(() => null);
    if (cachedProduct) {
      try {
        const parsed = JSON.parse(cachedProduct);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch {
        await this.redis.del(productCacheKey).catch(() => undefined);
      }
    }
    const product = await this.safeFindProductById(Number(productId));
    if (product) await this.redis.set(productCacheKey, JSON.stringify(product), 'EX', 300).catch(() => undefined);
    return product;
  }

  private productStorageCondition(product: any = {}) {
    const extra = this.asRecord(product?.extra_fields);
    return this.firstValue(
      extra.storage_condition,
      extra.storage,
      extra['贮藏方法'],
      extra['贮存条件'],
      extra['储存条件'],
      extra['仓储条件'],
    );
  }

  private readonly scanRegionBoxes = [
    { province: '广东省', city: '广州市', location: '广东省广州市', minLat: 22.55, maxLat: 23.95, minLng: 112.75, maxLng: 114.15 },
    { province: '广东省', city: '深圳市', location: '广东省深圳市', minLat: 22.35, maxLat: 22.90, minLng: 113.75, maxLng: 114.65 },
    { province: '广东省', city: '佛山市', location: '广东省佛山市', minLat: 22.62, maxLat: 23.58, minLng: 112.35, maxLng: 113.40 },
    { province: '广东省', city: '东莞市', location: '广东省东莞市', minLat: 22.65, maxLat: 23.25, minLng: 113.50, maxLng: 114.25 },
    { province: '广东省', city: '中山市', location: '广东省中山市', minLat: 22.20, maxLat: 22.80, minLng: 113.10, maxLng: 113.75 },
    { province: '北京市', city: '北京市', location: '北京市', minLat: 39.40, maxLat: 41.10, minLng: 115.40, maxLng: 117.60 },
    { province: '上海市', city: '上海市', location: '上海市', minLat: 30.65, maxLat: 31.90, minLng: 120.80, maxLng: 122.15 },
    { province: '浙江省', city: '杭州市', location: '浙江省杭州市', minLat: 29.85, maxLat: 30.75, minLng: 119.70, maxLng: 120.75 },
    { province: '江苏省', city: '南京市', location: '江苏省南京市', minLat: 31.20, maxLat: 32.65, minLng: 118.25, maxLng: 119.25 },
    { province: '四川省', city: '成都市', location: '四川省成都市', minLat: 30.05, maxLat: 31.45, minLng: 103.40, maxLng: 104.65 },
    { province: '湖北省', city: '武汉市', location: '湖北省武汉市', minLat: 29.90, maxLat: 31.35, minLng: 113.55, maxLng: 115.10 },
    { province: '湖南省', city: '长沙市', location: '湖南省长沙市', minLat: 27.85, maxLat: 28.75, minLng: 112.45, maxLng: 113.45 },
    { province: '福建省', city: '厦门市', location: '福建省厦门市', minLat: 24.20, maxLat: 24.90, minLng: 117.85, maxLng: 118.45 },
  ];

  private normalizeNumber(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private regionFromCoordinates(latitude?: number, longitude?: number) {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return this.scanRegionBoxes.find((item) => latitude! >= item.minLat && latitude! <= item.maxLat && longitude! >= item.minLng && longitude! <= item.maxLng) || null;
  }

  private safeIpList(value: unknown) {
    const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[，,;；\s]+/) : [];
    return Array.from(new Set(list
      .map((item: any) => String(item || '').trim())
      .filter((item: string) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(item))
      .slice(0, 8)));
  }

  private cleanAdminPart(value: unknown) {
    return String(value ?? '')
      .trim()
      .replace(/[\s,，;；|｜/／>\-]+/g, '')
      .replace(/^(中国|中华人民共和国)/, '');
  }

  private stripAdminSuffix(value: unknown) {
    return this.cleanAdminPart(value).replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|自治州|地区|省|市|盟|州|区|县|旗|新区)$/g, '');
  }

  private normalizeDistrictName(value: unknown) {
    const text = this.cleanAdminPart(value).replace(/(.{2,})\1$/u, '$1');
    if (!text) return '';
    return /(区|县|市|旗|新区|林区|特区)$/.test(text) ? text : `${text}区`;
  }

  private sameAdminName(a: unknown, b: unknown) {
    const aa = this.stripAdminSuffix(a);
    const bb = this.stripAdminSuffix(b);
    return Boolean(aa && bb && (aa === bb || aa.includes(bb) || bb.includes(aa)));
  }

  private detailedRegionLocation(region: { province?: string; city?: string; location?: string } | null, ipProvince?: unknown, ipCity?: unknown, ipDistrict?: unknown) {
    if (!region) return '';
    const district = this.normalizeDistrictName(ipDistrict);
    const sameProvince = !ipProvince || this.sameAdminName(region.province, ipProvince);
    const sameCity = !ipCity || this.sameAdminName(region.city, ipCity);
    if (district && sameProvince && sameCity) return [region.province, region.city, district].filter(Boolean).join('');
    return region.location || [region.province, region.city].filter(Boolean).join('');
  }

  private normalizeClientLocation(data: {
    location?: string;
    province?: string;
    city?: string;
    district?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    location_source?: string;
    webrtc_local_ips?: string[];
    public_ip?: string;
    ip_location?: string;
    ip_province?: string;
    ip_city?: string;
    ip_district?: string;
    ip_adcode?: string;
    ip_isp?: string;
    ip_source?: string;
    ip_info?: Record<string, any> | string;
  }) {
    const latitude = this.normalizeNumber(data.latitude);
    const longitude = this.normalizeNumber(data.longitude);
    const accuracy = this.normalizeNumber(data.accuracy);
    const hasBrowserGps = Number.isFinite(latitude) && Number.isFinite(longitude);
    const region = this.regionFromCoordinates(latitude, longitude);
    const ipInfo = this.asRecord(data.ip_info);
    const rawIpProvince = String(data.ip_province || ipInfo.province || ipInfo.region || '').trim();
    const rawIpCity = String(data.ip_city || ipInfo.city || '').trim();
    const rawIpDistrict = String(data.district || data.ip_district || ipInfo.district || ipInfo.county || ipInfo.area || '').trim();
    const rawIpLocation = String(data.ip_location || ipInfo.location || [rawIpProvince, rawIpCity, rawIpDistrict].filter(Boolean).join('')).trim();
    const canonicalIp = this.antiChanneling.normalizeLocationParts({
      location: rawIpLocation,
      province: rawIpProvince,
      city: rawIpCity,
      district: rawIpDistrict,
    });
    const ipProvince = canonicalIp.province_name || rawIpProvince;
    const ipCity = canonicalIp.city_name || rawIpCity;
    const ipDistrict = canonicalIp.district_name || rawIpDistrict;
    const ipLocation = canonicalIp.location || rawIpLocation;
    const explicitLocation = String(data.location || '').trim();
    const suppliedSource = String(data.location_source || '').trim().toLowerCase();
    const gpsLocation = hasBrowserGps ? `GPS(${latitude!.toFixed(6)},${longitude!.toFixed(6)})` : '';
    const detailedGpsLocation = this.detailedRegionLocation(region, ipProvince, ipCity, ipDistrict);

    const canonicalClient = this.antiChanneling.normalizeLocationParts({
      location: explicitLocation || ipLocation,
      province: data.province || ipProvince,
      city: data.city || ipCity,
      district: data.district || ipDistrict,
    });

    const province = String(region?.province || (!hasBrowserGps ? canonicalClient.province_name : '') || '').trim();
    const city = String(region?.city || (!hasBrowserGps ? canonicalClient.city_name : '') || '').trim();
    const district = String(canonicalClient.district_name || ipDistrict || '').trim();
    const hasCompleteRegion = Boolean(province && city);
    const location = detailedGpsLocation
      || (hasBrowserGps ? gpsLocation : '')
      || canonicalClient.location
      || [province, city].filter(Boolean).join('');
    const inferredSource = region
      ? 'browser_gps'
      : hasBrowserGps
        ? 'browser_gps_unresolved'
        : suppliedSource === 'uapi_network_myip' && hasCompleteRegion
          ? 'uapi_network_myip'
          : suppliedSource === 'webrtc_local_ip'
            ? 'webrtc_local_ip'
            : ipLocation && hasCompleteRegion
              ? 'uapi_network_myip'
              : explicitLocation
                ? 'manual_or_url'
                : 'unknown';

    return {
      location,
      province,
      city,
      district,
      latitude,
      longitude,
      accuracy,
      location_source: String(inferredSource).slice(0, 64),
      webrtc_local_ips: this.safeIpList(data.webrtc_local_ips),
      public_ip: String(data.public_ip || ipInfo.ip || '').trim().slice(0, 64),
      ip_adcode: String(data.ip_adcode || ipInfo.adcode || '').trim().slice(0, 32),
      ip_isp: String(data.ip_isp || ipInfo.isp || '').trim().slice(0, 64),
      rectangle: undefined,
      bounds: undefined,
      ip_info: {
        ip: String(data.public_ip || ipInfo.ip || '').trim().slice(0, 64),
        province: ipProvince.slice(0, 64),
        city: ipCity.slice(0, 64),
        district: district.slice(0, 64),
        location: ipLocation.slice(0, 128),
        adcode: String(data.ip_adcode || ipInfo.adcode || '').trim().slice(0, 32),
        rectangle: '',
        bounds: undefined,
        isp: String(data.ip_isp || ipInfo.isp || '').trim().slice(0, 64),
        source: String(data.ip_source || ipInfo.source || 'uapi_network_myip').slice(0, 64),
      },
    };
  }

  private normalizeIp(value: unknown) {
    const raw = String(value || '').trim().replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '');
    return isIP(raw) ? raw.toLowerCase() : '';
  }

  private isPublicIp(value: string) {
    if (!value) return false;
    if (value.includes(':')) return !/^(::1|fc|fd|fe80:)/i.test(value);
    const octets = value.split('.').map(Number);
    if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return false;
    return !(octets[0] === 0
      || octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168));
  }

  private uapiLocationEvidence(client: ReturnType<QueryService['normalizeClientLocation']>, requestIp?: string) {
    const source = String(client.location_source || '').trim().toLowerCase();
    const provider = String(client.ip_info?.source || '').trim().toLowerCase();
    const reportedIp = this.normalizeIp(client.public_ip || client.ip_info?.ip);
    const requestIpNormalized = this.normalizeIp(requestIp);
    const hasCompleteRegion = Boolean(client.province && client.city);
    const isUapiMyIp = source === 'uapi_network_myip' && (!provider || provider === 'uapi_network_myip');
    if (!isUapiMyIp || !reportedIp || !hasCompleteRegion) return null;
    // The verification page requests UAPI directly from the visitor's browser. Its API
    // request can nevertheless use another egress path (IPv4/IPv6, carrier routing,
    // or a reverse proxy), so an IP mismatch is retained for audit only. It must not
    // turn an otherwise complete UAPI province/city result into a false denial.
    const requestIpBinding = !requestIpNormalized || !this.isPublicIp(requestIpNormalized)
      ? 'unavailable'
      : requestIpNormalized === reportedIp
        ? 'matched'
        : 'mismatched';
    return {
      ...client,
      verified: true as const,
      trust_level: 'uapi_network_myip' as const,
      provider: 'uapis.cn',
      request_ip_binding: requestIpBinding,
      auxiliary: false as const,
    };
  }

  private selectLocationEvidence(client: ReturnType<QueryService['normalizeClientLocation']>, trusted: TrustedGeoEvidence | null, requestIp?: string) {
    const clientReported = {
      ...client,
      verified: false as const,
      trust_level: 'unverified_client' as const,
      auxiliary: true as const,
    };
    if (!trusted) return this.uapiLocationEvidence(client, requestIp) || clientReported;

    return {
      location: trusted.location,
      province: trusted.province,
      city: trusted.city,
      district: trusted.district || '',
      latitude: trusted.latitude,
      longitude: trusted.longitude,
      accuracy: undefined,
      location_source: trusted.source,
      verified: true as const,
      trust_level: trusted.trust_level,
      provider: trusted.provider,
      public_ip: trusted.ip,
      ip_adcode: trusted.adcode || '',
      rectangle: trusted.rectangle,
      bounds: trusted.bounds,
      ip_info: {
        ip: trusted.ip,
        province: trusted.province,
        city: trusted.city,
        district: trusted.district || '',
        location: trusted.location,
        country: trusted.country || '',
        country_code: trusted.country_code || '',
        adcode: trusted.adcode || '',
        rectangle: trusted.rectangle || '',
        bounds: trusted.bounds,
        source: trusted.source,
        provider: trusted.provider || '',
      },
      // Browser GPS/UAPI/WebRTC values remain available for audit and correlation only.
      client_reported: clientReported,
      webrtc_local_ips: client.webrtc_local_ips,
    };
  }

  private hitMemoryLimit(key: string, limit: number, windowSeconds: number) {
    const now = Date.now();
    const current = this.memoryRateBuckets.get(key);
    if (!current || current.resetAt <= now) {
      this.memoryRateBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      // 轻量清理，防止长期运行 Map 增长。
      if (this.memoryRateBuckets.size > 20000) {
        for (const [bucketKey, bucket] of this.memoryRateBuckets.entries()) {
          if (bucket.resetAt <= now) this.memoryRateBuckets.delete(bucketKey);
        }
      }
      return false;
    }
    current.count += 1;
    return current.count > limit;
  }

  private async hitLimit(key: string, limit: number, windowSeconds: number) {
    try {
      const count = await this.redis.incr(key);
      if (count === 1) await this.redis.expire(key, windowSeconds);
      return count > limit;
    } catch {
      // Redis 短暂不可用时不让扫码查询卡死；降级为进程内限流。
      return this.hitMemoryLimit(key, limit, windowSeconds);
    }
  }

  private async recordSecurityEvent(eventType: string, code: string, meta: { ip?: string; deviceId?: string }, reason: string, payload: Record<string, any> = {}) {
    await this.prisma.riskEvent.create({
      data: {
        event_type: eventType.slice(0, 64),
        code: this.codePolicy.hash(code),
        ip: meta.ip ? this.codePolicy.hash(meta.ip) : null,
        device_id: meta.deviceId ? this.codePolicy.hash(meta.deviceId) : null,
        reason: reason.slice(0, 255),
        payload,
      },
    }).catch(() => undefined);
  }

  private async guardRateLimit(code: string, ip?: string, deviceId?: string) {
    const publicLimit = Number(this.config.get('PUBLIC_QUERY_LIMIT', 30));
    const codeLimit = Number(this.config.get('CODE_QUERY_LIMIT', 10));
    const deviceLimit = Number(this.config.get('DEVICE_QUERY_LIMIT', 40));
    const windowSeconds = Number(this.config.get('PUBLIC_QUERY_WINDOW_SECONDS', 60));
    const codeKey = this.codePolicy.hash(code);
    const ipKey = ip ? this.codePolicy.hash(ip) : '';
    const deviceKey = deviceId ? this.codePolicy.hash(deviceId) : '';
    if (ipKey && await this.hitLimit(`rl:scan:ip:${ipKey}`, publicLimit, windowSeconds)) {
      await this.recordSecurityEvent('PUBLIC_QUERY_RATE_LIMIT', code, { ip, deviceId }, 'IP 查询频率超过阈值', { scope: 'ip', window_seconds: windowSeconds, limit: publicLimit });
      throw new HttpException('扫码过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (deviceKey && await this.hitLimit(`rl:scan:device:${deviceKey}`, deviceLimit, windowSeconds)) {
      await this.recordSecurityEvent('PUBLIC_QUERY_RATE_LIMIT', code, { ip, deviceId }, '设备查询频率超过阈值', { scope: 'device', window_seconds: windowSeconds, limit: deviceLimit });
      throw new HttpException('当前设备查询过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (await this.hitLimit(`rl:scan:code:${codeKey}`, codeLimit, Number(this.config.get('CODE_QUERY_WINDOW_SECONDS', 60)))) {
      await this.recordSecurityEvent('PUBLIC_QUERY_RATE_LIMIT', code, { ip, deviceId }, '单码查询频率超过阈值', { scope: 'code', limit: codeLimit });
      throw new HttpException('该防伪码查询过于频繁，请稍后再试', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private normalizeTraceChain(value: any): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return typeof value === 'object' ? Object.values(value) : [];
  }

  private traceSortTime(node: any) {
    const raw = node?.timestamp || node?.time || node?.created_at || node?.process_time || node?.date;
    const value = raw ? new Date(raw).getTime() : 0;
    return Number.isNaN(value) ? 0 : value;
  }

  private latestTraceChain(value: any): any[] {
    const list = this.normalizeTraceChain(value).filter((item) => item && typeof item === 'object');
    if (!list.length) return [];
    return [[...list].sort((a, b) => this.traceSortTime(b) - this.traceSortTime(a))[0]];
  }

  async qrcodeSvg(code: string, requestHost?: string) {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) throw new HttpException('防伪码不能为空', HttpStatus.BAD_REQUEST);
    const verifyUrl = this.buildVerifyUrl(normalizedCode, {}, requestHost);
    return QRCode.toString(verifyUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 280 });
  }

  buildVerifyUrl(code?: string, options: { channel?: string; location?: string } = {}, requestHost?: string) {
    let frontendBase = String(
      this.config.get('PUBLIC_FRONTEND_BASE_URL')
      || this.config.get('FRONTEND_BASE_URL')
      || this.config.get('WEB_BASE_URL')
      || '',
    ).replace(/\/+$/, '');
    if (!frontendBase && requestHost) frontendBase = requestHost;
    const verifyPath = `/${String(this.config.get('VERIFY_PAGE_PATH') || '/verify').replace(/^\/+|\/+$/g, '')}`;
    const safeCode = String(code || '').trim();
    const params = new URLSearchParams();
    if (options.channel) params.set('channel', String(options.channel));
    if (options.location) params.set('location', String(options.location));
    const query = params.toString();
    return `${frontendBase}${verifyPath}${safeCode ? `/${encodeURIComponent(safeCode)}` : ''}${query ? `?${query}` : ''}`;
  }

  async query(data: {
    code: string;
    channel?: string;
    location?: string;
    province?: string;
    city?: string;
    district?: string;
    device_id?: string;
    device_integrity?: string;
    jailbroken?: boolean;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    location_source?: string;
    webrtc_local_ips?: string[];
    public_ip?: string;
    ip_location?: string;
    ip_province?: string;
    ip_city?: string;
    ip_district?: string;
    ip_adcode?: string;
    ip_isp?: string;
    ip_source?: string;
    ip_info?: Record<string, any> | string;
  }, meta: { ip?: string; userAgent?: string; headers?: Record<string, unknown>; remoteAddress?: string }) {
    data.code = this.normalizeQueryCode(data.code);
    if (!data.code) throw new HttpException('防伪码不能为空', HttpStatus.BAD_REQUEST);
    await this.guardRateLimit(data.code, meta.ip, data.device_id);
    await this.verificationSecurity.enforceBehavior(data.code, { ip: meta.ip, deviceId: data.device_id });

    const signature: AntiCounterfeitCodeAssessment = this.codePolicy.assess(data.code);
    const signedFormatCandidate = isSignedAntiCounterfeitCodeCandidate(data.code);
    if (!signature.accepted && signedFormatCandidate) {
      await this.recordSecurityEvent(
        'INVALID_CODE_SIGNATURE',
        data.code,
        { ip: meta.ip, deviceId: data.device_id },
        signature.reason,
        { signed_format: signature.signed, kid: signature.kid || null },
      );
    }

    // 防伪码查询次数不能使用缓存中的 query_count，否则短时间内多次查询会一直显示 1。
    const allowRegisteredLegacy = !signedFormatCandidate && this.allowRegisteredLegacyCodes();
    // 生产环境可以拒绝“任意旧格式码”，但已登记且能在数据库中精确命中的
    // 历史码仍应支持平滑过渡。带签名格式前缀但验签无效的码绝不进入兼容分支。
    const code = (signature.accepted || allowRegisteredLegacy)
      ? await this.safeFindCodeByCode(data.code)
      : null;
    const registeredLegacyAccepted = Boolean(code && !signedFormatCandidate && !signature.accepted && allowRegisteredLegacy);
    const codeAccepted = signature.accepted || registeredLegacyAccepted;
    const numericBoxId = Number(code?.box_id ?? 0);
    const linkedBox = numericBoxId > 0 ? await this.safeFindBoxById(numericBoxId) : null;
    const box = code ? linkedBox : signedFormatCandidate ? null : await this.safeFindBoxByCodeOrId(data.code);
    const scannedProduct = code || box || signedFormatCandidate ? null : await this.safeFindProductByCode(data.code);

    let product: any = scannedProduct || null;
    const productId = code?.product_id ?? box?.product_id ?? scannedProduct?.id;
    if (productId) product = await this.safeProductFromCacheOrDb(Number(productId));

    const isBoxCode = Boolean(!code && box);
    const isProductCode = Boolean(!code && !box && scannedProduct);
    const now = new Date();
    const expiresAt = code?.expires_at ? new Date(code.expires_at) : null;
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const isExpired = Boolean(expiresAt && expiresAt.getTime() < todayStart.getTime());
    const codeStatus = Number(code?.status ?? 0);
    // 兼容历史/导入数据：部分旧码没有经过“激活”动作，首次消费者扫码时状态为 0。
    // 这类已建档且未过期的码应在首次扫码时自动转为“已查询”，避免第一次访问被误判为无效码。
    const isReal = Boolean((code && codeAccepted && ([1, 4].includes(codeStatus) || this.isFirstScanAllowed(codeStatus)) && !isExpired) || isBoxCode || isProductCode);
    let queryCount = 0;
    let firstQueryAt: Date | null = null;
    let updatedCode: any = code;

    if (code) {
      updatedCode = await this.safeUpdateCodeQueryState(code, isReal, now);
      queryCount = Number(updatedCode.query_count || 0);
      firstQueryAt = updatedCode.first_query_at || null;
    }

    // 仪表盘、查询日志和风控需要“查询发生后立即可见”。
    // 旧逻辑只把日志丢给 BullMQ，生产环境如果没有单独启动 worker，
    // 防伪码状态会变成“已查询”，但 query_logs 没有记录，导致首页趋势图一直是 0。
    // 这里改为同步落库；即使队列/Redis 未启动，扫码结果和统计看板也会马上更新。
    // Server GeoIP/edge evidence takes priority. If unavailable, use the browser's direct UAPI
    // myip result only after its returned public IP matches this API request.
    const clientLocation = this.normalizeClientLocation(data);
    const trustedLocation = await this.serverGeolocation.resolve(meta.ip, {
      headers: meta.headers,
      remoteAddress: meta.remoteAddress,
    }).catch(() => null);
    const locationEvidence = this.selectLocationEvidence(clientLocation, trustedLocation, meta.ip);
    const scanLocation = locationEvidence.location;
    await this.prisma.queryLog.create({
      data: {
        code: this.codeVault.reference(data.code),
        result: isReal ? 1 : 0,
        channel: data.channel || 'web',
        location: scanLocation || undefined,
        location_source: locationEvidence.location_source,
        location_verified: locationEvidence.verified === true,
        ip: meta.ip || undefined,
        user_agent: meta.userAgent || null,
        query_count: queryCount,
      },
    }).catch(() => undefined);

    const localTodayStart = new Date(now);
    localTodayStart.setHours(0, 0, 0, 0);
    const queryCodeReference = this.codeVault.reference(data.code);
    const todayQueryCount = await this.prisma.queryLog.count({
      where: {
        code: { in: Array.from(new Set([queryCodeReference, data.code])) },
        created_at: { gte: localTodayStart },
      },
    }).catch(() => 0);

    let trace: any = null;
    let traceChain: any[] = [];
    const queryTraceData = {
      node_type: '查询',
      content: `${isBoxCode ? '箱码' : isProductCode ? '产品码' : '防伪码'}扫码查询：${isExpired ? '防伪码已过期' : isReal ? '验证通过' : '验证未通过'}`,
      anti_fake_code: updatedCode?.code || null,
      code_status: updatedCode?.status ?? null,
      query_count: queryCount,
      product_id: product?.id || productId || null,
      product_code: product?.product_code || null,
      product_name: product?.product_name || null,
      batch_no: updatedCode?.batch_no || box?.batch_no || null,
      box_id: box?.id || updatedCode?.box_id || null,
      box_no: box?.box_no || updatedCode?.box_no || null,
      channel: data.channel || 'web',
      location: scanLocation || undefined,
      ip: meta.ip || undefined,
      user_agent: meta.userAgent || '',
      detail: {
        result: isReal ? 1 : 0,
        expired: isExpired,
        expires_at: expiresAt,
        first_query_at: firstQueryAt,
        queried_at: now,
        client_location: locationEvidence,
      },
    };

    if (updatedCode) {
      const traces = await this.resources.recordTraceForCodes([updatedCode], '防伪查询', queryTraceData).catch(() => []);
      trace = traces.find((item: any) => String(item.anti_fake_code) === String(updatedCode.code)) || traces[0] || null;
      traceChain = Array.isArray(trace?.trace_chain) ? trace.trace_chain : [];
    } else if (box) {
      const boxTrace = await this.resources.recordBoxTraceEvent(box, '箱码查询', queryTraceData).catch(() => ({ product: null, traces: [], trace_chain: [] })) as any;
      trace = boxTrace.product || boxTrace.traces?.[0] || null;
      traceChain = Array.isArray(boxTrace.trace_chain) ? boxTrace.trace_chain : [];
    } else if (scannedProduct) {
      trace = await this.resources.recordProductTraceEvent(scannedProduct, '产品扫码查询', queryTraceData).catch(() => null);
      traceChain = Array.isArray(trace?.trace_chain) ? trace.trace_chain : [];
    }

    const firstTemplateFields = traceChain
      .map((node: any) => node?.detail?.template_fields)
      .find((item: any) => item && typeof item === 'object');
    // 历史码可能只保存了产品快照而没有有效 product_id。发货前仍应正常展示这些产品资料。
    const productForDisplay = product || this.productSnapshotFromCode(updatedCode || box);
    const enrichedProduct = productForDisplay ? {
      ...productForDisplay,
      origin_place: firstTemplateFields?.origin_place || productForDisplay.production_place || null,
      raw_material: firstTemplateFields?.raw_material || null,
      production_standard: firstTemplateFields?.production_standard || null,
      qualification: firstTemplateFields?.qualification || null,
      storage_condition: firstTemplateFields?.storage_condition || this.productStorageCondition(productForDisplay) || null,
      shelf_life: firstTemplateFields?.shelf_life || productForDisplay.shelf_life || null,
      trace_auto_template: firstTemplateFields || null,
    } : productForDisplay;

    // 防窜开关属于单个防伪码。箱码、产品码和未知输入都不能被消费者端误标为“已开启防窜”。
    const antiChannelingEnabled = Boolean(updatedCode && this.isAntiChannelingEnabled(updatedCode));
    const antiChannelingContext = {
      code: data.code,
      code_type: updatedCode ? 'anti_fake_code' : isBoxCode ? 'box' : isProductCode ? 'product' : 'anti_fake_code',
      channel: data.channel || 'web',
      location: scanLocation || undefined,
      province: locationEvidence.province || undefined,
      city: locationEvidence.city || undefined,
      district: locationEvidence.district || undefined,
      latitude: locationEvidence.latitude,
      longitude: locationEvidence.longitude,
      accuracy: locationEvidence.accuracy,
      adcode: locationEvidence.ip_adcode || locationEvidence.ip_info?.adcode || undefined,
      rectangle: locationEvidence.rectangle || locationEvidence.ip_info?.rectangle || undefined,
      bounds: locationEvidence.bounds || locationEvidence.ip_info?.bounds || undefined,
      location_source: locationEvidence.location_source,
      location_verified: locationEvidence.verified === true,
      webrtc_local_ips: locationEvidence.webrtc_local_ips,
      ip: meta.ip || undefined,
      userAgent: meta.userAgent || '',
      device_id: data.device_id || undefined,
      device_integrity: data.device_integrity || undefined,
      jailbroken: data.jailbroken === true,
      is_real: isReal,
      signature_verified: signature.accepted && signature.signed,
      legacy_code: Boolean(code && !signedFormatCandidate && (signature.accepted || registeredLegacyAccepted)),
      signature_status: signature.accepted
        ? (signature.signed ? 'verified' : 'legacy')
        : registeredLegacyAccepted
          ? 'registered_legacy'
          : signature.reason.toLowerCase(),
      query_count: queryCount,
      anti_fake_code: updatedCode || undefined,
      box,
      product,
    };
    const authorizationDecision = updatedCode
      ? await this.antiChanneling.resolveCodeAuthorization(antiChannelingContext).catch(() => ({
          enabled: antiChannelingEnabled,
          required: antiChannelingEnabled && Boolean(box),
          state: box ? 'boxed' : (antiChannelingEnabled ? 'unboxed' : 'disabled'),
          status: box && antiChannelingEnabled ? 'authorization_unresolved' : 'not_required',
          content_access_granted: !(box && antiChannelingEnabled),
        }))
      : {
          enabled: false,
          required: false,
          state: 'not_applicable',
          status: 'not_required',
          content_access_granted: true,
        };
    // 只有开启防窜校验且已发货的防伪码才需要位置授权验证。
    // 未发货（包括已装箱）或关闭防窜校验时直接授予内容访问权限。
    const locationAuthorizationRequired = Boolean(isReal && authorizationDecision.required);
    const contentAccessGranted = Boolean(isReal && (!locationAuthorizationRequired || authorizationDecision.content_access_granted === true));
    const authorizationDenied = Boolean(isReal && locationAuthorizationRequired && !contentAccessGranted);
    // 只对以下情况进行风险评估：
    // 1. 非防伪码查询（箱码、产品码等）
    // 2. 防伪码已发货且开启防窜校验（需要位置授权）
    // 3. 假码扫描
    const shouldEvaluateRisk = Boolean(!updatedCode && !isBoxCode && !isProductCode)
      || Boolean(updatedCode && (locationAuthorizationRequired || !isReal));
    const riskEvaluation = shouldEvaluateRisk
      ? await this.antiChanneling.evaluateScan(antiChannelingContext).catch(() => ({ alert_count: 0, alerts: [] }))
      : {
          enabled: antiChannelingEnabled,
          skipped: true,
          reason: authorizationDecision.state === 'disabled'
            ? 'code_anti_channeling_disabled'
            : authorizationDecision.state === 'unboxed'
            ? 'anti_channeling_not_required_before_shipment'
            : authorizationDecision.state === 'boxed'
            ? 'anti_channeling_not_required_before_shipment'
            : 'not_applicable',
          alert_count: 0,
          alerts: [],
        };
    // 关闭防窜或未发货都不形成授权位置；仅发货后返回收货代理商所属地区。
    const shipmentAuthorization = locationAuthorizationRequired
      ? await this.antiChanneling.resolveShipmentAuthorization(antiChannelingContext).catch(() => null)
      : null;

    const allRiskAlerts = Array.isArray((riskEvaluation as any)?.alerts) ? (riskEvaluation as any).alerts : [];
    // 消费者页只呈现本次位置授权结果。历史多地轨迹、设备和频率风险仍保留在后台预警，
    // 但不能把“当前位置已授权”的访问误展示成当前位置越区。
    const publicChannelingAlertTypes = new Set([
      'geo_mismatch',
      'location_unverified',
    ]);
    const antiChannelingAlerts = isReal && locationAuthorizationRequired
      ? allRiskAlerts
          .filter((alert: any) => publicChannelingAlertTypes.has(String(alert?.alert_type || alert?.alertType || '').trim()))
          .map((alert: any) => this.publicAntiChannelingAlert(alert))
          .filter(Boolean)
      : [];
    const antiChannelingAlertCount = antiChannelingAlerts.length;
    const antiChanneling = {
      ...(riskEvaluation as any),
      enabled: antiChannelingEnabled,
      required: locationAuthorizationRequired,
      state: authorizationDecision.state,
      authorization_status: authorizationDecision.status,
      content_access_granted: contentAccessGranted,
      alert_count: antiChannelingAlertCount,
      alerts: antiChannelingAlerts,
    };
    const primaryAntiChannelingAlert = antiChannelingAlerts.find(Boolean) || null;
    const authorizedRegionText = String(primaryAntiChannelingAlert?.authorized_region || shipmentAuthorization?.authorized_region || '').trim();
    const actualLocationText = String(primaryAntiChannelingAlert?.actual_location || primaryAntiChannelingAlert?.actualLocation || scanLocation || '').trim();
    const primaryAlertType = String(primaryAntiChannelingAlert?.alert_type || primaryAntiChannelingAlert?.alertType || '');
    const antiChannelingMessage = authorizationDenied || (isReal && locationAuthorizationRequired && antiChannelingAlertCount > 0)
      ? authorizationDecision.status === 'authorization_unresolved'
        ? '防窜授权位置未配置：请联系官方客服核验购买渠道，产品详情暂不展示。'
        : primaryAlertType === 'location_unverified' || authorizationDecision.status === 'location_unverified'
        ? [
            '位置待核验：本次扫码未能通过网络取得可用于授权核验的行政区。',
            authorizedRegionText ? `授权区域：${authorizedRegionText}。` : '',
            actualLocationText ? `采集位置：${actualLocationText}。` : '',
            '请检查网络后重新扫码；位置核验通过前暂不展示产品详情。',
          ].filter(Boolean).join('')
        : [
            '防窜货预警：本次扫码位置与该码授权销售区域不一致。',
            authorizedRegionText ? `授权区域：${authorizedRegionText}。` : '',
            actualLocationText ? `扫码位置：${actualLocationText}。` : '',
            `系统已记录 ${Math.max(antiChannelingAlertCount, 1)} 条预警，产品详情暂不展示，请联系官方客服核验购买渠道。`,
          ].filter(Boolean).join('')
      : '';
    const publicShipmentAuthorization = !shipmentAuthorization || contentAccessGranted
      ? shipmentAuthorization
      : {
          authorized_region: shipmentAuthorization.authorized_region || null,
          province_name: shipmentAuthorization.province_name || null,
          city_name: shipmentAuthorization.city_name || null,
          source: shipmentAuthorization.source || null,
          source_label: shipmentAuthorization.source_label || null,
          authorization_state: shipmentAuthorization.authorization_state || authorizationDecision.state,
          authorization_status: shipmentAuthorization.authorization_status || authorizationDecision.status,
        };
    const hasPublicChannelingRisk = Boolean(isReal && locationAuthorizationRequired && (authorizationDenied || antiChannelingAlertCount > 0));

    return {
      is_real: isReal,
      anti_channeling_enabled: antiChannelingEnabled,
      location_authorization_required: locationAuthorizationRequired,
      authorization_state: authorizationDecision.state,
      authorization_status: authorizationDecision.status,
      content_access_granted: contentAccessGranted,
      is_channeling_risk: hasPublicChannelingRisk,
      risk_level: hasPublicChannelingRisk ? 'anti_channeling' : (isReal ? 'normal' : 'invalid'),
      risk_message: antiChannelingMessage || null,
      query_count: queryCount,
      today_query_count: typeof todayQueryCount === 'number' ? todayQueryCount : queryCount,
      first_query_time: firstQueryAt,
      last_query_time: now,
      expires_at: updatedCode?.expires_at || null,
      is_expired: isExpired,
      product: contentAccessGranted ? enrichedProduct : null,
      box: contentAccessGranted ? box : null,
      trace: contentAccessGranted ? trace : null,
      trace_no: contentAccessGranted ? trace?.trace_no || null : null,
      batch_no: contentAccessGranted ? updatedCode?.batch_no || box?.batch_no || trace?.batch_no : null,
      box_no: contentAccessGranted ? box?.box_no || updatedCode?.box_no : null,
      code_owner: contentAccessGranted && updatedCode ? {
        // 产品所属公司始终是制造商/品牌主体，不能被发货代理商覆盖。
        product_code: updatedCode.product_code || null,
        product_name: updatedCode.product_name || null,
        category: updatedCode.category || null,
        brand: updatedCode.brand || null,
        company_name: updatedCode.company_name || updatedCode.manufacturer || null,
        manufacturer: updatedCode.manufacturer || null,
      } : null,
      shipment_authorization: publicShipmentAuthorization,
      trace_chain: contentAccessGranted ? this.latestTraceChain(traceChain) : [],
      scan_location: locationEvidence,
      anti_channeling: antiChanneling,
      message: antiChannelingMessage || (isBoxCode
        ? '箱码验证通过，当前箱子为官方建档箱码，已自动同步箱内产品溯源。'
        : isProductCode
          ? '产品信息验证通过，已自动生成产品溯源链路。'
          : (isExpired ? '该防伪码已超过有效期，请结合产品包装和渠道信息谨慎核验，查询记录已留痕。' : isReal ? '恭喜，这是正品，产品/防伪码溯源已自动记录。' : '未查询到有效防伪码，请谨慎核验，查询记录已留痕。')),
    };
  }
}
