import { INestApplication, Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import * as PrismaClientModule from '@prisma/client';

const { PrismaClient } = ((PrismaClientModule as any).default || PrismaClientModule) as any;

type SlowQuery = { query: string; params?: string; duration: number; timestamp: string };

type CompatColumnPatch = {
  table: string;
  column: string;
  definition: string;
};

type CompatIndexPatch = {
  table: string;
  index: string;
  definition: string;
};

type CompatColumnTypePatch = {
  table: string;
  column: string;
  definition: string;
  maxLength?: number;
};

const COMPAT_COLUMN_PATCHES: CompatColumnPatch[] = [
  { table: 'products', column: 'production_date', definition: 'DATE NULL' },
  { table: 'products', column: 'production_place', definition: 'VARCHAR(128) NULL' },
  { table: 'products', column: 'manufacturer', definition: 'VARCHAR(128) NULL' },

  { table: 'agents', column: 'district', definition: "VARCHAR(64) NULL COMMENT '区县'" },

  { table: 'boxes', column: 'product_code', definition: "VARCHAR(64) NULL COMMENT '产品编号快照'" },
  { table: 'boxes', column: 'product_name', definition: "VARCHAR(128) NULL COMMENT '产品名称快照'" },
  { table: 'boxes', column: 'category', definition: "VARCHAR(64) NULL COMMENT '产品分类快照'" },
  { table: 'boxes', column: 'brand', definition: "VARCHAR(64) NULL COMMENT '品牌快照'" },
  { table: 'boxes', column: 'specification', definition: "VARCHAR(128) NULL COMMENT '规格快照'" },
  { table: 'boxes', column: 'unit', definition: "VARCHAR(32) NULL COMMENT '单位快照'" },
  { table: 'boxes', column: 'production_place', definition: "VARCHAR(128) NULL COMMENT '生成/生产地点快照'" },
  { table: 'boxes', column: 'manufacturer', definition: "VARCHAR(128) NULL COMMENT '公司快照'" },
  { table: 'boxes', column: 'province_code', definition: "VARCHAR(16) NULL COMMENT '省份编码'" },
  { table: 'boxes', column: 'city_code', definition: "VARCHAR(16) NULL COMMENT '城市编码'" },
  { table: 'boxes', column: 'province_name', definition: "VARCHAR(64) NULL COMMENT '省份名称'" },
  { table: 'boxes', column: 'city_name', definition: "VARCHAR(64) NULL COMMENT '城市名称'" },
  { table: 'boxes', column: 'region_group', definition: "VARCHAR(128) NULL COMMENT '区域分组'" },
  { table: 'boxes', column: 'warehouse', definition: "VARCHAR(128) NULL COMMENT '仓库'" },
  { table: 'boxes', column: 'distributor', definition: "VARCHAR(128) NULL COMMENT '经销商/渠道'" },
  { table: 'boxes', column: 'agent_id', definition: "INT NULL COMMENT '代理商ID'" },
  { table: 'boxes', column: 'agent_name', definition: "VARCHAR(128) NULL COMMENT '代理商名称快照'" },
  { table: 'boxes', column: 'company_name', definition: "VARCHAR(128) NULL COMMENT '公司名称'" },
  { table: 'boxes', column: 'ownership_at', definition: "DATETIME NULL COMMENT '最近一次归属变更时间'" },
  { table: 'boxes', column: 'packing_address', definition: "VARCHAR(255) NULL COMMENT '装箱地址记录'" },
  { table: 'boxes', column: 'authorization_address', definition: "VARCHAR(255) NULL COMMENT '防伪授权地址'" },
  { table: 'boxes', column: 'authorization_level', definition: "VARCHAR(32) NULL COMMENT '防伪授权级别'" },
  { table: 'boxes', column: 'authorization_source', definition: "VARCHAR(64) NULL COMMENT '防伪授权来源'" },

  { table: 'shipments', column: 'authorization_address', definition: "VARCHAR(255) NULL COMMENT '防伪授权地址'" },
  { table: 'shipments', column: 'authorization_level', definition: "VARCHAR(32) NULL COMMENT '防伪授权级别'" },
  { table: 'shipments', column: 'authorization_source', definition: "VARCHAR(64) NULL COMMENT '防伪授权来源'" },

  { table: 'anti_fake_codes', column: 'box_id', definition: "INT NULL COMMENT '所属装箱ID'" },
  { table: 'anti_fake_codes', column: 'box_no', definition: "VARCHAR(128) NULL COMMENT '所属装箱码'" },
  { table: 'anti_fake_codes', column: 'product_code', definition: "VARCHAR(64) NULL COMMENT '产品编号快照'" },
  { table: 'anti_fake_codes', column: 'product_name', definition: "VARCHAR(128) NULL COMMENT '产品名称快照'" },
  { table: 'anti_fake_codes', column: 'category', definition: "VARCHAR(64) NULL COMMENT '产品分类快照'" },
  { table: 'anti_fake_codes', column: 'brand', definition: "VARCHAR(64) NULL COMMENT '品牌快照'" },
  { table: 'anti_fake_codes', column: 'specification', definition: "VARCHAR(128) NULL COMMENT '规格快照'" },
  { table: 'anti_fake_codes', column: 'unit', definition: "VARCHAR(32) NULL COMMENT '单位快照'" },
  { table: 'anti_fake_codes', column: 'production_place', definition: "VARCHAR(128) NULL COMMENT '生成/生产地点快照'" },
  { table: 'anti_fake_codes', column: 'manufacturer', definition: "VARCHAR(128) NULL COMMENT '公司快照'" },
  { table: 'anti_fake_codes', column: 'province_code', definition: "VARCHAR(16) NULL COMMENT '省份编码'" },
  { table: 'anti_fake_codes', column: 'city_code', definition: "VARCHAR(16) NULL COMMENT '城市编码'" },
  { table: 'anti_fake_codes', column: 'province_name', definition: "VARCHAR(64) NULL COMMENT '省份名称'" },
  { table: 'anti_fake_codes', column: 'city_name', definition: "VARCHAR(64) NULL COMMENT '城市名称'" },
  { table: 'anti_fake_codes', column: 'region_group', definition: "VARCHAR(128) NULL COMMENT '区域分组'" },
  { table: 'anti_fake_codes', column: 'warehouse', definition: "VARCHAR(128) NULL COMMENT '仓库'" },
  { table: 'anti_fake_codes', column: 'distributor', definition: "VARCHAR(128) NULL COMMENT '经销商/渠道'" },
  { table: 'anti_fake_codes', column: 'agent_id', definition: "INT NULL COMMENT '代理商ID'" },
  { table: 'anti_fake_codes', column: 'agent_name', definition: "VARCHAR(128) NULL COMMENT '代理商名称快照'" },
  { table: 'anti_fake_codes', column: 'company_name', definition: "VARCHAR(128) NULL COMMENT '公司名称'" },
  { table: 'anti_fake_codes', column: 'box_bound_at', definition: "DATETIME NULL COMMENT '装箱绑定时间'" },
  { table: 'anti_fake_codes', column: 'ownership_at', definition: "DATETIME NULL COMMENT '最近一次归属变更时间'" },
  { table: 'anti_fake_codes', column: 'expires_at', definition: "DATE NULL COMMENT '防伪码过期日期，可为空表示长期有效'" },
  { table: 'anti_fake_codes', column: 'anti_channeling_enabled', definition: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用防窜校验'" },


  { table: 'anti_channeling_alerts', column: 'handle_result', definition: "VARCHAR(255) NULL COMMENT '处理结果/稽查结论'" },
  { table: 'anti_channeling_alerts', column: 'handled_by', definition: "INT NULL COMMENT '处理人管理员ID'" },
  { table: 'anti_channeling_alerts', column: 'handled_at', definition: "DATETIME NULL COMMENT '处理时间'" },
  { table: 'anti_channeling_alerts', column: 'remark', definition: "VARCHAR(255) NULL COMMENT '预警备注'" },
];


const COMPAT_COLUMN_TYPE_PATCHES: CompatColumnTypePatch[] = [
  { table: 'boxes', column: 'packing_address', definition: "VARCHAR(255) NULL COMMENT '装箱地址记录'", maxLength: 255 },
  { table: 'boxes', column: 'authorization_address', definition: "VARCHAR(255) NULL COMMENT '防伪授权地址'", maxLength: 255 },
  { table: 'boxes', column: 'authorization_level', definition: "VARCHAR(32) NULL COMMENT '防伪授权级别'", maxLength: 32 },
  { table: 'boxes', column: 'authorization_source', definition: "VARCHAR(64) NULL COMMENT '防伪授权来源'", maxLength: 64 },
  { table: 'shipments', column: 'authorization_address', definition: "VARCHAR(255) NULL COMMENT '防伪授权地址'", maxLength: 255 },
  { table: 'shipments', column: 'authorization_level', definition: "VARCHAR(32) NULL COMMENT '防伪授权级别'", maxLength: 32 },
  { table: 'shipments', column: 'authorization_source', definition: "VARCHAR(64) NULL COMMENT '防伪授权来源'", maxLength: 64 },
];

const COMPAT_INDEX_PATCHES: CompatIndexPatch[] = [
  { table: 'products', index: 'products_manufacturer_idx', definition: 'ADD INDEX `products_manufacturer_idx` (`manufacturer`)' },
  { table: 'boxes', index: 'boxes_product_code_idx', definition: 'ADD INDEX `boxes_product_code_idx` (`product_code`)' },
  { table: 'boxes', index: 'boxes_province_name_city_name_idx', definition: 'ADD INDEX `boxes_province_name_city_name_idx` (`province_name`, `city_name`)' },
  { table: 'boxes', index: 'boxes_agent_id_idx', definition: 'ADD INDEX `boxes_agent_id_idx` (`agent_id`)' },
  { table: 'anti_fake_codes', index: 'anti_fake_codes_box_id_idx', definition: 'ADD INDEX `anti_fake_codes_box_id_idx` (`box_id`)' },
  { table: 'anti_fake_codes', index: 'anti_fake_codes_box_no_idx', definition: 'ADD INDEX `anti_fake_codes_box_no_idx` (`box_no`)' },
  { table: 'anti_fake_codes', index: 'anti_fake_codes_product_code_idx', definition: 'ADD INDEX `anti_fake_codes_product_code_idx` (`product_code`)' },
  { table: 'anti_fake_codes', index: 'anti_fake_codes_manufacturer_idx', definition: 'ADD INDEX `anti_fake_codes_manufacturer_idx` (`manufacturer`)' },
  { table: 'anti_fake_codes', index: 'anti_fake_codes_province_name_city_name_idx', definition: 'ADD INDEX `anti_fake_codes_province_name_city_name_idx` (`province_name`, `city_name`)' },
  { table: 'anti_fake_codes', index: 'anti_fake_codes_agent_id_idx', definition: 'ADD INDEX `anti_fake_codes_agent_id_idx` (`agent_id`)' },
  { table: 'anti_fake_codes', index: 'anti_fake_codes_expires_at_idx', definition: 'ADD INDEX `anti_fake_codes_expires_at_idx` (`expires_at`)' },
];

function sqlIdent(name: string) {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `\`${name}\``;
}

function isDuplicateSchemaPatchError(error: any) {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  return code === 'P2010'
    && (message.includes('duplicate column') || message.includes('duplicate key name') || message.includes('already exists'));
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  [delegate: string]: any;

  private readonly logger = new Logger(PrismaService.name);
  private readonly slowQueryMs = Number(process.env.SLOW_QUERY_MS || 300);
  private slowQueryCount = 0;
  private lastSlowQueries: SlowQuery[] = [];

  constructor() {
    const enableQueryMetrics = process.env.PRISMA_QUERY_METRICS !== 'false';
    super({
      log: enableQueryMetrics
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : ['warn', 'error'],
    });

    if (enableQueryMetrics) {
      this.$on('query', (event: any) => {
        const duration = Number(event?.duration || 0);
        if (duration < this.slowQueryMs) return;
        this.slowQueryCount += 1;
        this.lastSlowQueries.unshift({
          query: String(event?.query || '').slice(0, 2000),
          params: String(event?.params || '').slice(0, 1000),
          duration,
          timestamp: new Date().toISOString(),
        });
        this.lastSlowQueries = this.lastSlowQueries.slice(0, 20);
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
    await this.ensureCompatibilitySchema();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }

  getSlowQueryStats() {
    return {
      threshold_ms: this.slowQueryMs,
      count: this.slowQueryCount,
      last: this.lastSlowQueries,
    };
  }

  async getConnectionStats() {
    try {
      const rows = await this.$queryRawUnsafe("SHOW STATUS WHERE Variable_name IN ('Threads_connected','Threads_running','Max_used_connections')");
      return Object.fromEntries(rows.map((row: any) => [String(row.Variable_name), Number(row.Value)]));
    } catch {
      return {};
    }
  }

  private async hasColumn(table: string, column: string) {
    const rows = await this.$queryRawUnsafe(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
      table,
      column,
    ) as Array<Record<string, unknown>>;
    return rows.length > 0;
  }

  private async hasIndex(table: string, index: string) {
    const rows = await this.$queryRawUnsafe(
      'SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1',
      table,
      index,
    ) as Array<Record<string, unknown>>;
    return rows.length > 0;
  }

  private async columnMeta(table: string, column: string) {
    const rows = await this.$queryRawUnsafe(
      `SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
        LIMIT 1`,
      table,
      column,
    ) as Array<Record<string, unknown>>;
    return rows[0] || null;
  }

  private async applyCompatColumnPatch(patch: CompatColumnPatch) {
    if (await this.hasColumn(patch.table, patch.column)) return false;
    try {
      await this.$executeRawUnsafe(`ALTER TABLE ${sqlIdent(patch.table)} ADD COLUMN ${sqlIdent(patch.column)} ${patch.definition}`);
      return true;
    } catch (error) {
      if (isDuplicateSchemaPatchError(error)) return false;
      throw error;
    }
  }

  private async applyCompatColumnTypePatch(patch: CompatColumnTypePatch) {
    const meta = await this.columnMeta(patch.table, patch.column);
    if (!meta) return false;

    const dataType = String((meta as any).DATA_TYPE || '').toLowerCase();
    const isNullable = String((meta as any).IS_NULLABLE || '').toUpperCase() === 'YES';
    const length = Number((meta as any).CHARACTER_MAXIMUM_LENGTH || 0);
    const textCompatible = dataType === 'varchar' || dataType === 'text';
    const lengthCompatible = !patch.maxLength || dataType === 'text' || length >= patch.maxLength;
    if (textCompatible && isNullable && lengthCompatible) return false;

    await this.$executeRawUnsafe(`ALTER TABLE ${sqlIdent(patch.table)} MODIFY COLUMN ${sqlIdent(patch.column)} ${patch.definition}`);
    return true;
  }

  private async applyCompatIndexPatch(patch: CompatIndexPatch) {
    if (await this.hasIndex(patch.table, patch.index)) return false;
    try {
      await this.$executeRawUnsafe(`ALTER TABLE ${sqlIdent(patch.table)} ${patch.definition}`);
      return true;
    } catch (error) {
      if (isDuplicateSchemaPatchError(error)) return false;
      throw error;
    }
  }

  private async ensureCompatibilitySchema() {
    if (String(process.env.SCHEMA_AUTO_REPAIR || 'true') === 'false') return;
    if (!String(process.env.DATABASE_URL || '').startsWith('mysql://')) return;

    const applied: string[] = [];
    try {
      for (const patch of COMPAT_COLUMN_PATCHES) {
        if (await this.applyCompatColumnPatch(patch)) applied.push(`${patch.table}.${patch.column}`);
      }
      for (const patch of COMPAT_COLUMN_TYPE_PATCHES) {
        if (await this.applyCompatColumnTypePatch(patch)) applied.push(`${patch.table}.${patch.column}:type`);
      }
      for (const patch of COMPAT_INDEX_PATCHES) {
        if (await this.applyCompatIndexPatch(patch)) applied.push(`${patch.table}.${patch.index}`);
      }
      if (applied.length) {
        this.logger.warn(`[schema-repair] 已自动补齐数据库兼容字段/索引：${applied.join(', ')}`);
      }
    } catch (error) {
      this.logger.error('[schema-repair] 数据库兼容字段自动补齐失败，请执行 api/prisma/migrations 下的 SQL 后重启服务。', error);
      throw error;
    }
  }
}
