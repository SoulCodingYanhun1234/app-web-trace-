import { Controller, Get, Header, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipWrap } from '../common/decorators/skip-wrap.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { ExportService } from './export.service.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream, existsSync, statSync } from 'fs';
import { unlink } from 'fs/promises';
import { Readable } from 'stream';

@ApiBearerAuth()
@ApiTags('导出')
@Controller('export')
export class ExportController {
  constructor(private readonly service: ExportService) {}


  private firstHeader(value: unknown) {
    return Array.isArray(value) ? value[0] : String(value || '').split(',')[0].trim();
  }

  private safeRequestOrigin(protocol: unknown, host: unknown): string | undefined {
    const proto = this.firstHeader(protocol).toLowerCase();
    const safeProto = proto === 'http' || proto === 'https' ? proto : 'https';
    const safeHost = this.firstHeader(host).toLowerCase();
    if (!safeHost || !/^[a-z0-9.-]+(?::\d{1,5})?$/.test(safeHost)) return undefined;
    return `${safeProto}://${safeHost}`;
  }

  private getRequestHost(req?: FastifyRequest): string | undefined {
    if (!req) return undefined;
    const forwarded = this.safeRequestOrigin(req.headers?.['x-forwarded-proto'], req.headers?.['x-forwarded-host']);
    if (forwarded) return forwarded;
    return this.safeRequestOrigin((req as any).protocol || req.headers?.['x-forwarded-proto'] || 'http', req.headers?.host);
  }

  @SkipWrap()
  @Get('codes')
  @RequirePermissions('export:download')
  codes() { return this.service.codesCsv(); }

  @SkipWrap()
  @Get('query-logs')
  @RequirePermissions('export:download')
  queryLogs() { return this.service.queryLogsCsv(); }


  @SkipWrap()
  @Get('boxes')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="box-codes.csv"')
  @RequirePermissions('export:download')
  @ApiOperation({ summary: '导出箱码 CSV；传 codes 时仅导出选中箱码' })
  boxes(@Query() query: Record<string, any>) { return this.service.boxesCsv(query); }

  @SkipWrap()
  @Get('anti-channeling-alerts')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="anti-channeling-alerts.csv"')
  @RequirePermissions('anti-channeling:view')
  antiChannelingAlerts(@Query() query: Record<string, any>) { return this.service.antiChannelingAlertsCsv(query); }


  private async sendBoxQrCodesZip(codes?: string, format?: string, reply?: FastifyReply) {
    const zipPath = await this.service.exportBoxQrCodesZip({ codes, format });

    if (!existsSync(zipPath)) throw new Error('ZIP文件创建失败');
    if (!reply) throw new Error('Response not available');

    const safeFormat = String(format || 'svg').toLowerCase() === 'png' ? 'png' : 'svg';
    const filename = `box-qr-codes-${safeFormat}-${Date.now()}.zip`;
    const fileSize = statSync(zipPath).size;
    const stream = createReadStream(zipPath);

    reply.raw.setHeader('Content-Type', 'application/zip');
    reply.raw.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    reply.raw.setHeader('Content-Length', fileSize);

    Readable.from(stream).pipe(reply.raw);
    reply.raw.on('finish', async () => {
      try { await unlink(zipPath); } catch { /* ignore */ }
    });
    return reply;
  }

  @SkipWrap()
  @Get('box-qrcode-zip')
  @RequirePermissions('export:download')
  @ApiOperation({ summary: '导出选中的箱码二维码 ZIP，可选择 SVG/PNG 格式' })
  @ApiQuery({ name: 'codes', required: true, description: '逗号分隔的箱号或箱子ID；仅导出选中箱子' })
  @ApiQuery({ name: 'format', required: false, enum: ['svg', 'png'], description: '二维码图片格式' })
  exportBoxQrCodesZip(
    @Query('codes') codes?: string,
    @Query('format') format?: string,
    @Res() reply?: FastifyReply,
  ) {
    return this.sendBoxQrCodesZip(codes, format, reply);
  }

  // 兼容已经发布过的前端路径，避免升级期间出现 404。
  @SkipWrap()
  @Get('boxes/qrcode-zip')
  @RequirePermissions('export:download')
  @ApiOperation({ summary: '兼容旧版：导出选中的箱码二维码 ZIP' })
  exportBoxQrCodesZipLegacy(
    @Query('codes') codes?: string,
    @Query('format') format?: string,
    @Res() reply?: FastifyReply,
  ) {
    return this.sendBoxQrCodesZip(codes, format, reply);
  }

  @SkipWrap()
  @Get('codes/qrcode-zip')
  @RequirePermissions('export:download')
  @ApiOperation({ summary: '导出选中的二维码 ZIP，可选择 SVG/PNG 格式' })
  @ApiQuery({ name: 'codes', required: false, description: '逗号分隔的防伪码；传入后只导出选中的码' })
  @ApiQuery({ name: 'format', required: false, enum: ['svg', 'png'], description: '二维码图片格式' })
  async exportQrCodesZip(
    @Query('batch_no') batch_no?: string,
    @Query('product_id') product_id?: string,
    @Query('codes') codes?: string,
    @Query('format') format?: string,
    @Req() req?: FastifyRequest,
    @Res() reply?: FastifyReply,
  ) {
    const productId = product_id ? Number(product_id) : undefined;
    const zipPath = await this.service.exportQrCodesZip({ batch_no, product_id: productId, codes, format, requestHost: this.getRequestHost(req) });

    if (!existsSync(zipPath)) {
      throw new Error('ZIP文件创建失败');
    }

    if (!reply) throw new Error('Response not available');

    const safeFormat = String(format || 'svg').toLowerCase() === 'png' ? 'png' : 'svg';
    const filename = `qr-codes-${safeFormat}-${Date.now()}.zip`;
    const fileSize = statSync(zipPath).size;
    const stream = createReadStream(zipPath);

    reply.raw.setHeader('Content-Type', 'application/zip');
    reply.raw.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    reply.raw.setHeader('Content-Length', fileSize);

    Readable.from(stream).pipe(reply.raw);

    reply.raw.on('finish', async () => {
      try {
        await unlink(zipPath);
      } catch {
        // Ignore
      }
    });

    return reply;
  }
}
