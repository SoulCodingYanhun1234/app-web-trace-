import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service.js';
import { ANTI_COUNTERFEIT_CODE_VERSION, AntiCounterfeitCodePolicy } from '../common/anti-counterfeit-code.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12);
const compactCodeId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 16);

type Dict = Record<string, any>;
type CodeEncoding = 'NUMERIC' | 'ALPHANUMERIC' | 'BASE62' | 'BASE64';
type ChecksumAlgorithm = 'LUHN' | 'CRC16' | 'CRC32' | 'SHA256_TRUNC';
type SegmentType = 'FIXED' | 'VARIABLE' | 'TIMESTAMP' | 'RANDOM' | 'SEQUENCE' | 'CHECKSUM';

type CodeSegment = {
  name: string;
  position?: { start: number; length: number };
  length?: number;
  type: SegmentType;
  value?: string;
  generator?: string;
};

type CodeFormatConfig = {
  formatId: string;
  formatName: string;
  enabled: boolean;
  structure: {
    totalLength: number;
    segments: CodeSegment[];
    checksumAlgorithm: ChecksumAlgorithm;
    encoding: CodeEncoding;
  };
  encryption?: { algorithm: 'AES256' | 'SM4'; keyId: string } | null;
  compression?: { enabled: boolean; algorithm: 'QRCODE' | 'DATAMATRIX' | 'PDF417' } | null;
};

type RuleExecutionResult = {
  triggered: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  confidence: number;
  evidence: Dict;
};

const DEFAULT_CODE_FORMATS: CodeFormatConfig[] = [
  {
    formatId: 'STD_24',
    formatName: '标准 24 位码',
    enabled: true,
    structure: {
      totalLength: 24,
      checksumAlgorithm: 'LUHN',
      encoding: 'ALPHANUMERIC',
      segments: [
        { name: 'brand', length: 2, type: 'FIXED', value: 'AB' },
        { name: 'product', length: 4, type: 'VARIABLE', generator: 'productCode' },
        { name: 'batch', length: 6, type: 'VARIABLE', generator: 'batchCode' },
        { name: 'serial', length: 10, type: 'SEQUENCE' },
        { name: 'checksum', length: 2, type: 'CHECKSUM' },
      ],
    },
  },
  {
    formatId: 'SHORT_18',
    formatName: '短码 18 位',
    enabled: true,
    structure: {
      totalLength: 18,
      checksumAlgorithm: 'CRC16',
      encoding: 'NUMERIC',
      segments: [
        { name: 'product', length: 4, type: 'VARIABLE', generator: 'productCode' },
        { name: 'batch', length: 4, type: 'VARIABLE', generator: 'batchCode' },
        { name: 'serial', length: 8, type: 'SEQUENCE' },
        { name: 'checksum', length: 2, type: 'CHECKSUM' },
      ],
    },
  },
  {
    formatId: 'ENC_32',
    formatName: '加密长码 32 位',
    enabled: true,
    structure: {
      totalLength: 32,
      checksumAlgorithm: 'SHA256_TRUNC',
      encoding: 'BASE62',
      segments: [
        { name: 'header', length: 4, type: 'FIXED', value: 'SEC1' },
        { name: 'payload', length: 20, type: 'RANDOM' },
        { name: 'timestamp', length: 4, type: 'TIMESTAMP' },
        { name: 'checksum', length: 4, type: 'CHECKSUM' },
      ],
    },
    encryption: { algorithm: 'AES256', keyId: 'key_default' },
  },
  {
    formatId: 'GS1_COMP',
    formatName: 'GS1 兼容码',
    enabled: true,
    structure: {
      totalLength: 28,
      checksumAlgorithm: 'CRC32',
      encoding: 'NUMERIC',
      segments: [
        { name: 'company_prefix', length: 6, type: 'VARIABLE', value: '690000' },
        { name: 'item_reference', length: 5, type: 'VARIABLE', generator: 'productCode' },
        { name: 'batch', length: 5, type: 'VARIABLE', generator: 'batchCode' },
        { name: 'serial', length: 8, type: 'SEQUENCE' },
        { name: 'checksum', length: 4, type: 'CHECKSUM' },
      ],
    },
  },
];

const DEFAULT_SYSTEM_CONFIG = {
  codeFormat: {
    enabled: true,
    defaultPattern: 'STD_24',
    patterns: DEFAULT_CODE_FORMATS.map((item) => item.formatId),
  },
  traceability: {
    mode: 'HYBRID',
    requiredSteps: ['CODE_GENERATED', 'BATCH_CREATED', 'PACKAGING', 'WAREHOUSE_IN', 'SHIPMENT_OUT'],
    optionalSteps: ['MARKET_SCAN', 'BLOCKCHAIN_PROOF', 'AFTER_SALE'],
  },
  antiChannel: {
    enabled: true,
    rules: ['GEO_FENCE_DEFAULT', 'FREQUENCY_24H', 'ML_RISK_SCORE'],
    mlModelEnabled: true,
    confidenceThreshold: 0.72,
  },
  blockchain: {
    enabled: true,
    provider: 'FABRIC',
    syncMode: 'BATCH',
    storageStrategy: 'CRITICAL_ONLY',
  },
  cache: {
    l1: { provider: 'LOCAL_MAP', ttl: 300000 },
    l2: { provider: 'REDIS', ttl: 3600000 },
    l3: { provider: 'CDN', ttl: 86400000 },
  },
  deployment: {
    mode: 'MONOLITH_COMPATIBLE_MICROSERVICE_READY',
    edgeEnabled: true,
    apiMarketEnabled: true,
  },
};

@Injectable()
export class TraceabilityV2Service {
  private readonly codePolicy = new AntiCounterfeitCodePolicy();
  private readonly codeVault = new AntiCounterfeitCodeVault();
  private readonly logger = new Logger(TraceabilityV2Service.name);
  private schemaReady = false;
  private readonly l1Cache = new Map<string, { value: any; expiresAt: number }>();
  private readonly cacheMetrics = { hits: 0, misses: 0, invalidations: 0, writes: 0 };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private q(name: string) { return `\`${String(name || '').replace(/`/g, '``')}\``; }

  private text(value: unknown, max = 255) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  }

  private cleanSegment(value: unknown, length: number, fallback = '0', encoding: CodeEncoding = 'ALPHANUMERIC') {
    const charset = encoding === 'NUMERIC' ? /[^0-9]/g : encoding === 'ALPHANUMERIC' ? /[^0-9A-Za-z]/g : /[^0-9A-Za-z+/=_-]/g;
    const raw = this.text(value, Math.max(length * 2, 16)).replace(charset, '').toUpperCase();
    const base = raw || fallback;
    if (base.length >= length) return base.slice(0, length);
    return base.padStart(length, encoding === 'NUMERIC' ? '0' : 'X');
  }

  private json(value: unknown) {
    return JSON.stringify(value ?? null);
  }

  private parseJson<T = any>(value: unknown, fallback: T): T {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'object') return value as T;
    try { return JSON.parse(String(value)) as T; } catch { return fallback; }
  }

  private async rawOne<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.prisma.$queryRawUnsafe(sql, ...params).catch((error: any) => {
      this.logger.warn(`SQL 查询失败：${String(error?.message || error).slice(0, 200)}`);
      return [];
    }) as T[];
    return rows[0] || null;
  }

  private async rawMany<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.prisma.$queryRawUnsafe(sql, ...params).catch((error: any) => {
      this.logger.warn(`SQL 查询失败：${String(error?.message || error).slice(0, 200)}`);
      return [];
    }) as Promise<T[]>;
  }

  private async addColumnIfMissing(table: string, column: string, definition: string) {
    const rows = await this.prisma.$queryRawUnsafe(
      'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
      table,
      column,
    ).catch(() => []) as any[];
    if (rows.length) return;
    await this.prisma.$executeRawUnsafe(`ALTER TABLE ${this.q(table)} ADD COLUMN ${this.q(column)} ${definition}`).catch((error: any) => {
      const msg = String(error?.message || error || '');
      if (!/Duplicate column/i.test(msg)) throw error;
    });
  }

  async ensureSchema() {
    if (this.schemaReady) return;
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS v2_system_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(100) NOT NULL UNIQUE,
        config_value JSON NOT NULL,
        description VARCHAR(255) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS v2_code_formats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        format_id VARCHAR(32) NOT NULL UNIQUE,
        format_name VARCHAR(100) NOT NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        structure JSON NOT NULL,
        encryption JSON NULL,
        compression JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_v2_code_formats_enabled (enabled)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS v2_anti_channel_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rule_id VARCHAR(64) NOT NULL UNIQUE,
        rule_name VARCHAR(128) NOT NULL,
        description VARCHAR(255) NULL,
        enabled TINYINT NOT NULL DEFAULT 1,
        priority INT NOT NULL DEFAULT 100,
        rule_type VARCHAR(40) NOT NULL,
        conditions JSON NULL,
        actions JSON NULL,
        scope JSON NULL,
        confidence_threshold DECIMAL(4,2) NOT NULL DEFAULT 0.70,
        cooldown_ms INT NOT NULL DEFAULT 300000,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_v2_rules_enabled (enabled),
        INDEX idx_v2_rules_type (rule_type)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS v2_api_tenants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL UNIQUE,
        tenant_name VARCHAR(128) NOT NULL,
        tier VARCHAR(32) NOT NULL DEFAULT 'BASIC',
        status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        config JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_v2_tenants_tier (tier),
        INDEX idx_v2_tenants_status (status)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS v2_edge_nodes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        node_id VARCHAR(64) NOT NULL UNIQUE,
        node_type VARCHAR(40) NOT NULL,
        node_name VARCHAR(128) NULL,
        latitude DECIMAL(10,6) NULL,
        longitude DECIMAL(10,6) NULL,
        config JSON NULL,
        last_heartbeat DATETIME(3) NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'ONLINE',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_v2_edge_status (status),
        INDEX idx_v2_edge_type (node_type)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS v2_edge_offline_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        node_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        payload JSON NOT NULL,
        synced TINYINT NOT NULL DEFAULT 0,
        synced_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_v2_edge_events_node (node_id),
        INDEX idx_v2_edge_events_synced (synced)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS v2_event_outbox (
        id INT AUTO_INCREMENT PRIMARY KEY,
        topic VARCHAR(100) NOT NULL,
        event_key VARCHAR(128) NULL,
        payload JSON NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        published_at DATETIME(3) NULL,
        INDEX idx_v2_outbox_topic (topic),
        INDEX idx_v2_outbox_status (status)
      )
    `);

    const codeColumns: Array<[string, string]> = [
      ['code_ciphertext', 'VARBINARY(512) NULL'],
      ['code_iv', 'BINARY(12) NULL'],
      ['code_tag', 'BINARY(16) NULL'],
      ['code_key_id', 'VARCHAR(32) NULL'],
      ['format_id', 'VARCHAR(32) NULL DEFAULT \'STD_24\''],
      ['encrypted', 'TINYINT NULL DEFAULT 0'],
      ['metadata', 'JSON NULL'],
      ['segments', 'JSON NULL'],
      ['risk_score', 'DECIMAL(5,2) NULL DEFAULT 0'],
    ];
    for (const [column, definition] of codeColumns) await this.addColumnIfMissing('anti_fake_codes', column, definition);

    await this.prisma.$executeRawUnsafe(
      'INSERT IGNORE INTO v2_system_configs (config_key, config_value, description) VALUES (?, CAST(? AS JSON), ?)',
      'system',
      this.json(DEFAULT_SYSTEM_CONFIG),
      '防窜货溯源系统 v2.0 灵活架构总配置',
    );

    for (const format of DEFAULT_CODE_FORMATS) {
      await this.prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO v2_code_formats (format_id, format_name, enabled, structure, encryption, compression)
         VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))`,
        format.formatId,
        format.formatName,
        format.enabled ? 1 : 0,
        this.json(format.structure),
        this.json(format.encryption || null),
        this.json(format.compression || null),
      );
    }

    const defaultRules = [
      {
        ruleId: 'GEO_FENCE_DEFAULT',
        ruleName: '授权区域不一致检测',
        ruleType: 'GEO_FENCE',
        priority: 10,
        description: '市场扫码所在地与发货授权区域不一致时触发。',
        conditions: { expression: 'actualRegion != expectedRegion', regionBufferKm: 5 },
        actions: [{ type: 'ALERT', params: { channel: 'system' } }],
        confidenceThreshold: 0.7,
      },
      {
        ruleId: 'FREQUENCY_24H',
        ruleName: '24 小时高频扫码检测',
        ruleType: 'FREQUENCY_ANALYSIS',
        priority: 30,
        description: '同一码 24 小时内扫码次数过多时触发，识别复制码或恶意扫码。',
        conditions: { threshold: 10, windowHours: 24 },
        actions: [{ type: 'LOG', params: {} }, { type: 'ALERT', params: { channel: 'quality_team' } }],
        confidenceThreshold: 0.65,
      },
      {
        ruleId: 'ML_RISK_SCORE',
        ruleName: 'ML 综合风险评分',
        ruleType: 'ML_MODEL',
        priority: 50,
        description: '以区域、时间、频次、经销商历史等特征计算综合风险。',
        conditions: { threshold: 0.72, modelVersion: 'v2-local-scorecard' },
        actions: [{ type: 'ESCALATE', params: { level: 'regional_manager' } }],
        confidenceThreshold: 0.72,
      },
    ];
    for (const rule of defaultRules) {
      await this.prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO v2_anti_channel_rules (rule_id, rule_name, description, enabled, priority, rule_type, conditions, actions, scope, confidence_threshold, cooldown_ms)
         VALUES (?, ?, ?, 1, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?)`,
        rule.ruleId,
        rule.ruleName,
        rule.description,
        rule.priority,
        rule.ruleType,
        this.json(rule.conditions),
        this.json(rule.actions),
        this.json({}),
        rule.confidenceThreshold,
        300000,
      );
    }

    await this.prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO v2_api_tenants (tenant_id, tenant_name, tier, status, config)
       VALUES (?, ?, ?, ?, CAST(? AS JSON))`,
      'internal-admin',
      '内部管理端',
      'ENTERPRISE',
      'ACTIVE',
      this.json({ quota: { requestsPerSecond: 200, requestsPerDay: 1000000, maxBatchSize: 100000 }, permissions: { allowedAPIs: ['*'] }, authentication: { type: 'JWT' } }),
    );

    this.schemaReady = true;
  }

  private async outbox(topic: string, eventKey: string, payload: Dict) {
    await this.ensureSchema();
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO v2_event_outbox (topic, event_key, payload) VALUES (?, ?, CAST(? AS JSON))',
      topic,
      eventKey,
      this.json(payload),
    ).catch(() => undefined);
  }

  async topology() {
    await this.ensureSchema();
    return {
      gateway: ['管理端网关', '消费者网关', '合作伙伴网关'],
      serviceMesh: ['服务发现', '负载均衡', '熔断降级', '链路追踪'],
      microservices: [
        { name: '码服务', status: 'implemented-in-v2-module', endpoint: '/api/v2/codes/*' },
        { name: '产品服务', status: 'reused-existing-resource', endpoint: '/api/products' },
        { name: '批次服务', status: 'reused-v1-schema', endpoint: '/api/v1/batches' },
        { name: '包装服务', status: 'reused-v1-schema', endpoint: '/api/v1/packaging/*' },
        { name: '仓储服务', status: 'reused-v1-schema', endpoint: '/api/v1/warehouse/in' },
        { name: '发货服务', status: 'reused-existing-resource', endpoint: '/api/shipments' },
        { name: '防窜服务', status: 'implemented-in-v2-module', endpoint: '/api/v2/scans/market' },
        { name: '规则引擎', status: 'implemented-in-v2-module', endpoint: '/api/v2/rules' },
        { name: '配置中心', status: 'implemented-in-v2-module', endpoint: '/api/v2/config/system' },
        { name: '边缘节点', status: 'implemented-in-v2-module', endpoint: '/api/v2/edge-nodes/*' },
        { name: 'API 租户市场', status: 'implemented-in-v2-module', endpoint: '/api/v2/api-tenants' },
      ],
      eventBus: ['code.events', 'batch.events', 'shipment.events', 'scan.events', 'violation.events', 'blockchain.events'],
      dataLayer: ['MySQL/PostgreSQL 兼容业务库', 'Redis 可接入缓存', 'ClickHouse/OLAP 可扩展', '区块链存证表'],
    };
  }

  async getSystemConfig() {
    await this.ensureSchema();
    const row = await this.rawOne<any>('SELECT config_value FROM v2_system_configs WHERE config_key = ? LIMIT 1', ['system']);
    return this.parseJson(row?.config_value, DEFAULT_SYSTEM_CONFIG);
  }

  async updateSystemConfig(body: Dict) {
    await this.ensureSchema();
    const current = await this.getSystemConfig();
    const next = this.deepMerge(current, body || {});
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO v2_system_configs (config_key, config_value, description) VALUES (?, CAST(? AS JSON), ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_at = CURRENT_TIMESTAMP(3)',
      'system',
      this.json(next),
      '防窜货溯源系统 v2.0 灵活架构总配置',
    );
    await this.outbox('config.events', 'system', { type: 'CONFIG_UPDATED', config: next });
    return next;
  }

  private deepMerge(base: any, patch: any): any {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : patch;
    const output = { ...(base || {}) };
    for (const [key, value] of Object.entries(patch)) {
      output[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? this.deepMerge(output[key], value)
        : value;
    }
    return output;
  }

  async listCodeFormats() {
    await this.ensureSchema();
    const rows = await this.rawMany<any>('SELECT * FROM v2_code_formats ORDER BY id ASC');
    return rows.map((row) => this.formatFromRow(row));
  }

  private formatFromRow(row: any): CodeFormatConfig {
    return {
      formatId: String(row.format_id),
      formatName: String(row.format_name),
      enabled: Number(row.enabled) === 1,
      structure: this.parseJson(row.structure, DEFAULT_CODE_FORMATS[0].structure),
      encryption: this.parseJson(row.encryption, null),
      compression: this.parseJson(row.compression, null),
    };
  }

  async saveCodeFormat(body: Dict) {
    await this.ensureSchema();
    const formatId = this.text(body.formatId || body.format_id, 32).toUpperCase();
    const formatName = this.text(body.formatName || body.format_name || formatId, 100);
    if (!formatId) throw new BadRequestException('formatId 不能为空');
    const structure = body.structure || DEFAULT_CODE_FORMATS.find((item) => item.formatId === formatId)?.structure;
    if (!structure?.segments?.length) throw new BadRequestException('码制式 structure.segments 不能为空');
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO v2_code_formats (format_id, format_name, enabled, structure, encryption, compression)
       VALUES (?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE format_name = VALUES(format_name), enabled = VALUES(enabled), structure = VALUES(structure), encryption = VALUES(encryption), compression = VALUES(compression), updated_at = CURRENT_TIMESTAMP(3)`,
      formatId,
      formatName,
      body.enabled === false ? 0 : 1,
      this.json(structure),
      this.json(body.encryption || null),
      this.json(body.compression || null),
    );
    await this.outbox('code-format.events', formatId, { type: 'CODE_FORMAT_SAVED', formatId });
    return this.getCodeFormat(formatId);
  }

  private async getCodeFormat(formatId?: string): Promise<CodeFormatConfig> {
    await this.ensureSchema();
    const systemConfig = await this.getSystemConfig();
    const id = this.text(formatId || systemConfig?.codeFormat?.defaultPattern || 'STD_24', 32).toUpperCase();
    const row = await this.rawOne<any>('SELECT * FROM v2_code_formats WHERE format_id = ? LIMIT 1', [id]);
    if (!row) throw new BadRequestException(`未找到码制式：${id}`);
    const format = this.formatFromRow(row);
    if (!format.enabled) throw new BadRequestException(`码制式已禁用：${id}`);
    return format;
  }

  private async productSnapshot(productId?: number | null) {
    if (!productId) return null;
    return (this.prisma as any).product.findUnique({ where: { id: Number(productId) } }).catch(() => null);
  }

  private async nextSerial(formatId: string, productId: number | null, batchCode: string) {
    const rows = await this.prisma.$queryRawUnsafe(
      'SELECT MAX(CAST(serial_number AS UNSIGNED)) AS max_serial FROM anti_fake_codes WHERE COALESCE(format_id, ?) = ? AND COALESCE(product_id, 0) = ? AND COALESCE(batch_no, \'\') = ?',
      formatId,
      formatId,
      productId || 0,
      batchCode,
    ).catch(() => [{ max_serial: 0 }]) as Array<{ max_serial?: number | bigint | string | null }>;
    const current = Number(rows?.[0]?.max_serial || 0);
    return Number.isFinite(current) ? current + 1 : 1;
  }

  private hashCode(code: string) {
    const salt = String(this.config.get('CODE_SALT') || process.env.CODE_SALT || 'trace-enterprise-default-salt');
    return crypto.createHash('sha256').update(`${code}:${salt}`).digest('hex');
  }

  private calculateChecksum(raw: string, algorithm: ChecksumAlgorithm, length: number) {
    if (algorithm === 'LUHN') {
      const digits = raw.replace(/\D/g, '').split('').map(Number);
      let sum = 0;
      let even = false;
      for (let i = digits.length - 1; i >= 0; i -= 1) {
        let digit = digits[i];
        if (even) { digit *= 2; if (digit > 9) digit -= 9; }
        sum += digit;
        even = !even;
      }
      return String((10 - (sum % 10)) % 10).padStart(length, '0').slice(0, length);
    }
    const digestName = algorithm === 'SHA256_TRUNC' ? 'sha256' : 'sha1';
    return crypto.createHash(digestName).update(raw).digest('hex').toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, length).padEnd(length, '0');
  }

  private encodeTimestamp(length: number, encoding: CodeEncoding) {
    const now = Math.floor(Date.now() / 1000);
    const value = encoding === 'NUMERIC' ? String(now) : now.toString(36).toUpperCase();
    return value.slice(-length).padStart(length, encoding === 'NUMERIC' ? '0' : 'X');
  }

  private randomSegment(length: number, encoding: CodeEncoding) {
    const chars = encoding === 'NUMERIC'
      ? '0123456789'
      : encoding === 'ALPHANUMERIC'
        ? '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        : '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    let out = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i += 1) out += chars[bytes[i] % chars.length];
    return out;
  }

  private segmentLength(segment: CodeSegment) {
    return Number(segment.length || segment.position?.length || 0);
  }

  private buildCode(format: CodeFormatConfig, serial: number, context: Dict) {
    const segments: Dict = {};
    let raw = '';
    let checksumLength = 0;
    for (const segment of format.structure.segments) {
      const length = this.segmentLength(segment);
      if (!length) continue;
      if (segment.type === 'CHECKSUM' || segment.name.toLowerCase() === 'checksum') {
        checksumLength = length;
        continue;
      }
      let value = '';
      if (segment.type === 'FIXED') value = String(segment.value || '');
      if (segment.type === 'VARIABLE') value = String(context[segment.name] ?? context[segment.generator || ''] ?? segment.value ?? '');
      if (segment.type === 'SEQUENCE') value = String(serial);
      if (segment.type === 'TIMESTAMP') value = this.encodeTimestamp(length, format.structure.encoding);
      if (segment.type === 'RANDOM') value = this.randomSegment(length, format.structure.encoding);
      const clean = segment.type === 'SEQUENCE'
        ? String(value).replace(/\D/g, '').padStart(length, '0').slice(-length)
        : this.cleanSegment(value, length, segment.value || '0', format.structure.encoding);
      segments[segment.name] = clean;
      raw += clean;
    }
    const checksum = checksumLength ? this.calculateChecksum(raw, format.structure.checksumAlgorithm, checksumLength) : '';
    if (checksumLength) segments.checksum = checksum;
    return { code: raw + checksum, raw, checksum, segments };
  }

  async generateCodesV2(body: Dict) {
    await this.ensureSchema();
    const format = await this.getCodeFormat(body.formatId || body.format_id);
    const productId = Number(body.productId || body.product_id || 0) || null;
    const product = await this.productSnapshot(productId);
    const quantity = Math.min(Math.max(Number(body.quantity || body.count || 1), 1), 100000);
    const batchCode = this.text(body.batchCode || body.batch_code || body.batch_no || product?.batch_no || '', 64);
    if (!batchCode) throw new BadRequestException('批次码不能为空');
    const productCode = this.cleanSegment(body.productCode || product?.product_code || productId || '0000', 8, '0000', format.structure.encoding);
    const context: Dict = {
      ...body,
      productCode,
      product: productCode,
      batchCode: this.cleanSegment(batchCode, 12, '000000', format.structure.encoding),
      batch: this.cleanSegment(batchCode, 12, '000000', format.structure.encoding),
      brand: this.cleanSegment(body.brandCode || product?.brand || 'AB', 8, 'AB', format.structure.encoding),
      company_prefix: this.cleanSegment(body.companyPrefix || body.company_prefix || '690000', 8, '690000', 'NUMERIC'),
      item_reference: this.cleanSegment(body.itemReference || body.item_reference || productCode, 8, '00000', 'NUMERIC'),
    };
    const startSerial = await this.nextSerial(format.formatId, productId, batchCode);
    const now = new Date();
    const codes: string[] = [];
    const rows: Array<{ code: string; serial: string; checksum: string; segments: Dict }> = [];
    for (let i = 0; i < quantity; i += 1) {
      const built = this.buildCode(format, startSerial + i, context);
      const code = this.codePolicy.issueOrLegacy(() => compactCodeId());
      codes.push(code);
      rows.push({ code, serial: String(startSerial + i), checksum: built.checksum, segments: built.segments });
    }
    const columns = [
      'product_id', 'code', 'code_hash', 'code_ciphertext', 'code_iv', 'code_tag', 'code_key_id',
      'prefix', 'serial_number', 'checksum', 'batch_no', 'status', 'activated_at', 'expires_at', 'packaging_level',
      'product_code', 'product_name', 'category', 'brand', 'specification', 'unit', 'production_place', 'manufacturer', 'company_name',
      'format_id', 'encrypted', 'metadata', 'segments', 'created_at', 'updated_at',
    ];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const placeholders = chunk.map(() => `(${columns.map((column) => ['metadata', 'segments'].includes(column) ? 'CAST(? AS JSON)' : '?').join(',')})`).join(',');
      const params = chunk.flatMap((row) => {
        const stored = this.codeVault.persistence(row.code);
        return [
        productId,
        stored.code,
        stored.code_hash,
        stored.code_ciphertext,
        stored.code_iv,
        stored.code_tag,
        stored.code_key_id,
        this.text(body.prefix || format.formatId, 32) || ANTI_COUNTERFEIT_CODE_VERSION,
        row.serial,
        row.checksum || null,
        batchCode,
        body.autoActivate === false || body.auto_activate === false ? 0 : 1,
        body.autoActivate === false || body.auto_activate === false ? null : now,
        body.expiresAt || body.expires_at || null,
        'ITEM',
        product?.product_code || productCode,
        product?.product_name || null,
        product?.category || null,
        product?.brand || body.brand || null,
        product?.specification || null,
        product?.unit || null,
        product?.production_place || null,
        product?.manufacturer || null,
        product?.manufacturer || null,
        format.formatId,
        format.encryption ? 1 : 0,
        this.json({ ...(body.metadata || {}), v2: true, formatName: format.formatName, generationTaskId: body.taskId || null }),
        this.json(row.segments),
        now,
        now,
      ];
      });
      await this.prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO anti_fake_codes (${columns.map((column) => this.q(column)).join(',')}) VALUES ${placeholders}`,
        ...params,
      );
    }
    const taskId = `CG${Date.now()}${nanoid().slice(0, 6)}`;
    await this.outbox('code.events', taskId, { type: 'CODES_GENERATED', taskId, productId, batchCode, formatId: format.formatId, quantity, firstCode: codes[0], lastCode: codes[codes.length - 1] });
    await this.writeProof('CODE_GENERATE_V2', taskId, codes[0], { taskId, productId, batchCode, formatId: format.formatId, quantity, firstCode: codes[0], lastCode: codes[codes.length - 1] });
    return { task_id: taskId, status: 'COMPLETED', formatId: format.formatId, formatName: format.formatName, count: codes.length, first_code: codes[0], last_code: codes[codes.length - 1], codes };
  }

  private cacheGet<T = any>(key: string): T | null {
    const item = this.l1Cache.get(key);
    if (!item || item.expiresAt < Date.now()) {
      if (item) this.l1Cache.delete(key);
      this.cacheMetrics.misses += 1;
      return null;
    }
    this.cacheMetrics.hits += 1;
    return item.value as T;
  }

  private cacheSet(key: string, value: any, ttl = 300000) {
    this.l1Cache.set(key, { value, expiresAt: Date.now() + ttl });
    this.cacheMetrics.writes += 1;
  }

  private async findCode(code: string) {
    await this.ensureSchema();
    const cacheKey = `code:${code}`;
    const cached = this.cacheGet<any>(cacheKey);
    if (cached) return cached;
    const storedRow = await this.rawOne<any>('SELECT * FROM anti_fake_codes WHERE code_hash = ? OR BINARY code = BINARY ? LIMIT 1', [this.codePolicy.hash(code), code]);
    const row = storedRow ? this.codeVault.hydrate(storedRow) : null;
    if (row) this.cacheSet(cacheKey, row, 300000);
    return row;
  }

  async verifyCodeV2(code: string, clientInfo: Dict = {}) {
    await this.ensureSchema();
    const normalized = this.text(code, 128);
    const signature = this.codePolicy.assess(normalized);
    if (!signature.accepted) {
      return {
        valid: false,
        code: normalized,
        security: {
          riskLevel: 'CRITICAL',
          riskFactors: [`SIGNATURE_${signature.reason}`],
          signatureVerified: false,
          clientInfo: { ip: clientInfo.ip || null, userAgent: clientInfo.userAgent || null },
        },
      };
    }
    const codeRow = await this.findCode(normalized);
    if (!codeRow) throw new NotFoundException('溯源码不存在');
    const expectedHash = this.codePolicy.hash(String(codeRow.code));
    const riskFactors: string[] = [];
    if (codeRow.code_hash && codeRow.code_hash !== expectedHash) riskFactors.push('HASH_MISMATCH');
    const recent = await this.rawOne<any>('SELECT COUNT(1) AS total FROM market_scans WHERE code = ? AND scan_time >= DATE_SUB(NOW(), INTERVAL 1 HOUR)', [normalized]);
    if (Number(recent?.total || 0) > 10) riskFactors.push('ABNORMAL_SCAN_FREQUENCY');
    const riskLevel = riskFactors.includes('HASH_MISMATCH') ? 'CRITICAL' : riskFactors.length ? 'HIGH' : 'LOW';
    return {
      valid: riskLevel !== 'CRITICAL' && Number(codeRow.status) !== 3,
      code: normalized,
      formatId: codeRow.format_id || 'STD_24',
      encrypted: Number(codeRow.encrypted || 0) === 1,
      productInfo: { product_id: codeRow.product_id, product_code: codeRow.product_code, product_name: codeRow.product_name, batch_no: codeRow.batch_no },
      security: {
        riskLevel,
        riskFactors,
        signatureVerified: signature.signed,
        legacyCode: !signature.signed,
        clientInfo: { ip: clientInfo.ip || null, userAgent: clientInfo.userAgent || null },
      },
      segments: this.parseJson(codeRow.segments, {}),
      metadata: this.parseJson(codeRow.metadata, {}),
    };
  }

  async saveRule(body: Dict) {
    await this.ensureSchema();
    const ruleId = this.text(body.ruleId || body.rule_id || `RULE_${nanoid()}`, 64).toUpperCase();
    const ruleName = this.text(body.ruleName || body.rule_name || ruleId, 128);
    const ruleType = this.text(body.ruleType || body.rule_type || 'GEO_FENCE', 40).toUpperCase();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO v2_anti_channel_rules (rule_id, rule_name, description, enabled, priority, rule_type, conditions, actions, scope, confidence_threshold, cooldown_ms)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), ?, ?)
       ON DUPLICATE KEY UPDATE rule_name = VALUES(rule_name), description = VALUES(description), enabled = VALUES(enabled), priority = VALUES(priority), rule_type = VALUES(rule_type), conditions = VALUES(conditions), actions = VALUES(actions), scope = VALUES(scope), confidence_threshold = VALUES(confidence_threshold), cooldown_ms = VALUES(cooldown_ms), updated_at = CURRENT_TIMESTAMP(3)`,
      ruleId,
      ruleName,
      this.text(body.description, 255) || null,
      body.enabled === false ? 0 : 1,
      Number(body.priority || 100),
      ruleType,
      this.json(body.conditions || {}),
      this.json(body.actions || []),
      this.json(body.scope || {}),
      Number(body.confidenceThreshold || body.confidence_threshold || 0.7),
      Number(body.cooldownMs || body.cooldown_ms || 300000),
    );
    await this.outbox('rule.events', ruleId, { type: 'RULE_SAVED', ruleId, ruleType });
    return this.rawOne('SELECT * FROM v2_anti_channel_rules WHERE rule_id = ? LIMIT 1', [ruleId]);
  }

  async listRules(query: Dict = {}) {
    await this.ensureSchema();
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.enabled !== undefined) { clauses.push('enabled = ?'); params.push(String(query.enabled) === 'false' ? 0 : 1); }
    if (query.ruleType || query.rule_type) { clauses.push('rule_type = ?'); params.push(this.text(query.ruleType || query.rule_type, 40).toUpperCase()); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await this.rawMany<any>(`SELECT * FROM v2_anti_channel_rules ${where} ORDER BY priority ASC, id ASC`, params);
    return rows.map((row) => ({ ...row, conditions: this.parseJson(row.conditions, {}), actions: this.parseJson(row.actions, []), scope: this.parseJson(row.scope, {}) }));
  }

  private parsePoint(body: Dict) {
    const loc = body.location || body.scanLocation || {};
    const lat = Number(body.lat ?? body.latitude ?? loc.lat ?? loc.latitude);
    const lng = Number(body.lng ?? body.longitude ?? loc.lng ?? loc.longitude);
    return { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null };
  }

  private actualRegionFromInput(body: Dict) {
    const loc = body.location || body.scanLocation || {};
    return this.text(body.actualRegion || body.actual_region || body.scanRegion || loc.region || loc.city || loc.province || loc.address || body.scan_address || body.scanLocation, 128);
  }

  private regionMismatch(expected?: string | null, actual?: string | null) {
    if (!expected || !actual) return false;
    const exp = String(expected).replace(/省|市|区|县|自治区|特别行政区/g, '');
    const act = String(actual).replace(/省|市|区|县|自治区|特别行政区/g, '');
    return !act.includes(exp) && !exp.includes(act);
  }

  private async evaluateRule(row: any, codeRow: any, scanBody: Dict, recentScanCount: number): Promise<RuleExecutionResult> {
    const ruleType = String(row.rule_type || '').toUpperCase();
    const conditions = this.parseJson<Dict>(row.conditions, {});
    const expectedRegion = this.text(codeRow?.region_group || codeRow?.city_name || codeRow?.province_name || codeRow?.warehouse, 128);
    const actualRegion = this.actualRegionFromInput(scanBody);
    const expectedDealer = this.text(codeRow?.agent_name || codeRow?.distributor, 128);
    const actualDealer = this.text(scanBody.actualDealer || scanBody.actual_dealer || scanBody.dealer || scanBody.dealerName, 128);
    if (ruleType === 'GEO_FENCE') {
      const triggered = this.regionMismatch(expectedRegion, actualRegion);
      return { triggered, severity: triggered ? 'HIGH' : 'LOW', confidence: triggered ? 0.86 : 0, evidence: { expectedRegion, actualRegion, expression: conditions.expression || null } };
    }
    if (ruleType === 'DEALER_CHECK') {
      const triggered = Boolean(expectedDealer && actualDealer && expectedDealer !== actualDealer);
      return { triggered, severity: triggered ? 'MEDIUM' : 'LOW', confidence: triggered ? 0.72 : 0, evidence: { expectedDealer, actualDealer } };
    }
    if (ruleType === 'FREQUENCY_ANALYSIS') {
      const threshold = Number(conditions.threshold || 10);
      const triggered = recentScanCount > threshold;
      return { triggered, severity: triggered ? 'HIGH' : 'LOW', confidence: triggered ? Math.min(0.95, 0.55 + recentScanCount / Math.max(threshold * 4, 1)) : 0, evidence: { recentScanCount, threshold, windowHours: conditions.windowHours || 24 } };
    }
    if (ruleType === 'TIME_PATTERN') {
      const shipTime = codeRow?.ownership_at || codeRow?.updated_at || codeRow?.created_at;
      const hours = shipTime ? (Date.now() - new Date(shipTime).getTime()) / 3600000 : 0;
      const threshold = Number(conditions.minHoursSinceShipment || 0);
      const triggered = hours < threshold;
      return { triggered, severity: triggered ? 'MEDIUM' : 'LOW', confidence: triggered ? 0.68 : 0, evidence: { hoursSinceShipment: Number(hours.toFixed(2)), threshold } };
    }
    if (ruleType === 'ML_MODEL') {
      const geo = this.regionMismatch(expectedRegion, actualRegion) ? 0.45 : 0;
      const freq = Math.min(recentScanCount / 25, 0.25);
      const dealer = expectedDealer && actualDealer && expectedDealer !== actualDealer ? 0.15 : 0;
      const unknown = !expectedRegion || !actualRegion ? 0.08 : 0;
      const score = Math.min(0.98, 0.1 + geo + freq + dealer + unknown);
      const threshold = Number(conditions.threshold || row.confidence_threshold || 0.72);
      return { triggered: score >= threshold, severity: score >= 0.9 ? 'CRITICAL' : score >= 0.72 ? 'HIGH' : score >= 0.5 ? 'MEDIUM' : 'LOW', confidence: score, evidence: { modelVersion: conditions.modelVersion || 'v2-local-scorecard', features: { geo, freq, dealer, unknown, recentScanCount, expectedRegion, actualRegion } } };
    }
    return { triggered: false, severity: 'LOW', confidence: 0, evidence: {} };
  }

  async evaluateScan(body: Dict, dryRun = false, clientInfo: Dict = {}) {
    await this.ensureSchema();
    const code = this.text(body.code || body.traceCode || body.anti_fake_code, 128);
    if (!code) throw new BadRequestException('扫码 code 不能为空');
    const codeRow = await this.findCode(code);
    if (!codeRow) throw new NotFoundException('溯源码不存在');
    const point = this.parsePoint(body);
    const actualRegion = this.actualRegionFromInput(body);
    const scanTime = body.scanTime || body.scan_time ? new Date(String(body.scanTime || body.scan_time)) : new Date();
    if (Number.isNaN(scanTime.getTime())) throw new BadRequestException('scanTime 格式错误');
    const recent = await this.rawOne<any>('SELECT COUNT(1) AS total FROM market_scans WHERE code = ? AND scan_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)', [code]);
    const recentScanCount = Number(recent?.total || 0) + 1;

    if (!dryRun) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO market_scans (code, scan_time, latitude, longitude, scan_location, scan_address, scanner_type, scanner_id, device_id, ip_address, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
        code,
        scanTime,
        point.lat,
        point.lng,
        actualRegion || null,
        this.text(body.scanAddress || body.scan_address || body.address, 255) || null,
        this.text(body.scannerType || body.scanner_type || 'CONSUMER', 32),
        this.text(body.scannerId || body.scanner_id, 64) || null,
        this.text(body.deviceId || body.device_id, 128) || null,
        this.text(clientInfo.ip || body.ip, 64) || null,
        this.json({ ...body, clientInfo }),
      );
      await this.prisma.$executeRawUnsafe('UPDATE anti_fake_codes SET query_count = query_count + 1, last_query_at = ?, risk_score = COALESCE(risk_score, 0), updated_at = CURRENT_TIMESTAMP(3) WHERE code_hash = ?', scanTime, this.codePolicy.hash(code)).catch(() => undefined);
      this.l1Cache.delete(`code:${code}`);
    }

    const rules = await this.listRules({ enabled: true });
    const violations: Dict[] = [];
    for (const rule of rules) {
      const result = await this.evaluateRule(rule, codeRow, body, recentScanCount);
      if (result.triggered && result.confidence >= Number(rule.confidence_threshold || 0)) {
        violations.push({ ruleId: rule.rule_id, ruleName: rule.rule_name, ruleType: rule.rule_type, severity: result.severity, confidence: result.confidence, evidence: result.evidence, actions: rule.actions || [] });
      }
    }
    const riskScore = violations.length ? Math.min(0.99, violations.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / violations.length) : 0;
    const maxSeverity = violations.some((item) => item.severity === 'CRITICAL') ? 'CRITICAL' : violations.some((item) => item.severity === 'HIGH') ? 'HIGH' : violations.some((item) => item.severity === 'MEDIUM') ? 'MEDIUM' : 'LOW';

    let violation: Dict | null = null;
    if (!dryRun && violations.length) {
      const violationId = `V2CV${Date.now()}${nanoid().slice(0, 4).toUpperCase()}`;
      const expectedRegion = this.text(codeRow.region_group || codeRow.city_name || codeRow.province_name || codeRow.warehouse, 128);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO channel_violations (violation_id, code, expected_region, actual_region, expected_dealer, actual_dealer, latitude, longitude, scan_time, confidence, severity, status, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
        violationId,
        code,
        expectedRegion || null,
        actualRegion || null,
        this.text(codeRow.agent_name || codeRow.distributor, 128) || null,
        this.text(body.actualDealer || body.actual_dealer, 128) || null,
        point.lat,
        point.lng,
        scanTime,
        Number(riskScore.toFixed(2)),
        maxSeverity,
        'PENDING',
        this.json({ v2: true, rules: violations, scan: body }),
      );
      violation = await this.rawOne<Dict>('SELECT * FROM channel_violations WHERE violation_id = ? LIMIT 1', [violationId]);
      await this.writeProof('VIOLATION_V2', violationId, code, { violationId, code, riskScore, maxSeverity, violations });
      await this.outbox('violation.events', violationId, { type: 'VIOLATION_DETECTED', violationId, code, riskScore, severity: maxSeverity, rules: violations.map((item) => item.ruleId) });
    }

    return { dryRun, code, result: violations.length ? 'VIOLATION_PENDING' : 'NORMAL', riskScore: Number(riskScore.toFixed(2)), severity: maxSeverity, triggeredRules: violations.map((item) => item.ruleId), violations, violation };
  }

  async realtimeMetrics() {
    await this.ensureSchema();
    const safeCount = async (sql: string, params: unknown[] = []) => Number((await this.rawOne<any>(sql, params))?.total || 0);
    const [codesGeneratedToday, codesActivatedToday, shipmentsToday, marketScansToday, uniqueScannersToday, violationsToday, violationsPending, outboxPending] = await Promise.all([
      safeCount('SELECT COUNT(1) AS total FROM anti_fake_codes WHERE DATE(created_at) = CURRENT_DATE'),
      safeCount('SELECT COUNT(1) AS total FROM anti_fake_codes WHERE DATE(activated_at) = CURRENT_DATE'),
      safeCount('SELECT COUNT(1) AS total FROM shipments WHERE DATE(updated_at) = CURRENT_DATE AND status >= 1'),
      safeCount('SELECT COUNT(1) AS total FROM market_scans WHERE DATE(scan_time) = CURRENT_DATE'),
      safeCount('SELECT COUNT(DISTINCT scanner_id) AS total FROM market_scans WHERE DATE(scan_time) = CURRENT_DATE AND scanner_id IS NOT NULL'),
      safeCount('SELECT COUNT(1) AS total FROM channel_violations WHERE DATE(scan_time) = CURRENT_DATE'),
      safeCount("SELECT COUNT(1) AS total FROM channel_violations WHERE COALESCE(status, 'PENDING') = 'PENDING'"),
      safeCount("SELECT COUNT(1) AS total FROM v2_event_outbox WHERE status = 'PENDING'"),
    ]);
    const totalScans = await safeCount('SELECT COUNT(1) AS total FROM market_scans');
    const totalViolations = await safeCount('SELECT COUNT(1) AS total FROM channel_violations');
    return {
      codesGeneratedToday,
      codesActivatedToday,
      productionYield: codesGeneratedToday ? Number((codesActivatedToday / codesGeneratedToday).toFixed(4)) : 0,
      shipmentsToday,
      productsInTransit: await safeCount('SELECT COUNT(1) AS total FROM shipments WHERE status = 1'),
      productsDelivered: await safeCount('SELECT COUNT(1) AS total FROM shipments WHERE status = 2'),
      scansToday: marketScansToday,
      uniqueScannersToday,
      avgScansPerHour: Number((marketScansToday / 24).toFixed(2)),
      violationsToday,
      violationsPending,
      violationRate: totalScans ? Number((totalViolations / totalScans).toFixed(4)) : 0,
      cacheHitRate: this.cacheHitRate(),
      eventBacklog: outboxPending,
      apiLatencyP95: null,
      apiErrorRate: null,
    };
  }

  private cacheHitRate() {
    const total = this.cacheMetrics.hits + this.cacheMetrics.misses;
    return total ? Number((this.cacheMetrics.hits / total).toFixed(4)) : 0;
  }

  async cacheStatus() {
    await this.ensureSchema();
    return {
      l1: { provider: 'LOCAL_MAP', entries: this.l1Cache.size, hitRate: this.cacheHitRate(), ...this.cacheMetrics },
      l2: { provider: 'REDIS', status: 'configured-by-env', ttlMs: (await this.getSystemConfig()).cache?.l2?.ttl || 3600000 },
      l3: { provider: 'CDN', status: 'metadata-only', ttlMs: (await this.getSystemConfig()).cache?.l3?.ttl || 86400000 },
    };
  }

  async invalidateCache(body: Dict) {
    const keys = Array.isArray(body.keys) ? body.keys.map((item: unknown) => this.text(item, 180)).filter(Boolean) : [];
    const codes = Array.isArray(body.codes) ? body.codes.map((item: unknown) => `code:${this.text(item, 128)}`) : [];
    const targets = [...keys, ...codes];
    if (!targets.length && body.all) {
      const count = this.l1Cache.size;
      this.l1Cache.clear();
      this.cacheMetrics.invalidations += count;
      return { invalidated: count, mode: 'all' };
    }
    for (const key of targets) this.l1Cache.delete(key);
    this.cacheMetrics.invalidations += targets.length;
    await this.outbox('cache.events', 'invalidate', { keys: targets, all: Boolean(body.all) });
    return { invalidated: targets.length, keys: targets };
  }

  async listTenants(query: Dict = {}) {
    await this.ensureSchema();
    const rows = await this.rawMany<any>('SELECT * FROM v2_api_tenants ORDER BY id DESC LIMIT ?', [Math.min(Number(query.limit || 100), 500)]);
    return rows.map((row) => ({ ...row, config: this.parseJson(row.config, {}) }));
  }

  async saveTenant(body: Dict) {
    await this.ensureSchema();
    const tenantId = this.text(body.tenantId || body.tenant_id || `tenant_${nanoid()}`, 64);
    const tenantName = this.text(body.tenantName || body.tenant_name || tenantId, 128);
    const tier = this.text(body.tier || 'BASIC', 32).toUpperCase();
    const config = body.config || {
      quota: { requestsPerSecond: tier === 'ENTERPRISE' ? 200 : 20, requestsPerDay: tier === 'ENTERPRISE' ? 1000000 : 50000, maxBatchSize: tier === 'ENTERPRISE' ? 100000 : 5000 },
      permissions: { allowedAPIs: body.allowedAPIs || body.allowed_apis || ['/v2/traceability/*', '/v2/codes/*'] },
      authentication: { type: body.authType || body.auth_type || 'API_KEY', allowedIPs: body.allowedIPs || [] },
    };
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO v2_api_tenants (tenant_id, tenant_name, tier, status, config)
       VALUES (?, ?, ?, ?, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE tenant_name = VALUES(tenant_name), tier = VALUES(tier), status = VALUES(status), config = VALUES(config), updated_at = CURRENT_TIMESTAMP(3)`,
      tenantId,
      tenantName,
      tier,
      this.text(body.status || 'ACTIVE', 32).toUpperCase(),
      this.json(config),
    );
    await this.outbox('tenant.events', tenantId, { type: 'TENANT_SAVED', tenantId, tier });
    return this.rawOne('SELECT * FROM v2_api_tenants WHERE tenant_id = ? LIMIT 1', [tenantId]);
  }

  async listEdgeNodes() {
    await this.ensureSchema();
    const rows = await this.rawMany<any>('SELECT * FROM v2_edge_nodes ORDER BY updated_at DESC LIMIT 200');
    return rows.map((row) => ({ ...row, config: this.parseJson(row.config, {}) }));
  }

  async edgeHeartbeat(body: Dict) {
    await this.ensureSchema();
    const nodeId = this.text(body.nodeId || body.node_id, 64);
    if (!nodeId) throw new BadRequestException('nodeId 不能为空');
    const nodeType = this.text(body.nodeType || body.node_type || 'WAREHOUSE', 40).toUpperCase();
    const point = this.parsePoint(body);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO v2_edge_nodes (node_id, node_type, node_name, latitude, longitude, config, last_heartbeat, status)
       VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CURRENT_TIMESTAMP(3), ?)
       ON DUPLICATE KEY UPDATE node_type = VALUES(node_type), node_name = VALUES(node_name), latitude = VALUES(latitude), longitude = VALUES(longitude), config = VALUES(config), last_heartbeat = CURRENT_TIMESTAMP(3), status = VALUES(status), updated_at = CURRENT_TIMESTAMP(3)`,
      nodeId,
      nodeType,
      this.text(body.nodeName || body.node_name, 128) || null,
      point.lat,
      point.lng,
      this.json(body.config || {}),
      this.text(body.status || 'ONLINE', 32).toUpperCase(),
    );
    return this.rawOne('SELECT * FROM v2_edge_nodes WHERE node_id = ? LIMIT 1', [nodeId]);
  }

  async recordOfflineScan(body: Dict) {
    await this.ensureSchema();
    const nodeId = this.text(body.nodeId || body.node_id, 64);
    if (!nodeId) throw new BadRequestException('nodeId 不能为空');
    await this.edgeHeartbeat({ nodeId, nodeType: body.nodeType || 'WAREHOUSE', config: body.nodeConfig || {} }).catch(() => undefined);
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO v2_edge_offline_events (node_id, event_type, payload, synced) VALUES (?, ?, CAST(? AS JSON), 0)',
      nodeId,
      this.text(body.eventType || body.event_type || 'SCAN_OFFLINE', 64),
      this.json(body.payload || body),
    );
    return { nodeId, queued: true, eventType: body.eventType || body.event_type || 'SCAN_OFFLINE' };
  }

  async syncEdgeEvents(body: Dict) {
    await this.ensureSchema();
    const nodeId = this.text(body.nodeId || body.node_id, 64);
    const limit = Math.min(Number(body.limit || 100), 1000);
    const clauses = ['synced = 0'];
    const params: unknown[] = [];
    if (nodeId) { clauses.push('node_id = ?'); params.push(nodeId); }
    const events = await this.rawMany<any>(`SELECT * FROM v2_edge_offline_events WHERE ${clauses.join(' AND ')} ORDER BY id ASC LIMIT ?`, [...params, limit]);
    let processed = 0;
    for (const event of events) {
      const payload = this.parseJson<Dict>(event.payload, {});
      try {
        if (String(event.event_type) === 'SCAN_OFFLINE' || payload.code) await this.evaluateScan(payload, false, { edgeNodeId: event.node_id });
        await this.prisma.$executeRawUnsafe('UPDATE v2_edge_offline_events SET synced = 1, synced_at = CURRENT_TIMESTAMP(3) WHERE id = ?', event.id);
        processed += 1;
      } catch (error: any) {
        this.logger.warn(`边缘事件同步失败：${String(error?.message || error).slice(0, 200)}`);
      }
    }
    return { nodeId: nodeId || null, fetched: events.length, processed };
  }

  private async writeProof(businessType: string, businessId: string, code: string | null | undefined, proofData: Dict) {
    const config = await this.getSystemConfig();
    if (config?.blockchain?.enabled === false) return null;
    const digest = crypto.createHash('sha256').update(this.json(proofData)).digest('hex');
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO blockchain_proofs (business_type, business_id, code, transaction_hash, merkle_root, proof_data) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))',
      businessType,
      businessId,
      code || null,
      digest,
      digest,
      this.json({ provider: config?.blockchain?.provider || 'FABRIC', syncMode: config?.blockchain?.syncMode || 'BATCH', data: proofData }),
    ).catch(() => undefined);
    await this.outbox('blockchain.events', businessId, { type: 'PROOF_QUEUED', businessType, businessId, code, digest });
    return { business_type: businessType, business_id: businessId, code, transaction_hash: digest };
  }
}
