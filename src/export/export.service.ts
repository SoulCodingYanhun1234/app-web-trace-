import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import QRCode from 'qrcode';
import { createLabeledQrPng, createLabeledQrSvg } from '../common/labeled-qrcode.js';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly codeVault = new AntiCounterfeitCodeVault();
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private buildVerifyUrl(code: string, path = 'verify', requestHost?: string) {
    let frontendBase = String(
      this.config.get('PUBLIC_FRONTEND_BASE_URL')
      || this.config.get('FRONTEND_BASE_URL')
      || this.config.get('WEB_BASE_URL')
      || '',
    ).replace(/\/+$/, '');
    if (!frontendBase && requestHost) frontendBase = requestHost;
    const verifyPath = `/${String(path || 'verify').replace(/^\/+|\/+$/g, '')}`;
    return `${frontendBase}${verifyPath}/${encodeURIComponent(String(code || '').trim())}`;
  }

  toCsv(rows: any[]) {
    if (!rows.length) return '';
    const cols = Object.keys(rows[0]);
    const esc = (v: any) => {
      let text = String(v ?? '').replace(/"/g, '""');
      // 防止 Excel/表格软件把导出的业务字段当作公式执行。
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text}"`;
    };
    return '\ufeff' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  }

  async codesCsv() {
    const rows = await this.prisma.antiFakeCode.findMany({ take: 50000, orderBy: { id: 'desc' } });
    return this.toCsv(this.codeVault.hydrateMany(rows as any[]));
  }

  async queryLogsCsv() {
    const rows = await this.prisma.queryLog.findMany({ take: 50000, orderBy: { id: 'desc' } });
    const hashes = rows.map((row: any) => this.codeVault.hashFromReference(row.code)).filter(Boolean) as string[];
    const storedCodes = hashes.length ? await this.prisma.antiFakeCode.findMany({
      where: { code_hash: { in: hashes } },
      select: { code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true },
    }) : [];
    const codeMap = new Map<string, string>();
    for (const stored of storedCodes) {
      const hydrated = this.codeVault.hydrate(stored as any);
      codeMap.set(this.codeVault.reference(hydrated.code), hydrated.code);
    }
    return this.toCsv(rows.map((row: any) => ({ ...row, code: codeMap.get(String(row.code || '')) || row.code })));
  }


  private normalizeBoxFilter(query: Record<string, any> = {}) {
    const selectedCodes = this.normalizeSelectedCodes(query.codes);
    const where: Record<string, any> = {};
    if (selectedCodes.length) {
      where.OR = [
        { box_no: { in: selectedCodes } },
        { id: { in: selectedCodes.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0) } },
      ];
      return where;
    }
    for (const field of ['batch_no', 'box_no', 'product_name', 'box_type']) {
      const value = String(query[field] || '').trim();
      if (value) where[field] = { contains: value.slice(0, 128) };
    }
    for (const field of ['product_id', 'status']) {
      if (query[field] === undefined || query[field] === null || query[field] === '') continue;
      const value = Number(query[field]);
      if (Number.isFinite(value)) where[field] = value;
    }
    return where;
  }

  private dateText(value: unknown) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((item) => [item.type, item.value]));
    // 带时区说明可阻止 Excel 将 CSV 单元格自动转成日期数值，避免列宽不足时显示 ########。
    return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}（北京时间）`;
  }

  private boxStatusText(status: unknown) {
    return ({ 0: '装箱中', 1: '已封箱', 2: '已发货' } as Record<number, string>)[Number(status)] || String(status ?? '');
  }

  private boxCsvRows(rows: any[]) {
    return rows.map((row: any) => ({
      箱码编号: row.box_no || row.id || '',
      产品编码: row.product_code || '',
      产品名称: row.product_name || '',
      批次号: row.batch_no || '',
      容量: row.box_capacity ?? '',
      箱规: row.box_spec || '',
      箱型: row.box_type || '',
      箱内码数量: Array.isArray(row.codes) ? row.codes.length : 0,
      公司: row.company_name || row.manufacturer || '',
      装箱地点: [row.province_name, row.city_name].filter(Boolean).join(' / ') || row.region_group || '',
      装箱代理商: row.agent_name || row.distributor || '',
      状态: this.boxStatusText(row.status),
      创建时间: this.dateText(row.created_at),
    }));
  }

  async boxesCsv(query: Record<string, any> = {}) {
    const rows = await this.prisma.box.findMany({
      where: this.normalizeBoxFilter(query),
      take: 50000,
      orderBy: { id: 'asc' },
    });
    return this.toCsv(this.boxCsvRows(rows));
  }

  async antiChannelingAlertsCsv(query: Record<string, any> = {}) {
    const keyword = String(query.keyword || query.code || query.alert_no || '').trim().slice(0, 128);
    const rawIds = Array.isArray(query.ids) ? query.ids : String(query.ids || '').split(/[,，\s]+/);
    const ids = Array.from(new Set(rawIds.map((item: any) => Number(item)).filter((item: number) => Number.isInteger(item) && item > 0)));
    const where: Record<string, any> = {};
    if (ids.length) where.id = { in: ids };
    if (keyword) {
      where.OR = [
        { alert_no: { contains: keyword } },
        { title: { contains: keyword } },
        { code: { contains: keyword } },
        { box_no: { contains: keyword } },
        { shipment_no: { contains: keyword } },
        { agent_name: { contains: keyword } },
        { authorized_region: { contains: keyword } },
        { actual_location: { contains: keyword } },
      ];
    }
    if (query.status !== undefined && query.status !== '') where.status = Number(query.status);
    if (query.severity !== undefined && query.severity !== '') where.severity = Number(query.severity);
    if (query.alert_type) where.alert_type = String(query.alert_type).slice(0, 64);
    if (query.created_from || query.created_to) {
      where.created_at = {};
      if (query.created_from) where.created_at.gte = new Date(String(query.created_from));
      if (query.created_to) where.created_at.lte = new Date(String(query.created_to));
    }

    const rows = await this.prisma.antiChannelingAlert.findMany({
      where,
      orderBy: [{ status: 'asc' }, { severity: 'desc' }, { last_seen_at: 'desc' }],
      take: 50000,
    });
    const alertHashes = rows.map((row: any) => this.codeVault.hashFromReference(row.code)).filter(Boolean) as string[];
    const storedAlertCodes = alertHashes.length ? await this.prisma.antiFakeCode.findMany({
      where: { code_hash: { in: alertHashes } },
      select: { code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true },
    }).catch(() => []) : [];
    const alertCodeMap = new Map<string, string>();
    for (const stored of storedAlertCodes) {
      const hydrated = this.codeVault.hydrate(stored as any);
      alertCodeMap.set(this.codeVault.reference(hydrated.code), hydrated.code);
    }
    const exportRows = rows.map((row: any) => ({ ...row, code: alertCodeMap.get(String(row.code || '')) || row.code }));
    const statusText: Record<number, string> = { 0: '新预警', 1: '已确认', 2: '处理中', 3: '已关闭', 4: '误报' };
    const severityText: Record<number, string> = { 1: '低', 2: '中', 3: '高', 4: '严重', 5: '紧急' };
    const typeText: Record<string, string> = {
      geo_mismatch: '扫码位置与授权区域不符',
      same_code_multi_region: '同一编码短时间异地扫码',
      ip_high_frequency: '同一 IP 短时高频扫码',
      device_risk: '设备访问异常',
      shipment_region_mismatch: '跨区域调拨/出库异常',
      fake_code_scan: '无效码/假码扫码',
      agent_cross_boundary: '代理商多区域集中异常',
      code_trajectory_anomaly: '编码轨迹异常跳跃',
    };
    const dateText = (value: any) => value instanceof Date ? value.toISOString().replace('T', ' ').slice(0, 19) : (value ? String(value) : '');
    const jsonText = (value: any) => value && typeof value === 'object' ? JSON.stringify(value) : String(value || '');

    return this.toCsv(exportRows.map((row: any) => ({
      预警编号: row.alert_no || '',
      预警类型: typeText[row.alert_type] || row.alert_type || '',
      预警级别: severityText[Number(row.severity)] || String(row.severity || ''),
      状态: statusText[Number(row.status)] || String(row.status || ''),
      预警标题: row.title || '',
      防伪码: row.code || '',
      箱号: row.box_no || '',
      发货单号: row.shipment_no || '',
      产品编码: row.product_code || '',
      产品名称: row.product_name || '',
      责任代理商: row.agent_name || '',
      授权区域: row.authorized_region || [row.authorized_province, row.authorized_city].filter(Boolean).join(' / '),
      扫码位置: row.actual_location || [row.actual_province, row.actual_city].filter(Boolean).join(' / '),
      扫码IP: row.ip || '',
      首次发现: dateText(row.first_seen_at || row.created_at),
      最后发现: dateText(row.last_seen_at),
      扫码时间: dateText(row.scan_time),
      处理结果: row.handle_result || '',
      备注: row.remark || '',
      证据: jsonText(row.evidence),
    })));
  }



  private safeZipEntryName(value: unknown, fallback = 'qrcode') {
    const cleaned = String(value ?? '')
      .trim()
      .replace(/[<>:"\/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/^\.+$/g, '')
      .slice(0, 120);
    return cleaned || fallback;
  }

  private normalizeQrFormat(format?: string) {
    const value = String(format || 'svg').toLowerCase().trim();
    if (['svg', 'png'].includes(value)) return value as 'svg' | 'png';
    throw new BadRequestException('二维码图片格式仅支持 svg 或 png');
  }

  private normalizeSelectedCodes(codes?: string[] | string) {
    const raw = Array.isArray(codes) ? codes : String(codes || '').split(/[,，\n\r\t ]+/);
    return Array.from(new Set(raw.map((item: any) => String(item || '').trim()).filter(Boolean))).slice(0, 10000);
  }

  async exportBoxQrCodesZip(options: { codes?: string[] | string; format?: string } = {}) {
    const format = this.normalizeQrFormat(options.format);
    const selectedCodes = this.normalizeSelectedCodes(options.codes);
    if (!selectedCodes.length) throw new BadRequestException('请先选择要导出的箱码');

    const boxes = await this.prisma.box.findMany({
      where: { OR: [
        { box_no: { in: selectedCodes } },
        { id: { in: selectedCodes.map((item) => Number(item)).filter((item) => Number.isFinite(item)) } },
      ] },
      take: 10000,
      orderBy: { id: 'asc' },
      select: {
        id: true, box_no: true, product_code: true, product_name: true, batch_no: true,
        box_capacity: true, box_spec: true, box_type: true, codes: true, company_name: true, manufacturer: true,
        province_name: true, city_name: true, region_group: true, agent_name: true, distributor: true,
        status: true, created_at: true,
      },
    });

    if (!boxes.length) throw new BadRequestException('没有找到可导出的箱码');

    const timestamp = Date.now();
    const tempDir = join(process.cwd(), 'temp', `box-qr-export-${timestamp}`);
    await mkdir(tempDir, { recursive: true });

    try {
      const batchSize = 50;
      for (let i = 0; i < boxes.length; i += batchSize) {
        const batch = boxes.slice(i, i + batchSize);
        await Promise.all(batch.map(async (box: any) => {
          const code = String(box.box_no || box.id);
          const fileName = `${String(box.id).padStart(6, '0')}-${this.safeZipEntryName(code, `box-${box.id}`)}.${format}`;
          const filePath = join(tempDir, fileName);
          if (format === 'svg') {
            await writeFile(filePath, createLabeledQrSvg(code, code, { qrSize: 400, labelHeight: 64 }), 'utf8');
            return;
          }
          await writeFile(filePath, createLabeledQrPng(code, code, { qrSize: 400, labelHeight: 64 }));
        }));
      }

      await writeFile(join(tempDir, '_箱码清单.csv'), this.toCsv(this.boxCsvRows(boxes)), 'utf8');
      const zipPath = join(process.cwd(), 'temp', `box-qr-codes-${format}-${timestamp}.zip`);
      await this.createZipFromDirectory(tempDir, zipPath);
      return zipPath;
    } finally {
      setTimeout(async () => {
        try {
          const { rm } = await import('fs/promises');
          await rm(tempDir, { recursive: true, force: true });
          this.logger.log(`Cleaned up temp directory: ${tempDir}`);
        } catch (error) {
          this.logger.error(`Failed to clean up temp directory: ${tempDir}`, error);
        }
      }, 5000);
    }
  }

  async exportQrCodesZip(options: { batch_no?: string; product_id?: number; codes?: string[] | string; format?: string; requestHost?: string } = {}) {
    const format = this.normalizeQrFormat(options.format);
    const selectedCodes = this.normalizeSelectedCodes(options.codes);
    const where: any = {};
    if (selectedCodes.length) Object.assign(where, this.codeVault.whereForCodes(selectedCodes));
    else {
      if (options.batch_no) where.batch_no = { contains: options.batch_no };
      if (options.product_id) where.product_id = options.product_id;
    }

    const storedCodes = await this.prisma.antiFakeCode.findMany({
      where,
      take: 10000,
      orderBy: { id: 'asc' },
      select: {
        code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true,
        batch_no: true, product_id: true,
      },
    });
    const codes = this.codeVault.hydrateMany(storedCodes as any[]);

    if (!codes.length) {
      throw new BadRequestException('没有找到可导出的防伪码');
    }

    const timestamp = Date.now();
    const tempDir = join(process.cwd(), 'temp', `qr-export-${timestamp}`);
    await mkdir(tempDir, { recursive: true });

    try {
      const batchSize = 50;
      for (let i = 0; i < codes.length; i += batchSize) {
        const batch = codes.slice(i, i + batchSize);
        const writePromises = batch.map(async (codeItem: any) => {
          const codeValue = String(codeItem.code || '').trim();
          const qrPayload = this.buildVerifyUrl(codeValue, this.config.get('VERIFY_PAGE_PATH') || 'verify', options.requestHost);
          const fileName = `${this.safeZipEntryName(codeValue, 'code')}.${format}`;
          const filePath = join(tempDir, fileName);
          if (format === 'svg') {
            const svg = await QRCode.toString(qrPayload, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 400 });
            await writeFile(filePath, svg, 'utf8');
            return;
          }
          await QRCode.toFile(filePath, qrPayload, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width: 400 });
        });
        await Promise.all(writePromises);
      }

      const zipPath = join(process.cwd(), 'temp', `qr-codes-${format}-${timestamp}.zip`);
      await this.createZipFromDirectory(tempDir, zipPath);

      return zipPath;
    } finally {
      setTimeout(async () => {
        try {
          const { rm } = await import('fs/promises');
          await rm(tempDir, { recursive: true, force: true });
          this.logger.log(`Cleaned up temp directory: ${tempDir}`);
        } catch (error) {
          this.logger.error(`Failed to clean up temp directory: ${tempDir}`, error);
        }
      }, 5000);
    }
  }

  private async createZipArchive() {
    const archiverModule: any = await import('archiver');

    // archiver v7/CommonJS exposes a default factory; archiver v8/ESM exposes ZipArchive.
    // Resolve both shapes so the service works across Node 18/20/22/24 and different installs.
    const factory = archiverModule.default || archiverModule.create;
    if (typeof factory === 'function') {
      return factory('zip', { zlib: { level: 9 } });
    }

    if (typeof archiverModule.ZipArchive === 'function') {
      return new archiverModule.ZipArchive({ zlib: { level: 9 } });
    }

    throw new Error('当前 archiver 版本不支持 ZIP 导出：未找到 default/create/ZipArchive 导出');
  }

  private async createZipFromDirectory(sourceDir: string, outputPath: string): Promise<void> {
    const archive = await this.createZipArchive();

    return new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outputPath);

      output.on('close', () => {
        this.logger.log(`ZIP created: ${outputPath} (${archive.pointer()} bytes)`);
        resolve();
      });

      output.on('error', (err: Error) => {
        reject(err);
      });

      archive.on('error', (err: Error) => {
        reject(err);
      });

      archive.pipe(output);
      archive.directory(sourceDir, false);
      void archive.finalize();
    });
  }
}
