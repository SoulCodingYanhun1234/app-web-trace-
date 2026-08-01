import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import crypto from 'node:crypto';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResourcesService } from '../resources/resources.service.js';
import { AntiCounterfeitCodePolicy } from '../common/anti-counterfeit-code.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 10);
const compactCodeId = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 16);

type GeoLocation = { lat?: number; lng?: number; latitude?: number; longitude?: number; address?: string; province?: string; city?: string };

type CodeInsertRow = {
  product_id: number | null;
  code: string;
  code_hash: string;
  prefix: string;
  serial_number: string | null;
  checksum: string | null;
  batch_no: string | null;
  status: number;
  activated_at: Date | null;
  expires_at: Date | null;
  packaging_level: string;
  product_code?: string | null;
  product_name?: string | null;
  category?: string | null;
  brand?: string | null;
  specification?: string | null;
  unit?: string | null;
  production_place?: string | null;
  manufacturer?: string | null;
  company_name?: string | null;
};

@Injectable()
export class TraceabilityV1Service {
  private readonly logger = new Logger(TraceabilityV1Service.name);
  private readonly codePolicy = new AntiCounterfeitCodePolicy();
  private readonly codeVault = new AntiCounterfeitCodeVault();
  private schemaReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly resources: ResourcesService,
    private readonly config: ConfigService,
  ) {}

  private q(name: string) { return `\`${String(name || '').replace(/`/g, '``')}\``; }

  private text(value: unknown, max = 255) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
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
      CREATE TABLE IF NOT EXISTS production_batches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_code VARCHAR(64) NOT NULL UNIQUE,
        product_id INT NULL,
        factory_id VARCHAR(64) NULL,
        planned_quantity INT NULL,
        actual_quantity INT NULL,
        production_date DATE NULL,
        expiry_date DATE NULL,
        status VARCHAR(32) NULL DEFAULT 'CREATED',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_production_batches_product_id (product_id),
        INDEX idx_production_batches_status (status)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS production_steps (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_code VARCHAR(64) NOT NULL,
        step_type VARCHAR(64) NOT NULL,
        step_name VARCHAR(128) NULL,
        operator_id VARCHAR(64) NULL,
        start_time DATETIME(3) NULL,
        end_time DATETIME(3) NULL,
        quantity INT NULL,
        quality_status VARCHAR(32) NULL,
        blockchain_hash VARCHAR(64) NULL,
        payload JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_production_steps_batch_code (batch_code),
        INDEX idx_production_steps_step_type (step_type)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS packaging_relations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        parent_code VARCHAR(128) NOT NULL,
        child_codes JSON NOT NULL,
        packaging_level VARCHAR(32) NOT NULL,
        relation_type VARCHAR(32) NULL DEFAULT 'ONE_TO_MANY',
        created_by VARCHAR(64) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_packaging_parent_code (parent_code),
        INDEX idx_packaging_level (packaging_level)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS warehouse_in_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(128) NOT NULL,
        batch_code VARCHAR(64) NULL,
        warehouse_id VARCHAR(64) NULL,
        quantity INT NOT NULL DEFAULT 1,
        in_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        operator_id VARCHAR(64) NULL,
        status VARCHAR(32) NULL DEFAULT 'IN_STOCK',
        payload JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_warehouse_code (code),
        INDEX idx_warehouse_batch_code (batch_code),
        INDEX idx_warehouse_id (warehouse_id)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS market_scans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(128) NOT NULL,
        scan_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        latitude DECIMAL(10,6) NULL,
        longitude DECIMAL(10,6) NULL,
        scan_location VARCHAR(255) NULL,
        scan_address VARCHAR(255) NULL,
        scanner_type VARCHAR(32) NULL,
        scanner_id VARCHAR(64) NULL,
        device_id VARCHAR(128) NULL,
        ip_address VARCHAR(64) NULL,
        payload JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_market_scans_code (code),
        INDEX idx_market_scans_scan_time (scan_time),
        INDEX idx_market_scans_scanner_type (scanner_type)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS channel_violations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        violation_id VARCHAR(64) NOT NULL UNIQUE,
        code VARCHAR(128) NOT NULL,
        expected_region VARCHAR(128) NULL,
        actual_region VARCHAR(128) NULL,
        expected_dealer VARCHAR(128) NULL,
        actual_dealer VARCHAR(128) NULL,
        latitude DECIMAL(10,6) NULL,
        longitude DECIMAL(10,6) NULL,
        scan_time DATETIME(3) NOT NULL,
        confidence DECIMAL(4,2) NULL,
        severity VARCHAR(32) NULL,
        status VARCHAR(32) NULL DEFAULT 'PENDING',
        handling_notes TEXT NULL,
        payload JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_channel_violations_code (code),
        INDEX idx_channel_violations_status (status),
        INDEX idx_channel_violations_scan_time (scan_time)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS blockchain_proofs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        business_type VARCHAR(64) NOT NULL,
        business_id VARCHAR(128) NOT NULL,
        code VARCHAR(128) NULL,
        transaction_hash VARCHAR(128) NULL,
        block_number VARCHAR(64) NULL,
        merkle_root VARCHAR(128) NULL,
        proof_data JSON NULL,
        stored_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        INDEX idx_blockchain_business (business_type, business_id),
        INDEX idx_blockchain_code (code)
      )
    `);
    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS code_serial_counters (
        scope_key VARCHAR(191) NOT NULL PRIMARY KEY,
        current_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB
    `);

    const codeColumns: Array<[string, string]> = [
      ['code_hash', 'VARCHAR(64) NULL'],
      ['code_ciphertext', 'VARBINARY(512) NULL'],
      ['code_iv', 'BINARY(12) NULL'],
      ['code_tag', 'BINARY(16) NULL'],
      ['code_key_id', 'VARCHAR(32) NULL'],
      ['prefix', 'VARCHAR(32) NULL'],
      ['serial_number', 'VARCHAR(32) NULL'],
      ['checksum', 'VARCHAR(8) NULL'],
      ['parent_code', 'VARCHAR(128) NULL'],
      ['packaging_level', 'VARCHAR(32) NULL'],
      ['risk_level', 'VARCHAR(32) NULL'],
      ['last_scan_location', 'VARCHAR(255) NULL'],
      ['last_scan_lat', 'DECIMAL(10,6) NULL'],
      ['last_scan_lng', 'DECIMAL(10,6) NULL'],
      ['last_scan_at', 'DATETIME(3) NULL'],
    ];
    for (const [column, definition] of codeColumns) await this.addColumnIfMissing('anti_fake_codes', column, definition);
    this.schemaReady = true;
  }

  private parseDate(value: unknown): Date | null {
    if (value === undefined || value === null || value === '') return null;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) throw new BadRequestException('日期格式错误');
    return date;
  }

  private asArray(value: unknown) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
      return value.split(/[\s,，;；|]+/);
    }
    return [];
  }

  private normalizeCodes(value: unknown, allowEmpty = false) {
    const codes = Array.from(new Set(this.asArray(value).map((item) => this.text(item, 128)).filter(Boolean)));
    if (!allowEmpty && !codes.length) throw new BadRequestException('码不能为空');
    return codes;
  }

  private checksum(payload: string) {
    const digits = payload.replace(/\D/g, '').split('').map(Number);
    let sum = 0;
    let even = false;
    for (let i = digits.length - 1; i >= 0; i -= 1) {
      let digit = digits[i];
      if (even) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      even = !even;
    }
    const luhn = (10 - (sum % 10)) % 10;
    const crc = crypto.createHash('sha1').update(payload).digest('hex').slice(0, 1).toUpperCase();
    return `${luhn}${crc}`;
  }

  private hashCode(code: string) {
    const salt = String(this.config.get('CODE_SALT') || process.env.CODE_SALT || 'trace-enterprise-default-salt');
    return crypto.createHash('sha256').update(`${code}:${salt}`).digest('hex');
  }

  private cleanSegment(value: unknown, max: number, fallback: string) {
    const clean = this.text(value, max).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    return (clean || fallback).slice(0, max);
  }

  private async productSnapshot(productId?: number | null) {
    if (!productId) return null;
    return (this.prisma as any).product.findUnique({ where: { id: Number(productId) } }).catch(() => null);
  }

  private productPatch(product: any = {}) {
    return {
      product_id: product?.id || null,
      product_code: product?.product_code || null,
      product_name: product?.product_name || null,
      category: product?.category || null,
      brand: product?.brand || null,
      specification: product?.specification || null,
      unit: product?.unit || null,
      production_place: product?.production_place || null,
      manufacturer: product?.manufacturer || null,
      company_name: product?.manufacturer || null,
    };
  }

  private async nextSerial(prefix: string, batchCode: string) {
    const rows = await this.prisma.$queryRawUnsafe(
      'SELECT MAX(CAST(serial_number AS UNSIGNED)) AS max_serial FROM anti_fake_codes WHERE prefix = ? AND batch_no = ?',
      prefix,
      batchCode,
    ).catch(() => [{ max_serial: 0 }]) as Array<{ max_serial?: number | bigint | string | null }>;
    const current = Number(rows?.[0]?.max_serial || 0);
    return Number.isFinite(current) ? current + 1 : 1;
  }

  private async insertCodes(rows: CodeInsertRow[]) {
    const columns = [
      'product_id', 'code', 'code_hash', 'code_ciphertext', 'code_iv', 'code_tag', 'code_key_id',
      'prefix', 'serial_number', 'checksum', 'batch_no', 'status', 'activated_at', 'expires_at', 'packaging_level',
      'product_code', 'product_name', 'category', 'brand', 'specification', 'unit', 'production_place', 'manufacturer', 'company_name', 'created_at', 'updated_at',
    ];
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
      const params = chunk.flatMap((row) => {
        const stored = this.codeVault.persistence(row.code);
        return [
        row.product_id, stored.code, stored.code_hash, stored.code_ciphertext, stored.code_iv, stored.code_tag, stored.code_key_id,
        row.prefix, row.serial_number, row.checksum, row.batch_no, row.status, row.activated_at, row.expires_at, row.packaging_level,
        row.product_code || null, row.product_name || null, row.category || null, row.brand || null, row.specification || null, row.unit || null, row.production_place || null, row.manufacturer || null, row.company_name || null, new Date(), new Date(),
      ];
      });
      await this.prisma.$executeRawUnsafe(
        `INSERT IGNORE INTO anti_fake_codes (${columns.map((column) => this.q(column)).join(',')}) VALUES ${placeholders}`,
        ...params,
      );
    }
  }

  async generateCodes(body: Record<string, any>) {
    await this.ensureSchema();
    const productId = Number(body.productId || body.product_id || 0) || null;
    const product = await this.productSnapshot(productId);
    const quantity = Math.min(Math.max(Number(body.quantity || body.count || 1), 1), 100000);
    const batchCode = this.text(body.batchCode || body.batch_code || body.batch_no || product?.batch_no, 64);
    if (!batchCode) throw new BadRequestException('批次码不能为空');
    const productCodePart = this.cleanSegment(body.productCode || product?.product_code || productId || 'P000', 4, 'P000');
    const brandPart = this.cleanSegment(body.brandCode || product?.brand || body.prefix || 'AA', 2, 'AA');
    const prefix = this.cleanSegment(body.prefix || `${brandPart}${productCodePart}`, 12, `${brandPart}${productCodePart}`);
    const autoActivate = body.autoActivate !== false && body.auto_activate !== false;
    const expiresAt = this.parseDate(body.expired_at || body.expires_at || body.valid_until);
    const startSerial = await this.nextSerial(prefix, batchCode);
    const now = new Date();
    const rows = Array.from({ length: quantity }, (_, index) => {
      const serial = String(startSerial + index).padStart(10, '0');
      const raw = `${prefix}-${batchCode}-${serial}`;
      const check = this.checksum(raw);
      const code = this.codePolicy.issueOrLegacy(() => compactCodeId());
      return {
        ...this.productPatch(product),
        code,
        code_hash: this.codePolicy.hash(code),
        prefix,
        serial_number: serial,
        checksum: check,
        batch_no: batchCode,
        status: autoActivate ? 1 : 0,
        activated_at: autoActivate ? now : null,
        expires_at: expiresAt,
        packaging_level: 'ITEM',
      };
    });
    await this.insertCodes(rows);
    await this.createBlockchainProof('CODE_GENERATE', `${batchCode}:${Date.now()}`, rows[0]?.code, { batchCode, prefix, quantity, range: [rows[0]?.code, rows[rows.length - 1]?.code] });
    await this.resources.autoSyncTrace({ codes: rows.map((row) => row.code) }).catch((error: any) => this.logger.warn(`生成码后同步溯源失败：${error?.message || error}`));
    return { count: rows.length, product_id: productId, batch_code: batchCode, prefix, codes: rows.map((row) => row.code), first_code: rows[0]?.code, last_code: rows[rows.length - 1]?.code };
  }

  async importCodes(body: Record<string, any>) {
    await this.ensureSchema();
    const codes = this.normalizeCodes(body.codes || body.code_list || body.import_codes);
    const productId = Number(body.productId || body.product_id || 0) || null;
    const product = await this.productSnapshot(productId);
    const batchCode = this.text(body.batchCode || body.batch_code || body.batch_no || product?.batch_no, 64);
    const rejected = codes.find((code) => !this.codePolicy.assess(code).accepted);
    if (rejected) throw new BadRequestException('导入码未通过签名策略校验，生产环境只允许有效签名码');
    const rows = codes.map((code, index) => ({
      ...this.productPatch(product),
      code,
      code_hash: this.codePolicy.hash(code),
      prefix: this.text(body.prefix || code.split('-')[0] || 'IMP', 32),
      serial_number: this.text((body.serials || [])[index] || '', 32) || null,
      checksum: this.text(code.split('-').pop(), 8) || null,
      batch_no: batchCode || null,
      status: body.autoActivate === false || body.auto_activate === false ? 0 : 1,
      activated_at: body.autoActivate === false || body.auto_activate === false ? null : new Date(),
      expires_at: null,
      packaging_level: 'ITEM',
    }));
    await this.insertCodes(rows);
    await this.resources.autoSyncTrace({ codes }).catch(() => undefined);
    return { requested: codes.length, imported: rows.length, batch_code: batchCode || null };
  }

  private async findCode(code: string) {
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM anti_fake_codes WHERE code_hash = ? OR BINARY code = BINARY ? LIMIT 1`,
      this.codePolicy.hash(code),
      code,
    ).catch(() => []) as any[];
    return rows[0] ? this.codeVault.hydrate(rows[0]) : null;
  }

  private async findCodes(codes: string[]) {
    if (!codes.length) return [];
    const hashes = codes.map((code) => this.codePolicy.hash(code));
    const placeholders = hashes.map(() => '?').join(',');
    const rows = await this.prisma.$queryRawUnsafe(`SELECT * FROM anti_fake_codes WHERE code_hash IN (${placeholders})`, ...hashes).catch(() => []) as any[];
    return this.codeVault.hydrateMany(rows);
  }

  async verifyCode(code: string) {
    await this.ensureSchema();
    const trace = await this.queryTraceability(code);
    const codeRow = trace.codeEntity;
    const expectedHash = codeRow ? this.codePolicy.hash(String(codeRow.code)) : '';
    const valid = Boolean(codeRow && (!codeRow.code_hash || codeRow.code_hash === expectedHash) && Number(codeRow.status) !== 3);
    return { valid, status: codeRow?.status ?? null, productInfo: trace.productInfo, risk: trace.security, traceability: trace };
  }

  async createPackagingRelation(body: Record<string, any>) {
    await this.ensureSchema();
    const parentCode = this.text(body.parentCode || body.parent_code || body.boxCode || body.box_no, 128);
    const childCodes = this.normalizeCodes(body.childCodes || body.child_codes || body.codes);
    const level = this.text(body.level || body.packagingLevel || body.packaging_level || 'BOX', 32).toUpperCase();
    if (!parentCode) throw new BadRequestException('父级包装码不能为空');
    if (childCodes.includes(parentCode)) throw new BadRequestException('父级码不能同时作为子级码');

    const children = await this.findCodes(childCodes);
    if (children.length !== childCodes.length) {
      const found = new Set(children.map((item: any) => String(item.code)));
      throw new BadRequestException(`以下子码不存在：${childCodes.filter((code) => !found.has(code)).join('、')}`);
    }

    const existedRelations = await this.prisma.$queryRawUnsafe('SELECT parent_code, child_codes FROM packaging_relations ORDER BY id DESC LIMIT 5000').catch(() => []) as any[];
    const alreadyBound = new Set<string>();
    for (const row of existedRelations) {
      const list = this.asArray(row.child_codes).map((item) => this.text(item, 128));
      for (const code of childCodes) if (list.includes(code)) alreadyBound.add(code);
    }
    if (alreadyBound.size) throw new BadRequestException(`部分子码已存在包装关联：${Array.from(alreadyBound).join('、')}`);

    await this.prisma.$executeRawUnsafe(
      'INSERT INTO packaging_relations (parent_code, child_codes, packaging_level, relation_type, created_by) VALUES (?, CAST(? AS JSON), ?, ?, ?)',
      parentCode,
      JSON.stringify(childCodes),
      level,
      'ONE_TO_MANY',
      this.text(body.createdBy || body.created_by, 64) || null,
    );

    const childHashes = childCodes.map((code) => this.codePolicy.hash(code));
    const placeholders = childHashes.map(() => '?').join(',');
    await this.prisma.$executeRawUnsafe(
      `UPDATE anti_fake_codes SET parent_code = ?, packaging_level = ?, box_no = CASE WHEN ? = 'BOX' THEN ? ELSE box_no END, box_bound_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE code_hash IN (${placeholders})`,
      parentCode,
      level === 'BOX' ? 'ITEM' : 'BOX',
      level,
      parentCode,
      ...childHashes,
    ).catch(() => undefined);

    if (level === 'BOX') {
      const existingBox = await (this.prisma as any).box.findFirst({ where: { box_no: parentCode } }).catch(() => null);
      if (existingBox) {
        await this.resources.addBoxCodes(existingBox.id, childCodes).catch((error: any) => this.logger.warn(`同步箱码失败：${error?.message || error}`));
        await this.resources.setBoxStatus(existingBox.id, 1).catch(() => undefined);
      } else {
        await this.resources.create('box', { box_no: parentCode, codes: childCodes, box_capacity: childCodes.length, box_type: '标准箱', status: 1 }).catch((error: any) => this.logger.warn(`创建箱码失败：${error?.message || error}`));
      }
    }

    await this.createBlockchainProof('RELATION', parentCode, parentCode, { parentCode, childCodes, level });
    await this.resources.autoSyncTrace({ codes: childCodes }).catch(() => undefined);
    return { parentCode, childCodes, level, relationType: 'ONE_TO_MANY', createdAt: new Date().toISOString() };
  }

  async packagingTree(code: string) {
    await this.ensureSchema();
    const visited = new Set<string>();
    const build = async (nodeCode: string): Promise<any> => {
      if (visited.has(nodeCode)) return { code: nodeCode, circular: true, children: [] };
      visited.add(nodeCode);
      const relations = await this.prisma.$queryRawUnsafe('SELECT * FROM packaging_relations WHERE parent_code = ? ORDER BY id ASC', nodeCode).catch(() => []) as any[];
      const children: any[] = [];
      for (const relation of relations) {
        const childCodes = this.normalizeCodes(relation.child_codes, true);
        for (const child of childCodes) children.push(await build(child));
      }
      const codeRow = await this.findCode(nodeCode);
      const box = await (this.prisma as any).box.findFirst({ where: { box_no: nodeCode } }).catch(() => null);
      return { code: nodeCode, level: box ? 'BOX' : codeRow?.packaging_level || 'ITEM', product_name: codeRow?.product_name || box?.product_name || null, children };
    };
    return build(this.text(code, 128));
  }

  async createBatch(body: Record<string, any>) {
    await this.ensureSchema();
    const productId = Number(body.productId || body.product_id || 0) || null;
    const batchCode = this.text(body.batchCode || body.batch_code || body.batch_no || `B${Date.now()}`, 64);
    const data = {
      batch_code: batchCode,
      product_id: productId,
      factory_id: this.text(body.factoryId || body.factory_id, 64) || null,
      planned_quantity: Number(body.plannedQuantity || body.planned_quantity || 0) || null,
      actual_quantity: Number(body.actualQuantity || body.actual_quantity || 0) || null,
      production_date: this.parseDate(body.productionDate || body.production_date),
      expiry_date: this.parseDate(body.expiryDate || body.expiry_date),
      status: this.text(body.status || 'CREATED', 32),
    };
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO production_batches (batch_code, product_id, factory_id, planned_quantity, actual_quantity, production_date, expiry_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE product_id = VALUES(product_id), factory_id = VALUES(factory_id), planned_quantity = VALUES(planned_quantity), actual_quantity = VALUES(actual_quantity), production_date = VALUES(production_date), expiry_date = VALUES(expiry_date), status = VALUES(status), updated_at = CURRENT_TIMESTAMP(3)`,
      data.batch_code, data.product_id, data.factory_id, data.planned_quantity, data.actual_quantity, data.production_date, data.expiry_date, data.status,
    );
    const row = await this.rawOne('SELECT * FROM production_batches WHERE batch_code = ? LIMIT 1', [batchCode]);
    if (productId) await this.resources.autoSyncTrace({ product_id: productId, batch_no: batchCode }).catch(() => undefined);
    return row;
  }

  async addBatchStep(batchCode: string, body: Record<string, any>) {
    await this.ensureSchema();
    const stepType = this.text(body.stepType || body.step_type || 'PRODUCTION', 64);
    const stepName = this.text(body.stepName || body.step_name || stepType, 128);
    const startTime = this.parseDate(body.startTime || body.start_time);
    const endTime = this.parseDate(body.endTime || body.end_time);
    const payloadJson = JSON.stringify(body || {});
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO production_steps (batch_code, step_type, step_name, operator_id, start_time, end_time, quantity, quality_status, blockchain_hash, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
      this.text(batchCode, 64),
      stepType,
      stepName,
      this.text(body.operatorId || body.operator_id, 64) || null,
      startTime,
      endTime,
      Number(body.quantity || 0) || null,
      this.text(body.qualityStatus || body.quality_status, 32) || null,
      null,
      payloadJson,
    );
    const row = await this.rawOne('SELECT * FROM production_steps WHERE batch_code = ? ORDER BY id DESC LIMIT 1', [this.text(batchCode, 64)]);
    const batch = await this.rawOne('SELECT * FROM production_batches WHERE batch_code = ? LIMIT 1', [this.text(batchCode, 64)]);
    await (this.prisma as any).processRecord.create({ data: {
      product_id: batch?.product_id || null,
      batch_no: this.text(batchCode, 64),
      process_type: stepType,
      process_name: stepName,
      process_content: this.text(body.content || body.process_content || `${stepName} 已记录`, 500),
      process_data: body,
      operator: this.text(body.operatorId || body.operator_id, 64) || null,
      location: this.text(body.location, 128) || null,
      process_time: endTime || startTime || new Date(),
      status: 1,
    } }).catch(() => undefined);
    await this.createBlockchainProof('PRODUCTION_STEP', String(row?.id || Date.now()), this.text(batchCode, 64), row || body);
    await this.resources.autoSyncTrace({ product_id: batch?.product_id, batch_no: this.text(batchCode, 64) }).catch(() => undefined);
    return row;
  }

  async warehouseIn(body: Record<string, any>) {
    await this.ensureSchema();
    const codes = this.normalizeCodes(body.codes || body.code);
    const warehouseId = this.text(body.warehouseId || body.warehouse_id || body.warehouse || 'DEFAULT', 64);
    const operatorId = this.text(body.operatorId || body.operator_id, 64) || null;
    const codeRows = await this.findCodes(codes);
    for (const code of codes) {
      const codeRow = codeRows.find((item: any) => String(item.code) === code);
      await this.prisma.$executeRawUnsafe(
        'INSERT INTO warehouse_in_records (code, batch_code, warehouse_id, quantity, operator_id, status, payload) VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))',
        code,
        codeRow?.batch_no || this.text(body.batchCode || body.batch_code || body.batch_no, 64) || null,
        warehouseId,
        1,
        operatorId,
        'IN_STOCK',
        JSON.stringify(body || {}),
      );
    }
    const codeHashes = codes.map((code) => this.codePolicy.hash(code));
    const placeholders = codeHashes.map(() => '?').join(',');
    await this.prisma.$executeRawUnsafe(`UPDATE anti_fake_codes SET status = 1, warehouse = ?, activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP(3)), updated_at = CURRENT_TIMESTAMP(3) WHERE code_hash IN (${placeholders})`, warehouseId, ...codeHashes).catch(() => undefined);
    await this.createBlockchainProof('WAREHOUSE_IN', `${warehouseId}:${Date.now()}`, codes[0], { codes, warehouseId });
    await this.resources.autoSyncTrace({ codes }).catch(() => undefined);
    return { warehouse_id: warehouseId, total: codes.length, status: 'IN_STOCK' };
  }

  async shipmentOut(body: Record<string, any>) {
    await this.ensureSchema();
    const codes = this.normalizeCodes(body.codes || body.code || body.boxCodes || body.box_codes, true);
    const boxTokens = this.normalizeCodes(body.box_ids || body.boxIds || body.boxCodes || body.box_codes, true);
    const codeRows = codes.length ? await this.findCodes(codes) : [];
    const directBoxes = boxTokens.length ? await (this.prisma as any).box.findMany({ where: { OR: [{ box_no: { in: boxTokens } }, { id: { in: boxTokens.map((item) => Number(item)).filter((n) => Number.isInteger(n) && n > 0) } }] } }).catch(() => []) : [];
    const codeBoxIds = Array.from(new Set(codeRows.map((item: any) => Number(item.box_id)).filter((n: number) => Number.isInteger(n) && n > 0)));
    const codeBoxes = codeBoxIds.length ? await (this.prisma as any).box.findMany({ where: { id: { in: codeBoxIds } } }).catch(() => []) : [];
    const boxes = Array.from(new Map([...directBoxes, ...codeBoxes].map((box: any) => [Number(box.id), box])).values());
    if (!boxes.length && codes.length) {
      const requestedBoxNo = this.text(body.autoBoxNo || body.auto_box_no, 128);
      const box = await this.resources.create('box', {
        ...(requestedBoxNo ? { box_no: requestedBoxNo } : {}),
        codes,
        box_capacity: codes.length,
        status: 1,
      }).catch((error: any) => {
        this.logger.warn(`自动建箱失败：${error?.message || error}`);
        return null;
      });
      if (box) boxes.push(box);
    }
    if (!boxes.length) throw new BadRequestException('请提供待发货的箱码或产品码');
    const agentId = Number(body.dealerId || body.dealer_id || body.agentId || body.agent_id || 0) || null;
    const shipment = await this.resources.create('shipments', {
      shipment_no: this.text(body.orderId || body.order_id || body.shipmentNo || body.shipment_no || `SH${Date.now()}`, 128),
      batch_no: this.text(body.batchCode || body.batch_code || body.batch_no || boxes[0]?.batch_no || codeRows[0]?.batch_no || 'AUTO', 64),
      agent_id: agentId,
      box_ids: boxes.map((box: any) => box.id),
      logistics_company: this.text(body.logisticsCompany || body.logistics_company, 128) || null,
      logistics_no: this.text(body.logisticsNo || body.logistics_no, 128) || null,
      receiver: this.text(body.receiver || body.dealerName || body.dealer_name, 64) || null,
      receiver_phone: this.text(body.receiverPhone || body.receiver_phone, 32) || null,
      receiver_address: this.text(body.destination || body.receiverAddress || body.receiver_address, 255) || null,
      province_name: this.text(body.provinceName || body.province_name, 64) || null,
      city_name: this.text(body.cityName || body.city_name, 64) || null,
      region_group: this.text(body.regionId || body.region_id || body.region_group, 128) || null,
      status: 0,
      remark: this.text(body.remark, 500) || null,
    });
    await this.resources.updateShipmentStatus(shipment.id, 1, body).catch((error: any) => this.logger.warn(`出库发货生命周期失败：${error?.message || error}`));
    await this.createBlockchainProof('SHIPMENT', String(shipment.id), codes[0] || boxes[0]?.box_no, { shipment, boxes: boxes.map((box: any) => box.box_no || box.id) });
    return { shipment_id: shipment.id, shipment_no: shipment.shipment_no, box_count: boxes.length, status: 'SHIPPED' };
  }

  private parsePoint(location: GeoLocation = {}) {
    const lat = Number(location.lat ?? location.latitude);
    const lng = Number(location.lng ?? location.longitude);
    return { lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null };
  }

  private actualRegionFromInput(location: GeoLocation = {}, body: Record<string, any> = {}) {
    return this.text(body.actualRegion || body.actual_region || location.address || [location.province, location.city].filter(Boolean).join('') || body.scan_address || body.location, 128);
  }

  private regionMismatch(expected?: string | null, actual?: string | null) {
    const e = this.text(expected || '', 128).replace(/[省市区县\s/]+/g, '');
    const a = this.text(actual || '', 128).replace(/[省市区县\s/]+/g, '');
    if (!e || !a) return false;
    return !(a.includes(e) || e.includes(a));
  }

  async marketScan(body: Record<string, any>, clientInfo: { ip?: string; userAgent?: string } = {}) {
    await this.ensureSchema();
    const code = this.text(body.code, 128);
    if (!code) throw new BadRequestException('溯源码不能为空');
    const codeRow = await this.findCode(code);
    if (!codeRow) throw new NotFoundException('溯源码不存在');
    const location = (body.location || {}) as GeoLocation;
    const point = this.parsePoint({ ...location, lat: body.lat ?? body.latitude ?? location.lat, lng: body.lng ?? body.longitude ?? location.lng });
    const scanTime = this.parseDate(body.scanTime || body.scan_time) || new Date();
    const actualRegion = this.actualRegionFromInput(location, body);
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO market_scans (code, scan_time, latitude, longitude, scan_location, scan_address, scanner_type, scanner_id, device_id, ip_address, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
      code,
      scanTime,
      point.lat,
      point.lng,
      actualRegion || null,
      this.text(body.scanAddress || body.scan_address || body.address || actualRegion, 255) || null,
      this.text(body.scannerType || body.scanner_type || 'CONSUMER', 32),
      this.text(body.scannerId || body.scanner_id, 64) || null,
      this.text(body.deviceId || body.device_id, 128) || null,
      this.text(clientInfo.ip || body.ip_address, 64) || null,
      JSON.stringify(body || {}),
    );
    await this.prisma.$executeRawUnsafe(
      `UPDATE anti_fake_codes
       SET query_count = COALESCE(query_count, 0) + 1,
           first_query_at = COALESCE(first_query_at, ?),
           last_query_at = ?,
           last_scan_location = ?,
           last_scan_lat = ?,
           last_scan_lng = ?,
           last_scan_at = ?,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ?`,
      scanTime,
      scanTime,
      actualRegion || null,
      point.lat,
      point.lng,
      scanTime,
      Number(codeRow.id),
    ).catch(() => undefined);

    const expectedRegion = this.text(codeRow.region_group || [codeRow.province_name, codeRow.city_name].filter(Boolean).join(' / '), 128);
    let violation: any = null;
    if (this.regionMismatch(expectedRegion, actualRegion)) {
      const confidence = actualRegion ? 0.92 : 0.65;
      const severity = confidence >= 0.85 ? 'HIGH' : 'MEDIUM';
      const violationId = `CV${Date.now()}${nanoid().slice(0, 4)}`;
      const codeReference = this.codeVault.reference(code);
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
        confidence,
        severity,
        'PENDING',
        JSON.stringify(body || {}),
      );
      violation = await this.rawOne('SELECT * FROM channel_violations WHERE violation_id = ? LIMIT 1', [violationId]);
      await (this.prisma as any).antiChannelingAlert.create({ data: {
        alert_no: violationId,
        alert_type: 'REGION_MISMATCH',
        severity: severity === 'HIGH' ? 3 : 2,
        title: '市场扫码区域与授权流向不一致',
        code: codeReference,
        product_id: codeRow.product_id || null,
        product_code: codeRow.product_code || null,
        product_name: codeRow.product_name || null,
        agent_id: codeRow.agent_id || null,
        agent_name: codeRow.agent_name || null,
        authorized_region: expectedRegion || null,
        authorized_province: codeRow.province_name || null,
        authorized_city: codeRow.city_name || null,
        actual_location: actualRegion || null,
        scan_time: scanTime,
        evidence: { code: codeReference, expectedRegion, actualRegion, confidence, point },
        status: 0,
      } }).catch(() => undefined);
      await this.createBlockchainProof('VIOLATION', violationId, code, violation);
    }
    return { code, productInfo: { product_id: codeRow.product_id, product_code: codeRow.product_code, product_name: codeRow.product_name }, expectedRegion, actualRegion, violation, result: violation ? 'VIOLATION_PENDING' : 'NORMAL' };
  }

  private async rawOne(sql: string, params: unknown[] = []) {
    const rows = await this.prisma.$queryRawUnsafe(sql, ...params).catch(() => []) as any[];
    return rows[0] || null;
  }

  private async rawMany(sql: string, params: unknown[] = []) {
    return this.prisma.$queryRawUnsafe(sql, ...params).catch(() => []) as Promise<any[]>;
  }

  async listViolations(query: Record<string, any> = {}) {
    await this.ensureSchema();
    const page = Math.max(Number(query.page || 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize || query.page_size || 20), 1), 100);
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (query.status) { clauses.push('status = ?'); params.push(this.text(query.status, 32)); }
    if (query.severity) { clauses.push('severity = ?'); params.push(this.text(query.severity, 32)); }
    if (query.code) { clauses.push('code LIKE ?'); params.push(`%${this.text(query.code, 128)}%`); }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const countRow = await this.rawOne(`SELECT COUNT(1) AS total FROM channel_violations ${whereSql}`, params);
    const list = await this.rawMany(`SELECT * FROM channel_violations ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]);
    return { list, pagination: { page, pageSize, total: Number(countRow?.total || 0) } };
  }

  async handleViolation(violationId: string, body: Record<string, any>) {
    await this.ensureSchema();
    const status = this.text(body.status || 'CONFIRMED', 32);
    await this.prisma.$executeRawUnsafe(
      'UPDATE channel_violations SET status = ?, handling_notes = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE violation_id = ?',
      status,
      this.text(body.handlingNotes || body.handling_notes, 2000) || null,
      violationId,
    );
    const row = await this.rawOne('SELECT * FROM channel_violations WHERE violation_id = ? LIMIT 1', [violationId]);
    if (!row) throw new NotFoundException('违规记录不存在');
    return row;
  }

  async queryTraceability(code: string) {
    await this.ensureSchema();
    const normalized = this.text(code, 128);
    const signature = this.codePolicy.assess(normalized);
    if (!signature.accepted) throw new NotFoundException('溯源码不存在或签名无效');
    const codeRow = await this.findCode(normalized);
    if (!codeRow) throw new NotFoundException('溯源码不存在');
    const [product, batch, trace, processSteps, productionSteps, warehouseRecords, marketScans, proofs, violations] = await Promise.all([
      codeRow.product_id ? (this.prisma as any).product.findUnique({ where: { id: Number(codeRow.product_id) } }).catch(() => null) : null,
      codeRow.batch_no ? this.rawOne('SELECT * FROM production_batches WHERE batch_code = ? LIMIT 1', [String(codeRow.batch_no)]) : null,
      (this.prisma as any).traceRecord.findFirst({ where: { OR: [{ anti_fake_code: normalized }, { trace_no: normalized }] } }).catch(() => null),
      codeRow.batch_no ? (this.prisma as any).processRecord.findMany({ where: { batch_no: String(codeRow.batch_no) }, orderBy: { id: 'asc' } }).catch(() => []) : [],
      codeRow.batch_no ? this.rawMany('SELECT * FROM production_steps WHERE batch_code = ? ORDER BY id ASC', [String(codeRow.batch_no)]) : [],
      this.rawMany('SELECT * FROM warehouse_in_records WHERE code = ? ORDER BY id ASC', [normalized]),
      this.rawMany('SELECT * FROM market_scans WHERE code = ? ORDER BY id ASC LIMIT 100', [normalized]),
      this.rawMany('SELECT * FROM blockchain_proofs WHERE code = ? ORDER BY id ASC', [normalized]),
      this.rawMany('SELECT * FROM channel_violations WHERE code = ? ORDER BY id DESC LIMIT 20', [normalized]),
    ]);
    const boxes = codeRow.box_id ? await (this.prisma as any).box.findMany({ where: { id: Number(codeRow.box_id) } }).catch(() => []) : [];
    const shipmentRows = boxes.length ? await (this.prisma as any).shipment.findMany({ orderBy: { id: 'desc' }, take: 500 }).catch(() => []) : [];
    const shipmentRecords = shipmentRows.filter((shipment: any) => this.asArray(shipment.box_ids).map((item) => Number(item)).includes(Number(codeRow.box_id)));
    const chain = this.asArray(trace?.trace_chain);
    const timeline = [
      { type: 'CODE_GENERATED', title: '溯源码生成', timestamp: codeRow.created_at, description: `防伪码 ${normalized} 已生成` },
      ...chain.map((node: any) => ({ type: node.node_type || 'TRACE_NODE', title: node.node_name || node.node_type || '溯源节点', timestamp: node.timestamp || node.created_at, description: node.content || node.process_content || '' })),
      ...processSteps.map((step: any) => ({ type: step.process_type || 'PROCESS', title: step.process_name || '生产环节', timestamp: step.process_time || step.created_at, description: step.process_content || '' })),
      ...productionSteps.map((step: any) => ({ type: step.step_type || 'PRODUCTION_STEP', title: step.step_name || step.step_type, timestamp: step.end_time || step.start_time || step.created_at, description: step.quality_status || '' })),
      ...warehouseRecords.map((row: any) => ({ type: 'WAREHOUSE_IN', title: '生产入库', timestamp: row.in_time || row.created_at, description: `入库仓：${row.warehouse_id || '-'}` })),
      ...shipmentRecords.map((row: any) => ({ type: 'SHIPMENT', title: '出库发货', timestamp: row.updated_at || row.created_at, description: `${row.shipment_no || ''} ${row.region_group || row.receiver_address || ''}` })),
      ...marketScans.map((row: any) => ({ type: 'MARKET_SCAN', title: '市场扫码', timestamp: row.scan_time || row.created_at, description: row.scan_location || row.scan_address || '' })),
    ].filter((item) => item.timestamp).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const security = this.securitySummary(codeRow, marketScans, violations);
    return { code: normalized, codeEntity: codeRow, productInfo: product, batchInfo: batch || { batch_code: codeRow.batch_no }, productionSteps, processSteps, warehouseRecords, shipmentRecords, marketScans, blockchainProofs: proofs, violations, packaging: { parent_code: codeRow.parent_code, box_no: codeRow.box_no, boxes }, timeline, security: { ...security, signature_verified: signature.signed, legacy_code: !signature.signed } };
  }

  private securitySummary(codeRow: any, marketScans: any[], violations: any[]) {
    const riskFactors: string[] = [];
    if (codeRow?.code_hash && codeRow.code_hash !== this.hashCode(String(codeRow.code))) riskFactors.push('HASH_MISMATCH');
    if (Number(codeRow?.query_count || 0) > 10) riskFactors.push('ABNORMAL_SCAN_FREQUENCY');
    if (violations.length) riskFactors.push('REGION_MISMATCH');
    const rapid = marketScans.some((scan: any, index: number) => {
      if (index === 0) return false;
      const prev = new Date(marketScans[index - 1].scan_time).getTime();
      const curr = new Date(scan.scan_time).getTime();
      return Math.abs(curr - prev) < 60_000;
    });
    if (rapid) riskFactors.push('RAPID_RESCAN');
    const riskLevel = riskFactors.includes('HASH_MISMATCH') ? 'CRITICAL' : violations.length ? 'HIGH' : riskFactors.length ? 'MEDIUM' : 'LOW';
    return { riskLevel, riskFactors, scanCount: Number(codeRow?.query_count || marketScans.length || 0) };
  }

  private async createBlockchainProof(businessType: string, businessId: string, code: string | null | undefined, proofData: any) {
    if (String(this.config.get('TRACE_PROOF_ENABLED') || process.env.TRACE_PROOF_ENABLED || 'true') === 'false') return null;
    const digest = crypto.createHash('sha256').update(JSON.stringify(proofData || {})).digest('hex');
    await this.ensureSchema();
    await this.prisma.$executeRawUnsafe(
      'INSERT INTO blockchain_proofs (business_type, business_id, code, transaction_hash, merkle_root, proof_data) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))',
      businessType,
      businessId,
      code || null,
      digest,
      digest,
      JSON.stringify(proofData || {}),
    ).catch(() => null);
    return { business_type: businessType, business_id: businessId, code, transaction_hash: digest };
  }
}
