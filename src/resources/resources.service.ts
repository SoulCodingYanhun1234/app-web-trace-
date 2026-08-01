import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import QRCode from 'qrcode';
import { ConfigService } from '@nestjs/config';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service.js';
import { QueueProducerService } from '../queue/queue-producer.service.js';
import { pageParams, pickAllowed, safeId, safeJsonArray, safeText } from '../common/utils.js';
import { prefixForField, resourceMap } from './resource-map.js';
import { AntiChannelingService } from '../anti-channeling/anti-channeling.service.js';
import { selectAntiChannelingCandidates } from '../anti-channeling/automation-policy.js';
import { createLabeledQrSvg } from '../common/labeled-qrcode.js';
import { AntiCounterfeitCodePolicy } from '../common/anti-counterfeit-code.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 16);

const MAX_SCAN_CODE_LENGTH = 128;
const MAX_SCAN_URL_LENGTH = 2048;
const RAW_CODE_PREFIX_RE = /^(?:code|qr|sn|barcode|anti[-_]?fake[-_]?code|antiFakeCode|box|carton|ship|shipment|return|trace|region|防伪码|二维码|箱码|物流单号)[:：=]/i;
const KNOWN_CITY_ALIASES = [
  '广州', '深圳', '清远', '佛山', '东莞', '中山', '珠海', '惠州', '江门', '肇庆', '汕头', '汕尾', '湛江', '茂名', '韶关', '梅州', '河源', '阳江', '潮州', '揭阳', '云浮',
  '北京', '上海', '天津', '重庆', '成都', '杭州', '南京', '苏州', '武汉', '长沙', '郑州', '西安', '青岛', '济南', '厦门', '福州', '南宁', '海口', '昆明', '贵阳', '南昌', '合肥', '石家庄', '太原', '沈阳', '大连', '长春', '哈尔滨', '呼和浩特', '银川', '兰州', '西宁', '乌鲁木齐', '拉萨'
];

// AI 自动化与溯源续写只读取实际需要的防伪码字段。
// 旧数据库若尚未补齐 code_hash/prefix 等增强字段，也不会因为 Prisma 默认 SELECT 全字段而整批失败。
const ANTI_FAKE_CODE_TRACE_SELECT = {
  id: true,
  product_id: true,
  code: true,
  code_hash: true,
  code_ciphertext: true,
  code_iv: true,
  code_tag: true,
  code_key_id: true,
  batch_no: true,
  status: true,
  anti_channeling_enabled: true,
  query_count: true,
  box_id: true,
  box_no: true,
  product_code: true,
  product_name: true,
  category: true,
  brand: true,
  specification: true,
  unit: true,
  production_place: true,
  manufacturer: true,
  province_code: true,
  city_code: true,
  province_name: true,
  city_name: true,
  region_group: true,
  warehouse: true,
  distributor: true,
  agent_id: true,
  agent_name: true,
  company_name: true,
  box_bound_at: true,
  ownership_at: true,
  activated_at: true,
  expires_at: true,
  first_query_at: true,
  last_query_at: true,
  created_at: true,
  updated_at: true,
} as const;



@Injectable()
export class ResourcesService {
  private readonly logger = new Logger(ResourcesService.name);
  private readonly codePolicy = new AntiCounterfeitCodePolicy();
  private readonly codeVault = new AntiCounterfeitCodeVault();
  private readonly tableColumnsCache = new Map<string, Set<string>>();
  private productManufacturerIndexChecked = false;
  private readonly runtimeColumnTypeChecked = new Set<string>();

  private readonly productRuntimeColumns = [
    'id', 'product_code', 'product_name', 'batch_no', 'category', 'brand', 'specification', 'unit',
    'production_date', 'production_place', 'manufacturer', 'shelf_life', 'description',
    'image_url', 'extra_fields', 'status', 'created_at', 'updated_at',
  ];

  private readonly productRuntimeColumnDefinitions: Array<[string, string]> = [
    ['batch_no', '`batch_no` VARCHAR(64) NULL'],
    ['production_date', '`production_date` DATE NULL'],
    ['production_place', '`production_place` VARCHAR(128) NULL'],
    ['manufacturer', '`manufacturer` VARCHAR(128) NULL'],
    ['shelf_life', '`shelf_life` VARCHAR(64) NULL'],
    ['description', '`description` TEXT NULL'],
    ['image_url', '`image_url` VARCHAR(255) NULL'],
    ['extra_fields', '`extra_fields` JSON NULL'],
    ['status', '`status` INT NOT NULL DEFAULT 1'],
  ];

  private qIdent(name: string) {
    return `\`${String(name || '').replace(/`/g, '``')}\``;
  }

  private runtimeColumnDefinitions(tableName: string): Array<[string, string]> {
    const text128 = 'VARCHAR(128) NULL';
    const text64 = 'VARCHAR(64) NULL';
    const regionColumns: Array<[string, string]> = [
      ['province_code', 'VARCHAR(16) NULL'],
      ['city_code', 'VARCHAR(16) NULL'],
      ['province_name', text64],
      ['city_name', text64],
      ['region_group', text128],
      ['warehouse', text128],
      ['distributor', text128],
      ['agent_id', 'INT NULL'],
      ['agent_name', text128],
      ['company_name', text128],
    ];
    const productSnapshotColumns: Array<[string, string]> = [
      ['product_code', text64],
      ['product_name', text128],
      ['category', text64],
      ['brand', text64],
      ['specification', text128],
      ['unit', 'VARCHAR(32) NULL'],
      ['production_place', text128],
      ['manufacturer', text128],
    ];
    const timestamps: Array<[string, string]> = [
      ['created_at', 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)'],
      ['updated_at', 'DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'],
    ];
    const map: Record<string, Array<[string, string]>> = {
      products: [
        ['product_code', 'VARCHAR(64) NULL'],
        ['product_name', 'VARCHAR(128) NULL'],
        ['batch_no', 'VARCHAR(64) NULL'],
        ['production_date', 'DATE NULL'],
        ['production_place', 'VARCHAR(128) NULL'],
        ['manufacturer', 'VARCHAR(128) NULL'],
        ['shelf_life', 'VARCHAR(64) NULL'],
        ['description', 'TEXT NULL'],
        ['image_url', 'VARCHAR(255) NULL'],
        ['extra_fields', 'JSON NULL'],
        ['status', 'INT NOT NULL DEFAULT 1'],
        ...timestamps,
      ],
      agents: [
        ['agent_code', 'VARCHAR(64) NULL'],
        ['agent_name', 'VARCHAR(128) NULL'],
        ['contact_name', 'VARCHAR(64) NULL'],
        ['contact_phone', 'VARCHAR(32) NULL'],
        ['contact_email', 'VARCHAR(128) NULL'],
        ['province', 'VARCHAR(64) NULL'],
        ['city', 'VARCHAR(64) NULL'],
        ['district', 'VARCHAR(64) NULL'],
        ['address', 'VARCHAR(255) NULL'],
        ['business_license', 'VARCHAR(128) NULL'],
        ['level', 'INT NULL'],
        ['parent_id', 'INT NULL'],
        ['status', 'INT NOT NULL DEFAULT 1'],
        ['remark', 'TEXT NULL'],
        ...timestamps,
      ],
      manufacturers: [
        ['manufacturer_code', 'VARCHAR(64) NULL'],
        ['manufacturer_name', 'VARCHAR(128) NULL'],
        ['company_name', 'VARCHAR(128) NULL'],
        ['social_credit_code', 'VARCHAR(128) NULL'],
        ['legal_person', 'VARCHAR(64) NULL'],
        ['contact_name', 'VARCHAR(64) NULL'],
        ['contact_phone', 'VARCHAR(32) NULL'],
        ['contact_email', 'VARCHAR(128) NULL'],
        ['province', 'VARCHAR(64) NULL'],
        ['city', 'VARCHAR(64) NULL'],
        ['address', 'VARCHAR(255) NULL'],
        ['business_license', 'VARCHAR(255) NULL'],
        ['production_license', 'VARCHAR(128) NULL'],
        ['quality_report', 'JSON NULL'],
        ['status', 'INT NOT NULL DEFAULT 1'],
        ['remark', 'TEXT NULL'],
        ...timestamps,
      ],
      product_regions: [
        ['product_id', 'INT NULL'],
        ...productSnapshotColumns.filter(([field]) => ['product_code', 'product_name', 'brand', 'category'].includes(field)),
        ['province_code', 'VARCHAR(16) NULL'],
        ['city_code', 'VARCHAR(16) NULL'],
        ['province_name', 'VARCHAR(64) NULL'],
        ['city_name', 'VARCHAR(64) NULL'],
        ['region_group', 'VARCHAR(128) NULL'],
        ['warehouse', 'VARCHAR(128) NULL'],
        ['distributor', 'VARCHAR(128) NULL'],
        ['agent_id', 'INT NULL'],
        ['authorized_status', 'VARCHAR(64) NULL DEFAULT \'正常授权\''],
        ['code_rule', 'VARCHAR(128) NULL'],
        ['codes', 'JSON NULL'],
        ['scan_count', 'INT NOT NULL DEFAULT 0'],
        ['last_scan_code', 'VARCHAR(128) NULL'],
        ['last_scan_at', 'DATETIME(3) NULL'],
        ['remark', 'TEXT NULL'],
        ['status', 'INT NOT NULL DEFAULT 1'],
        ...timestamps,
      ],
      boxes: [
        ['product_id', 'INT NULL'],
        ['box_no', text128],
        ['batch_no', text64],
        ['box_capacity', 'INT NULL'],
        ['box_spec', text128],
        ['box_type', text64],
        ...productSnapshotColumns,
        ...regionColumns,
        ['packing_address', 'VARCHAR(255) NULL'],
        ['authorization_address', 'VARCHAR(255) NULL'],
        ['authorization_level', 'VARCHAR(32) NULL'],
        ['authorization_source', 'VARCHAR(64) NULL'],
        ['codes', 'JSON NULL'],
        ['status', 'INT NOT NULL DEFAULT 0'],
        ['ownership_at', 'DATETIME(3) NULL'],
        ...timestamps,
      ],
      shipments: [
        ['shipment_no', text128],
        ['batch_no', text64],
        ['agent_id', 'INT NULL'],
        ['box_ids', 'JSON NULL'],
        ['logistics_company', text128],
        ['logistics_no', text128],
        ['sender', text64],
        ['sender_address', 'VARCHAR(255) NULL'],
        ['receiver', text64],
        ['receiver_phone', 'VARCHAR(32) NULL'],
        ['receiver_address', 'VARCHAR(255) NULL'],
        ['province_code', 'VARCHAR(16) NULL'],
        ['city_code', 'VARCHAR(16) NULL'],
        ['province_name', text64],
        ['city_name', text64],
        ['region_group', text128],
        ['warehouse', text128],
        ['distributor', text128],
        ['authorization_address', 'VARCHAR(255) NULL'],
        ['authorization_level', 'VARCHAR(32) NULL'],
        ['authorization_source', 'VARCHAR(64) NULL'],
        ['status', 'INT NOT NULL DEFAULT 0'],
        ['remark', 'TEXT NULL'],
        ...timestamps,
      ],
      anti_fake_codes: [
        ['product_id', 'INT NULL'],
        ['code', text128],
        ['code_hash', 'VARCHAR(64) NULL'],
        ['code_ciphertext', 'VARBINARY(512) NULL'],
        ['code_iv', 'BINARY(12) NULL'],
        ['code_tag', 'BINARY(16) NULL'],
        ['code_key_id', 'VARCHAR(32) NULL'],
        ['prefix', 'VARCHAR(32) NULL'],
        ['serial_number', 'VARCHAR(32) NULL'],
        ['checksum', 'VARCHAR(8) NULL'],
        ['parent_code', text128],
        ['packaging_level', 'VARCHAR(32) NULL'],
        ['risk_level', 'VARCHAR(32) NULL'],
        ['anti_channeling_enabled', 'TINYINT(1) NOT NULL DEFAULT 1'],
        ['batch_no', text64],
        ['status', 'INT NOT NULL DEFAULT 0'],
        ['query_count', 'INT NOT NULL DEFAULT 0'],
        ['box_id', 'INT NULL'],
        ['box_no', text128],
        ...productSnapshotColumns,
        ...regionColumns,
        ['box_bound_at', 'DATETIME(3) NULL'],
        ['ownership_at', 'DATETIME(3) NULL'],
        ['activated_at', 'DATETIME(3) NULL'],
        ['expires_at', 'DATE NULL'],
        ['first_query_at', 'DATETIME(3) NULL'],
        ['last_query_at', 'DATETIME(3) NULL'],
        ...timestamps,
      ],
    };
    return map[String(tableName || '').trim()] || [];
  }

  private resourceTableName(resource: string) {
    const map: Record<string, string> = {
      products: 'products',
      manufacturers: 'manufacturers',
      partners: 'manufacturers',
      agents: 'agents',
      'product-regions': 'product_regions',
      box: 'boxes',
      shipments: 'shipments',
      codes: 'anti_fake_codes',
    };
    return map[String(resource || '').trim()];
  }

  private runtimeColumnFallbackDefinition(tableName: string, column: string) {
    const explicit = this.runtimeColumnDefinitions(tableName).find(([field]) => field === column)?.[1];
    if (explicit) return explicit;
    const normalizedColumn = String(column || '').trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(normalizedColumn)) return '';
    if (normalizedColumn === 'authorization_address') return 'VARCHAR(255) NULL';
    if (normalizedColumn === 'authorization_level') return 'VARCHAR(32) NULL';
    if (/(_ids|_list|_data|_json|_fields|_chain|payload|config|rules|quality_report|notify_channels)$/i.test(normalizedColumn)) return 'JSON NULL';
    if (/(^id$|_id$|_count$|count$|status$|severity$|threshold$|window_seconds$|level$)/i.test(normalizedColumn)) return 'INT NULL';
    if (/(_at|_time)$/i.test(normalizedColumn)) return 'DATETIME(3) NULL';
    if (/(_date|date)$/i.test(normalizedColumn)) return 'DATE NULL';
    if (/(remark|description|content|reason|message|note|body|text)$/i.test(normalizedColumn)) return 'TEXT NULL';
    if (/(address|location|url|image|file|license|scope)$/i.test(normalizedColumn)) return 'VARCHAR(255) NULL';
    if (/(phone|mobile|tel)$/i.test(normalizedColumn)) return 'VARCHAR(32) NULL';
    if (/(code|no|name|title|type|source|basis|warehouse|distributor|manufacturer|brand|category|specification|province|city|region)$/i.test(normalizedColumn)) return 'VARCHAR(128) NULL';
    return 'VARCHAR(255) NULL';
  }

  private parseMissingColumnError(error: any, fallbackTable?: string) {
    const metaColumn = String(error?.meta?.column || '').trim();
    const message = String(error?.message || error || '');
    const raw = metaColumn || message.match(/column\s+`([^`]+)`\s+does not exist/i)?.[1] || '';
    const parts = raw.split('.').map((item) => item.replace(/[`'"\s]/g, '')).filter(Boolean);
    const column = parts[parts.length - 1] || message.match(/column\s+[`'"]?([A-Za-z0-9_]+)[`'"]?/i)?.[1] || '';
    const tableName = parts.length >= 2 ? parts[parts.length - 2] : fallbackTable || '';
    const normalizedTable = String(tableName || '').replace(/[^A-Za-z0-9_]/g, '');
    const normalizedColumn = String(column || '').replace(/[^A-Za-z0-9_]/g, '');
    if (!normalizedTable || !normalizedColumn) return null;
    if (!/column/i.test(message) && !metaColumn) return null;
    if (!/does not exist|Unknown column|P2022/i.test(message) && !metaColumn) return null;
    return { tableName: normalizedTable, column: normalizedColumn };
  }

  private async ensureRuntimeColumn(tableName: string, column: string) {
    const normalized = String(tableName || '').replace(/[^A-Za-z0-9_]/g, '');
    const normalizedColumn = String(column || '').replace(/[^A-Za-z0-9_]/g, '');
    if (!normalized || !normalizedColumn) return false;
    const columns = await this.tableColumns(normalized);
    if (columns.has(normalizedColumn)) return false;
    const definition = this.runtimeColumnFallbackDefinition(normalized, normalizedColumn);
    if (!definition) return false;
    try {
      await this.prisma.$executeRawUnsafe(`ALTER TABLE ${this.qIdent(normalized)} ADD COLUMN ${this.qIdent(normalizedColumn)} ${definition}`);
      this.clearTableColumnCache(normalized);
      this.logger.warn(`${normalized}.${normalizedColumn} 缺失，已按运行时 Prisma 报错自动补齐`);
      return true;
    } catch (error: any) {
      const message = String(error?.message || error || '');
      if (message.includes('Duplicate column')) {
        this.clearTableColumnCache(normalized);
        return true;
      }
      this.logger.warn(`根据 Prisma 报错自动补齐 ${normalized}.${normalizedColumn} 失败：${message.slice(0, 220)}`);
      return false;
    }
  }

  private async withMissingColumnRepair<T>(operation: () => Promise<T>, fallbackTable?: string): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        const missing = this.parseMissingColumnError(error, fallbackTable);
        if (!missing) throw error;
        const repaired = await this.ensureRuntimeColumn(missing.tableName, missing.column);
        if (!repaired) throw error;
      }
    }
    throw lastError;
  }

  private async indexExists(tableName: string, indexName: string) {
    const normalizedTable = String(tableName || '').replace(/[^A-Za-z0-9_]/g, '');
    const normalizedIndex = String(indexName || '').replace(/[^A-Za-z0-9_]/g, '');
    if (!normalizedTable || !normalizedIndex) return false;
    try {
      const rows = await this.prisma.$queryRawUnsafe(
        'SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
        normalizedTable,
        normalizedIndex,
      ) as Array<Record<string, any>>;
      return (rows || []).length > 0;
    } catch {
      return false;
    }
  }

  private async normalizeRuntimeColumnTypes(tableName: string) {
    const normalized = String(tableName || '').replace(/[^A-Za-z0-9_]/g, '');
    if (!['boxes', 'shipments'].includes(normalized)) return;
    const cacheKey = `${normalized}:authorization-runtime-types`;
    if (this.runtimeColumnTypeChecked.has(cacheKey)) return;
    this.runtimeColumnTypeChecked.add(cacheKey);

    const wanted: Record<string, { definition: string; maxLength: number }> = {
      authorization_address: { definition: 'VARCHAR(255) NULL', maxLength: 255 },
      authorization_level: { definition: 'VARCHAR(32) NULL', maxLength: 32 },
      authorization_source: { definition: 'VARCHAR(64) NULL', maxLength: 64 },
    };

    try {
      const rows = await this.prisma.$queryRawUnsafe(
        "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME IN ('authorization_address','authorization_level','authorization_source')",
        normalized,
      ) as Array<{ COLUMN_NAME?: string; DATA_TYPE?: string; CHARACTER_MAXIMUM_LENGTH?: number | string | null; IS_NULLABLE?: string }>;

      for (const row of rows || []) {
        const column = String(row.COLUMN_NAME || '');
        const config = wanted[column];
        if (!config) continue;
        const dataType = String(row.DATA_TYPE || '').toLowerCase();
        const maxLength = Number(row.CHARACTER_MAXIMUM_LENGTH || 0);
        const nullable = String(row.IS_NULLABLE || '').toUpperCase() === 'YES';
        const isTextColumn = ['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext'].includes(dataType);
        const lengthOk = !maxLength || maxLength >= config.maxLength;
        if (isTextColumn && nullable && lengthOk) continue;
        await this.prisma.$executeRawUnsafe(`ALTER TABLE ${this.qIdent(normalized)} MODIFY COLUMN ${this.qIdent(column)} ${config.definition}`);
        this.logger.warn(`${normalized}.${column} 类型不兼容，已修正为 ${config.definition}`);
      }
    } catch (error: any) {
      this.runtimeColumnTypeChecked.delete(cacheKey);
      this.logger.warn(`检查 ${normalized} 授权字段类型失败：${String(error?.message || error).slice(0, 220)}`);
    }
  }

  private async ensureRuntimeColumnsForTable(tableName: string) {
    const normalized = String(tableName || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!normalized) return;
    const definitions = this.runtimeColumnDefinitions(normalized);
    if (!definitions.length) return;
    const columns = await this.tableColumns(normalized);
    if (!columns.size) return;

    let changed = false;
    for (const [column, definition] of definitions) {
      if (columns.has(column)) continue;
      try {
        await this.prisma.$executeRawUnsafe(`ALTER TABLE ${this.qIdent(normalized)} ADD COLUMN ${this.qIdent(column)} ${definition}`);
        columns.add(column);
        changed = true;
        this.logger.warn(`${normalized}.${column} 缺失，已自动补齐`);
      } catch (error: any) {
        const message = String(error?.message || error || '');
        if (message.includes('Duplicate column')) {
          columns.add(column);
          continue;
        }
        this.logger.warn(`自动补齐 ${normalized}.${column} 失败：${message.slice(0, 220)}`);
      }
    }
    if (changed) this.clearTableColumnCache(normalized);
    await this.normalizeRuntimeColumnTypes(normalized);
  }

  private async ensureResourceRuntimeSchema(resource: string) {
    const tableName = this.resourceTableName(resource);
    if (tableName) await this.ensureRuntimeColumnsForTable(tableName);
    // 发货列表会根据 box_ids 反查箱子的产品快照；装箱/发货生命周期会同时更新箱码与防伪码归属。
    // 因此在这几个入口一并补齐依赖表，避免老库只打开列表就被 Prisma 的字段 SELECT 打成 500。
    if (resource === 'shipments') await this.ensureRuntimeColumnsForTable('boxes');
    if (resource === 'box' || resource === 'shipments' || resource === 'codes') await this.ensureRuntimeColumnsForTable('anti_fake_codes');
  }


  private async tableColumns(tableName: string): Promise<Set<string>> {
    const normalized = String(tableName || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!normalized) return new Set<string>();
    const cached = this.tableColumnsCache.get(normalized);
    if (cached) return cached;

    const readFromInformationSchema = async () => {
      const rows = await this.prisma.$queryRawUnsafe(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        normalized,
      ) as Array<{ COLUMN_NAME?: string }>;
      return new Set<string>((rows || []).map((row) => String(row.COLUMN_NAME || '')).filter(Boolean));
    };

    const readFromShowColumns = async () => {
      const rows = await this.prisma.$queryRawUnsafe(`SHOW COLUMNS FROM \`${normalized}\``) as Array<{ Field?: string }>;
      return new Set<string>((rows || []).map((row) => String(row.Field || '')).filter(Boolean));
    };

    try {
      const columns = await readFromInformationSchema();
      if (columns.size) {
        this.tableColumnsCache.set(normalized, columns);
        return columns;
      }
    } catch (error) {
      this.logger.warn(`读取 INFORMATION_SCHEMA 字段失败：${normalized}，尝试 SHOW COLUMNS`);
    }

    try {
      const columns = await readFromShowColumns();
      this.tableColumnsCache.set(normalized, columns);
      return columns;
    } catch (error) {
      this.logger.warn(`读取数据表字段失败：${normalized}，将使用最小安全字段集`);
      const fallback = normalized === 'products'
        ? new Set<string>(['id', 'product_code', 'product_name', 'category', 'brand', 'specification', 'unit', 'status', 'created_at', 'updated_at'])
        : new Set<string>();
      if (fallback.size) this.tableColumnsCache.set(normalized, fallback);
      return fallback;
    }
  }

  private clearTableColumnCache(tableName: string) {
    const normalized = String(tableName || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (normalized) this.tableColumnsCache.delete(normalized);
  }

  private async ensureProductSchemaColumns() {
    let columns = await this.tableColumns('products');
    if (!columns.size) return;
    let changed = false;
    for (const [column, definition] of this.productRuntimeColumnDefinitions) {
      if (columns.has(column)) continue;
      try {
        await this.prisma.$executeRawUnsafe(`ALTER TABLE ` + '`products`' + ` ADD COLUMN ${definition}`);
        changed = true;
        this.logger.warn(`products.${column} 缺失，已自动补齐`);
      } catch (error: any) {
        const message = String(error?.message || error || '');
        if (!message.includes('Duplicate column')) {
          this.logger.warn(`自动补齐 products.${column} 失败：${message.slice(0, 220)}`);
        }
      }
    }
    if (changed) {
      this.clearTableColumnCache('products');
      columns = await this.tableColumns('products');
    }
    if (!this.productManufacturerIndexChecked && columns.has('manufacturer')) {
      this.productManufacturerIndexChecked = true;
      const exists = await this.indexExists('products', 'products_manufacturer_idx');
      if (!exists) {
        await this.prisma.$executeRawUnsafe('CREATE INDEX `products_manufacturer_idx` ON `products` (`manufacturer`)').catch((error: any) => {
          const message = String(error?.message || error || '');
          if (!/Duplicate key name|already exists/i.test(message)) {
            this.logger.warn(`创建 products.manufacturer 索引失败：${message.slice(0, 220)}`);
          }
        });
      }
    }
  }

  private productSelectSql(columns: Set<string>) {
    return this.productRuntimeColumns
      .map((column) => columns.has(column) ? `\`${column}\`` : `NULL AS \`${column}\``)
      .join(', ');
  }

  private productWhereSql(query: Record<string, any>, columns: Set<string>) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    const keyword = safeText(query.keyword || query.code || query.product_code || query.product_name, 120);
    const searchable = ['product_name', 'product_code', 'batch_no', 'production_place', 'manufacturer', 'shelf_life']
      .filter((field) => columns.has(field));
    if (keyword && searchable.length) {
      clauses.push(`(${searchable.map((field) => `\`${field}\` LIKE ?`).join(' OR ')})`);
      searchable.forEach(() => params.push(`%${keyword}%`));
    }

    const numberFilters = ['status'];
    const textFilters = ['category', 'brand', 'product_code', 'product_name', 'batch_no', 'production_place', 'manufacturer', 'shelf_life'];
    for (const field of numberFilters) {
      if (!columns.has(field) || query[field] === undefined || query[field] === null || query[field] === '') continue;
      const n = Number(query[field]);
      if (Number.isFinite(n)) {
        clauses.push(`\`${field}\` = ?`);
        params.push(n);
      }
    }
    for (const field of textFilters) {
      if (!columns.has(field) || query[field] === undefined || query[field] === null || query[field] === '') continue;
      const text = safeText(query[field], 128);
      if (text) {
        clauses.push(`\`${field}\` LIKE ?`);
        params.push(`%${text}%`);
      }
    }
    return { whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  private normalizeProductRow(row: Record<string, any>) {
    const extra = this.asRecord(row?.extra_fields);
    const ownerId = safeText(extra.product_owner_partner_id || extra.owner_partner_id || extra.partner_id, 64);
    return {
      ...row,
      owner_partner_id: ownerId || undefined,
      product_owner_partner_id: ownerId || undefined,
      product_owner_party_type: safeText(extra.product_owner_party_type || extra.owner_party_type, 32) || undefined,
      product_owner_name: safeText(extra.product_owner_name || extra.owner_name, 128) || undefined,
      product_owner_region: [safeText(extra.product_owner_province, 64), safeText(extra.product_owner_city, 64), safeText(extra.product_owner_district, 64)].filter(Boolean).join(' / ') || undefined,
      storage_condition: this.productStorageCondition(row) || null,
    };
  }

  private async safeProductList(query: Record<string, any>) {
    await this.ensureProductSchemaColumns().catch((error) => this.logger.warn(`产品表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const { page, pageSize, skip } = pageParams(query);
    const columns = await this.tableColumns('products');
    if (!columns.size || !columns.has('id')) {
      return { list: [], pagination: { page, pageSize, total: 0, totalPages: 0 } };
    }
    const { whereSql, params } = this.productWhereSql(query, columns);
    const selected = this.productSelectSql(columns);
    const orderColumn = columns.has('id') ? 'id' : columns.has('created_at') ? 'created_at' : this.productRuntimeColumns.find((column) => columns.has(column)) || 'id';
    const countRows = await this.prisma.$queryRawUnsafe(
      `SELECT COUNT(1) AS total FROM \`products\` ${whereSql}`,
      ...params,
    ).catch(() => [{ total: 0 }]) as Array<{ total: number | bigint | string }>;
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT ${selected} FROM \`products\` ${whereSql} ORDER BY \`${orderColumn}\` DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      skip,
    ).catch((error: any) => {
      this.logger.error(`产品列表查询失败：${String(error?.message || error).slice(0, 500)}`);
      return [];
    }) as Array<Record<string, any>>;
    const total = Number(countRows?.[0]?.total || 0);
    return {
      list: rows.map((row) => this.normalizeProductRow(row)),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  private async safeProductDetail(id: string | number) {
    await this.ensureProductSchemaColumns().catch((error) => this.logger.warn(`产品表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const productId = safeId(id);
    const columns = await this.tableColumns('products');
    if (!columns.size || !columns.has('id')) {
      throw new NotFoundException('资源不存在');
    }
    const selected = this.productSelectSql(columns);
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT ${selected} FROM \`products\` WHERE \`id\` = ? LIMIT 1`,
      productId,
    ).catch(() => []) as Array<Record<string, any>>;
    const row = rows[0];
    if (!row) throw new NotFoundException('资源不存在');
    return this.normalizeProductRow(row);
  }

  constructor(private readonly prisma: PrismaService, private readonly queue: QueueProducerService, private readonly config: ConfigService, private readonly antiChanneling: AntiChannelingService) {}

  private codeWhere(codes: string[]) {
    return this.codeVault.whereForCodes(codes);
  }

  private hydrateCodeRows(rows: any[]) {
    return this.codeVault.hydrateMany(rows as any[]);
  }

  private storedCodeReferences(codes: string[]) {
    return Array.from(new Set(codes.map((code) => this.codeVault.reference(code))));
  }

  private async resolveStoredCodeReferences(value: unknown, client: any = this.prisma) {
    const refs = safeJsonArray(value).map((item: any) => String(item || '').trim()).filter(Boolean);
    if (!refs.length) return [];
    const hashes = refs.map((ref) => this.codeVault.hashFromReference(ref)).filter(Boolean) as string[];
    const legacy = refs.filter((ref) => !this.codeVault.hashFromReference(ref));
    const clauses: any[] = [];
    if (hashes.length) clauses.push({ code_hash: { in: hashes } });
    if (legacy.length) clauses.push({ code: { in: legacy } });
    const rows = clauses.length ? await client.antiFakeCode.findMany({
      where: { OR: clauses },
      select: {
        code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true,
      },
    }).catch(() => []) : [];
    const plaintextByRef = new Map<string, string>();
    for (const row of this.hydrateCodeRows(rows)) {
      plaintextByRef.set(this.codeVault.reference(String(row.code)), String(row.code));
      plaintextByRef.set(String(row.code), String(row.code));
    }
    return refs.map((ref) => plaintextByRef.get(ref) || ref);
  }

  private async hydrateBoxCodeList<T extends Record<string, any>>(box: T, client: any = this.prisma): Promise<T> {
    if (!box) return box;
    return { ...box, codes: await this.resolveStoredCodeReferences(box.codes, client) };
  }

  private sanitizeCodePayload(value: unknown, codes: string[]): any {
    const replacements = Array.from(new Set(codes.map((code) => String(code || '').trim()).filter(Boolean)))
      .sort((a, b) => b.length - a.length)
      .map((code) => [code, this.codeVault.reference(code)] as const);
    const visit = (current: unknown): any => {
      if (typeof current === 'string') {
        let result = current;
        for (const [code, ref] of replacements) result = result.split(code).join(ref);
        return result;
      }
      if (Array.isArray(current)) return current.map(visit);
      if (current && typeof current === 'object') {
        return Object.fromEntries(Object.entries(current as Record<string, unknown>).map(([key, item]) => [key, visit(item)]));
      }
      return current;
    };
    return visit(value);
  }

  private splitInput(value: unknown) {
    if (Array.isArray(value)) return value.map((item: any) => String(item).trim()).filter(Boolean);
    return String(value || '').split(/[\s,，;；|]+/).map((item: any) => item.trim()).filter(Boolean);
  }

  private safeDecode(value: unknown) {
    const text = String(value || '');
    try { return decodeURIComponent(text); } catch { return text; }
  }

  private normalizeScanCode(input: unknown) {
    const raw = String(input || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!raw || raw.length > MAX_SCAN_URL_LENGTH) return '';
    const finalize = (value: unknown) => {
      const text = String(value || '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(RAW_CODE_PREFIX_RE, '')
        .replace(/^\*|\*$/g, '')
        .trim();
      return text && text.length <= MAX_SCAN_CODE_LENGTH ? text : '';
    };
    const fromParams = (params: URLSearchParams) => {
      for (const key of ['code', 'anti_fake_code', 'antiFakeCode', 'q', 'barcode', 'sn', 'c', 'box', 'carton', 'shipment', 'trace', 'region']) {
        const value = params.get(key);
        if (value) return finalize(value);
      }
      return '';
    };
    try {
      const url = new URL(raw);
      const queryCode = fromParams(url.searchParams);
      if (queryCode) return queryCode;
      if (url.hash) {
        const hashQuery = url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : '';
        if (hashQuery) {
          const hashCode = fromParams(new URLSearchParams(hashQuery));
          if (hashCode) return hashCode;
        }
      }
      const parts = url.pathname.split('/').filter(Boolean);
      const index = parts.findIndex((part) => ['verify', 'v', 'query', 'code', 'codes', 'qr', 'box', 'carton', 'shipment', 'trace', 'region'].includes(part.toLowerCase()));
      if (index >= 0 && parts[index + 1]) return finalize(this.safeDecode(parts[index + 1]));
      if (parts.length) return finalize(this.safeDecode(parts[parts.length - 1]));
    } catch {
      // 普通条码不是 URL，继续兼容 code=xxx / 防伪码：xxx 等扫码内容。
    }
    const queryLike = raw.match(/(?:^|[?&#;\s,，])(?:code|anti_fake_code|antiFakeCode|q|barcode|sn|c|box|carton|shipment|return|trace|region)=([^&#;\s,，]+)/i);
    if (queryLike?.[1]) return finalize(this.safeDecode(queryLike[1]));
    return finalize(raw);
  }

  private splitCodeInput(value: unknown) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,，;；|]+/);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of raw) {
      const code = this.normalizeScanCode(item);
      if (code && !seen.has(code)) {
        seen.add(code);
        result.push(code);
      }
    }
    return result;
  }

  private nonEmptyString(value: unknown, label: string, maxLength = 255) {
    const text = safeText(value, maxLength);
    if (!text) throw new BadRequestException(`${label} 不能为空`);
    return text;
  }

  private parseDate(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
    const raw = String(value).trim();
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00.000Z` : raw;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('日期格式错误，请使用 YYYY-MM-DD 或 ISO-8601 日期时间');
    return date;
  }

  private normalizeJsonValue(value: unknown) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch { return value; }
    }
    return value;
  }

  private normalizePayload(resource: string, payload: Record<string, any>) {
    const next: Record<string, any> = { ...payload };
    const numberFields = ['id', 'product_id', 'agent_id', 'shipment_id', 'status', 'level', 'parent_id', 'box_capacity', 'return_type', 'scan_count', 'box_id'];
    const booleanFields = ['anti_channeling_enabled'];
    for (const field of numberFields) {
      if (next[field] !== undefined && next[field] !== null && next[field] !== '') {
        const n = Number(next[field]);
        if (!Number.isFinite(n)) throw new BadRequestException(`${field} 必须是数字`);
        next[field] = n;
      }
    }
    for (const field of booleanFields) {
      if (next[field] === undefined || next[field] === null || next[field] === '') continue;
      if (typeof next[field] === 'boolean') continue;
      const value = String(next[field]).trim().toLowerCase();
      if (['1', 'true', 'yes', 'on', '开启', '启用'].includes(value)) next[field] = true;
      else if (['0', 'false', 'no', 'off', '关闭', '停用'].includes(value)) next[field] = false;
      else throw new BadRequestException(`${field} 必须是布尔值`);
    }
    for (const field of ['issue_date', 'expiry_date', 'process_time', 'production_date', 'last_scan_at', 'expires_at']) {
      if (next[field] !== undefined) next[field] = next[field] === null && field === 'expires_at' ? null : this.parseDate(next[field]);
    }
    for (const field of ['extra_fields', 'process_data', 'trace_chain', 'quality_report']) {
      if (next[field] !== undefined) next[field] = this.normalizeJsonValue(next[field]);
    }
    for (const field of ['codes', 'box_ids', 'return_codes']) {
      if (next[field] !== undefined) {
        const list = field === 'box_ids' ? this.splitInput(next[field]) : this.splitCodeInput(next[field]);
        // box_ids 兼容后台手动填写数字 ID，也兼容扫码枪扫出的箱号/箱码；发货保存前再统一解析为真实箱子 ID。
        next[field] = list;
      }
    }
    if (resource === 'products') {
      if ('product_code' in next) {
        const productCode = safeText(next.product_code, 64);
        if (productCode) next.product_code = productCode;
        else delete next.product_code;
      }
      if ('product_name' in next) next.product_name = this.nonEmptyString(next.product_name, '产品名称', 128);
      if ('batch_no' in next) next.batch_no = this.nonEmptyString(next.batch_no, '生产批号', 64);
      if ('production_place' in next) {
        const productionPlace = safeText(next.production_place, 128);
        if (productionPlace) next.production_place = productionPlace;
        else next.production_place = null;
      }
      if ('manufacturer' in next) {
        const manufacturer = safeText(next.manufacturer, 128);
        if (manufacturer) next.manufacturer = manufacturer;
        else next.manufacturer = null;
      }
      if ('shelf_life' in next) next.shelf_life = this.nonEmptyString(next.shelf_life, '保质期', 64);
      this.normalizeProductExtraFields(next);
    }
    if (resource === 'manufacturers') {
      if ('manufacturer_code' in next) {
        const manufacturerCode = safeText(next.manufacturer_code, 64);
        if (manufacturerCode) next.manufacturer_code = manufacturerCode;
        else delete next.manufacturer_code;
      }
      if ('manufacturer_name' in next) {
        next.manufacturer_name = this.nonEmptyString(next.manufacturer_name, '公司名称', 128);
        next.company_name = next.manufacturer_name;
      } else if ('company_name' in next) {
        next.company_name = this.nonEmptyString(next.company_name, '公司名称', 128);
        next.manufacturer_name = next.company_name;
      }
      if (next.status === undefined || next.status === null || next.status === '') next.status = 1;
    }
    if (resource === 'trace' && next.anti_fake_code) {
      const rawCode = safeText(next.anti_fake_code, 128) || '';
      next.anti_fake_code = this.codeVault.reference(rawCode);
      if (next.trace_chain) next.trace_chain = this.sanitizeCodePayload(next.trace_chain, [rawCode]);
    }
    if (resource === 'agents' && !next.agent_code) next.agent_code = `AG${Date.now()}`;
    if (resource === 'product-regions') {
      if (!next.region_group && next.province_name) next.region_group = `${next.province_name}${next.city_name ? ` / ${next.city_name}` : ''}`;
      if (Array.isArray(next.codes) && next.codes.length && !next.last_scan_code) next.last_scan_code = next.codes[0];
      if (Array.isArray(next.codes) && next.codes.length && (!next.scan_count || Number(next.scan_count) < next.codes.length)) next.scan_count = next.codes.length;
      if (next.authorized_status === undefined || next.authorized_status === null || next.authorized_status === '') next.authorized_status = '正常授权';
      if (next.status === undefined || next.status === null || next.status === '') next.status = 1;
    }
    if (resource === 'shipments') {
      if ('batch_no' in next) next.batch_no = this.nonEmptyString(next.batch_no, '产品名称', 64);
      if (!next.region_group && next.province_name) next.region_group = `${next.province_name}${next.city_name ? ` / ${next.city_name}` : ''}`;
    }
    return next;
  }

  private buildVerifyUrl(code: string, path = 'verify', requestHost?: string) {
    let frontendBase = String(
      this.config.get('PUBLIC_FRONTEND_BASE_URL')
      || this.config.get('FRONTEND_BASE_URL')
      || this.config.get('WEB_BASE_URL')
      || '',
    ).replace(/\/+$/, '');

    // 如果没有配置基础URL但有请求主机，则从请求中自动获取
    if (!frontendBase && requestHost) {
      frontendBase = requestHost;
    }

    const verifyPath = `/${String(path || 'verify').replace(/^\/+|\/+$/g, '')}`;
    return `${frontendBase}${verifyPath}/${encodeURIComponent(String(code || '').trim())}`;
  }

  private legacyQueryUrl(code: string) {
    const apiPrefix = `/${String(this.config.get('API_PREFIX') || 'api').replace(/^\/+|\/+$/g, '')}`;
    return `${apiPrefix}/query?code=${encodeURIComponent(String(code || '').trim())}`;
  }

  qrcodeMeta(code: string, requestHost?: string) {
    const normalizedCode = String(code || '').trim();
    const verifyUrl = this.buildVerifyUrl(normalizedCode, this.config.get('VERIFY_PAGE_PATH') || 'verify', requestHost);
    return {
      code: normalizedCode,
      qr_payload: verifyUrl,
      scan_value: normalizedCode,
      payload_type: 'verify_url',
      url: verifyUrl,
      verify_url: verifyUrl,
      short_url: this.buildVerifyUrl(normalizedCode, 'v', requestHost),
      legacy_api_url: this.legacyQueryUrl(normalizedCode),
    };
  }

  async boxQrcodeSvg(idOrCode: string) {
    const lookup = String(idOrCode || '').trim();
    if (!lookup) throw new BadRequestException('箱子ID或箱码不能为空');

    const numericId = Number(lookup);
    const box = Number.isInteger(numericId) && numericId > 0
      ? await this.prisma.box.findUnique({ where: { id: numericId }, select: { id: true, box_no: true } }).catch(() => null)
      : await this.prisma.box.findFirst({ where: { box_no: lookup }, select: { id: true, box_no: true } }).catch(() => null);

    if (!box) throw new NotFoundException('箱子不存在，请刷新装箱列表后重试');
    const boxCode = String(box.box_no || box.id).trim();
    return createLabeledQrSvg(boxCode, boxCode, { qrSize: 320, labelHeight: 64 });
  }

  async qrcodeSvg(code: string, requestHost?: string, payload?: string) {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) throw new BadRequestException('防伪码不能为空');
    const rawPayload = ['raw', 'code', 'box'].includes(String(payload || '').toLowerCase());
    const verifyUrl = this.buildVerifyUrl(normalizedCode, this.config.get('VERIFY_PAGE_PATH') || 'verify', requestHost);
    const qrPayload = rawPayload ? normalizedCode : verifyUrl;
    // 防伪码二维码面向消费者时默认直接打开验证页：/verify/{code}。
    // 箱码等后台业务二维码传 payload=raw，并在二维码下方直接印出箱码编号，便于现场校对。
    if (rawPayload) return createLabeledQrSvg(qrPayload, normalizedCode, { qrSize: 280, labelHeight: 52 });
    return QRCode.toString(qrPayload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 280 });
  }

  private buildScannerUrl(kind: 'shipment' | 'box' | 'return', value: string, requestHost?: string) {
    const code = String(value || '').trim();
    let frontendBase = String(
      this.config.get('PUBLIC_FRONTEND_BASE_URL')
      || this.config.get('FRONTEND_BASE_URL')
      || this.config.get('WEB_BASE_URL')
      || '',
    ).replace(/\/+$/, '');
    if (!frontendBase && requestHost) frontendBase = requestHost;
    return frontendBase ? `${frontendBase}/scanner?${kind}=${encodeURIComponent(code)}` : `${kind}:${code}`;
  }

  private async findShipmentByScan(scan: unknown, client: any = this.prisma) {
    const normalized = this.normalizeScanCode(scan);
    if (!normalized) return null;
    const byNo = await client.shipment.findFirst({ where: { shipment_no: normalized } }).catch(() => null);
    if (byNo) return byNo;
    const asNumber = Number(normalized);
    if (Number.isInteger(asNumber) && asNumber > 0) {
      return client.shipment.findUnique({ where: { id: asNumber } }).catch(() => null);
    }
    return null;
  }

  async shipmentQrcodeMeta(id: string | number, requestHost?: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: safeId(id) } }).catch(() => null);
    if (!shipment) throw new NotFoundException('发货单不存在');
    const shipmentNo = String(shipment.shipment_no || shipment.id);
    const url = this.buildScannerUrl('shipment', shipmentNo, requestHost);
    return { id: shipment.id, shipment_no: shipmentNo, url, scan_value: `shipment:${shipmentNo}` };
  }

  async shipmentQrcodeSvg(id: string | number, requestHost?: string) {
    const meta = await this.shipmentQrcodeMeta(id, requestHost);
    // 发货单二维码给后台扫码枪使用，二维码内容固定为业务 ID，不写入跳转链接。
    return QRCode.toString(meta.scan_value, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 280 });
  }

  async shipmentScanPreview(scan: string | number) {
    const shipment = await this.findShipmentByScan(scan);
    if (!shipment) throw new NotFoundException('发货单不存在，请确认扫描的是发货单号或发货单二维码');
    const [agent, boxes] = await Promise.all([
      shipment.agent_id ? this.agentSnapshot(Number(shipment.agent_id)) : null,
      this.boxesForShipment(shipment),
    ]);
    const codes = this.codesFromBoxes(boxes);
    return {
      shipment,
      agent,
      agent_name: agent?.agent_name || agent?.agent_code || null,
      boxes: boxes.map((box: any) => ({ id: box.id, box_no: box.box_no, code_count: safeJsonArray(box.codes).length, status: box.status })),
      codes,
      code_count: codes.length,
    };
  }

  private async hydrateReturnPayload(payload: Record<string, any>, client: any = this.prisma) {
    const next: Record<string, any> = { ...payload };
    let shipment: any = null;
    if (next.shipment_id || next.shipment_no) {
      shipment = next.shipment_id
        ? await client.shipment.findUnique({ where: { id: Number(next.shipment_id) } }).catch(() => null)
        : await this.findShipmentByScan(next.shipment_no, client);
      if (shipment) {
        next.shipment_id = shipment.id;
        next.shipment_no = shipment.shipment_no || String(shipment.id);
        if (!next.agent_id && shipment.agent_id) next.agent_id = shipment.agent_id;
        const existingCodes = safeJsonArray(next.return_codes).map((code: any) => String(code).trim()).filter(Boolean);
        if (!existingCodes.length) {
          const boxes = await this.boxesForShipment(shipment);
          const codes = this.codesFromBoxes(boxes);
          if (codes.length) next.return_codes = codes;
        }
      }
    }
    if (next.agent_id) {
      const agent = await this.agentSnapshot(Number(next.agent_id), client);
      if (agent) next.agent_name = agent.agent_name || agent.agent_code || next.agent_name || null;
    }
    return next;
  }

  private getDelegate(resource: string) {
    resource = String(resource || '').trim();
    if (!/^[a-z][a-z-]*$/.test(resource)) throw new NotFoundException('资源不存在');
    const config = resourceMap[resource];
    if (!config) throw new NotFoundException('资源不存在');
    const delegate = (this.prisma as any)[config.delegate];
    if (!delegate) throw new NotFoundException('资源未配置 Prisma delegate');
    return { config, delegate };
  }

  private whereByQuery(resource: string, query: Record<string, any>) {
    const { config } = this.getDelegate(resource);
    const keyword = safeText(query.keyword || query.code || query.batch_no || query[`${resource}_no`], 120);
    const where: Record<string, any> = {};
    if (keyword && config.searchFields?.length) {
      where.OR = config.searchFields.map((field) => ({ [field]: { contains: keyword } }));
    }

    const numberFilters = new Set(['product_id', 'agent_id', 'shipment_id', 'status', 'level', 'return_type']);
    const exactTextFilters = new Set([
      'batch_no', 'code', 'shipment_no', 'return_no', 'box_no', 'trace_no', 'agent_code',
      'category', 'brand', 'province', 'city', 'district', 'province_name', 'city_name', 'province_code', 'city_code',
      'product_code', 'product_name', 'production_place', 'manufacturer', 'region_group', 'warehouse', 'distributor', 'authorized_status', 'process_type', 'cert_type', 'logistics_no', 'box_no', 'agent_name', 'company_name',
      'manufacturer_code', 'manufacturer_name', 'social_credit_code', 'contact_name', 'contact_phone', 'contact_email',
    ]);
    for (const field of [...numberFilters, ...exactTextFilters]) {
      if (query[field] === undefined || query[field] === null || query[field] === '') continue;
      if (numberFilters.has(field)) {
        const n = Number(query[field]);
        if (Number.isFinite(n)) where[field] = n;
      } else {
        const text = safeText(query[field], 128);
        if (text) where[field] = { contains: text };
      }
    }
    return where;
  }

  private readonly codePatchFields = [
    'product_id', 'batch_no', 'status', 'anti_channeling_enabled', 'expires_at', 'box_id', 'box_no',
    'product_code', 'product_name', 'category', 'brand', 'specification', 'unit',
    'production_place', 'manufacturer', 'province_code', 'city_code', 'province_name', 'city_name',
    'region_group', 'warehouse', 'distributor', 'agent_id', 'agent_name', 'company_name',
  ];

  private isFilled(value: unknown) {
    return value !== undefined && value !== null && value !== '';
  }

  private readonly fixedTraceWorkflowText = {
    inbound_quality: '入库环节按统一质检标准核验货品批次、外观、数量、资质和仓储条件，核验通过后系统自动建档入库。',
    outbound_quality: '出库环节按订单、箱码、防伪码和物流信息逐项扫码核验，确认无误后自动生成发货溯源记录。',
    circulation_control: '货品流转全程执行一物一码、一箱一码、单据联动和属地流向管控，严禁人工随意改写溯源内容。',
    after_sale_liability: '售后退货、复检、返修、报废和二次入库均自动留痕归档，可用于责任追溯、合规检查和召回处理。',
  };

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

  private productStorageCondition(product: any = {}, overrides: Record<string, any> = {}) {
    const extra = this.asRecord(product?.extra_fields);
    return this.firstValue(
      overrides.storage_condition,
      product?.storage_condition,
      extra.storage_condition,
      extra.storage,
      extra['贮藏方法'],
      extra['贮存条件'],
      extra['储存条件'],
      extra['仓储条件'],
    );
  }

  private normalizeProductExtraFields(payload: Record<string, any>) {
    const extra = this.asRecord(payload.extra_fields);
    const storageCondition = safeText(this.productStorageCondition({ ...payload, extra_fields: extra }, payload), 500);
    if (storageCondition) {
      extra.storage_condition = storageCondition;
      extra['贮藏方法'] = storageCondition;
    }
    payload.extra_fields = Object.keys(extra).length ? extra : undefined;
    delete payload.storage_condition;
    return payload;
  }

  private traceTemplateFields(product: any = {}, batchNo?: string | null, overrides: Record<string, any> = {}) {
    const extra = this.asRecord(product?.extra_fields);
    const shelfLife = this.firstValue(product?.shelf_life, extra.shelf_life, extra.shelfLife, extra['保质期'], extra.expiration, overrides.shelf_life, '以产品包装标识或系统有效期为准');
    const storageCondition = this.productStorageCondition(product, overrides) || '常温、阴凉、干燥处储存，避免阳光直射';
    return {
      template_version: 'auto-trace-v1',
      locked: true,
      auto_fill_mode: 'system-only',
      origin_place: this.firstValue(overrides.origin_place, overrides.production_place, product?.production_place, extra.origin_place, extra.origin, '产品档案未配置产地'),
      specification: this.firstValue(overrides.specification, product?.specification, extra.specification, '产品档案未配置规格'),
      raw_material: this.firstValue(overrides.raw_material, extra.raw_material, extra.material, extra.materials, '按产品档案原料/材质字段自动读取'),
      production_standard: this.firstValue(overrides.production_standard, extra.production_standard, extra.standard, extra.executive_standard, '按产品档案执行标准自动读取'),
      manufacturer: this.firstValue(overrides.manufacturer, product?.manufacturer, extra.manufacturer, '产品档案未配置公司'),
      qualification: this.firstValue(overrides.qualification, extra.qualification, extra.certificate, extra.certificates, '按证书/资质模块和产品档案自动读取'),
      storage_condition: storageCondition,
      shelf_life: shelfLife,
      batch_no: batchNo || overrides.batch_no || null,
      product_code: this.firstValue(overrides.product_code, product?.product_code, null),
      product_name: this.firstValue(overrides.product_name, product?.product_name, null),
    };
  }

  private buildAutoTraceDetail(product: any = {}, batchNo?: string | null, detail: Record<string, any> = {}, overrides: Record<string, any> = {}) {
    return {
      ...(detail || {}),
      auto_filled: true,
      manual_edit_locked: true,
      template_fields: this.traceTemplateFields(product, batchNo, overrides),
      workflow_text: this.fixedTraceWorkflowText,
    };
  }

  private parseDestination(address?: string | null) {
    const text = String(address || '').trim();
    if (!text) return {} as Record<string, any>;
    const municipality = text.match(/(北京|上海|天津|重庆)市?/);
    const province = text.match(/([\u4e00-\u9fa5]{2,12}(?:省|自治区|特别行政区))/);
    const citySource = province?.[1] ? text.replace(province[1], '') : text;
    const city = citySource.match(/([\u4e00-\u9fa5]{2,12}市)/);
    const county = citySource.match(/([\u4e00-\u9fa5]{2,12}(?:区|县|旗))/);
    const knownCity = KNOWN_CITY_ALIASES.find((name) => text.includes(name));
    const provinceName = province?.[1] || (municipality ? `${municipality[1]}市` : undefined);
    const cityName = city?.[1] || (municipality ? `${municipality[1]}市` : knownCity ? `${knownCity}市` : county?.[1]);
    return {
      province_name: provinceName,
      city_name: cityName,
      district_name: county?.[1],
      region_group: [provinceName, cityName].filter(Boolean).join(' / ') || undefined,
    };
  }

  private compactAgentRegion(agent: any) {
    return safeText(Array.from(new Set([agent?.province, agent?.city, agent?.district]
      .map((item) => safeText(item, 64) || '')
      .filter(Boolean)))
      .join(''), 255);
  }

  private compactAgentAddress(agent: any) {
    const address = safeText(agent?.address, 255) || '';
    const regionPrefix = Array.from(new Set([agent?.province, agent?.city, agent?.district]
      .map((item) => safeText(item, 64) || '')
      .filter(Boolean)))
      .filter((item) => !address.includes(item))
      .join('');
    return safeText(`${regionPrefix}${address}`, 255);
  }

  /**
   * 已发货后的防窜授权位置来自收件代理商档案。装箱地点和发货仓库位置只记录业务流转。
   */
  private resolveShipmentDestinationLocation(shipment: any = {}, agent: any = null, fallbackLocation?: unknown) {
    const isDestinationSnapshot = shipment?.authorization_source === 'shipment_destination_agent';
    const agentRegion = this.compactAgentRegion(agent);
    const destinationText = safeText(
      isDestinationSnapshot
        ? shipment?.authorization_address || shipment?.region_group || agentRegion
        : agentRegion || shipment?.authorization_address || shipment?.receiver_address || fallbackLocation || shipment?.sender_address,
      255,
    );
    const parsedDestination = this.parseDestination(destinationText);
    const provinceName = safeText(
      (isDestinationSnapshot ? shipment?.province_name : '') || agent?.province || parsedDestination.province_name,
      64,
    );
    const cityName = safeText(
      (isDestinationSnapshot ? shipment?.city_name : '') || agent?.city || parsedDestination.city_name,
      64,
    );
    const districtName = safeText(
      (isDestinationSnapshot ? parsedDestination.district_name : '') || agent?.district || parsedDestination.district_name,
      64,
    );
    return {
      raw_address: destinationText,
      receiver_address: this.compactAgentAddress(agent) || null,
      province_name: provinceName,
      city_name: cityName,
      district_name: districtName,
      region_group: safeText([provinceName, cityName, districtName].filter(Boolean).join(' / '), 128),
      basis: provinceName || cityName ? 'shipment_destination_agent' : 'shipment_destination_agent_unresolved',
    };
  }

  resolveShipmentAgentLocation(agent: any, shipment: any = {}) {
    return this.resolveShipmentDestinationLocation(shipment, agent);
  }

  private shipmentAuthorizationSnapshot(shipment: any, agent: any = null) {
    return this.resolveShipmentDestinationLocation(shipment, agent);
  }

  private async resolveShipmentBoxIds(value: unknown, client: any = this.prisma, currentShipmentId?: number) {
    if (value === undefined) return undefined;
    const tokens = Array.from(new Set(this.splitInput(value)));
    if (!tokens.length) return [];
    const currentIds = new Set<number>();
    if (currentShipmentId) {
      const current = await client.shipment.findUnique({ where: { id: Number(currentShipmentId) }, select: { box_ids: true } }).catch(() => null);
      for (const item of safeJsonArray(current?.box_ids)) {
        const n = Number(item);
        if (Number.isInteger(n) && n > 0) currentIds.add(n);
      }
    }
    const ids: number[] = [];
    for (const token of tokens) {
      const text = safeText(token, 128);
      const numeric = Number(text);
      const box = Number.isInteger(numeric) && numeric > 0
        ? await client.box.findUnique({ where: { id: numeric } }).catch(() => null)
        : await client.box.findFirst({ where: { box_no: text } }).catch(() => null);
      if (!box) throw new BadRequestException(`箱子 ${text} 不存在，请先完成装箱`);
      const status = Number(box.status || 0);
      if (status !== 1 && !currentIds.has(Number(box.id))) {
        throw new BadRequestException(`箱子 ${box.box_no || box.id} 未封箱，不能加入发货单；请先在装箱管理中封箱`);
      }
      if (!ids.includes(Number(box.id))) ids.push(Number(box.id));
    }
    return ids;
  }

  private async shipmentHasEnabledAntiChannelingCodes(boxIds: unknown, client: any = this.prisma) {
    const ids = safeJsonArray(boxIds)
      .map((item: any) => Number(item))
      .filter((id: number) => Number.isInteger(id) && id > 0);
    if (!ids.length) return false;
    const count = await client.antiFakeCode.count({
      where: { box_id: { in: ids }, anti_channeling_enabled: true },
    }).catch(() => 0);
    return Number(count) > 0;
  }

  private async hydrateShipmentPayload(payload: Record<string, any>, client: any = this.prisma, currentShipmentId?: number) {
    const senderAddressProvided = Object.prototype.hasOwnProperty.call(payload, 'sender_address');
    const next = { ...payload };
    const requestedSenderAddress = safeText(next.sender_address, 255);
    if (!next.agent_id) throw new BadRequestException('请选择收件代理商');
    const agent = await this.agentSnapshot(Number(next.agent_id), client);
    if (!agent) throw new BadRequestException('所选收件代理商不存在');
    this.requireAgentRegion(agent, '收件代理商');
    const distributorName = safeText(agent?.agent_name || agent?.agent_code, 128);

    next.receiver = safeText(distributorName, 64);
    next.receiver_phone = safeText(agent.contact_phone, 32) || null;
    next.receiver_address = this.compactAgentAddress(agent) || null;
    next.distributor = distributorName;
    next.sender_address = senderAddressProvided ? (requestedSenderAddress || null) : (this.compactAgentAddress(agent) || null);

    if (Object.prototype.hasOwnProperty.call(next, 'box_ids')) {
      next.box_ids = await this.resolveShipmentBoxIds(next.box_ids, client, currentShipmentId);
    }

    // 每次保存都以当前所选代理商档案重建快照，避免更换草稿收件人后沿用旧授权地址。
    const authorization = this.resolveShipmentAgentLocation(agent);
    if (await this.shipmentHasEnabledAntiChannelingCodes(next.box_ids, client)) {
      if (!authorization.raw_address || !authorization.province_name || !authorization.city_name) {
        throw new BadRequestException('箱内存在开启防窜校验的防伪码，所选收件代理商必须配置完整省、市位置');
      }
    }
    next.authorization_address = authorization.raw_address || null;
    next.authorization_level = authorization.city_name ? 'city' : authorization.province_name ? 'province' : null;
    next.authorization_source = authorization.basis;
    next.province_name = authorization.province_name || null;
    next.city_name = authorization.city_name || null;
    next.region_group = authorization.region_group || null;
    return next;
  }

  private async destinationPatchForShipment(shipment: any, client: any = this.prisma) {
    const agent = shipment?.agent_id ? await this.agentSnapshot(Number(shipment.agent_id), client) : null;
    const destination = this.shipmentAuthorizationSnapshot(shipment, agent);
    const agentName = safeText(shipment?.distributor || agent?.agent_name || agent?.agent_code, 128);
    const patch: Record<string, any> = {
      agent_id: shipment?.agent_id || undefined,
      agent_name: agentName || undefined,
      province_code: shipment?.province_code || undefined,
      city_code: shipment?.city_code || undefined,
      province_name: destination.province_name || undefined,
      city_name: destination.city_name || undefined,
      region_group: destination.region_group || undefined,
      warehouse: shipment?.warehouse || undefined,
      distributor: agentName || shipment?.receiver || undefined,
      ownership_at: new Date(),
    };
    Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);
    return patch;
  }

  private cleanCodeList(value: unknown, limit = 50000, allowEmpty = false) {
    const list = Array.from(new Set(this.splitInput(value))).slice(0, limit);
    if (!allowEmpty && !list.length) throw new BadRequestException('防伪码不能为空');
    return list;
  }

  private codeWhereByQuery(query: Record<string, any> = {}) {
    const where: Record<string, any> = {};
    const keyword = safeText(query.keyword || query.code, 128);
    if (keyword) {
      where.OR = [
        { code_hash: this.codeVault.hash(keyword) },
        { code: keyword },
        { batch_no: { contains: keyword } },
        { box_no: { contains: keyword } },
        { product_code: { contains: keyword } },
        { product_name: { contains: keyword } },
        { manufacturer: { contains: keyword } },
        { province_name: { contains: keyword } },
        { city_name: { contains: keyword } },
        { agent_name: { contains: keyword } },
      ];
    }

    for (const field of ['product_id', 'status', 'box_id', 'agent_id']) {
      if (!this.isFilled(query[field])) continue;
      const n = Number(query[field]);
      if (Number.isFinite(n)) where[field] = n;
    }
    if (this.isFilled(query.anti_channeling_enabled)) {
      const raw = query.anti_channeling_enabled;
      where.anti_channeling_enabled = typeof raw === 'boolean'
        ? raw
        : !['0', 'false', 'no', 'off', '关闭', '停用'].includes(String(raw).trim().toLowerCase());
    }
    for (const field of [
      'batch_no', 'code', 'box_no', 'product_code', 'product_name', 'category', 'brand',
      'production_place', 'manufacturer', 'province_name', 'city_name', 'region_group',
      'warehouse', 'distributor', 'agent_name', 'company_name',
    ]) {
      const text = safeText(query[field], 128);
      if (text) {
        if (field === 'code') {
          where.code_hash = this.codeVault.hash(text);
          delete where.code;
        } else where[field] = { contains: text };
      }
    }
    const expiresFrom = this.parseDate(query.expires_from || query.expires_start);
    const expiresTo = this.parseDate(query.expires_to || query.expires_end);
    if (expiresFrom || expiresTo) where.expires_at = { ...(expiresFrom ? { gte: expiresFrom } : {}), ...(expiresTo ? { lte: expiresTo } : {}) };
    if (query.expiry_state === 'expired') where.expires_at = { lt: new Date() };
    if (query.expiry_state === 'valid') where.AND = [...(where.AND || []), { OR: [{ expires_at: null }, { expires_at: { gte: new Date() } }] }];
    if (query.expiry_state === 'permanent') where.expires_at = null;
    return where;
  }

  private async productSnapshot(productId?: number | null, client: any = this.prisma) {
    if (!productId) return null;
    return client.product.findUnique({
      where: { id: Number(productId) },
      select: {
        id: true,
        product_code: true,
        product_name: true,
        category: true,
        brand: true,
        specification: true,
        unit: true,
        production_date: true,
        production_place: true,
        batch_no: true,
        manufacturer: true,
        description: true,
        extra_fields: true,
      },
    }).catch(() => null);
  }

  private async agentSnapshot(agentId?: number | null, client: any = this.prisma) {
    if (!agentId) return null;
    return client.agent.findUnique({
      where: { id: Number(agentId) },
      select: { id: true, agent_name: true, agent_code: true, contact_name: true, contact_phone: true, province: true, city: true, district: true, address: true, status: true },
    }).catch(() => null);
  }

  private async companySnapshot(companyName?: unknown, client: any = this.prisma) {
    const name = safeText(companyName, 128);
    if (!name) return null;
    return client.manufacturer.findFirst({
      where: {
        status: 1,
        OR: [{ manufacturer_name: name }, { company_name: name }],
      },
      select: {
        id: true,
        manufacturer_code: true,
        manufacturer_name: true,
        company_name: true,
        province: true,
        city: true,
        address: true,
        status: true,
      },
      orderBy: { id: 'desc' },
    }).catch(() => null);
  }

  private requireAgentRegion(agent: any, label = '经销商') {
    const name = safeText(agent?.agent_name || agent?.agent_code, 128);
    const province = safeText(agent?.province, 64);
    if (!name) throw new BadRequestException(`${label}名称不能为空`);
    if (!province) throw new BadRequestException(`${name} 尚未设置所属地区，请至少选择省级地区`);
  }

  private productOwnerAgentId(extra: Record<string, any>) {
    const ownerMode = String(safeText(extra.product_owner_mode || extra.owner_mode, 32) || '').toLowerCase();
    const partyType = String(safeText(extra.product_owner_party_type || extra.owner_party_type, 32) || '').toLowerCase();
    const rawPartnerId = safeText(extra.product_owner_partner_id || extra.owner_partner_id || extra.partner_id, 64);
    if (rawPartnerId && /^(?:agent|dealer|distributor)[:_-]\d+$/i.test(rawPartnerId)) {
      return this.parsePartnerId(rawPartnerId).id;
    }
    if (ownerMode !== 'agent' && !['agent', 'dealer', 'distributor', '经销商', '代理商'].includes(partyType)) return null;
    const sourceId = Number(extra.product_owner_source_id || extra.owner_source_id || 0);
    return Number.isInteger(sourceId) && sourceId > 0 ? sourceId : null;
  }

  private clearProductOwnerLocation(extra: Record<string, any>) {
    for (const key of [
      'product_owner_province', 'owner_province', 'product_owner_province_code', 'owner_province_code',
      'product_owner_city', 'owner_city', 'product_owner_city_code', 'owner_city_code',
      'product_owner_district', 'owner_district',
    ]) delete extra[key];
  }

  private async hydrateProductOwnerPayload(payload: Record<string, any>, client: any = this.prisma) {
    const next = { ...payload };
    const extra = this.asRecord(next.extra_fields);
    const agentId = this.productOwnerAgentId(extra);

    // 产品地区只允许从所属经销商档案派生。旧版手工地区字段不再参与新防伪码归属。
    this.clearProductOwnerLocation(extra);
    if (!agentId) {
      if (String(extra.product_owner_mode || '').toLowerCase() === 'region') delete extra.product_owner_mode;
      next.extra_fields = Object.keys(extra).length ? extra : undefined;
      return next;
    }

    const agent = await this.agentSnapshot(agentId, client);
    if (!agent) throw new BadRequestException('所选经销商不存在');
    if (Number(agent.status ?? 1) !== 1) throw new BadRequestException('所选经销商已停用，不能作为产品归属');
    this.requireAgentRegion(agent);
    const agentName = safeText(agent.agent_name || agent.agent_code, 128);
    extra.product_owner_mode = 'agent';
    extra.product_owner_partner_id = `agent:${agent.id}`;
    extra.product_owner_party_type = 'agent';
    extra.product_owner_source_id = agent.id;
    extra.product_owner_name = agentName;
    extra.product_owner_address = safeText(agent.address, 255);
    extra.product_owner_province = safeText(agent.province, 64);
    extra.product_owner_city = safeText(agent.city, 64);
    extra.product_owner_district = safeText(agent.district, 64);
    extra.product_owner_authorization_level = 'third';
    next.extra_fields = extra;
    return next;
  }

  private productBaseSnapshotData(product: any = {}) {
    return {
      product_id: product?.id || null,
      product_code: product?.product_code || null,
      product_name: product?.product_name || null,
      batch_no: product?.batch_no || null,
      category: product?.category || null,
      brand: product?.brand || null,
      specification: product?.specification || null,
      unit: product?.unit || null,
      production_place: product?.production_place || null,
      manufacturer: product?.manufacturer || null,
      company_name: product?.manufacturer || null,
    };
  }

  private async partnerSnapshotForProduct(product: any = {}, client: any = this.prisma) {
    const extra = this.asRecord(product?.extra_fields);
    const directProvince = safeText(extra.product_owner_province || extra.owner_province, 64);
    const directCity = safeText(extra.product_owner_city || extra.owner_city, 64);
    const directDistrict = safeText(extra.product_owner_district || extra.owner_district, 64);
    const ownerMode = String(safeText(extra.product_owner_mode || extra.owner_mode, 32) || '').toLowerCase();
    // 旧版产品可直接维护地区；该来源不再用于新防伪码归属。
    if (ownerMode === 'region') return null;

    const rawPartnerId = safeText(extra.product_owner_partner_id || extra.owner_partner_id || extra.partner_id, 64);
    if (rawPartnerId) {
      try {
        const parsed = this.parsePartnerId(rawPartnerId);
        if (parsed.kind !== 'agent') return null;
        const row = await client.agent.findUnique({ where: { id: parsed.id } }).catch(() => null);
        if (row) return this.toPartnerRow('agent', row);
      } catch {
        // 自定义历史数据忽略格式错误，继续按快照字段回退。
      }
    }
    const partyType = ownerMode === 'agent' ? 'agent' : this.normalizePartnerKind(extra.product_owner_party_type || extra.owner_party_type);
    if (partyType !== 'agent') return null;
    const sourceId = Number(extra.product_owner_source_id || extra.owner_source_id || 0);
    if (Number.isInteger(sourceId) && sourceId > 0) {
      const row = await client.agent.findUnique({ where: { id: sourceId } }).catch(() => null);
      if (row) return this.toPartnerRow(partyType, row);
    }
    const snapshotName = safeText(extra.product_owner_name || extra.owner_name || product?.manufacturer, 128);
    if (!snapshotName) return null;
    return {
      id: rawPartnerId || null,
      source_id: sourceId || null,
      party_type: partyType,
      party_type_label: this.partnerKindLabel(partyType),
      party_name: snapshotName,
      display_name: snapshotName,
      company_name: undefined,
      agent_name: snapshotName,
      agent_id: sourceId || undefined,
      province: directProvince,
      city: directCity,
      district: directDistrict,
      address: safeText(extra.product_owner_address || extra.owner_address, 255),
    };
  }

  private productOwnerAuthorizationPatch(partner: any) {
    if (!partner) return {} as Record<string, any>;
    const partyName = safeText(partner.party_name || partner.agent_name || partner.company_name || partner.display_name, 128);
    const provinceName = safeText(partner.province, 64);
    const cityName = safeText(partner.city, 64);
    if (partner.party_type === 'region') {
      const regionData: Record<string, any> = {
        province_name: provinceName || undefined,
        city_name: cityName || undefined,
        region_group: [provinceName, cityName].filter(Boolean).join(' / ') || undefined,
      };
      Object.keys(regionData).forEach((key) => regionData[key] === undefined && delete regionData[key]);
      return regionData;
    }
    const data: Record<string, any> = {
      province_name: provinceName || undefined,
      city_name: cityName || undefined,
      region_group: [provinceName, cityName, safeText(partner.district, 64)].filter(Boolean).join(' / ') || undefined,
      warehouse: safeText(partner.address, 128) || undefined,
      distributor: partyName || undefined,
      company_name: partner.party_type === 'company' ? safeText(partner.company_name || partyName, 128) || undefined : undefined,
      agent_id: partner.party_type === 'agent' ? Number(partner.source_id || partner.agent_id || 0) || undefined : undefined,
      agent_name: partner.party_type === 'agent' ? partyName || undefined : undefined,
    };
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    return data;
  }

  private async productCodeOwnershipData(product: any = {}, client: any = this.prisma) {
    const partner = await this.partnerSnapshotForProduct(product, client);
    if (partner?.party_type === 'agent') {
      if (Number((partner as any).status ?? 1) !== 1) throw new BadRequestException('产品所属经销商已停用，请先调整产品归属');
      this.requireAgentRegion(partner, '产品所属经销商');
    }
    const data = {
      ...this.productBaseSnapshotData(product),
      ...this.productOwnerAuthorizationPatch(partner),
      ownership_at: new Date(),
    } as Record<string, any>;
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    return data;
  }

  private unboxedCodeSnapshotData(product: any = {}) {
    return {
      ...this.productBaseSnapshotData(product),
      province_code: null,
      city_code: null,
      province_name: null,
      city_name: null,
      region_group: null,
      warehouse: null,
      distributor: null,
      agent_id: null,
      agent_name: null,
      ownership_at: new Date(),
    } as Record<string, any>;
  }

  private async restoreProductAuthorizationForCodesTx(client: any, codes: string[]) {
    const normalizedCodes = this.cleanCodeList(codes, 50000, true);
    if (!normalizedCodes.length) return 0;
    const storedRows = await client.antiFakeCode.findMany({
      where: this.codeWhere(normalizedCodes),
      select: { code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true, product_id: true },
    });
    const rows = this.hydrateCodeRows(storedRows);
    const byProduct = new Map<number, string[]>();
    for (const row of rows || []) {
      const productId = Number(row.product_id || 0);
      if (!Number.isInteger(productId) || productId <= 0) continue;
      const list = byProduct.get(productId) || [];
      list.push(String(row.code));
      byProduct.set(productId, list);
    }
    let affected = 0;
    for (const [productId, list] of byProduct.entries()) {
      const product = await this.productSnapshot(productId, client);
      const ownership = this.unboxedCodeSnapshotData(product || { id: productId });
      const data = { ...ownership, box_id: null, box_no: null, box_bound_at: null, ownership_at: new Date() };
      const result = await client.antiFakeCode.updateMany({ where: this.codeWhere(list), data });
      affected += Number(result.count || 0);
    }
    return affected;
  }

  private async boxSnapshot(boxId?: number | null, boxNo?: string | null, client: any = this.prisma) {
    if (boxId) return client.box.findUnique({ where: { id: Number(boxId) } }).catch(() => null);
    if (boxNo) return client.box.findFirst({ where: { box_no: String(boxNo) } }).catch(() => null);
    return null;
  }

  private fillIfBlank(target: Record<string, any>, field: string, value: unknown) {
    if (!this.isFilled(target[field]) && this.isFilled(value)) target[field] = value;
  }

  private async productRegionOwnershipData(region: any, client: any = this.prisma) {
    const data: Record<string, any> = {
      product_id: region?.product_id || undefined,
      product_code: region?.product_code || undefined,
      product_name: region?.product_name || undefined,
      category: region?.category || undefined,
      brand: region?.brand || undefined,
      warehouse: region?.warehouse || undefined,
      ownership_at: new Date(),
    };

    if (data.product_id) {
      const product = await this.productSnapshot(Number(data.product_id), client);
      if (product) {
        // 产品地区表只保留扫码分类用途；防伪码授权地区统一读取产品所属经销商。
        Object.assign(data, await this.productCodeOwnershipData(product, client));
      }
    }
    if (!data.agent_id && region?.agent_id) {
      const agent = await this.agentSnapshot(Number(region.agent_id), client);
      if (!agent) throw new BadRequestException('所选经销商不存在');
      this.requireAgentRegion(agent);
      const agentName = safeText(agent.agent_name || agent.agent_code, 128);
      data.agent_id = agent.id;
      data.agent_name = agentName;
      data.province_name = safeText(agent.province, 64);
      data.city_name = safeText(agent.city, 64);
      data.region_group = [data.province_name, data.city_name, safeText(agent.district, 64)].filter(Boolean).join(' / ');
      data.distributor = agentName;
    }
    if (!data.company_name && data.manufacturer) data.company_name = data.manufacturer;
    Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
    return data;
  }

  private async syncProductRegionCodesCascade(region: any) {
    const codes = this.cleanCodeList(region?.codes, 50000, true);
    if (!codes.length) return { affected: 0, codes: 0 };
    const data = await this.productRegionOwnershipData(region);
    const affected = await this.updateCodesByChunks(codes, data);
    await this.recordTraceForCodes(codes, '产品地区绑定', {
      node_type: '产品地区归属',
      trace_key: `product-region:${region?.id || 'new'}:${region?.updated_at || Date.now()}`,
      content: `已将 ${codes.length} 个防伪码绑定到 ${region?.product_name || region?.product_code || '产品'} 的 ${data.region_group || data.province_name || '指定地区'}`,
      detail: { product_region_id: region?.id, product_code: data.product_code, province_name: data.province_name, city_name: data.city_name, region_group: data.region_group, warehouse: data.warehouse, distributor: data.distributor },
    }, { dedupeEvent: true }).catch(() => []);
    return { affected, codes: codes.length };
  }

  private async hydrateBoxPayload(payload: Record<string, any>, client: any = this.prisma) {
    const next: Record<string, any> = { ...payload };
    if (next.product_id) {
      const product = await this.productSnapshot(Number(next.product_id), client);
      if (product) {
        for (const field of ['product_code', 'product_name', 'batch_no', 'category', 'brand', 'specification', 'unit', 'production_place', 'manufacturer']) {
          this.fillIfBlank(next, field, product[field]);
        }
      }
    }
    if (next.agent_id) {
      const agent = await this.agentSnapshot(Number(next.agent_id), client);
      if (!agent) throw new BadRequestException('所选经销商不存在');
      const agentName = safeText(agent.agent_name || agent.agent_code, 128);
      next.agent_name = agentName;
      next.province_name = safeText(agent.province, 64);
      next.city_name = safeText(agent.city, 64);
      next.region_group = [next.province_name, next.city_name, safeText(agent.district, 64)].filter(Boolean).join(' / ');
      next.distributor = agentName;
    } else {
      const company = await this.companySnapshot(next.company_name || next.manufacturer, client);
      const companyName = safeText(company?.company_name || company?.manufacturer_name || next.company_name || next.manufacturer, 128);
      next.agent_id = null;
      next.agent_name = null;
      next.company_name = companyName || null;
      next.province_name = safeText(company?.province, 64);
      next.city_name = safeText(company?.city, 64);
      next.region_group = [next.province_name, next.city_name].filter(Boolean).join(' / ');
      next.distributor = companyName || null;
    }
    // 清理旧版装箱授权快照；只有发货单可以生成防伪码位置授权。
    next.authorization_address = null;
    next.authorization_level = null;
    next.authorization_source = null;
    if (!next.region_group && next.province_name) next.region_group = `${next.province_name}${next.city_name ? ` / ${next.city_name}` : ''}`;
    if (!next.company_name && next.manufacturer) next.company_name = next.manufacturer;
    if (Object.keys(next).some((key) => this.codePatchFields.includes(key))) next.ownership_at = new Date();
    return next;
  }

  private async ownershipDataForBox(box: any, client: any = this.prisma) {
    const payload = await this.hydrateBoxPayload(box || {}, client);
    const data: Record<string, any> = {
      box_id: box?.id || null,
      box_no: box?.box_no || null,
      product_id: payload.product_id || null,
      batch_no: payload.batch_no || null,
      box_bound_at: new Date(),
      ownership_at: new Date(),
    };
    for (const field of this.codePatchFields.filter((item) => !['box_id', 'box_no', 'product_id', 'batch_no', 'status', 'anti_channeling_enabled'].includes(item))) {
      data[field] = payload[field] ?? null;
    }
    return data;
  }

  private async hydrateCodePatch(patch: Record<string, any>, client: any = this.prisma) {
    const normalized = this.normalizePayload('codes', pickAllowed(patch || {}, this.codePatchFields));
    const data: Record<string, any> = {};
    for (const field of this.codePatchFields) {
      if (Object.prototype.hasOwnProperty.call(normalized, field)) data[field] = normalized[field];
    }

    const targetBox = await this.boxSnapshot(data.box_id, data.box_no, client);
    if ((this.isFilled(data.box_id) || this.isFilled(data.box_no)) && !targetBox) {
      throw new BadRequestException('指定的装箱码不存在，无法批量变更归属');
    }
    if (targetBox) {
      const boxData = await this.ownershipDataForBox(targetBox, client);
      Object.assign(data, boxData);
    } else if (data.product_id) {
      const product = await this.productSnapshot(Number(data.product_id), client);
      if (product) {
        for (const field of ['product_code', 'product_name', 'batch_no', 'category', 'brand', 'specification', 'unit', 'production_place', 'manufacturer']) {
          this.fillIfBlank(data, field, product[field]);
        }
      }
    }

    if (data.agent_id) {
      const agent = await this.agentSnapshot(Number(data.agent_id), client);
      if (!agent) throw new BadRequestException('所选经销商不存在');
      const agentName = safeText(agent.agent_name || agent.agent_code, 128);
      data.agent_name = agentName;
      data.province_name = safeText(agent.province, 64);
      data.city_name = safeText(agent.city, 64);
      data.region_group = [data.province_name, data.city_name, safeText(agent.district, 64)].filter(Boolean).join(' / ');
      data.distributor = agentName;
    }
    if (!data.region_group && data.province_name) data.region_group = `${data.province_name}${data.city_name ? ` / ${data.city_name}` : ''}`;
    if (!data.company_name && data.manufacturer) data.company_name = data.manufacturer;
    if (!Object.keys(data).length) throw new BadRequestException('请至少填写一个要修改的字段');
    data.ownership_at = new Date();
    return { data, targetBox };
  }

  private async syncBoxCodesCascadeTx(client: any, box: any, codes?: string[]) {
    const sourceCodes = codes ?? await this.resolveStoredCodeReferences(box?.codes, client);
    const normalizedCodes = this.cleanCodeList(sourceCodes, 50000, true);
    if (!normalizedCodes.length) return 0;
    const ownership = await this.ownershipDataForBox(box, client);
    let affected = 0;
    for (let i = 0; i < normalizedCodes.length; i += 1000) {
      const chunk = normalizedCodes.slice(i, i + 1000);
      const result = await client.antiFakeCode.updateMany({ where: this.codeWhere(chunk), data: ownership });
      affected += Number(result.count || 0);
    }
    return affected;
  }

  private async clearRemovedBoxCodesTx(client: any, box: any, codes: string[]) {
    const normalizedCodes = this.cleanCodeList(codes, 50000, true);
    if (!normalizedCodes.length) return 0;
    const data = {
      box_id: null,
      box_no: null,
      box_bound_at: null,
      ownership_at: new Date(),
    };
    let affected = 0;
    for (let i = 0; i < normalizedCodes.length; i += 1000) {
      const chunk = normalizedCodes.slice(i, i + 1000);
      const result = await client.antiFakeCode.updateMany({
        where: { AND: [this.codeWhere(chunk), { OR: [{ box_id: Number(box.id) }, { box_no: box.box_no || '' }] }] },
        data,
      });
      affected += Number(result.count || 0);
    }
    // 从箱内移除后恢复产品/公司快照。
    await this.restoreProductAuthorizationForCodesTx(client, normalizedCodes);
    return affected;
  }

  private async cascadeProductMetaToCodes(product: any) {
    if (!product?.id) return { codes: 0, boxes: 0 };
    const meta = this.productBaseSnapshotData(product);
    delete (meta as any).product_id;
    const unboxedSnapshot = this.unboxedCodeSnapshotData(product);
    const [codes, unboxedCodes, boxes] = await this.prisma.$transaction([
      this.prisma.antiFakeCode.updateMany({ where: { product_id: Number(product.id) }, data: { ...meta, ownership_at: new Date() } }),
      this.prisma.antiFakeCode.updateMany({ where: { product_id: Number(product.id), box_id: null }, data: unboxedSnapshot }),
      this.prisma.box.updateMany({ where: { product_id: Number(product.id) }, data: meta }),
    ]).catch(() => [{ count: 0 }, { count: 0 }, { count: 0 }]);
    return { codes: Number((codes as any).count || 0) + Number((unboxedCodes as any).count || 0), boxes: Number((boxes as any).count || 0) };
  }

  private isCanonicalBoxNo(value: unknown) {
    return /^QRB-[1-9]\d*$/i.test(String(value || '').trim());
  }

  private generatedBoxNo(id: unknown) {
    const boxId = Number(id);
    if (!Number.isSafeInteger(boxId) || boxId <= 0) throw new BadRequestException('箱码编号生成失败，请稍后重试');
    return `QRB-${boxId}`;
  }

  private isBoxNoUniqueConflict(error: unknown) {
    const current = error as any;
    if (String(current?.code || '') !== 'P2002') return false;
    const target = Array.isArray(current?.meta?.target) ? current.meta.target.map(String) : [String(current?.meta?.target || '')];
    return !target.some(Boolean) || target.some((item: string) => /box_no/i.test(item));
  }

  private async createBoxWithCascade(payload: Record<string, any>) {
    const requestedInput = safeText(payload?.box_no, 128);
    if (requestedInput && !this.isCanonicalBoxNo(requestedInput)) {
      throw new BadRequestException('箱码编号格式不规范；请留空由系统生成，格式为 QRB-全局编号，例如 QRB-1');
    }

    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const row = await this.prisma.$transaction(async (tx: any) => {
          const data = await this.hydrateBoxPayload(payload, tx);
          const plaintextCodes = this.cleanCodeList(data.codes, 50000, true);
          if (Array.isArray(data.codes)) data.codes = this.storedCodeReferences(plaintextCodes);
          const requestedNo = safeText(data.box_no, 128);
          data.box_no = requestedNo ? requestedNo.toUpperCase() : null;
          const created = await tx.box.create({ data });
          const stored = requestedNo
            ? created
            : await tx.box.update({ where: { id: created.id }, data: { box_no: this.generatedBoxNo(created.id) } });
          await this.syncBoxCodesCascadeTx(tx, stored, plaintextCodes);
          return this.hydrateBoxCodeList(stored, tx);
        });
        await this.recordBoxTraceEvent(row, '装箱建档', { trace_key: `box-created:${row.id}`, content: `箱码 ${row.box_no || row.id} 已创建并进入装箱流程` });
        return row;
      } catch (error) {
        if (!requestedInput && attempt + 1 < maxAttempts && this.isBoxNoUniqueConflict(error)) continue;
        throw error;
      }
    }
    throw new BadRequestException('箱码编号生成失败，请稍后重试');
  }

  private async updateBoxWithCascade(id: string | number, payload: Record<string, any>) {
    const previous = await this.withMissingColumnRepair<any | null>(() => this.prisma.box.findUnique({ where: { id: safeId(id) } }), 'boxes');
    if (!previous) throw new NotFoundException('箱码不存在');
    if (Object.prototype.hasOwnProperty.call(payload, 'box_no')) {
      const requestedNo = safeText(payload.box_no, 128);
      if (requestedNo && requestedNo !== previous.box_no) throw new BadRequestException('箱码编号由系统生成，创建后不可修改');
      delete payload.box_no;
    }
    const hydratedPrevious = await this.hydrateBoxCodeList(previous);
    const beforeCodes = this.cleanCodeList(hydratedPrevious.codes, 50000, true);
    const row = await this.prisma.$transaction(async (tx: any) => {
      const data = await this.hydrateBoxPayload(payload, tx);
      const afterCodes = Array.isArray(data.codes) ? this.cleanCodeList(data.codes, 50000, true) : beforeCodes;
      if (Array.isArray(data.codes)) data.codes = this.storedCodeReferences(afterCodes);
      const updated = await tx.box.update({ where: { id: previous.id }, data });
      const afterSet = new Set(afterCodes);
      const removed = beforeCodes.filter((code) => !afterSet.has(code));
      await this.clearRemovedBoxCodesTx(tx, updated, removed);
      await this.syncBoxCodesCascadeTx(tx, updated, afterCodes);
      return this.hydrateBoxCodeList(updated, tx);
    });
    await this.recordBoxTraceEvent(row, Array.isArray(payload.codes) ? '装箱码清单更新' : '装箱归属变更', {
      trace_key: `box-updated:${row.id}:${row.updated_at}`,
      content: `箱码 ${row.box_no || row.id} 已级联更新 ${this.cleanCodeList(row.codes, 50000, true).length} 个防伪码`,
    });
    return row;
  }

  private async resolveBatchUpdateScope(body: Record<string, any>, where: Record<string, any>) {
    const limit = Math.min(Math.max(Number(body.limit || 50000), 1), 50000);
    const rows = await this.prisma.antiFakeCode.findMany({
      where,
      select: { id: true, code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true, box_id: true, box_no: true },
      take: limit + 1,
      orderBy: { id: 'asc' },
    });
    if (rows.length > limit) throw new BadRequestException(`本次命中超过 ${limit} 条，请缩小筛选条件或分批处理`);
    if (!rows.length) throw new BadRequestException('没有找到可修改的防伪码');
    return this.hydrateCodeRows(rows as any[]);
  }

  private async rewriteBoxCodeListsTx(client: any, rows: any[], targetBox: any | null) {
    const previousBoxIds = Array.from(new Set(rows.map((row) => Number(row.box_id)).filter((id) => Number.isInteger(id) && (!targetBox || id !== Number(targetBox.id)))));
    if (previousBoxIds.length) {
      const previousBoxes = await client.box.findMany({ where: { id: { in: previousBoxIds } }, select: { id: true, codes: true } });
      const movedSet = new Set(rows.map((row) => String(row.code)));
      for (const box of previousBoxes) {
        const currentCodes = await this.resolveStoredCodeReferences(box.codes, client);
        const nextCodes = this.cleanCodeList(currentCodes, 50000, true).filter((code) => !movedSet.has(code));
        await client.box.update({ where: { id: box.id }, data: { codes: this.storedCodeReferences(nextCodes), ownership_at: new Date() } });
      }
    }
    if (targetBox) {
      const incoming = rows.map((row) => String(row.code));
      const targetCodes = await this.resolveStoredCodeReferences(targetBox.codes, client);
      const merged = Array.from(new Set([...this.cleanCodeList(targetCodes, 50000, true), ...incoming]));
      await client.box.update({ where: { id: targetBox.id }, data: { codes: this.storedCodeReferences(merged), ownership_at: new Date() } });
    }
  }

  async batchUpdateCodes(body: Record<string, any> = {}) {
    const rawCodes = this.cleanCodeList(body.codes || body.code_list || body.import_codes, 50000, true);
    const where = rawCodes.length
      ? this.codeWhere(rawCodes)
      : this.codeWhereByQuery(body.filters || body.query || {});
    if (!rawCodes.length && !Object.keys(where).length && body.allow_all !== true) {
      throw new BadRequestException('条件筛选批量修改必须提供筛选条件；如需全量修改请显式传 allow_all=true');
    }

    const patchSource = body.patch && typeof body.patch === 'object' ? body.patch : body;
    const { data, targetBox } = await this.hydrateCodePatch(patchSource);
    const scopeRows: Array<{ code: string | number; box_id?: number | string | null }> = await this.resolveBatchUpdateScope(body, where);

    if (data.anti_channeling_enabled === true) {
      const boxIds = Array.from(new Set(scopeRows
        .map((row) => Number(row.box_id || 0))
        .filter((boxId) => Number.isInteger(boxId) && boxId > 0)));
      if (boxIds.length) {
        const boxes = await this.prisma.box.findMany({ where: { id: { in: boxIds } }, select: { id: true, box_no: true, agent_id: true } });
        const missingAgent = boxes.find((box: any) => !box.agent_id);
        if (missingAgent) {
          throw new BadRequestException(`箱子 ${missingAgent.box_no || missingAgent.id} 未选择装箱位置代理商，不能为箱内防伪码开启防窜校验`);
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx: any) => {
      await this.rewriteBoxCodeListsTx(tx, scopeRows, targetBox);
      return tx.antiFakeCode.updateMany({ where: { id: { in: scopeRows.map((row: any) => Number(row.id)).filter(Boolean) } }, data });
    });

    await this.recordTraceForCodes(scopeRows.map((row) => String(row.code)), '防伪码批量修改', {
      node_type: '防伪码批量维护',
      trace_key: `code-batch-update:${Date.now()}:${scopeRows.length}`,
      content: `批量修改 ${scopeRows.length} 个防伪码，已同步产品/公司/地区/箱码归属字段`,
      detail: { patch: data, mode: rawCodes.length ? 'codes' : 'filters' },
    }, { dedupeEvent: true }).catch(() => []);

    return {
      affected: Number(result.count || 0),
      matched: scopeRows.length,
      mode: rawCodes.length ? 'codes' : 'filters',
      target_box: targetBox ? { id: targetBox.id, box_no: targetBox.box_no } : null,
    };
  }

  private async enrichRows(resource: string, rows: any[]) {
    if (!rows.length) return rows;
    if (resource === 'box') rows = await Promise.all(rows.map((row: any) => this.hydrateBoxCodeList(row)));
    if (resource === 'trace') {
      const refs = rows.map((row: any) => row.anti_fake_code).filter(Boolean);
      const resolved = await this.resolveStoredCodeReferences(refs);
      let index = 0;
      rows = rows.map((row: any) => row.anti_fake_code ? { ...row, anti_fake_code: resolved[index++] || row.anti_fake_code } : row);
    }
    const productIds = Array.from(new Set(rows.map((row: any) => Number(row.product_id)).filter((id: any) => Number.isInteger(id) && id > 0)));
    const agentIds = Array.from(new Set(rows.map((row: any) => Number(row.agent_id)).filter((id: any) => Number.isInteger(id) && id > 0)));
    const shipmentIds = Array.from(new Set(rows.map((row: any) => Number(row.shipment_id)).filter((id: any) => Number.isInteger(id) && id > 0)));
    const shipmentBoxIds = resource === 'shipments'
      ? Array.from(new Set(rows.flatMap((row: any) => safeJsonArray(row.box_ids).map((item: any) => Number(item)).filter((id: number) => Number.isInteger(id) && id > 0))))
      : [];
    const codeBoxIds = resource === 'codes'
      ? Array.from(new Set(rows.map((row: any) => Number(row.box_id)).filter((id: number) => Number.isInteger(id) && id > 0)))
      : [];

    const [products, agents, shipments, shipmentBoxes, codeBoxes] = await Promise.all([
      productIds.length ? this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, product_name: true, product_code: true } }) : [],
      agentIds.length ? this.prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, agent_name: true, agent_code: true } }) : [],
      shipmentIds.length ? this.prisma.shipment.findMany({ where: { id: { in: shipmentIds } }, select: { id: true, shipment_no: true } }) : [],
      shipmentBoxIds.length ? this.prisma.box.findMany({ where: { id: { in: shipmentBoxIds } }, select: { id: true, product_name: true, product_code: true, batch_no: true } }) : [],
      codeBoxIds.length ? this.prisma.box.findMany({ where: { id: { in: codeBoxIds } }, select: { id: true, status: true } }) : [],
    ]);
    const productMap = new Map(products.map((item: any) => [item.id, `${item.product_name || '-'}（${item.product_code || item.id}）`]));
    const agentMap = new Map(agents.map((item: any) => [item.id, `${item.agent_name || '-'}（${item.agent_code || item.id}）`]));
    const shipmentMap = new Map(shipments.map((item: any) => [item.id, item.shipment_no || String(item.id)]));
    const shipmentBoxMap = new Map(shipmentBoxes.map((item: any) => [Number(item.id), item]));
    const codeBoxStatusMap = new Map(codeBoxes.map((item: any) => [Number(item.id), Number(item.status || 0)]));

    return rows.map((row: any) => {
      const productExtras = resource === 'products' ? this.asRecord(row.extra_fields) : {};
      const rowShipmentBoxes = resource === 'shipments'
        ? safeJsonArray(row.box_ids).map((id: any) => shipmentBoxMap.get(Number(id))).filter(Boolean)
        : [];
      const shipmentProductNames = Array.from(new Set(rowShipmentBoxes.map((box: any) => safeText(box?.product_name || box?.product_code, 128)).filter(Boolean))).join('、');
      return {
        ...row,
        storage_condition: resource === 'products' ? this.productStorageCondition(row) || null : row.storage_condition,
        extra_fields: resource === 'products' && productExtras.storage_condition && !productExtras['贮藏方法']
          ? { ...productExtras, 贮藏方法: productExtras.storage_condition }
          : row.extra_fields,
        product_label: row.product_id ? productMap.get(Number(row.product_id)) || String(row.product_id) : null,
        agent_label: row.agent_id ? agentMap.get(Number(row.agent_id)) || String(row.agent_id) : null,
        shipment_label: row.shipment_id ? shipmentMap.get(Number(row.shipment_id)) || String(row.shipment_id) : null,
        product_names: resource === 'shipments' ? shipmentProductNames || row.batch_no || null : undefined,
        product_name: resource === 'shipments' ? shipmentProductNames || row.batch_no || null : row.product_name,
        box_status: resource === 'codes' && row.box_id ? codeBoxStatusMap.get(Number(row.box_id)) ?? null : undefined,
        box_count: Array.isArray(row.box_ids) ? row.box_ids.length : undefined,
        code_count: Array.isArray(row.codes) ? row.codes.length : undefined,
        return_code_count: Array.isArray(row.return_codes) ? row.return_codes.length : undefined,
      };
    });
  }

  private normalizeTraceChain(chain: any[]) {
    return safeJsonArray(chain).sort((a: any, b: any) => {
      const at = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bt = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
      return at - bt;
    });
  }

  private async enrichBoxDetail(row: any) {
    const codes = safeJsonArray(row.codes).map((item: any) => String(item).trim()).filter(Boolean);
    if (!codes.length) return { ...row, codes: [], code_count: 0, code_details: [] };

    const [storedCodeRows, traceRows] = await Promise.all([
      this.prisma.antiFakeCode.findMany({
        where: this.codeWhere(codes),
        select: {
          id: true, code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true,
          product_id: true, batch_no: true, status: true, query_count: true, activated_at: true, expires_at: true,
          first_query_at: true, last_query_at: true, created_at: true, updated_at: true,
        },
      }).catch(() => []),
      this.prisma.traceRecord.findMany({
        where: { anti_fake_code: { in: [...codes, ...this.storedCodeReferences(codes)] } },
        select: { id: true, trace_no: true, anti_fake_code: true, status: true, production_date: true, production_place: true, manufacturer: true, updated_at: true },
      }).catch(() => []),
    ]);
    const codeRows = this.hydrateCodeRows(storedCodeRows as any[]);
    const codeMap = new Map(codeRows.map((item: any) => [String(item.code), item]));
    const traceMap = new Map<string, any>();
    for (const item of traceRows) {
      traceMap.set(String(item.anti_fake_code), item);
      const hash = this.codeVault.hashFromReference(item.anti_fake_code);
      if (hash) {
        const codeRow = codeRows.find((row: any) => row.code_hash === hash);
        if (codeRow) traceMap.set(String(codeRow.code), item);
      }
    }
    return {
      ...row,
      codes,
      code_count: codes.length,
      code_details: codes.map((code: string, index: number) => {
        const item: any = codeMap.get(code) || {};
        const trace: any = traceMap.get(code) || {};
        return {
          index: index + 1,
          code,
          product_id: item.product_id ?? row.product_id ?? null,
          batch_no: item.batch_no || row.batch_no || null,
          status: item.status ?? null,
          query_count: item.query_count ?? 0,
          code_generated_at: item.created_at || null,
          activated_at: item.activated_at || null,
          expires_at: item.expires_at || null,
          first_query_at: item.first_query_at || null,
          last_query_at: item.last_query_at || null,
          trace_id: trace.id || null,
          trace_no: trace.trace_no || null,
          trace_status: trace.status ?? null,
          production_date: trace.production_date || null,
          production_place: trace.production_place || null,
          manufacturer: trace.manufacturer || null,
          trace_updated_at: trace.updated_at || null,
        };
      }),
    };
  }

  private compactTimestamp(date = new Date()) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  private async generateUniqueProductCode() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const suffix = nanoid().replace(/[^0-9A-Za-z]/g, '').slice(0, 6).toUpperCase();
      const code = `P${this.compactTimestamp()}${suffix}`;
      const existed = await this.prisma.product.findUnique({ where: { product_code: code }, select: { id: true } }).catch(() => null);
      if (!existed) return code;
    }
    return `P${Date.now()}${nanoid().slice(0, 8).toUpperCase()}`;
  }

  private requireProductBaseFields(payload: Record<string, any>) {
    this.nonEmptyString(payload.batch_no, '生产批号', 64);
    this.nonEmptyString(payload.manufacturer, '所属公司（制造商）', 128);
    this.nonEmptyString(payload.shelf_life, '保质期', 64);
  }

  async traceWorkflowOverview() {
    await Promise.allSettled([
      this.ensureProductSchemaColumns(),
      this.ensureResourceRuntimeSchema('codes'),
      this.ensureResourceRuntimeSchema('box'),
      this.ensureResourceRuntimeSchema('shipments'),
      this.ensureResourceRuntimeSchema('trace'),
    ]);

    const safeCount = async (runner: () => Promise<number>) => runner().catch(() => 0);
    const safeList = async <T = any>(runner: () => Promise<T[]>) => runner().catch(() => [] as T[]);
    const [
      products,
      productsWithRegion,
      codes,
      activatedCodes,
      boxedCodes,
      traces,
      productTraces,
      boxes,
      sealedBoxes,
      shipments,
      shippedShipments,
      shipmentCodes,
      latestProducts,
      latestBoxes,
      latestShipments,
    ] = await Promise.all([
      safeCount(() => this.prisma.product.count()),
      safeCount(() => this.prisma.product.count({ where: { extra_fields: { path: ['product_owner_mode'], equals: 'region' } as any } })),
      safeCount(() => this.prisma.antiFakeCode.count()),
      safeCount(() => this.prisma.antiFakeCode.count({ where: { status: { in: [1, 4] } } })),
      safeCount(() => this.prisma.antiFakeCode.count({ where: { box_id: { not: null } } })),
      safeCount(() => this.prisma.traceRecord.count()),
      safeCount(() => this.prisma.traceRecord.count({ where: { anti_fake_code: null } })),
      safeCount(() => this.prisma.box.count()),
      safeCount(() => this.prisma.box.count({ where: { status: { gte: 1 } } })),
      safeCount(() => this.prisma.shipment.count()),
      safeCount(() => this.prisma.shipment.count({ where: { status: { gte: 1 } } })),
      safeCount(() => this.prisma.antiFakeCode.count({ where: { agent_id: { not: null } } })),
      safeList(() => this.prisma.product.findMany({ orderBy: { id: 'desc' }, take: 5, select: { id: true, product_code: true, product_name: true, batch_no: true, category: true, created_at: true } })),
      safeList(() => this.prisma.box.findMany({ orderBy: { id: 'desc' }, take: 5, select: { id: true, box_no: true, batch_no: true, product_name: true, status: true, created_at: true } })),
      safeList(() => this.prisma.shipment.findMany({ orderBy: { id: 'desc' }, take: 5, select: { id: true, shipment_no: true, batch_no: true, receiver: true, region_group: true, status: true, created_at: true } })),
    ]);

    const safeRawCount = async (tableName: string) => this.prisma.$queryRawUnsafe(`SELECT COUNT(1) AS total FROM \`${String(tableName).replace(/[^A-Za-z0-9_]/g, '')}\``)
      .then((rows: any) => Number(rows?.[0]?.total || 0))
      .catch(() => 0);
    const [productionBatches, productionSteps, packagingRelations, warehouseInRecords, marketScans, channelViolations, blockchainProofs] = await Promise.all([
      safeRawCount('production_batches'),
      safeRawCount('production_steps'),
      safeRawCount('packaging_relations'),
      safeRawCount('warehouse_in_records'),
      safeRawCount('market_scans'),
      safeRawCount('channel_violations'),
      safeRawCount('blockchain_proofs'),
    ]);

    const steps = [
      { key: 'base', title: '基础资料配置', route: '/products', total: products, done: products, auto: '创建产品后自动生成产品建档溯源节点；所属地区可选，不再强制填写公司。' },
      { key: 'codes', title: '生成溯源码', route: '/codes', total: codes, done: activatedCodes, auto: '生成防伪码时自动绑定产品、批次、有效期和产品归属快照。' },
      { key: 'trace', title: '建立批次与溯源环节', route: '/trace', total: traces, done: productTraces, auto: '产品、批次、生产流程、防伪码会自动汇入 trace_chain。' },
      { key: 'bind', title: '码与产品关联', route: '/box', total: codes, done: boxedCodes, auto: '扫码装箱时自动建立单品码、箱码和产品批次关联。' },
      { key: 'stock', title: '生产入库', route: '/box', total: boxes, done: sealedBoxes, auto: '箱码创建、加码、封箱会自动续写装箱/入库节点。' },
      { key: 'ship', title: '出库发货', route: '/shipments', total: shipments, done: shippedShipments, code_done: shipmentCodes, auto: '发货后自动锁定流向，将产品码、批次、经销商/区域、时间写入溯源和防窜。' },
    ];

    return {
      summary: { products, products_with_region: productsWithRegion, codes, activated_codes: activatedCodes, traces, boxes, sealed_boxes: sealedBoxes, shipments, shipped_shipments: shippedShipments, shipment_codes: shipmentCodes, production_batches: productionBatches, production_steps: productionSteps, packaging_relations: packagingRelations, warehouse_in_records: warehouseInRecords, market_scans: marketScans, channel_violations: channelViolations, blockchain_proofs: blockchainProofs },
      steps,
      latest: { products: latestProducts, boxes: latestBoxes, shipments: latestShipments },
      automation: {
        enabled: process.env.TRACE_AUTO_SYNC !== 'false',
        batch_mode: String(this.config.get('BATCH_TRACE_MODE') || process.env.BATCH_TRACE_MODE || 'async'),
        rule: '系统在产品建档、生成防伪码、批次环节、包装关联、生产入库、出库发货和市场扫码时自动补写溯源链；防窜预警仅由防伪码市场扫码触发。',
        v1_api: ['/api/v1/codes/generate', '/api/v1/packaging/relation', '/api/v1/batches', '/api/v1/warehouse/in', '/api/v1/shipment/out', '/api/v1/traceability/{code}', '/api/v1/scans/market', '/api/v1/violations'],
      },
    };
  }

  private automationLimit(value: unknown, fallback = 100) {
    const parsed = Number(value || fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.min(1000, Math.floor(parsed)));
  }

  private automationModuleKeys(value: unknown) {
    const allowed = ['product', 'codes', 'trace', 'box', 'shipment', 'anti-channeling'];
    const input = Array.isArray(value)
      ? value
      : String(value || '').split(/[\s,，;；|]+/);
    const normalized = input.map((item: any) => String(item || '').trim().toLowerCase()).filter(Boolean);
    if (!normalized.length || normalized.includes('all')) return allowed;
    return Array.from(new Set(normalized.filter((item) => allowed.includes(item))));
  }

  private automationSampleRate(value: unknown, fallback = 0.2) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0.05, Math.min(0.5, parsed));
  }

  private async antiChannelingAutomationPlan(body: Record<string, any>, limit: number) {
    const recentHours = Math.max(1, Math.min(168, Number(body.recent_hours || 24) || 24));
    const sampleRate = this.automationSampleRate(body.sample_rate, 0.2);
    const maxCandidates = Math.max(1, Math.min(500, Number(body.max_candidates || Math.min(limit, 50)) || 50));
    const logTake = Math.max(100, Math.min(5000, Number(body.log_limit || Math.max(limit * 10, 500)) || 500));
    const since = new Date(Date.now() - recentHours * 60 * 60 * 1000);
    const logs = await this.prisma.queryLog.findMany({
      where: { code: { not: null }, created_at: { gte: since } },
      orderBy: { created_at: 'desc' },
      take: logTake,
    });
    const uniqueLogCodes = Array.from(new Set(logs.map((item: any) => String(item.code || '').trim()).filter(Boolean)));
    const logHashes = uniqueLogCodes.map((code) => this.codeVault.hashFromReference(code)).filter(Boolean) as string[];
    const storedCodeRows = uniqueLogCodes.length
      ? await this.prisma.antiFakeCode.findMany({ where: { OR: [{ code_hash: { in: logHashes } }, { code: { in: uniqueLogCodes } }] }, select: ANTI_FAKE_CODE_TRACE_SELECT })
      : [];
    const codeRows = this.hydrateCodeRows(storedCodeRows as any[]);
    const codeMap = new Map<string, any>();
    for (const row of codeRows) {
      codeMap.set(String(row.code), row);
      codeMap.set(this.codeVault.reference(String(row.code)), row);
    }
    const eligibleLogs = logs.filter((item: any) => codeMap.has(String(item.code || '').trim()));
    const selection = selectAntiChannelingCandidates(eligibleLogs, { sampleRate, maxCandidates });
    const candidates = selection.candidates.map((candidate) => ({
      ...candidate,
      anti_fake_code: codeMap.get(candidate.code),
    }));
    return {
      logs,
      candidates,
      stats: {
        ...selection.stats,
        inspected_log_count: logs.length,
        eligible_log_count: eligibleLogs.length,
        recent_hours: recentHours,
        eligible_anti_fake_codes: candidates.length,
        skipped_not_anti_fake_code: Math.max(logs.length - eligibleLogs.length, 0),
        skipped_code_types: Math.max(uniqueLogCodes.length - codeRows.length, 0),
      },
    };
  }

  private traceAutomationHealth(total: number, automated: number, pending: number) {
    if (!total) return { score: 100, status: 'healthy' };
    const coverage = Math.max(0, Math.min(100, Math.round((automated / Math.max(total, 1)) * 100)));
    const penalty = Math.min(30, Math.round((pending / Math.max(total, 1)) * 30));
    const score = Math.max(0, Math.min(100, coverage - penalty));
    return { score, status: score >= 90 ? 'healthy' : score >= 70 ? 'attention' : 'warning' };
  }

  async traceAutomationOverview(module?: string, options: { repairSchema?: boolean } = {}) {
    if (options.repairSchema !== false) {
      await Promise.allSettled([
        this.ensureProductSchemaColumns(),
        this.ensureResourceRuntimeSchema('codes'),
        this.ensureResourceRuntimeSchema('box'),
        this.ensureResourceRuntimeSchema('shipments'),
        this.ensureResourceRuntimeSchema('trace'),
      ]);
    }

    const safeCount = async (runner: () => Promise<number>) => runner().catch(() => 0);
    const [
      productTotal,
      productIncomplete,
      codeTotal,
      codeLinked,
      traceTotal,
      boxTotal,
      boxWithCodes,
      sealedBoxes,
      shipmentTotal,
      shippedShipments,
      alertTotal,
      pendingAlerts,
      recentScanCount,
    ] = await Promise.all([
      safeCount(() => this.prisma.product.count()),
      safeCount(() => this.prisma.product.count({ where: { OR: [{ batch_no: null }, { batch_no: '' }, { manufacturer: null }, { manufacturer: '' }, { shelf_life: null }, { shelf_life: '' }] } })),
      safeCount(() => this.prisma.antiFakeCode.count()),
      safeCount(() => this.prisma.antiFakeCode.count({ where: { product_id: { not: null } } })),
      safeCount(() => this.prisma.traceRecord.count()),
      safeCount(() => this.prisma.box.count()),
      safeCount(async () => { const rows: any = await this.prisma.$queryRawUnsafe('SELECT COUNT(1) AS total FROM boxes WHERE codes IS NOT NULL AND JSON_LENGTH(codes) > 0'); return Number(rows?.[0]?.total || 0); }),
      safeCount(() => this.prisma.box.count({ where: { status: { gte: 1 } } })),
      safeCount(() => this.prisma.shipment.count()),
      safeCount(() => this.prisma.shipment.count({ where: { status: { gte: 1 } } })),
      safeCount(() => this.prisma.antiChannelingAlert.count()),
      safeCount(() => this.prisma.antiChannelingAlert.count({ where: { status: { in: [0, 1, 2] } } })),
      safeCount(() => this.prisma.queryLog.count({ where: { code: { not: null }, created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })),
    ]);

    const [traceRows, traceCodeRows] = await Promise.all([
      this.prisma.traceRecord.findMany({ orderBy: { updated_at: 'desc' }, take: 500 }).catch(() => []),
      this.prisma.traceRecord.findMany({ where: { anti_fake_code: { not: null } }, select: { anti_fake_code: true }, distinct: ['anti_fake_code'], take: 20000 }).catch(() => []),
    ]);
    const tracedCodeCount = traceCodeRows.length;
    const incompleteTraceCount = traceRows.filter((row: any) => {
      const chain = this.normalizeTraceChain(row.trace_chain);
      const text = chain.map((node: any) => `${node?.node_type || ''} ${node?.node_name || ''} ${node?.content || ''}`).join(' ');
      return !row.product_id || !row.anti_fake_code || !row.batch_no || chain.length < 3 || !/装箱|发货|物流|仓储|box|shipment|logistics/i.test(text);
    }).length;

    const unlinkedCodeCount = Math.max(codeTotal - codeLinked, 0);
    const tracedLinkedCodeCount = Math.min(codeLinked, tracedCodeCount);
    const productRepairable = Math.max(codeLinked - tracedLinkedCodeCount, 0);
    const rawModules = [
      {
        key: 'product', title: '产品管理', route: '/products', icon: 'product',
        total: productTotal + codeTotal + codeLinked, automated: Math.max(productTotal - productIncomplete, 0) + codeLinked + tracedLinkedCodeCount, pending: productIncomplete + unlinkedCodeCount + productRepairable,
        repairable: productRepairable, blocked: productIncomplete + unlinkedCodeCount,
        description: '校验产品批次、制造商、保质期和经销商归属，并自动刷新关联防伪码快照及产品溯源节点。',
        actions: ['补写产品建档节点', '刷新关联防伪码产品快照', '同步产品批次溯源'],
        checks: [
          { key: 'metadata', label: '产品必填资料', total: productTotal, passed: Math.max(productTotal - productIncomplete, 0), pending: productIncomplete, repairable: false },
          { key: 'code-link', label: '防伪码产品关联', total: codeTotal, passed: codeLinked, pending: unlinkedCodeCount, repairable: false },
          { key: 'trace-link', label: '产品与防伪码溯源链', total: codeLinked, passed: tracedLinkedCodeCount, pending: productRepairable, repairable: true },
        ],
      },
      {
        key: 'codes', title: '防伪码管理', route: '/codes', icon: 'code',
        total: codeTotal + codeLinked, automated: codeLinked + tracedLinkedCodeCount, pending: unlinkedCodeCount + productRepairable,
        repairable: productRepairable, blocked: unlinkedCodeCount,
        description: '仅防伪码作为一物一码身份；自动绑定产品、批次、有效期和装箱，发货后再写入授权区域快照。',
        actions: ['生成码后自动建链', '补齐缺失 trace 记录', '同步状态与归属快照'],
        checks: [
          { key: 'product-binding', label: '产品绑定', total: codeTotal, passed: codeLinked, pending: unlinkedCodeCount, repairable: false },
          { key: 'trace-record', label: '溯源记录', total: codeLinked, passed: tracedLinkedCodeCount, pending: productRepairable, repairable: true },
        ],
      },
      {
        key: 'trace', title: '溯源管理', route: '/trace', icon: 'trace',
        total: traceTotal, automated: Math.max(traceTotal - incompleteTraceCount, 0), pending: incompleteTraceCount,
        repairable: incompleteTraceCount, blocked: 0,
        description: '扫描溯源链完整性，自动补齐产品、生产、质检、装箱、发货、退货和查询节点。',
        actions: ['重建固定模板', '去重续写业务节点', '检查字段与时序'],
        checks: [
          { key: 'chain-template', label: '固定模板与关键字段', total: traceTotal, passed: Math.max(traceTotal - incompleteTraceCount, 0), pending: incompleteTraceCount, repairable: true },
          { key: 'dedupe', label: '节点幂等去重', total: traceTotal, passed: traceTotal, pending: 0, repairable: true },
        ],
      },
      {
        key: 'box', title: '装箱管理', route: '/box', icon: 'box',
        total: boxTotal * 2, automated: boxWithCodes + sealedBoxes, pending: Math.max(boxTotal - boxWithCodes, 0) + Math.max(boxTotal - sealedBoxes, 0),
        repairable: Math.max(boxTotal - boxWithCodes, 0), blocked: Math.max(boxTotal - sealedBoxes, 0),
        description: '自动建立防伪码—箱码层级，封箱后续写生产入库节点；箱码本身不触发防窜预警。',
        actions: ['同步箱内防伪码', '重放装箱/封箱节点', '校验重复装箱'],
        checks: [
          { key: 'box-code-link', label: '箱内防伪码关联', total: boxTotal, passed: boxWithCodes, pending: Math.max(boxTotal - boxWithCodes, 0), repairable: true },
          { key: 'sealed', label: '封箱/入库状态', total: boxTotal, passed: sealedBoxes, pending: Math.max(boxTotal - sealedBoxes, 0), repairable: false },
        ],
      },
      {
        key: 'shipment', title: '发货管理', route: '/shipments', icon: 'shipment',
        total: shipmentTotal, automated: shippedShipments, pending: Math.max(shipmentTotal - shippedShipments, 0),
        repairable: 0, blocked: Math.max(shipmentTotal - shippedShipments, 0),
        description: '自动把经销商、授权区域、物流和签收状态写入箱内防伪码及溯源链；发货码不参与防窜。',
        actions: ['刷新发货流向快照', '续写出库/签收节点', '同步箱码与防伪码状态'],
        checks: [
          { key: 'lifecycle', label: '发货生命周期状态', total: shipmentTotal, passed: shippedShipments, pending: Math.max(shipmentTotal - shippedShipments, 0), repairable: false },
        ],
      },
      {
        key: 'anti-channeling', title: '防窜预警', route: '/anti-channeling', icon: 'risk',
        total: alertTotal, automated: Math.max(alertTotal - pendingAlerts, 0), pending: pendingAlerts,
        repairable: 0, blocked: pendingAlerts,
        description: '仅对真实防伪码的市场扫码执行区域、频率、设备和轨迹规则；装箱码及其他业务码全部跳过。',
        actions: ['风险候选采样复核', '同位置预警聚合展示', '保留人工闭环台账'],
        alert_total: alertTotal,
        checks: [
          { key: 'candidate-sampling', label: '近 24 小时风险候选池', total: recentScanCount, passed: recentScanCount, pending: 0, repairable: true },
          { key: 'open-alerts', label: '待闭环预警', total: alertTotal, passed: Math.max(alertTotal - pendingAlerts, 0), pending: pendingAlerts, repairable: false },
        ],
      },
    ].map((item) => ({ ...item, ...this.traceAutomationHealth(item.total, item.automated, item.pending) }));

    const requested = String(module || '').trim().toLowerCase();
    const modules = requested && requested !== 'all' ? rawModules.filter((item) => item.key === requested) : rawModules;
    const overallTotal = rawModules.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const overallAutomated = rawModules.reduce((sum, item) => sum + Number(item.automated || 0), 0);
    const overallPending = rawModules.reduce((sum, item) => sum + Number(item.pending || 0), 0);
    const overall = this.traceAutomationHealth(overallTotal, overallAutomated, overallPending);

    return {
      generated_at: new Date().toISOString(),
      enabled: process.env.TRACE_AUTO_SYNC !== 'false',
      mode: this.config.get<string>('OPENAI_API_KEY', '') ? 'ai-model-assisted' : 'rule-engine-assisted',
      policy: {
        anti_channeling_code_type: 'anti_fake_code_only',
        skipped_code_types: ['box', 'shipment', 'product', 'trace', 'return_order'],
        anti_channeling_scan_mode: 'risk_candidate_sampling',
        anti_channeling_default_sample_rate: 0.2,
        anti_channeling_same_location_popup: 'single',
        anti_channeling_popup_duration_ms: 10_000,
        trace_write_mode: 'idempotent_merge',
      },
      overall: { total: overallTotal, automated: overallAutomated, pending: overallPending, ...overall },
      modules,
      suggestions: [
        overallPending ? `当前识别到 ${overallPending} 项待自动补链或待业务闭环任务，可运行“一键 AI 自动化溯源”。` : '当前自动化链路运行正常，建议定期执行巡检保持数据一致。',
        '防窜判断只处理防伪码市场扫码，箱码、发货码、产品码和溯源码不会生成防窜预警。',
        '防窜自动巡检采用风险排序后的候选抽样，不逐个测试全部防伪码；同一异常位置的弹窗聚合为一条并在 10 秒后关闭。',
        '自动任务采用可重复执行的去重合并策略，不会因为重复运行而无限追加相同节点。',
      ],
    };
  }

  async runTraceAutomation(body: Record<string, any> = {}) {
    const dryRun = body.dry_run === true || String(body.dry_run || '').toLowerCase() === 'true';
    if (!dryRun && process.env.TRACE_AUTO_SYNC === 'false') throw new BadRequestException('自动溯源已关闭，请先设置 TRACE_AUTO_SYNC=true');
    // 先尝试补齐旧库字段；即使数据库账号没有 ALTER 权限，下面的显式 select 仍可兼容旧表运行。
    if (!dryRun) {
      await this.ensureRuntimeColumnsForTable('anti_fake_codes').catch((error: any) => {
        this.logger.warn(`防伪码旧库字段自动修复失败，将使用兼容查询继续运行：${error?.message || error}`);
      });
    }
    const modules = this.automationModuleKeys(body.modules || body.module);
    const limit = this.automationLimit(body.limit, 100);
    const startedAt = new Date();
    const results: Array<Record<string, any>> = [];
    const beforeOverview = await this.traceAutomationOverview('all', { repairSchema: !dryRun });
    const beforeModuleMap = new Map<string, any>((beforeOverview.modules || []).map((item: any) => [String(item.key), item]));

    const execute = async (
      key: string,
      runner: () => Promise<Record<string, any>>,
      inspector?: () => Promise<Record<string, any>>,
    ) => {
      const begin = Date.now();
      try {
        const before: any = beforeModuleMap.get(key) || {};
        const detail = dryRun
          ? (inspector ? await inspector() : {
              scanned: Math.min(Number(before.total || 0), limit),
              affected: 0,
              candidates: Math.min(Number(before.repairable ?? before.pending ?? 0), limit),
              blocked: Number(before.blocked || 0),
              checks: before.checks || [],
              message: '巡检完成，尚未写入或修改业务数据',
            })
          : await runner();
        results.push({
          key,
          success: true,
          duration_ms: Date.now() - begin,
          dry_run: dryRun,
          before_pending: Number(before.pending || 0),
          phases: [
            { key: 'inspect', label: '自动巡检', status: 'completed' },
            { key: 'repair', label: '自动补链', status: dryRun ? 'skipped' : 'completed' },
            { key: 'verify', label: '结果复检', status: dryRun ? 'planned' : 'pending' },
          ],
          ...detail,
        });
      } catch (error: any) {
        this.logger.error(`AI 自动化模块 ${key} 失败: ${error?.message || error}`);
        results.push({ key, success: false, duration_ms: Date.now() - begin, error: String(error?.message || error).slice(0, 500) });
      }
    };

    if (modules.includes('product')) await execute('product', async () => {
      const rows = await this.prisma.product.findMany({ orderBy: { updated_at: 'desc' }, take: Math.min(limit, 200) });
      let affected = 0;
      for (const product of rows) {
        await this.recordProductTraceEvent(product, 'AI 自动化产品同步', {
          trace_key: `ai-product:${product.id}:${product.updated_at || product.created_at}`,
          content: `AI 自动化已校验产品 ${product.product_name || product.product_code || product.id} 并刷新关联溯源`,
          detail: { automation: true, source: 'trace-automation', module: 'product' },
        });
        const synced: any = await this.syncTraceForProductCodes(product.id, product.batch_no || null, 'AI 自动化产品关联码同步', {
          trace_key: `ai-product-codes:${product.id}:${product.updated_at || product.created_at}`,
          detail: { automation: true, source: 'trace-automation', module: 'product' },
        });
        affected += Array.isArray(synced?.traces) ? synced.traces.length : 0;
      }
      return { scanned: rows.length, affected, message: '产品档案、关联防伪码快照与溯源节点已刷新' };
    });

    if (modules.includes('codes')) await execute('codes', async () => {
      const storedRows = await this.prisma.antiFakeCode.findMany({ select: ANTI_FAKE_CODE_TRACE_SELECT, orderBy: { updated_at: 'desc' }, take: limit });
      const rows = this.hydrateCodeRows(storedRows as any[]);
      const traces = await this.recordTraceForCodes(rows, 'AI 自动化防伪码同步', {
        node_type: '防伪码自动化',
        trace_key: 'ai-automation:codes:sync',
        content: `AI 自动化已扫描并同步 ${rows.length} 个防伪码`,
        detail: { automation: true, source: 'trace-automation', module: 'codes' },
      }, { dedupeEvent: true });
      return { scanned: rows.length, affected: traces.length, message: '防伪码产品、批次、状态和溯源关系已同步' };
    });

    if (modules.includes('trace')) await execute('trace', async () => {
      const storedRows = await this.prisma.antiFakeCode.findMany({
        where: body.batch_no ? { batch_no: String(body.batch_no).trim() } : undefined,
        select: ANTI_FAKE_CODE_TRACE_SELECT,
        orderBy: { updated_at: 'desc' }, take: limit,
      });
      const rows = this.hydrateCodeRows(storedRows as any[]);
      const traces = await this.recordTraceForCodes(rows, 'AI 自动化溯源补链', {
        node_type: 'AI 自动化巡检',
        trace_key: 'ai-automation:trace:audit',
        content: 'AI 自动化巡检已重新合并产品、生产、装箱、发货、退货和查询节点',
        detail: { automation: true, source: 'trace-automation', module: 'trace', checked_at: startedAt.toISOString() },
      }, { dedupeEvent: true });
      return { scanned: rows.length, affected: traces.length, message: '溯源链已按固定模板重新计算并去重合并' };
    });

    if (modules.includes('box')) await execute('box', async () => {
      const rows = await this.prisma.box.findMany({ orderBy: { updated_at: 'desc' }, take: limit });
      let affected = 0;
      for (const box of rows) {
        const result: any = await this.recordBoxTraceEvent(box, Number(box.status || 0) >= 1 ? 'AI 自动化封箱/入库同步' : 'AI 自动化装箱同步', {
          trace_key: `ai-box:${box.id}:${box.updated_at || box.created_at}`,
          content: `AI 自动化已复核箱码 ${box.box_no || box.id} 与箱内防伪码层级`,
          detail: { automation: true, source: 'trace-automation', module: 'box', box_status: box.status },
        });
        affected += Array.isArray(result?.traces) ? result.traces.length : 0;
      }
      return { scanned: rows.length, affected, message: '箱内防伪码绑定、封箱和入库节点已重放' };
    });

    if (modules.includes('shipment')) await execute('shipment', async () => {
      const [rows, draftCount] = await Promise.all([
        this.prisma.shipment.findMany({ where: { status: { gte: 1 } }, orderBy: { updated_at: 'desc' }, take: limit }),
        this.prisma.shipment.count({ where: { status: { lt: 1 } } }).catch(() => 0),
      ]);
      let affected = 0;
      for (const shipment of rows) {
        const result: any = await this.applyShipmentLifecycle(shipment, 'AI 自动化发货流向同步');
        affected += Number(result?.codes || 0);
      }
      return {
        scanned: rows.length,
        affected,
        skipped: draftCount,
        message: '仅同步已发货/已签收单据的流向与溯源；草稿和未发货单据未自动推进业务状态',
      };
    });

    if (modules.includes('anti-channeling')) await execute('anti-channeling', async () => {
      const plan = await this.antiChannelingAutomationPlan(body, limit);
      let alertCount = 0;
      for (const candidate of plan.candidates) {
        const log: any = candidate.log;
        const code = String(candidate.code || '').trim();
        const antiFakeCode: any = candidate.anti_fake_code;
        const result: any = await this.antiChanneling.evaluateScan({
          code,
          code_type: 'anti_fake_code',
          anti_fake_code: antiFakeCode,
          channel: log.channel || 'automation-audit',
          location: log.location || undefined,
          ip: log.ip || undefined,
          userAgent: log.user_agent || undefined,
          query_count: log.query_count || antiFakeCode.query_count || 0,
          query_log_id: log.id,
        });
        alertCount += Number(result?.alert_count || 0);
      }
      return {
        scanned: plan.logs.length,
        candidates: plan.candidates.length,
        affected: alertCount,
        skipped: Number(plan.stats.skipped_by_sampling || 0) + Number(plan.stats.skipped_not_anti_fake_code || 0),
        sampling: plan.stats,
        message: '已按风险排序抽取候选防伪码复核，不逐码测试全部防伪码；其他码型已跳过',
      };
    }, async () => {
      const plan = await this.antiChannelingAutomationPlan(body, limit);
      return {
        scanned: plan.logs.length,
        candidates: plan.candidates.length,
        affected: 0,
        skipped: Number(plan.stats.skipped_by_sampling || 0) + Number(plan.stats.skipped_not_anti_fake_code || 0),
        sampling: plan.stats,
        message: '防窜候选巡检完成，未执行预警写入',
      };
    });

    const afterOverview = dryRun ? beforeOverview : await this.traceAutomationOverview('all', { repairSchema: false });
    const afterModuleMap = new Map<string, any>((afterOverview.modules || []).map((item: any) => [String(item.key), item]));
    for (const result of results) {
      const after: any = afterModuleMap.get(result.key) || {};
      result.after_pending = Number(after.pending || 0);
      result.verified = result.success && (dryRun || result.after_pending <= Number(result.before_pending || 0));
      result.checks = after.checks || result.checks || [];
      if (Array.isArray(result.phases)) {
        const verifyPhase = result.phases.find((item: any) => item.key === 'verify');
        if (verifyPhase) verifyPhase.status = result.verified ? 'completed' : 'attention';
      }
    }
    const successCount = results.filter((item) => item.success).length;
    const affected = results.reduce((sum, item) => sum + Number(item.affected || 0), 0);
    return {
      run_id: `TRACE-AUTO-${Date.now()}-${nanoid().slice(0, 6).toUpperCase()}`,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      dry_run: dryRun,
      requested_modules: modules,
      success: successCount === results.length,
      summary: { modules: results.length, succeeded: successCount, failed: results.length - successCount, affected },
      results,
      policy: {
        anti_channeling_code_type: 'anti_fake_code_only',
        anti_channeling_scan_mode: 'risk_candidate_sampling',
        same_location_popup: 'single',
        popup_duration_ms: 10_000,
        idempotent: true,
      },
    };
  }

  async list(resource: string, query: Record<string, any>) {
    if (resource === 'products') return this.safeProductList(query);
    await this.ensureResourceRuntimeSchema(resource).catch((error) => this.logger.warn(`资源 ${resource} 表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const { delegate } = this.getDelegate(resource);
    const { page, pageSize, skip } = pageParams(query);
    const where = this.whereByQuery(resource, query);
    const tableName = this.resourceTableName(resource);
    const [total, rows] = await this.withMissingColumnRepair(() => Promise.all([
      delegate.count({ where }),
      delegate.findMany({ where, orderBy: { id: 'desc' }, skip, take: pageSize }),
    ]), tableName);
    const list = await this.withMissingColumnRepair(() => this.enrichRows(resource, rows), tableName);
    return { list, pagination: { page, pageSize, total } };
  }

  async detail(resource: string, id: string | number) {
    if (resource === 'products') return this.safeProductDetail(id);
    await this.ensureResourceRuntimeSchema(resource).catch((error) => this.logger.warn(`资源 ${resource} 表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const { delegate } = this.getDelegate(resource);
    const tableName = this.resourceTableName(resource);
    const row = await this.withMissingColumnRepair(() => delegate.findUnique({ where: { id: safeId(id) } }), tableName);
    if (!row) throw new NotFoundException('资源不存在');
    const [detail] = await this.withMissingColumnRepair(() => this.enrichRows(resource, [row]), tableName);
    if (resource === 'box') return this.enrichBoxDetail(detail);
    if (resource === 'trace') return { ...detail, trace_chain: this.normalizeTraceChain(detail.trace_chain) };
    return detail;
  }

  async create(resource: string, data: Record<string, any>) {
    await this.ensureResourceRuntimeSchema(resource).catch((error) => this.logger.warn(`资源 ${resource} 表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const { config, delegate } = this.getDelegate(resource);
    let payload = this.normalizePayload(resource, pickAllowed(data, config.allowedFields));
    if (resource === 'returns') payload = await this.hydrateReturnPayload(payload);
    if (resource === 'shipments') payload = await this.hydrateShipmentPayload(payload);
    if (resource !== 'box' && config.defaultNo && !payload[config.defaultNo]) {
      payload[config.defaultNo] = `${prefixForField(config.defaultNo)}${Date.now()}`;
    }
    if (resource === 'products') {
      await this.ensureProductSchemaColumns().catch((error) => this.logger.warn(`产品表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
      payload = await this.hydrateProductOwnerPayload(payload);
      if (!payload.product_code) payload.product_code = await this.generateUniqueProductCode();
      this.requireProductBaseFields(payload);
    }
    if (resource === 'agents') this.requireAgentRegion(payload);
    if (resource === 'box') return this.createBoxWithCascade(payload);
    if (resource === 'product-regions') {
      const tableName = this.resourceTableName(resource);
      const row = await this.withMissingColumnRepair(() => delegate.create({ data: payload }), tableName);
      await this.syncProductRegionCodesCascade(row);
      return row;
    }
    const tableName = this.resourceTableName(resource);
    const row = await this.withMissingColumnRepair<any>(() => delegate.create({ data: payload }), tableName);
    if (resource === 'products') {
      await this.recordProductTraceEvent(row, '产品建档', { trace_key: `product-created:${row.id}`, content: `产品 ${row.product_name || row.product_code || row.id} 已创建` });
      await this.cascadeProductMetaToCodes(row);
    }
    if (resource === 'process') {
      await this.syncProcessRecordTrace(row, '流程记录新增');
    }
    if (resource === 'shipments') {
      await this.applyShipmentLifecycle(row, '发货单创建');
    }
    if (resource === 'returns') {
      await this.applyReturnLifecycle(row, '退货单创建');
    }
    return row;
  }

  async update(resource: string, id: string | number, data: Record<string, any>) {
    await this.ensureResourceRuntimeSchema(resource).catch((error) => this.logger.warn(`资源 ${resource} 表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const { config, delegate } = this.getDelegate(resource);
    let payload = this.normalizePayload(resource, pickAllowed(data, config.allowedFields));
    if (resource === 'returns') payload = await this.hydrateReturnPayload(payload);
    if (resource === 'shipments') {
      // 通用编辑可能只提交局部字段。先读取原发货单，确保授权快照始终基于已选收件代理商。
      const tableName = this.resourceTableName(resource);
      const existing = await this.withMissingColumnRepair<any | null>(() => delegate.findUnique({ where: { id: safeId(id) } }), tableName);
      if (!existing) throw new NotFoundException('发货单不存在');
      if (Number(existing.status || 0) >= 1 && payload.agent_id && Number(payload.agent_id) !== Number(existing.agent_id)) {
        throw new BadRequestException('发货单已出库，不能更换收件代理商；请新建发货单以保留原授权轨迹');
      }
      payload = await this.hydrateShipmentPayload({ ...existing, ...payload }, this.prisma, safeId(id));
    }
    if (resource === 'products') await this.ensureProductSchemaColumns().catch((error) => this.logger.warn(`产品表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const current = await this.detail(resource, id);
    if (resource === 'products') {
      payload.extra_fields = data.extra_fields === undefined
        ? this.asRecord(current.extra_fields)
        : { ...this.asRecord(current.extra_fields), ...this.asRecord(payload.extra_fields) };
      payload = await this.hydrateProductOwnerPayload(payload);
    }
    if (resource === 'agents') {
      const nextAgent = { ...current, ...payload };
      // 允许先停用历史上未维护地区的经销商；重新启用或继续使用前必须至少选择省级地区。
      if (Number(nextAgent.status ?? 1) === 1) this.requireAgentRegion(nextAgent);
    }
    if (resource === 'box') return this.updateBoxWithCascade(id, payload);
    const tableName = this.resourceTableName(resource);
    const row = await this.withMissingColumnRepair<any>(() => delegate.update({ where: { id: safeId(id) }, data: payload }), tableName);
    if (resource === 'product-regions') {
      await this.syncProductRegionCodesCascade(row);
      return row;
    }
    if (resource === 'products') {
      await this.cascadeProductMetaToCodes(row);
      await this.syncTraceForProductCodes(row.id, null, '产品资料更新', { trace_key: `product-updated:${row.id}:${row.updated_at}`, content: `产品 ${row.product_name || row.product_code || row.id} 资料已更新，并已级联刷新关联防伪码产品快照` });
    }
    if (resource === 'process') {
      await this.syncProcessRecordTrace(row, '流程记录更新');
    }
    if (resource === 'shipments') {
      await this.applyShipmentLifecycle(row, '发货单更新');
    }
    if (resource === 'returns') {
      await this.applyReturnLifecycle(row, '退货单更新');
    }
    return row;
  }

  async remove(resource: string, id: string | number) {
    await this.ensureResourceRuntimeSchema(resource).catch((error) => this.logger.warn(`资源 ${resource} 表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const { delegate } = this.getDelegate(resource);
    await this.detail(resource, id);
    await delegate.delete({ where: { id: safeId(id) } });
    return null;
  }

  async productsSelect() {
    await this.ensureProductSchemaColumns().catch(() => undefined);
    const columns = await this.tableColumns('products');
    if (!columns.has('id')) return [];
    const selected = ['id', 'product_name', 'product_code', 'batch_no', 'category', 'manufacturer', 'extra_fields']
      .map((column) => columns.has(column) ? `\`${column}\`` : `NULL AS \`${column}\``)
      .join(', ');
    const whereSql = columns.has('status') ? 'WHERE `status` = 1' : '';
    const orderColumn = columns.has('id') ? 'id' : columns.has('created_at') ? 'created_at' : 'id';
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT ${selected} FROM \`products\` ${whereSql} ORDER BY \`${orderColumn}\` DESC LIMIT 1000`,
    ).catch((error: any) => {
      this.logger.warn(`产品下拉查询失败：${String(error?.message || error).slice(0, 220)}`);
      return [];
    }) as Array<{ id: number; product_name?: string | null; product_code?: string | null; batch_no?: string | null; category?: string | null; manufacturer?: string | null }>;
    return rows.map((r) => {
      const normalized = this.normalizeProductRow(r);
      const owner = normalized.product_owner_name ? ` · ${normalized.product_owner_name}` : '';
      const region = normalized.product_owner_region ? `（${normalized.product_owner_region}）` : '';
      return {
        label: `${r.product_name || '-'}${r.batch_no ? `（${r.batch_no}）` : `(${r.product_code || r.id})`}${owner}${region}`,
        value: r.id,
        ...normalized,
      };
    });
  }

  async productCategories() {
    await this.ensureProductSchemaColumns().catch(() => undefined);
    const columns = await this.tableColumns('products');
    if (!columns.has('category')) return [];
    const rows = await this.prisma.$queryRawUnsafe(
      "SELECT DISTINCT `category` FROM `products` WHERE `category` IS NOT NULL AND `category` <> \'\' ORDER BY `category` ASC LIMIT 200",
    ).catch((error: any) => {
      this.logger.warn(`产品分类查询失败：${String(error?.message || error).slice(0, 220)}`);
      return [];
    }) as Array<{ category?: string | null }>;
    return rows.map((row) => row.category).filter(Boolean);
  }


  private normalizePartnerKind(value: any): 'company' | 'agent' {
    const text = String(value || '').trim().toLowerCase();
    if (['agent', 'dealer', 'distributor', 'channel', '代理商', '经销商', '渠道'].includes(text)) return 'agent';
    return 'company';
  }

  private partnerKindLabel(kind: 'company' | 'agent') {
    return kind === 'agent' ? '代理商' : '公司';
  }

  private partnerId(kind: 'company' | 'agent', id: number | string) {
    return `${kind}:${id}`;
  }

  private parsePartnerId(raw: string | number) {
    const text = decodeURIComponent(String(raw || '')).trim();
    const match = text.match(/^(company|manufacturer|agent|dealer|distributor)[:_-](\d+)$/i);
    if (match) return { kind: this.normalizePartnerKind(match[1]), id: safeId(match[2]) };
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return { kind: 'company' as const, id: safeId(numeric) };
    throw new BadRequestException('企业主体ID格式错误');
  }

  private toPartnerRow(kind: 'company' | 'agent', row: Record<string, any>) {
    const isAgent = kind === 'agent';
    const sourceId = Number(row.id);
    const partyName = String(isAgent ? (row.agent_name || '') : (row.manufacturer_name || row.company_name || '')).trim();
    const partyCode = String(isAgent ? (row.agent_code || '') : (row.manufacturer_code || '')).trim();
    return {
      id: this.partnerId(kind, sourceId),
      source_id: sourceId,
      party_type: kind,
      party_type_label: this.partnerKindLabel(kind),
      party_code: partyCode,
      party_name: partyName,
      display_name: `${this.partnerKindLabel(kind)}｜${partyName || partyCode || sourceId}`,
      manufacturer_code: isAgent ? undefined : row.manufacturer_code,
      manufacturer_name: isAgent ? undefined : row.manufacturer_name,
      company_name: isAgent ? undefined : (row.company_name || row.manufacturer_name),
      social_credit_code: isAgent ? undefined : row.social_credit_code,
      legal_person: isAgent ? undefined : row.legal_person,
      production_license: isAgent ? undefined : row.production_license,
      quality_report: isAgent ? undefined : row.quality_report,
      agent_code: isAgent ? row.agent_code : undefined,
      agent_name: isAgent ? row.agent_name : undefined,
      agent_id: isAgent ? sourceId : undefined,
      level: isAgent ? row.level : undefined,
      parent_id: isAgent ? row.parent_id : undefined,
      contact_name: row.contact_name,
      contact_phone: row.contact_phone,
      contact_email: row.contact_email,
      province: row.province,
      city: row.city,
      district: isAgent ? row.district : undefined,
      address: row.address,
      business_license: row.business_license,
      status: row.status,
      remark: row.remark,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private partnerSearchHit(row: Record<string, any>, keyword: string) {
    if (!keyword) return true;
    const haystack = [
      row.party_type_label, row.party_code, row.party_name, row.company_name, row.agent_name,
      row.contact_name, row.contact_phone, row.contact_email, row.province, row.city, row.district, row.address,
      row.business_license, row.social_credit_code, row.production_license, row.remark,
    ].map((item) => String(item || '').toLowerCase()).join(' ');
    return haystack.includes(keyword.toLowerCase());
  }

  private partnerLocationLabel(row: Record<string, any>) {
    return [row.province, row.city, row.district].filter(Boolean).join('/') || '';
  }

  private partnerSelectOption(row: Record<string, any>) {
    const location = this.partnerLocationLabel(row);
    const code = String(row.party_code || '').trim();
    return {
      label: `【${row.party_type_label}】${row.party_name || row.party_code || row.source_id}${code ? `（${code}）` : ''}${location ? `｜${location}` : ''}`,
      value: row.id,
      ...row,
    };
  }

  private normalizePartnerPayload(kind: 'company' | 'agent', data: Record<string, any>) {
    const name = safeText(data.party_name || data.display_name || data.company_name || data.manufacturer_name || data.agent_name, 128);
    if (!name) throw new BadRequestException(`${this.partnerKindLabel(kind)}名称不能为空`);
    const code = safeText(data.party_code || data.manufacturer_code || data.agent_code, 64);
    const common = {
      contact_name: safeText(data.contact_name, 64) || null,
      contact_phone: safeText(data.contact_phone, 32) || null,
      contact_email: safeText(data.contact_email, 128) || null,
      province: safeText(data.province, 64) || null,
      city: safeText(data.city, 64) || null,
      address: safeText(data.address, 255) || null,
      business_license: safeText(data.business_license, 255) || null,
      status: data.status === undefined || data.status === null || data.status === '' ? 1 : Number(data.status),
      remark: safeText(data.remark, 2000) || null,
    };
    if (!Number.isFinite(common.status)) throw new BadRequestException('状态必须是数字');
    if (kind === 'agent') {
      const level = data.level === undefined || data.level === null || data.level === '' ? null : Number(data.level);
      const parentId = data.parent_id === undefined || data.parent_id === null || data.parent_id === '' ? null : Number(data.parent_id);
      if (level !== null && !Number.isFinite(level)) throw new BadRequestException('代理等级必须是数字');
      if (parentId !== null && !Number.isFinite(parentId)) throw new BadRequestException('上级代理ID必须是数字');
      const district = safeText(data.district, 64) || null;
      this.requireAgentRegion({ agent_name: name, agent_code: code, ...common, district });
      return {
        agent_code: code || `AG${Date.now()}`,
        agent_name: name,
        ...common,
        district,
        business_license: safeText(data.business_license, 128) || null,
        level,
        parent_id: parentId,
      };
    }
    return {
      manufacturer_code: code || `COM${Date.now()}`,
      manufacturer_name: name,
      company_name: name,
      social_credit_code: safeText(data.social_credit_code, 128) || null,
      legal_person: safeText(data.legal_person, 64) || null,
      ...common,
      production_license: safeText(data.production_license, 128) || null,
      quality_report: this.normalizeJsonValue(data.quality_report),
    };
  }

  async listPartners(query: Record<string, any>) {
    await Promise.all([this.ensureResourceRuntimeSchema('manufacturers'), this.ensureResourceRuntimeSchema('agents')])
      .catch((error) => this.logger.warn(`企业主体表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const { page, pageSize } = pageParams(query);
    const type = String(query.party_type || query.type || '').trim();
    const kind = type ? this.normalizePartnerKind(type) : '';
    const status = query.status === undefined || query.status === null || query.status === '' ? undefined : Number(query.status);
    if (status !== undefined && !Number.isFinite(status)) throw new BadRequestException('状态必须是数字');
    const keyword = String(safeText(query.keyword, 128) || '').toLowerCase();
    const province = safeText(query.province, 64);
    const city = safeText(query.city, 64);
    const district = safeText(query.district, 64);

    const [companies, agents] = await Promise.all([
      kind && kind !== 'company' ? Promise.resolve([]) : (this.prisma as any).manufacturer.findMany({ orderBy: { id: 'desc' }, take: 5000 }),
      kind && kind !== 'agent' ? Promise.resolve([]) : (this.prisma as any).agent.findMany({ orderBy: { id: 'desc' }, take: 5000 }),
    ]);

    const rows = [
      ...(companies as any[]).map((row) => this.toPartnerRow('company', row)),
      ...(agents as any[]).map((row) => this.toPartnerRow('agent', row)),
    ].filter((row) =>
      (status === undefined || Number(row.status) === status)
      && (!province || String(row.province || '').includes(province))
      && (!city || String(row.city || '').includes(city))
      && (!district || String(row.district || '').includes(district))
      && this.partnerSearchHit(row, keyword),
    ).sort((a, b) => {
      const at = new Date(a.updated_at || a.created_at || 0).getTime();
      const bt = new Date(b.updated_at || b.created_at || 0).getTime();
      return bt - at || Number(b.source_id || 0) - Number(a.source_id || 0);
    });

    const total = rows.length;
    const skip = (page - 1) * pageSize;
    return { list: rows.slice(skip, skip + pageSize), pagination: { page, pageSize, total } };
  }

  async partnersSelect(query: Record<string, any> = {}) {
    const res = await this.listPartners({ ...query, page: 1, pageSize: 1000, status: query.status ?? 1 });
    return (res.list || []).map((row: any) => this.partnerSelectOption(row));
  }

  async partnerDetail(id: string | number) {
    const parsed = this.parsePartnerId(id);
    const delegate = parsed.kind === 'agent' ? (this.prisma as any).agent : (this.prisma as any).manufacturer;
    const row = await delegate.findUnique({ where: { id: parsed.id } });
    if (!row) throw new NotFoundException('企业主体不存在');
    return this.toPartnerRow(parsed.kind, row);
  }

  async createPartner(data: Record<string, any>) {
    const kind = this.normalizePartnerKind(data.party_type || data.type || data.kind);
    const payload = this.normalizePartnerPayload(kind, data);
    const delegate = kind === 'agent' ? (this.prisma as any).agent : (this.prisma as any).manufacturer;
    const row = await delegate.create({ data: payload });
    return this.toPartnerRow(kind, row);
  }

  async updatePartner(id: string | number, data: Record<string, any>) {
    const parsed = this.parsePartnerId(id);
    const current = await this.partnerDetail(id);
    const payload = this.normalizePartnerPayload(parsed.kind, { ...current, ...data, party_type: parsed.kind });
    const delegate = parsed.kind === 'agent' ? (this.prisma as any).agent : (this.prisma as any).manufacturer;
    const row = await delegate.update({ where: { id: parsed.id }, data: payload });
    return this.toPartnerRow(parsed.kind, row);
  }

  async removePartner(id: string | number) {
    const parsed = this.parsePartnerId(id);
    const delegate = parsed.kind === 'agent' ? (this.prisma as any).agent : (this.prisma as any).manufacturer;
    await delegate.delete({ where: { id: parsed.id } });
    return { success: true };
  }

  async agentsSelect() {
    await this.ensureResourceRuntimeSchema('agents').catch((error) => this.logger.warn(`代理商表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    return this.prisma.agent.findMany({
      where: { status: 1 },
      select: { id: true, agent_name: true, agent_code: true, contact_name: true, contact_phone: true, province: true, city: true, district: true, address: true, level: true },
      orderBy: { id: 'desc' },
      take: 1000,
    }).then((rows: Array<Record<string, any>>) => rows.map((r) => ({
      label: `${r.agent_name || '-'}(${r.agent_code || '-'})${r.province || r.city || r.district ? `｜${[r.province, r.city, r.district].filter(Boolean).join('/')}` : ''}`,
      value: r.id,
      ...r,
    })));
  }

  async manufacturersSelect() {
    await Promise.all([
      this.ensureResourceRuntimeSchema('manufacturers'),
      this.ensureResourceRuntimeSchema('box'),
      this.ensureResourceRuntimeSchema('codes'),
    ]).catch((error) => this.logger.warn(`公司下拉表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const options = new Map<string, Record<string, any>>();
    const addOption = (item: Record<string, any>) => {
      const name = String(item.manufacturer_name || item.manufacturer || item.company_name || item.value || '').trim();
      if (!name) return;
      const company = String(item.company_name || name).trim();
      const code = String(item.manufacturer_code || '').trim();
      const key = `${name}::${company}`;
      if (options.has(key)) return;
      options.set(key, {
        label: `${name}${company && company !== name ? ` / ${company}` : ''}${code ? `（${code}）` : ''}`,
        value: name,
        manufacturer_name: name,
        company_name: company,
        manufacturer_code: code,
        id: item.id || undefined,
      });
    };

    const masterRows = await (this.prisma as any).manufacturer.findMany({
      where: { status: 1 },
      select: { id: true, manufacturer_code: true, manufacturer_name: true, company_name: true },
      orderBy: { id: 'desc' },
      take: 1000,
    }).catch((error: any) => {
      this.logger.warn(`公司档案下拉查询失败：${String(error?.message || error).slice(0, 220)}`);
      return [];
    }) as Array<Record<string, any>>;
    masterRows.forEach(addOption);

    const fallbackRows = await this.prisma.$queryRawUnsafe(`
      SELECT DISTINCT \`manufacturer\` AS manufacturer_name, \`manufacturer\` AS company_name FROM \`products\` WHERE \`manufacturer\` IS NOT NULL AND \`manufacturer\` <> ''
      UNION
      SELECT DISTINCT \`manufacturer\` AS manufacturer_name, \`company_name\` AS company_name FROM \`boxes\` WHERE (\`manufacturer\` IS NOT NULL AND \`manufacturer\` <> '') OR (\`company_name\` IS NOT NULL AND \`company_name\` <> '')
      UNION
      SELECT DISTINCT \`manufacturer\` AS manufacturer_name, \`company_name\` AS company_name FROM \`anti_fake_codes\` WHERE (\`manufacturer\` IS NOT NULL AND \`manufacturer\` <> '') OR (\`company_name\` IS NOT NULL AND \`company_name\` <> '')
      LIMIT 1000
    `).catch((error: any) => {
      this.logger.warn(`历史公司下拉补充查询失败：${String(error?.message || error).slice(0, 220)}`);
      return [];
    }) as Array<Record<string, any>>;
    fallbackRows.forEach(addOption);
    return Array.from(options.values()).slice(0, 1000);
  }

  async listCodes(query: Record<string, any>) {
    await this.ensureResourceRuntimeSchema('codes').catch((error) => this.logger.warn(`防伪码表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const { page, pageSize, skip } = pageParams(query);
    const where = this.codeWhereByQuery(query);
    const codeListSelect = {
      id: true, product_id: true, code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true,
      batch_no: true, status: true, anti_channeling_enabled: true, query_count: true,
      box_id: true, box_no: true, product_code: true, product_name: true, category: true, brand: true,
      manufacturer: true, company_name: true, province_name: true, city_name: true, region_group: true,
      agent_id: true, agent_name: true, distributor: true,
      activated_at: true, expires_at: true, first_query_at: true, last_query_at: true, created_at: true, updated_at: true,
    };
    const [total, rows] = await Promise.all([
      this.prisma.antiFakeCode.count({ where }),
      this.prisma.antiFakeCode.findMany({ where, select: codeListSelect, orderBy: { id: 'desc' }, skip, take: pageSize }),
    ]);
    const list = await this.enrichRows('codes', this.hydrateCodeRows(rows as any[]));
    return { list, pagination: { page, pageSize, total } };
  }

  async codeBatches(query: Record<string, any> = {}) {
    await this.ensureResourceRuntimeSchema('codes').catch((error) => this.logger.warn(`防伪码表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const productId = Number(query.product_id);
    const where: Record<string, any> = { batch_no: { not: null } };
    if (Number.isInteger(productId) && productId > 0) where.product_id = productId;
    return this.prisma.antiFakeCode.findMany({
      where,
      distinct: ['batch_no'],
      select: { batch_no: true },
      orderBy: { id: 'desc' },
      take: 500,
    });
  }

  async productOwnershipSnapshotForCodes(productId?: string | number | null) {
    const id = productId ? Number(productId) : null;
    if (!id || !Number.isInteger(id)) return {};
    const product = await this.productSnapshot(id);
    return product ? this.unboxedCodeSnapshotData(product) : {};
  }

  async codeStats(product_id?: string | number) {
    await this.ensureResourceRuntimeSchema('codes').catch((error) => this.logger.warn(`防伪码表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const where = product_id ? { product_id: Number(product_id) } : {};
    const [total, statusRows, queried] = await Promise.all([
      this.prisma.antiFakeCode.count({ where }),
      this.prisma.antiFakeCode.groupBy({ by: ['status'], where, _count: { _all: true } }).catch(() => []),
      this.prisma.antiFakeCode.count({ where: { ...where, query_count: { gt: 0 } } }),
    ]);
    const byStatus = new Map((statusRows as any[]).map((row: any) => [Number(row.status), Number(row._count?._all || 0)]));
    const activated = Number(byStatus.get(1) || 0) + Number(byStatus.get(4) || 0);
    return {
      total,
      codes: total,
      activated,
      locked: Number(byStatus.get(2) || 0),
      cancelled: Number(byStatus.get(3) || 0),
      queried,
    };
  }

  async generateCodes(body: Record<string, any>) {
    await this.ensureResourceRuntimeSchema('codes').catch((error) => this.logger.warn(`防伪码表结构自检失败：${String(error?.message || error).slice(0, 220)}`));
    const count = Math.min(Math.max(Number(body.count || 1), 1), 10000);
    const prefix = body.prefix || '';
    const expiresAt = this.parseDate(body.expires_at || body.expiry_date || body.expire_date || body.valid_until) || null;
    const productId = body.product_id ? Number(body.product_id) : null;
    if (!productId || !Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('请先创建并选择产品，再生成防伪码');
    }
    const product = await this.productSnapshot(productId);
    if (!product) throw new BadRequestException('所选产品不存在，请先创建产品再生成防伪码');
    const batch_no = safeText(body.batch_no || product?.batch_no, 64);
    if (!batch_no) throw new BadRequestException('所选产品尚未设置生产批号，请先在产品资料中维护批号');
    // 新码只关联产品和批次，地区在后续发货时按实际目的地确定。
    // 这也让同步生成与异步生成保持一致，不再要求产品所属经销商预先维护地区。
    const productData = this.unboxedCodeSnapshotData(product);
    const shouldActivate = body.auto_activate !== false && Number(body.status ?? 1) !== 0;
    const antiChannelingEnabled = body.anti_channeling_enabled !== false
      && !['0', 'false', 'no', 'off', '关闭', '停用'].includes(String(body.anti_channeling_enabled ?? 'true').trim().toLowerCase());
    const now = new Date();
    const rows = Array.from({ length: count }, () => {
      const code = this.codePolicy.issueOrLegacy(() => nanoid());
      return {
        __plaintext: code,
        ...productData,
        product_id: productId,
        batch_no,
        ...this.codeVault.persistence(code),
        prefix: safeText(prefix, 32) || null,
        status: shouldActivate ? 1 : 0,
        anti_channeling_enabled: antiChannelingEnabled,
        activated_at: shouldActivate ? now : null,
        expires_at: expiresAt,
      };
    });
    const storedRows = rows.map(({ __plaintext, ...row }) => row);
    await this.prisma.antiFakeCode.createMany({ data: storedRows, skipDuplicates: true });
    const createdStoredRows = await this.prisma.antiFakeCode.findMany({
      where: { code_hash: { in: rows.map((item) => item.code_hash) } },
    }).catch(() => storedRows);
    const createdRows = this.hydrateCodeRows(createdStoredRows as any[]);
    await this.recordTraceForCodes(createdRows, '防伪码生成', {
      node_type: '防伪码',
      trace_key: `code-batch-generated:${batch_no}`,
      content: `批次 ${batch_no} 自动生成 ${count} 个防伪码${shouldActivate ? '，并自动启用' : ''}`,
      product_id: body.product_id ? Number(body.product_id) : null,
      batch_no,
      expires_at: expiresAt,
      detail: { expires_at: expiresAt, validity: expiresAt ? '指定过期日期' : '长期有效', anti_channeling_enabled: antiChannelingEnabled },
    }, { dedupeEvent: true });
    return { count, batch_no, expires_at: expiresAt, anti_channeling_enabled: antiChannelingEnabled };
  }


  async generateCodesAsync(body: Record<string, any>) {
    const count = Math.min(Math.max(Number(body.count || 1), 1), 100000);
    const productId = body.product_id ? Number(body.product_id) : null;
    if (!productId || !Number.isInteger(productId) || productId <= 0) {
      throw new BadRequestException('请先创建并选择产品，再生成防伪码');
    }
    const product = await this.productSnapshot(productId);
    if (!product) throw new BadRequestException('所选产品不存在，请先创建产品再生成防伪码');
    const batch_no = safeText(body.batch_no || product?.batch_no, 64);
    if (!batch_no) throw new BadRequestException('所选产品尚未设置生产批号，请先在产品资料中维护批号');
    const job = await this.queue.enqueueCodeGeneration({
      product_id: productId || body.product_id,
      count,
      batch_no,
      prefix: body.prefix || '',
      auto_activate: body.auto_activate !== false,
      anti_channeling_enabled: body.anti_channeling_enabled !== false
        && !['0', 'false', 'no', 'off', '关闭', '停用'].includes(String(body.anti_channeling_enabled ?? 'true').trim().toLowerCase()),
      expires_at: this.parseDate(body.expires_at || body.expiry_date || body.expire_date || body.valid_until) || null,
    });
    return { jobId: job.id, count, batch_no, status: 'queued' };
  }

  private normalizeCodes(codes: unknown, limit = 50000) {
    const list = Array.from(new Set(this.splitCodeInput(codes)));
    if (!list.length) throw new BadRequestException('防伪码不能为空');
    if (list.length > limit) throw new BadRequestException(`单次最多处理 ${limit} 个防伪码，请分批操作`);
    return list;
  }

  private batchChunkSize() {
    const configured = Number(this.config.get('CODE_BATCH_CHUNK_SIZE') || process.env.CODE_BATCH_CHUNK_SIZE || 1000);
    return Math.min(Math.max(Number.isFinite(configured) ? configured : 1000, 100), 5000);
  }

  private traceBatchLimit() {
    const configured = Number(this.config.get('BATCH_TRACE_LIMIT') || process.env.BATCH_TRACE_LIMIT || 2000);
    return Math.min(Math.max(Number.isFinite(configured) ? configured : 2000, 0), 10000);
  }

  private async updateCodesByChunks(codes: string[], data: Record<string, any>) {
    let affected = 0;
    const chunkSize = this.batchChunkSize();
    for (let i = 0; i < codes.length; i += chunkSize) {
      const chunk = codes.slice(i, i + chunkSize);
      const result = await this.prisma.antiFakeCode.updateMany({
        where: this.codeWhere(chunk),
        data,
      });
      affected += Number(result.count || 0);
    }
    return affected;
  }

  private async updateEnabledAntiChannelingCodesByChunks(codes: string[], data: Record<string, any>) {
    let affected = 0;
    const chunkSize = this.batchChunkSize();
    for (let i = 0; i < codes.length; i += chunkSize) {
      const chunk = codes.slice(i, i + chunkSize);
      const result = await this.prisma.antiFakeCode.updateMany({
        where: { AND: [this.codeWhere(chunk), { anti_channeling_enabled: true }] },
        data,
      });
      affected += Number(result.count || 0);
    }
    return affected;
  }

  private async findCodeRowsByChunks(codes: string[]) {
    const rows: any[] = [];
    const chunkSize = this.batchChunkSize();
    for (let i = 0; i < codes.length; i += chunkSize) {
      const chunk = codes.slice(i, i + chunkSize);
      const storedRows = await this.prisma.antiFakeCode.findMany({
        where: this.codeWhere(chunk),
        select: {
          code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true,
          product_id: true, batch_no: true, status: true, anti_channeling_enabled: true, query_count: true,
          created_at: true, activated_at: true, box_id: true, box_no: true,
          product_code: true, product_name: true, category: true, brand: true, specification: true, unit: true,
          production_place: true, manufacturer: true, province_name: true, city_name: true,
          region_group: true, warehouse: true, distributor: true, agent_id: true, agent_name: true, company_name: true,
        },
      }).catch(() => []);
      rows.push(...this.hydrateCodeRows(storedRows as any[]));
    }
    return rows;
  }

  private async scheduleBatchTrace(codes: string[], action: string, data: Record<string, any> = {}) {
    if (!codes.length || process.env.TRACE_AUTO_SYNC === 'false') return 'disabled';
    const mode = String(this.config.get('BATCH_TRACE_MODE') || process.env.BATCH_TRACE_MODE || 'async').toLowerCase();
    if (mode === 'off' || mode === 'disabled' || mode === 'false') return 'disabled';

    const limit = this.traceBatchLimit();
    if (limit <= 0) return 'disabled';
    const traceCodes = codes.slice(0, limit);
    const traceData = {
      ...data,
      content: codes.length > traceCodes.length
        ? `${data.content || action}；本次 ${codes.length} 个，后台详细溯源记录前 ${traceCodes.length} 个`
        : (data.content || action),
      detail: { ...(data.detail || {}), total_codes: codes.length, traced_codes: traceCodes.length },
    };

    const run = async () => {
      const rows = await this.findCodeRowsByChunks(traceCodes);
      await this.recordTraceForCodes(rows.length ? rows : traceCodes, action, traceData, { dedupeEvent: true });
    };

    const onError = (error: any) => this.logger.warn(`批量操作已完成，但${action}溯源后台同步失败：${error?.message || error}`);
    if (mode === 'sync') {
      // 调试或强一致环境可设置 BATCH_TRACE_MODE=sync；默认异步，不阻塞批量状态变更接口。
      try {
        await run();
        return 'synced';
      } catch (error: any) {
        onError(error);
        return 'failed';
      }
    }
    setImmediate(() => { void run().catch(onError); });
    return 'queued';
  }

  private async batchSetCodeStatus(codes: string[], data: Record<string, any>, action: string, content: string) {
    const normalized = this.normalizeCodes(codes);
    const affected = await this.updateCodesByChunks(normalized, data);
    const trace = await this.scheduleBatchTrace(normalized, action, { node_type: '防伪码', content });
    return { requested: normalized.length, affected, missing: Math.max(normalized.length - affected, 0), trace };
  }

  async batchActivate(codes: string[]) {
    return this.batchSetCodeStatus(codes, { status: 1, activated_at: new Date() }, '防伪码激活', '防伪码已批量激活');
  }

  async batchLock(codes: string[], lock: boolean) {
    return this.batchSetCodeStatus(codes, { status: lock ? 2 : 1 }, lock ? '防伪码锁定' : '防伪码解锁', lock ? '防伪码已锁定' : '防伪码已恢复激活');
  }

  async batchCancel(codes: string[]) {
    return this.batchSetCodeStatus(codes, { status: 3 }, '防伪码注销', '防伪码已注销/作废');
  }

  async batchDeleteCodes(codes: string[]) {
    const normalized = this.normalizeCodes(codes, 5000);
    const storedRows = await this.prisma.antiFakeCode.findMany({
      where: this.codeWhere(normalized),
      select: { id: true, code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true, box_id: true, box_no: true },
    });
    const rows = this.hydrateCodeRows(storedRows as any[]);
    if (!rows.length) throw new BadRequestException('没有找到可删除的防伪码');

    await this.recordTraceForCodes(rows.map((row: any) => String(row.code)), '防伪码删除', {
      node_type: '防伪码删除',
      trace_key: `code-batch-delete:${Date.now()}:${rows.length}`,
      content: `批量删除 ${rows.length} 个防伪码`,
      detail: { codes: rows.map((row: any) => String(row.code)) },
    }, { dedupeEvent: true }).catch(() => []);

    const result = await this.prisma.$transaction(async (tx: any) => {
      await this.rewriteBoxCodeListsTx(tx, rows, null);
      return tx.antiFakeCode.deleteMany({ where: { id: { in: storedRows.map((row: any) => Number(row.id)).filter(Boolean) } } });
    });

    return { affected: Number(result.count || 0), matched: rows.length };
  }

  async traceByNo(traceNo: string) {
    const row = await this.prisma.traceRecord.findFirst({
      where: { OR: [{ trace_no: traceNo }, { anti_fake_code: { in: [traceNo, this.codeVault.reference(traceNo)] } }] },
    });
    if (!row) throw new NotFoundException('溯源记录不存在');
    const [detail] = await this.enrichRows('trace', [row]);
    return { ...detail, trace_chain: this.normalizeTraceChain(detail.trace_chain) };
  }

  async autoSyncTrace(body: Record<string, any> = {}) {
    const productId = body.product_id ? Number(body.product_id) : null;
    const batchNo = body.batch_no ? String(body.batch_no).trim() : null;
    const codes = this.splitCodeInput(body.codes || body.code);

    if (codes.length) {
      const traces = await this.recordTraceForCodes(codes, '手动自动溯源同步', { node_type: '溯源', content: `手动同步 ${codes.length} 个防伪码溯源` }, { dedupeEvent: true });
      return { mode: 'codes', total: traces.length, traces };
    }

    if (productId) {
      const result = await this.syncTraceForProductCodes(productId, batchNo, '手动产品溯源同步', {
        node_type: '溯源',
        content: `手动同步产品 ${productId}${batchNo ? ` / 批次 ${batchNo}` : ''} 的溯源流程`,
        batch_no: batchNo,
      });
      return { mode: 'product', total: Array.isArray((result as any).traces) ? (result as any).traces.length : 0, ...result };
    }

    const where: Record<string, any> = {};
    if (batchNo) where.batch_no = batchNo;
    const storedRows = await this.prisma.antiFakeCode.findMany({ where, orderBy: { id: 'desc' }, take: 10000 }).catch(() => []);
    const rows = this.hydrateCodeRows(storedRows as any[]);
    const traces = await this.recordTraceForCodes(rows, '手动全量溯源同步', {
      node_type: '溯源',
      content: batchNo ? `手动同步批次 ${batchNo} 的防伪码溯源` : '手动同步最近 10000 个防伪码溯源',
      batch_no: batchNo,
    }, { dedupeEvent: true });
    return { mode: batchNo ? 'batch' : 'latest', total: traces.length, traces };
  }

  async addTraceNode(id: string | number, data: Record<string, any>) {
    const row = await this.prisma.traceRecord.findUnique({ where: { id: safeId(id) } });
    if (!row) throw new NotFoundException('溯源记录不存在');
    const chain = safeJsonArray(row.trace_chain);
    const [traceCode] = row.anti_fake_code ? await this.resolveStoredCodeReferences([row.anti_fake_code]) : [];
    const node = { ...data, timestamp: new Date().toISOString() };
    chain.push(traceCode ? this.sanitizeCodePayload(node, [traceCode]) : node);
    await this.prisma.traceRecord.update({ where: { id: row.id }, data: { trace_chain: chain } });
    return chain;
  }

  private traceNo(index = 0) {
    return `TR${Date.now()}${index}${nanoid().slice(0, 6)}`;
  }

  private traceEvent(name: string, data: Record<string, any> = {}) {
    const timestampSource = data.timestamp || data.process_time || data.created_at;
    const timestamp = timestampSource ? new Date(timestampSource) : new Date();
    const safeTimestamp = Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString();
    return {
      node_name: name,
      node_type: data.node_type || name,
      content: data.content || name,
      trace_key: data.trace_key || `${data.node_type || name}:${data.id || data.code || data.box_id || data.shipment_id || safeTimestamp}`,
      product_id: data.product_id ?? null,
      product_code: data.product_code ?? null,
      product_name: data.product_name ?? null,
      category: data.category ?? null,
      brand: data.brand ?? null,
      specification: data.specification ?? null,
      unit: data.unit ?? null,
      production_date: data.production_date ?? null,
      production_place: data.production_place ?? null,
      manufacturer: data.manufacturer ?? null,
      anti_fake_code: data.anti_fake_code ?? data.code ?? null,
      code_generated_at: data.code_generated_at ?? null,
      packing_time: data.packing_time ?? null,
      code_status: data.code_status ?? null,
      query_count: data.query_count ?? null,
      batch_no: data.batch_no ?? null,
      process_id: data.process_id ?? null,
      process_type: data.process_type ?? null,
      process_name: data.process_name ?? null,
      process_content: data.process_content ?? null,
      process_data: data.process_data ?? null,
      box_id: data.box_id ?? null,
      box_no: data.box_no ?? null,
      box_capacity: data.box_capacity ?? null,
      box_code_count: data.box_code_count ?? null,
      shipment_id: data.shipment_id ?? null,
      shipment_no: data.shipment_no ?? null,
      logistics_company: data.logistics_company ?? null,
      logistics_no: data.logistics_no ?? null,
      receiver: data.receiver ?? null,
      receiver_phone: data.receiver_phone ?? null,
      receiver_address: data.receiver_address ?? null,
      channel: data.channel ?? null,
      ip: data.ip ?? null,
      user_agent: data.user_agent ?? null,
      operator: data.operator || 'system',
      location: data.location ?? null,
      detail: data.detail ?? { auto_filled: true, manual_edit_locked: true },
      timestamp: safeTimestamp,
    };
  }

  private eventKey(event: Record<string, any>) {
    return String(event.trace_key || `${event.node_type || event.node_name || 'node'}:${event.process_id || event.anti_fake_code || event.box_id || event.shipment_id || event.timestamp || ''}`);
  }

  private mergeTraceChain(chain: any[], events: Array<Record<string, any>>, options: { dedupe?: boolean } = { dedupe: true }) {
    const list = safeJsonArray(chain);
    if (!options.dedupe) return [...list, ...events];
    const keys = new Set(list.map((item: any) => this.eventKey(item)).filter(Boolean));
    for (const event of events) {
      const key = this.eventKey(event);
      if (key && keys.has(key)) continue;
      list.push(event);
      if (key) keys.add(key);
    }
    return list;
  }

  private async productById(productId?: number | null) {
    return productId ? this.prisma.product.findUnique({ where: { id: Number(productId) } }).catch(() => null) : null;
  }

  private productEvent(product: any, batchNo?: string | null) {
    if (!product) return null;
    return this.traceEvent('产品建档', {
      node_type: '产品',
      trace_key: `product:${product.id}:${product.updated_at || product.created_at || ''}:${batchNo || ''}`,
      content: `产品 ${product.product_name || product.product_code || product.id} 已建档${batchNo ? `，批次 ${batchNo}` : ''}`,
      product_id: product.id,
      product_code: product.product_code,
      product_name: product.product_name,
      category: product.category,
      brand: product.brand,
      specification: product.specification,
      unit: product.unit,
      production_date: product.production_date || null,
      manufacturer: product.manufacturer || null,
      batch_no: batchNo || null,
      detail: this.buildAutoTraceDetail(product, batchNo, {
        production_date: product.production_date || null,
          manufacturer: product.manufacturer || null,
        description: product.description || null,
        image_url: product.image_url || null,
        extra_fields: product.extra_fields || null,
        status: product.status,
      }),
      timestamp: product.production_date || product.created_at || new Date(),
    });
  }

  private processEvent(record: any) {
    return this.traceEvent(record.process_name || record.process_type || '生产流程', {
      node_type: record.process_type || '生产流程',
      trace_key: `process:${record.id}:${record.updated_at || record.process_time || record.created_at || ''}`,
      content: record.process_content || record.process_name || record.process_type || '生产流程记录',
      product_id: record.product_id || null,
      batch_no: record.batch_no || null,
      process_id: record.id,
      process_type: record.process_type || null,
      process_name: record.process_name || null,
      process_content: record.process_content || null,
      process_data: record.process_data || null,
      operator: record.operator || 'system',
      location: record.location || null,
      detail: {
        status: record.status,
        created_at: record.created_at,
        updated_at: record.updated_at,
      },
      timestamp: record.process_time || record.created_at || new Date(),
    });
  }

  private async processEventsFor(productId?: number | null, batchNo?: string | null) {
    if (!productId) return [];
    const where: Record<string, any> = { product_id: Number(productId) };
    if (batchNo) where.OR = [{ batch_no: batchNo }, { batch_no: null }, { batch_no: '' }];
    const rows = await this.prisma.processRecord.findMany({
      where,
      orderBy: [{ process_time: 'asc' }, { id: 'asc' }],
      take: 200,
    }).catch(() => []);
    return rows.map((row: any) => this.processEvent(row));
  }

  private async productForCode(item: any, cache?: { products: Map<string, Promise<any>> }) {
    const productKey = String(item.product_id || '');
    if (cache && productKey && !cache.products.has(productKey)) cache.products.set(productKey, this.productById(item.product_id || null));
    return cache && productKey ? await cache.products.get(productKey) : await this.productById(item.product_id || null);
  }

  private async traceRecordMetaForCode(item: any, cache?: { products: Map<string, Promise<any>> }) {
    const product = await this.productForCode(item, cache);
    return {
      production_date: item.production_date || product?.production_date || null,
      production_place: item.production_place || product?.production_place || null,
      manufacturer: item.manufacturer || product?.manufacturer || null,
    };
  }

  private async baseTraceChainForCode(item: any, seedEvent?: Record<string, any>, cache?: { products: Map<string, Promise<any>>; processes: Map<string, Promise<Array<Record<string, any>>>> }) {
    const product = await this.productForCode(item, cache);
    const chain: Array<Record<string, any>> = [];
    const productNode = this.productEvent(product, item.batch_no || null);
    if (productNode) chain.push(productNode);
    const processKey = `${item.product_id || ''}:${item.batch_no || ''}`;
    if (cache && item.product_id && !cache.processes.has(processKey)) cache.processes.set(processKey, this.processEventsFor(item.product_id || null, item.batch_no || null));
    chain.push(...(cache && item.product_id ? await cache.processes.get(processKey) || [] : await this.processEventsFor(item.product_id || null, item.batch_no || null)));
    chain.push(this.traceEvent('采购入库建档', {
      node_type: '采购入库',
      trace_key: `inbound:${item.code}:${item.batch_no || 'default'}`,
      content: `批次 ${item.batch_no || '默认批次'} 已自动生成采购/入库溯源档案，并绑定防伪码 ${item.code}`,
      product_id: item.product_id || null,
      product_code: product?.product_code || null,
      product_name: product?.product_name || null,
      category: product?.category || null,
      brand: product?.brand || null,
      specification: product?.specification || null,
      unit: product?.unit || null,
      production_date: product?.production_date || null,
      production_place: product?.production_place || null,
      manufacturer: product?.manufacturer || null,
      anti_fake_code: item.code,
      batch_no: item.batch_no || null,
      operator: 'system',
      detail: this.buildAutoTraceDetail(product, item.batch_no || null, {
        inbound_no: item.batch_no || null,
        arrival_date: item.created_at || new Date(),
        supplier_code: this.asRecord(product?.extra_fields).supplier_code || this.asRecord(product?.extra_fields).supplier || null,
        warehouse: item.warehouse || null,
        auto_bind_code: item.code,
      }),
      timestamp: item.created_at || new Date(),
    }));
    chain.push(this.traceEvent('防伪码生成', {
      node_type: '防伪码',
      trace_key: `code:${item.code}:created`,
      content: `防伪码 ${item.code} 已生成${product?.product_name ? `，关联产品：${product.product_name}` : ''}`,
      product_id: item.product_id || null,
      product_code: product?.product_code || null,
      product_name: product?.product_name || null,
      category: product?.category || null,
      brand: product?.brand || null,
      specification: product?.specification || null,
      unit: product?.unit || null,
      production_date: product?.production_date || null,
      production_place: product?.production_place || null,
      manufacturer: product?.manufacturer || null,
      anti_fake_code: item.code,
      code_generated_at: item.created_at || null,
      code_status: item.status ?? null,
      query_count: item.query_count ?? 0,
      batch_no: item.batch_no || null,
      detail: this.buildAutoTraceDetail(product, item.batch_no || null, { code_generated_at: item.created_at || null, auto_bind_code: item.code }),
      timestamp: item.created_at || new Date(),
    }));
    chain.push(this.traceEvent('溯源建档', {
      ...(seedEvent || {}),
      node_type: '溯源',
      trace_key: `trace:init:${item.code}`,
      content: '系统已自动生成产品/防伪码溯源档案，固定模板和业务字段已自动回填',
      product_id: item.product_id || null,
      anti_fake_code: item.code,
      batch_no: item.batch_no || null,
      detail: this.buildAutoTraceDetail(product, item.batch_no || null, this.asRecord(seedEvent?.detail), seedEvent || {}),
    }));
    return chain;
  }

  private traceNoForProduct(product: any, batchNo?: string | null) {
    const raw = `PRD-${product.product_code || product.id}${batchNo ? `-${batchNo}` : ''}`;
    return raw.replace(/[^0-9A-Za-z_\-]/g, '-').slice(0, 128);
  }

  async recordProductTraceEvent(productOrId: any, action = '产品溯源同步', data: Record<string, any> = {}) {
    if (process.env.TRACE_AUTO_SYNC === 'false') return null;
    const product = typeof productOrId === 'object' ? productOrId : await this.productById(Number(productOrId));
    if (!product) return null;
    const batchNo = data.batch_no ? String(data.batch_no) : null;
    const traceNo = this.traceNoForProduct(product, batchNo);
    const productNode = this.productEvent(product, batchNo);
    const baseChain = [productNode, ...await this.processEventsFor(product.id, batchNo)].filter(Boolean) as Array<Record<string, any>>;
    const event = this.traceEvent(action, {
      ...data,
      node_type: data.node_type || '产品',
      trace_key: data.trace_key || `product-action:${product.id}:${action}:${new Date().toISOString()}`,
      content: data.content || `${action}：${product.product_name || product.product_code || product.id}`,
      product_id: product.id,
      product_code: product.product_code,
      product_name: product.product_name,
      category: product.category,
      brand: product.brand,
      specification: product.specification,
      unit: product.unit,
      production_date: product.production_date || null,
      manufacturer: product.manufacturer || null,
      batch_no: batchNo,
      detail: this.buildAutoTraceDetail(product, batchNo, this.asRecord(data.detail), data),
    });
    const existing = await this.prisma.traceRecord.findFirst({ where: { trace_no: traceNo } }).catch(() => null);
    if (!existing) {
      return this.prisma.traceRecord.create({
        data: {
          product_id: product.id,
          trace_no: traceNo,
          anti_fake_code: null,
          batch_no: batchNo,
          production_date: product.production_date || null,
              manufacturer: product.manufacturer || null,
          trace_chain: this.mergeTraceChain(baseChain, [event]),
          status: 1,
        },
      }).catch(() => null);
    }
    return this.prisma.traceRecord.update({
      where: { id: existing.id },
      data: {
        production_date: product.production_date || existing.production_date || null,
        production_place: product.production_place || existing.production_place || null,
        manufacturer: product.manufacturer || existing.manufacturer || null,
        trace_chain: this.mergeTraceChain(existing.trace_chain as any[], [...baseChain, event]),
      },
    }).catch(() => existing);
  }

  private async appendTraceEvent(rows: any[], event: Record<string, any>, dedupe = false) {
    const tasks = rows.map((row: any) => {
      const chain = this.mergeTraceChain(row.trace_chain as any[], [event], { dedupe });
      return this.prisma.traceRecord.update({ where: { id: row.id }, data: { trace_chain: chain } });
    });
    for (let i = 0; i < tasks.length; i += 40) await Promise.all(tasks.slice(i, i + 40));
  }

  private async appendTraceEventForCodes(rows: any[], event: Record<string, any>, codeByReference: Map<string, string>, dedupe = false) {
    const allCodes = Array.from(new Set(codeByReference.values()));
    const tasks = rows.map((row: any) => {
      const safeEvent = allCodes.length ? this.sanitizeCodePayload(event, allCodes) : event;
      const chain = this.mergeTraceChain(row.trace_chain as any[], [safeEvent], { dedupe });
      return this.prisma.traceRecord.update({ where: { id: row.id }, data: { trace_chain: chain } });
    });
    for (let i = 0; i < tasks.length; i += 40) await Promise.all(tasks.slice(i, i + 40));
  }

  private async hydrateTraceCodeReferences(rows: any[]) {
    if (!rows.length) return rows;
    const refs = rows.map((row: any) => row.anti_fake_code).filter(Boolean);
    const plaintext = await this.resolveStoredCodeReferences(refs);
    let index = 0;
    return rows.map((row: any) => row.anti_fake_code ? { ...row, anti_fake_code: plaintext[index++] || row.anti_fake_code } : row);
  }

  private async ensureTraceForCodes(codeRows: any[], event: Record<string, any>, options: { dedupeEvent?: boolean } = {}) {
    if (!codeRows.length || process.env.TRACE_AUTO_SYNC === 'false') return [];
    const uniqueRows = Array.from(new Map(codeRows.map((item: any) => [String(item.code), item])).values());
    const codes = uniqueRows.map((item: any) => String(item.code)).filter(Boolean);
    const refs = this.storedCodeReferences(codes);
    const traceLookupValues = Array.from(new Set([...refs, ...codes]));
    const existing = await this.prisma.traceRecord.findMany({ where: { anti_fake_code: { in: traceLookupValues } } }).catch(() => []);
    const baseCache = { products: new Map<string, Promise<any>>(), processes: new Map<string, Promise<Array<Record<string, any>>>>() };
    const existingCodes = new Set(existing.map((item: any) => String(item.anti_fake_code)));
    const missing = uniqueRows.filter((item: any) => !existingCodes.has(String(item.code)) && !existingCodes.has(this.codeVault.reference(String(item.code))));

    for (let i = 0; i < missing.length; i += 500) {
      const chunk = missing.slice(i, i + 500);
      const data = await Promise.all(chunk.map(async (item: any, index: number) => {
        const chain = await this.baseTraceChainForCode(item, event, baseCache);
        return {
          product_id: item.product_id || null,
          trace_no: this.traceNo(index + i),
          anti_fake_code: this.codeVault.reference(String(item.code)),
          batch_no: item.batch_no || null,
          ...await this.traceRecordMetaForCode(item, baseCache),
          trace_chain: this.sanitizeCodePayload(chain, codes),
          status: 1,
        };
      }));
      await this.prisma.traceRecord.createMany({ data, skipDuplicates: true }).catch(() => undefined);
    }

    const refreshed = await this.prisma.traceRecord.findMany({ where: { anti_fake_code: { in: traceLookupValues } } }).catch(() => []);
    await this.refreshTraceMetaForCodes(refreshed, uniqueRows, baseCache);
    const codeByReference = new Map<string, string>();
    for (const code of codes) {
      codeByReference.set(code, code);
      codeByReference.set(this.codeVault.reference(code), code);
    }
    await this.appendTraceEventForCodes(refreshed, event, codeByReference, Boolean(options.dedupeEvent));
    const result = await this.prisma.traceRecord.findMany({ where: { anti_fake_code: { in: traceLookupValues } } }).catch(() => refreshed);
    return this.hydrateTraceCodeReferences(result);
  }

  private async refreshTraceMetaForCodes(rows: any[], codeRows: any[], cache: { products: Map<string, Promise<any>> }) {
    if (!rows.length || !codeRows.length) return;
    const codeMap = new Map<string, any>();
    for (const item of codeRows) {
      codeMap.set(String(item.code), item);
      codeMap.set(this.codeVault.reference(String(item.code)), item);
    }
    const tasks = rows.map(async (row: any) => {
      const item = codeMap.get(String(row.anti_fake_code));
      if (!item) return null;
      const meta = await this.traceRecordMetaForCode(item, cache);
      const data: Record<string, any> = {};
      if (!row.production_date && meta.production_date) data.production_date = meta.production_date;
      if (!row.production_place && meta.production_place) data.production_place = meta.production_place;
      if (!row.manufacturer && meta.manufacturer) data.manufacturer = meta.manufacturer;
      if (!Object.keys(data).length) return null;
      return this.prisma.traceRecord.update({ where: { id: row.id }, data }).catch(() => null);
    });
    for (let i = 0; i < tasks.length; i += 40) await Promise.all(tasks.slice(i, i + 40));
  }

  async recordTraceForCodes(codeRowsOrCodes: any[], action = '溯源同步', data: Record<string, any> = {}, options: { dedupeEvent?: boolean } = {}) {
    if (!codeRowsOrCodes.length || process.env.TRACE_AUTO_SYNC === 'false') return [];
    const incomingCodes = codeRowsOrCodes.map((item: any) => typeof item === 'string' ? item : item?.code).filter(Boolean).map(String);
    if (!incomingCodes.length) return [];
    const knownRows = codeRowsOrCodes.filter((item: any) => item && typeof item === 'object' && item.code);
    const knownMap = new Map(knownRows.map((item: any) => [String(item.code), item]));
    const missingCodes = incomingCodes.filter((code: string) => !knownMap.has(code));
    const storedRows = missingCodes.length ? await this.prisma.antiFakeCode.findMany({ where: this.codeWhere(missingCodes), select: ANTI_FAKE_CODE_TRACE_SELECT }).catch(() => []) : [];
    const dbRows = this.hydrateCodeRows(storedRows as any[]);
    const codeRows = [...knownRows, ...dbRows];
    if (!codeRows.length) return [];
    const event = this.traceEvent(action, data);
    return this.ensureTraceForCodes(codeRows, event, options);
  }

  async syncTraceForProductCodes(productId?: number | null, batchNo?: string | null, action = '产品流程同步', data: Record<string, any> = {}) {
    if (!productId || process.env.TRACE_AUTO_SYNC === 'false') return [];
    const where: Record<string, any> = { product_id: Number(productId) };
    if (batchNo) where.batch_no = String(batchNo);
    const storedRows = await this.prisma.antiFakeCode.findMany({ where, select: ANTI_FAKE_CODE_TRACE_SELECT, take: 10000 }).catch(() => []);
    const rows = this.hydrateCodeRows(storedRows as any[]);
    const product = await this.recordProductTraceEvent(productId, action, data);
    const traces = rows.length ? await this.recordTraceForCodes(rows, action, {
      ...data,
      node_type: data.node_type || '产品流程',
      product_id: Number(productId),
      batch_no: batchNo || data.batch_no || null,
    }, { dedupeEvent: true }) : [];
    return { product, traces };
  }

  async syncProcessRecordTrace(record: any, action = '流程记录同步') {
    if (!record?.product_id || process.env.TRACE_AUTO_SYNC === 'false') return null;
    const event = this.processEvent(record);
    return this.syncTraceForProductCodes(record.product_id, record.batch_no || null, action, {
      ...event,
      node_type: record.process_type || event.node_type || '生产流程',
      trace_key: event.trace_key,
      content: event.content,
      product_id: record.product_id,
      batch_no: record.batch_no || null,
      process_id: record.id,
      process_type: record.process_type || null,
      process_name: record.process_name || null,
      process_content: record.process_content || null,
      process_data: record.process_data || null,
      operator: record.operator || 'system',
      location: record.location || null,
      timestamp: record.process_time || record.created_at || new Date(),
    });
  }

  async syncReturnTrace(returnOrder: any, action = '退货流程') {
    if (!returnOrder || process.env.TRACE_AUTO_SYNC === 'false') return [];
    const codes = await this.returnCodesForOrder(returnOrder);
    if (!codes.length) return [];
    const codeRows = await this.findCodeRowsByChunks(codes);
    const firstCode: any = codeRows[0] || {};
    const firstProduct = firstCode.product_id ? await this.productById(Number(firstCode.product_id)).catch(() => null) : null;
    const status = Number(returnOrder.status || 0);
    const type = Number(returnOrder.return_type || 0);
    const qualityResult = status === 2 ? (type === 2 ? '次品报废/不可二次销售' : '良品复检通过/可二次入库') : status === 3 ? '退货驳回/维持原流向' : '退货登记待验货';
    return this.recordTraceForCodes(codeRows.length ? codeRows : codes, action, {
      node_type: '退货售后',
      trace_key: `return:${returnOrder.id}:${action}:${returnOrder.updated_at || returnOrder.created_at || new Date()}`,
      content: `${action}：${returnOrder.return_no || returnOrder.id}${returnOrder.return_reason ? `，原因：${returnOrder.return_reason}` : ''}，${qualityResult}`,
      shipment_id: returnOrder.shipment_id || null,
      shipment_no: returnOrder.shipment_no || null,
      detail: this.buildAutoTraceDetail(firstProduct || firstCode, firstCode.batch_no || null, {
        return_id: returnOrder.id,
        return_no: returnOrder.return_no,
        agent_id: returnOrder.agent_id,
        agent_name: returnOrder.agent_name,
        return_reason: returnOrder.return_reason,
        return_type: returnOrder.return_type,
        status: returnOrder.status,
        remark: returnOrder.remark,
        return_codes: codes,
        quality_result: qualityResult,
        review_status: status === 2 ? '复检完成' : status === 3 ? '已驳回' : '待复检',
        stock_effect: status === 2 ? (type === 2 ? '库存不回补，记录报废/返修' : '库存自动回补，可进入二次销售') : '库存暂锁定，待售后确认',
        archive_rule: '系统自动调取原发货、装箱、属地流向和入库溯源资料，并续写售后闭环。',
      }),
    }, { dedupeEvent: true });
  }

  async recordBoxTraceEvent(box: any, action = '箱码溯源同步', data: Record<string, any> = {}) {
    if (!box || process.env.TRACE_AUTO_SYNC === 'false') return { traces: [], trace_chain: [] };
    const codes = await this.resolveStoredCodeReferences(box.codes);
    const productSnapshot = box.product_id ? await this.productById(Number(box.product_id)).catch(() => null) : null;
    const eventData = {
      ...data,
      node_type: data.node_type || '装箱',
      box_id: box.id,
      box_no: box.box_no,
      box_capacity: box.box_capacity,
      box_code_count: codes.length,
      product_id: box.product_id || data.product_id || null,
      batch_no: box.batch_no || data.batch_no || null,
      packing_time: data.packing_time || box.updated_at || new Date(),
      timestamp: data.timestamp || data.packing_time || box.updated_at || new Date(),
      detail: this.buildAutoTraceDetail(productSnapshot || box, box.batch_no || data.batch_no || null, data.detail || {
        box_id: box.id,
        box_no: box.box_no,
        code_count: codes.length,
        codes,
        province_name: box.province_name,
        city_name: box.city_name,
        region_group: box.region_group,
        warehouse: box.warehouse,
        distributor: box.distributor,
        agent_id: box.agent_id,
        agent_name: box.agent_name,
      }, box),
      content: data.content || `${action}：箱码 ${box.box_no || box.id}，当前关联 ${codes.length} 个产品码`,
    };
    const traces = codes.length ? await this.recordTraceForCodes(codes, action, eventData) : [];
    const summary = this.traceEvent(action, eventData);
    const product = box.product_id ? await this.recordProductTraceEvent(box.product_id, action, eventData) : null;
    const traceChain = this.mergeTraceChain(product?.trace_chain || [], [summary], { dedupe: false });
    return { traces, product, trace_chain: traceChain };
  }


  private async boxesForShipment(shipment: any) {
    const boxIds = safeJsonArray(shipment?.box_ids).map((item: any) => Number(item)).filter((item: number) => Number.isFinite(item));
    if (!boxIds.length) return [];
    const rows = await this.prisma.box.findMany({ where: { id: { in: boxIds } } }).catch(() => []);
    return Promise.all(rows.map((row: any) => this.hydrateBoxCodeList(row)));
  }

  private codesFromBoxes(boxes: any[]) {
    return Array.from(new Set((boxes || []).flatMap((box: any) => safeJsonArray(box.codes).map((code: any) => String(code).trim()).filter(Boolean))));
  }

  private async setCodeStatusByBoxCodes(boxes: any[], data: Record<string, any>) {
    const codes = this.codesFromBoxes(boxes);
    if (!codes.length) return 0;
    return this.updateCodesByChunks(codes, data);
  }

  private async applyShipmentLifecycle(shipment: any, action = '发货单联动') {
    const boxes = await this.boxesForShipment(shipment);
    const ids = boxes.map((box: any) => Number(box.id)).filter((id: number) => Number.isFinite(id));
    if (!ids.length) return { boxes: 0, codes: 0 };

    const now = new Date();
    const status = Number(shipment.status || 0);
    const boxStatus = status >= 1 ? 2 : 1;
    const shipmentBatchPatch = shipment.batch_no ? { batch_no: shipment.batch_no } : {};
    // 箱子始终只保留装箱业务快照。已发货授权位置在查询时从发货单读取。
    await this.prisma.box.updateMany({
      where: { id: { in: ids } },
      data: { status: boxStatus, ownership_at: now, ...shipmentBatchPatch },
    }).catch(() => undefined);

    const codePatch: Record<string, any> = {
      status: status >= 1 ? 1 : undefined,
      activated_at: status >= 1 ? now : undefined,
      ownership_at: now,
      ...shipmentBatchPatch,
    };
    Object.keys(codePatch).forEach((key) => codePatch[key] === undefined && delete codePatch[key]);
    const codes = await this.setCodeStatusByBoxCodes(boxes, codePatch);
    const codeValues = this.codesFromBoxes(boxes);
    if (status >= 1) {
      const authorization = await this.destinationPatchForShipment(shipment);
      if (authorization.province_name || authorization.city_name) {
        await this.updateEnabledAntiChannelingCodesByChunks(codeValues, {
          province_name: authorization.province_name,
          city_name: authorization.city_name,
          region_group: authorization.region_group,
          ownership_at: now,
        });
      }
    } else {
      // 草稿或撤回的发货单不形成位置授权，恢复装箱业务快照。
      for (const box of boxes) await this.syncBoxCodesCascadeTx(this.prisma, box).catch(() => undefined);
    }
    const updatedBoxes = await this.boxesForShipment(shipment);
    await this.syncShipmentTrace(shipment, updatedBoxes, action);
    await this.antiChanneling.evaluateShipment({ shipment, boxes: updatedBoxes, action }).catch((error: any) => this.logger.warn(`防窜发货预警评估失败：${error?.message || error}`));
    return { boxes: ids.length, codes };
  }

  private async returnCodesForOrder(returnOrder: any) {
    const explicit = safeJsonArray(returnOrder?.return_codes).map((code: any) => String(code).trim()).filter(Boolean);
    if (explicit.length) return Array.from(new Set(explicit));
    const where: Record<string, any> = {};
    if (returnOrder?.shipment_id) where.id = Number(returnOrder.shipment_id);
    else if (returnOrder?.shipment_no) where.shipment_no = String(returnOrder.shipment_no);
    if (!Object.keys(where).length) return [] as string[];
    const shipment = await this.prisma.shipment.findFirst({ where }).catch(() => null);
    const boxes = shipment ? await this.boxesForShipment(shipment) : [];
    const codes = this.codesFromBoxes(boxes);
    if (codes.length && returnOrder?.id) {
      await this.prisma.returnOrder.update({ where: { id: Number(returnOrder.id) }, data: { return_codes: codes } }).catch(() => undefined);
    }
    return codes;
  }

  private async applyReturnLifecycle(returnOrder: any, action = '退货单联动') {
    const codes = await this.returnCodesForOrder(returnOrder);
    if (!codes.length) {
      await this.syncReturnTrace(returnOrder, action);
      return { codes: 0 };
    }
    const now = new Date();
    const status = Number(returnOrder.status || 0);
    const type = Number(returnOrder.return_type || 0);
    const codeStatus = status === 2 ? (type === 2 ? 3 : 1) : status === 3 ? 1 : 2;
    const affected = await this.updateCodesByChunks(codes, { status: codeStatus, ownership_at: now });
    await this.syncReturnTrace({ ...returnOrder, return_codes: codes }, action);
    return { codes: affected };
  }

  async syncShipmentTrace(shipment: any, boxes?: any[], action = '发货') {
    if (!shipment || process.env.TRACE_AUTO_SYNC === 'false') return;
    const sourceBoxes = boxes?.length ? boxes : await this.boxesForShipment(shipment);
    const codes = this.codesFromBoxes(sourceBoxes);
    if (!codes.length) return;
    const codeRows = await this.findCodeRowsByChunks(codes);
    const firstCode: any = codeRows[0] || {};
    const firstProduct = firstCode.product_id ? await this.productById(Number(firstCode.product_id)).catch(() => null) : null;
    const destinationPatch = await this.destinationPatchForShipment(shipment);
    const event = this.traceEvent(action, {
      node_type: '发货物流',
      content: `${action}${shipment.shipment_no ? `：${shipment.shipment_no}` : ''}${shipment.logistics_no ? `，物流单号：${shipment.logistics_no}` : ''}`,
      shipment_id: shipment.id,
      shipment_no: shipment.shipment_no,
      batch_no: shipment.batch_no || null,
      logistics_company: shipment.logistics_company,
      logistics_no: shipment.logistics_no,
      receiver: shipment.receiver,
      receiver_phone: shipment.receiver_phone,
      receiver_address: shipment.receiver_address,
      detail: this.buildAutoTraceDetail(firstProduct || firstCode, firstCode.batch_no || null, {
        agent_id: shipment.agent_id,
        agent_name: destinationPatch.agent_name || null,
        box_ids: safeJsonArray(shipment.box_ids),
        box_count: sourceBoxes.length,
        code_count: codes.length,
        sender: shipment.sender,
        sender_address: shipment.sender_address,
        receiver: shipment.receiver,
        receiver_phone: shipment.receiver_phone,
        receiver_address: shipment.receiver_address,
        logistics_company: shipment.logistics_company,
        logistics_no: shipment.logistics_no,
        province_name: destinationPatch.province_name || null,
        city_name: destinationPatch.city_name || null,
        region_group: destinationPatch.region_group || null,
        status: shipment.status,
        remark: shipment.remark,
        auto_fill_rule: '订单发货后，系统自动同步外箱、箱内单品防伪码、发货授权位置和物流流向。',
      }, destinationPatch),
    });
    await this.ensureTraceForCodes(codeRows, event, { dedupeEvent: true });
  }

  private async boxesContainingCodes(codes: string[], excludeBoxId?: number) {
    const clean = Array.from(new Set((codes || []).map((item) => String(item || '').trim()).filter(Boolean)));
    if (!clean.length) return [];
    const found: any[] = [];
    for (const code of clean) {
      try {
        const reference = this.codeVault.reference(code);
        const rows = await this.prisma.$queryRaw<any[]>`SELECT id, box_no, codes FROM boxes WHERE JSON_CONTAINS(codes, JSON_QUOTE(${reference})) OR JSON_CONTAINS(codes, JSON_QUOTE(${code})) ORDER BY id DESC LIMIT 20`;
        found.push(...rows.map((row: any) => ({ ...row, conflict_code: code })));
      } catch {
        // 兼容非 MySQL 或 JSON 查询不可用的环境。
      }
    }
    const rows = found.length ? found : await this.prisma.box.findMany({ orderBy: { id: 'desc' }, take: 2000 }).catch(() => []);
    const hydratedRows = await Promise.all(rows.map((row: any) => this.hydrateBoxCodeList(row)));
    const conflicts = hydratedRows
      .filter((row: any) => !excludeBoxId || Number(row.id) !== Number(excludeBoxId))
      .filter((row: any) => {
        const rowCodes = safeJsonArray(row.codes).map((item: any) => String(item).trim()).filter(Boolean);
        return clean.some((code) => rowCodes.includes(code));
      });
    return Array.from(new Map(conflicts.map((row: any) => [row.id, row])).values());
  }


  private async findBindableCodeRows(codes: string[]) {
    const rows: any[] = [];
    const chunkSize = 1000;
    for (let i = 0; i < codes.length; i += chunkSize) {
      const chunk = codes.slice(i, i + chunkSize);
      const storedRows = await this.prisma.antiFakeCode.findMany({
        where: { AND: [this.codeWhere(chunk), { status: { not: 3 } }] },
        select: {
          code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true,
          product_id: true, batch_no: true, product_code: true, product_name: true, category: true, brand: true,
          specification: true, unit: true, production_place: true, manufacturer: true, company_name: true,
          province_code: true, city_code: true, province_name: true, city_name: true, region_group: true,
          warehouse: true, distributor: true, agent_id: true, agent_name: true,
        },
      });
      rows.push(...this.hydrateCodeRows(storedRows as any[]));
    }
    return rows;
  }

  async addBoxCodes(id: string | number, codes: string[]) {
    const storedBox = await this.prisma.box.findUnique({ where: { id: safeId(id) } });
    const row = storedBox ? await this.hydrateBoxCodeList(storedBox) : null;
    if (!row) throw new NotFoundException('箱码不存在');
    if (Number(row.status) === 2) throw new BadRequestException('已发货箱子不能继续加码');

    const existing = Array.from(new Set(safeJsonArray(row.codes).map((item: any) => String(item).trim()).filter(Boolean)));
    const rawInput = this.splitCodeInput(codes);
    const input = Array.from(new Set(rawInput));
    const inputDuplicated = rawInput.filter((code, index) => rawInput.indexOf(code) !== index);
    if (!input.length) throw new BadRequestException('防伪码不能为空');

    const validRows = await this.findBindableCodeRows(input);
    const validSet = new Set(validRows.map((item: any) => item.code));
    const validMap = new Map<string, any>(validRows.map((item: any) => [String(item.code), item]));
    const missing = input.filter((code: any) => !validSet.has(code));
    const duplicated = Array.from(new Set([...inputDuplicated, ...input.filter((code: any) => existing.includes(code))]));
    const canAdd = input.filter((code: any) => validSet.has(code) && !existing.includes(code));

    // 手动“加码”场景取消产品、批次、容量、已绑定其他箱等硬限制。
    // 后端只保留“码必须存在且未注销、箱子不能已发货”的基础安全校验，并在事务内自动全局去重：
    // 目标箱保留最新加码结果，其他箱清单中的同码会被移除，避免一个小码同时出现在多个箱内。
    const conflicts = await this.boxesContainingCodes(canAdd, row.id);
    const movedFromOtherBoxes = Array.from(new Set(conflicts.flatMap((box: any) => {
      const rowCodes = safeJsonArray(box.codes).map((item: any) => String(item).trim()).filter(Boolean);
      return canAdd.filter((code: any) => rowCodes.includes(String(code)));
    })));

    const accepted = canAdd;
    const overflow: string[] = [];
    const merged = Array.from(new Set([...existing, ...accepted]));
    const acceptedRows = accepted.map((code: any) => validMap.get(String(code))).filter(Boolean);
    const first: any = acceptedRows[0];
    const updateData: Record<string, any> = { codes: this.storedCodeReferences(merged) };
    const inheritFields = [
      'product_id', 'batch_no', 'product_code', 'product_name', 'category', 'brand', 'specification', 'unit',
      'production_place', 'manufacturer', 'company_name', 'province_code', 'city_code', 'province_name', 'city_name',
      'region_group', 'warehouse', 'distributor', 'agent_id', 'agent_name',
    ];
    if (first) {
      for (const field of inheritFields) {
        if (!this.isFilled((row as any)[field]) && this.isFilled(first[field])) updateData[field] = first[field];
      }
      const codeCompany = first.company_name || first.manufacturer;
      if (!this.isFilled((row as any).company_name) && this.isFilled(codeCompany)) updateData.company_name = codeCompany;
      if (!this.isFilled((row as any).manufacturer) && this.isFilled(codeCompany)) updateData.manufacturer = codeCompany;
    }

    const updatedBox = await this.prisma.$transaction(async (tx: any) => {
      for (const conflictBox of conflicts as any[]) {
        const conflictCodes = safeJsonArray(conflictBox.codes).map((item: any) => String(item).trim()).filter(Boolean);
        const nextCodes = conflictCodes.filter((code: string) => !accepted.includes(code));
        if (nextCodes.length !== conflictCodes.length) {
          const previousBox = await tx.box.findUnique({ where: { id: Number(conflictBox.id) } }).catch(() => null);
          const updatedConflictBox = await tx.box.update({ where: { id: Number(conflictBox.id) }, data: { codes: this.storedCodeReferences(nextCodes) } });
          await this.clearRemovedBoxCodesTx(tx, previousBox || updatedConflictBox, accepted);
          if (nextCodes.length) await this.syncBoxCodesCascadeTx(tx, updatedConflictBox, nextCodes);
        }
      }
      const hydrated = await this.hydrateBoxPayload(updateData, tx);
      const nextBox = await tx.box.update({ where: { id: row.id }, data: hydrated });
      await this.syncBoxCodesCascadeTx(tx, nextBox, accepted);
      return this.hydrateBoxCodeList(nextBox, tx);
    });
    if (acceptedRows.length) {
      await this.recordBoxTraceEvent(updatedBox, '装箱绑定', {
        trace_key: `box-bind:${updatedBox.id}:${accepted.join('|')}:${updatedBox.updated_at || new Date()}`,
        content: `装入箱 ${updatedBox.box_no || updatedBox.id}，本次新增 ${accepted.length} 个防伪码，箱内共 ${merged.length} 个`,
        packing_time: updatedBox.updated_at || new Date(),
        detail: {
          box_id: updatedBox.id,
          box_no: updatedBox.box_no,
          added_codes: accepted,
          added_count: accepted.length,
          total_count: merged.length,
        },
      });
    }
    return {
      total: merged.length,
      added: accepted.length,
      duplicated,
      missing,
      overflow,
      moved: movedFromOtherBoxes,
      auto_deduped: movedFromOtherBoxes.length + duplicated.length,
      codes: merged,
    };
  }

  async setBoxStatus(id: string | number, status: number) {
    const box = await this.prisma.box.update({ where: { id: safeId(id) }, data: { status } });
    await this.recordBoxTraceEvent(box, status === 1 ? '封箱完成' : status === 2 ? '箱子已发货' : '箱子状态更新', {
      trace_key: `box-status:${box.id}:${status}:${box.updated_at || new Date()}`,
      content: `箱码 ${box.box_no || box.id} 状态更新为 ${status}`,
    });
    return null;
  }

  async updateShipmentStatus(id: string | number, status: number, data: Record<string, any> = {}) {
    const { config } = this.getDelegate('shipments');
    let payload = this.normalizePayload('shipments', pickAllowed(data, config.allowedFields));
    const current = await this.prisma.shipment.findUnique({
      where: { id: safeId(id) },
      select: {
        batch_no: true, agent_id: true, box_ids: true, logistics_company: true, logistics_no: true,
        sender: true, sender_address: true, receiver: true, receiver_phone: true, receiver_address: true,
        province_code: true, city_code: true, province_name: true, city_name: true, region_group: true,
        warehouse: true, distributor: true, remark: true,
      },
    });
    payload = await this.hydrateShipmentPayload({ ...(current || {}), ...payload }, this.prisma, safeId(id));
    const row = await this.prisma.shipment.update({ where: { id: safeId(id) }, data: { ...payload, status } });
    const action = status === 1 ? '发货出库' : status === 2 ? '签收完成' : status === 3 ? '物流异常' : '发货状态更新';
    await this.applyShipmentLifecycle(row, action);
    return null;
  }

  async updateReturnStatus(id: string | number, status: number, remark?: string) {
    const row = await this.prisma.returnOrder.update({ where: { id: safeId(id) }, data: { status, remark } });
    const action = status === 1 ? '退货受理' : status === 2 ? '退货完成' : status === 3 ? '退货驳回' : '退货状态更新';
    await this.applyReturnLifecycle(row, action);
    return null;
  }
}
