import { Body, Controller, Delete, ForbiddenException, Get, Header, NotFoundException, Param, Post, Put, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { SkipWrap } from '../common/decorators/skip-wrap.decorator.js';
import { isAiFeatureEnabled } from '../common/feature-flags.js';
import { ResourcesService } from './resources.service.js';

@ApiBearerAuth()
@ApiTags('通用业务资源')
@Controller()
export class ResourcesController {
  constructor(private readonly service: ResourcesService, private readonly config: ConfigService) {}

  private ensureAiEnabled() {
    if (!isAiFeatureEnabled(this.config.get('AI_FEATURE_ENABLED'))) {
      throw new NotFoundException('AI 功能未启用');
    }
  }

  private moduleForResource(resource: string) {
    const map: Record<string, string> = {
      products: 'product',
      manufacturers: 'manufacturer',
      partners: 'manufacturer',
      'product-regions': 'product-region',
      agents: 'manufacturer',
      certificates: 'certificate',
      process: 'process',
      trace: 'trace',
      box: 'box',
      shipments: 'shipment',
      returns: 'return',
    };
    return map[String(resource || '').trim()];
  }

  private ensureResourcePermission(user: AuthUser | undefined, resource: string, action: 'view' | 'manage') {
    const module = this.moduleForResource(resource);
    if (!module) return;
    const permissions = user?.permissions || [];
    if (user?.role === 1 || permissions.includes('*')) return;
    const required = `${module}:${action}`;
    if (!permissions.includes(required)) throw new ForbiddenException('没有操作权限');
  }

  @Get('products/select')
  @RequirePermissions('product:view')
  productsSelect() { return this.service.productsSelect(); }

  @Get('products/categories')
  @RequirePermissions('product:view')
  productCategories() { return this.service.productCategories(); }

  @Get('products/manufacturers/select')
  @RequirePermissions('product:view')
  productManufacturersSelect() { return this.service.manufacturersSelect(); }

  @Get('agents/select')
  @RequirePermissions('manufacturer:view')
  agentsSelect() { return this.service.agentsSelect(); }

  @Get('manufacturers/select')
  @RequirePermissions('manufacturer:view')
  manufacturersSelect() { return this.service.manufacturersSelect(); }


  @Get('partners/select')
  @RequirePermissions('manufacturer:view')
  partnersSelect(@Query() query: Record<string, any>) { return this.service.partnersSelect(query); }

  @Get('partners')
  @RequirePermissions('manufacturer:view')
  listPartners(@Query() query: Record<string, any>) { return this.service.listPartners(query); }

  @Get('partners/:id')
  @RequirePermissions('manufacturer:view')
  partnerDetail(@Param('id') id: string) { return this.service.partnerDetail(id); }

  @Post('partners')
  @RequirePermissions('manufacturer:manage')
  createPartner(@Body() body: Record<string, any>) { return this.service.createPartner(body); }

  @Put('partners/:id')
  @RequirePermissions('manufacturer:manage')
  updatePartner(@Param('id') id: string, @Body() body: Record<string, any>) { return this.service.updatePartner(id, body); }

  @Delete('partners/:id')
  @RequirePermissions('manufacturer:manage')
  removePartner(@Param('id') id: string) { return this.service.removePartner(id); }

  @Get('codes')
  @RequirePermissions('code:view')
  listCodes(@Query() query: Record<string, any>) { return this.service.listCodes(query); }

  @Get('codes/batches')
  @RequirePermissions('code:view')
  codeBatches(@Query() query: Record<string, any>) { return this.service.codeBatches(query); }

  @Get('codes/stats')
  @RequirePermissions('code:view')
  codeStats(@Query('product_id') productId?: string) { return this.service.codeStats(productId); }

  @Post('codes/generate')
  @RequirePermissions('code:generate')
  generateCodes(@Body() body: Record<string, any>) { return this.service.generateCodes(body); }

  @Post('codes/generate-async')
  @RequirePermissions('code:generate')
  generateCodesAsync(@Body() body: Record<string, any>) { return this.service.generateCodesAsync(body); }

  @Post('codes/batch-activate')
  @RequirePermissions('code:activate')
  batchActivate(@Body('codes') codes: string[]) { return this.service.batchActivate(codes); }

  @Post('codes/batch-lock')
  @RequirePermissions('code:activate')
  batchLock(@Body('codes') codes: string[], @Body('lock') lock: boolean) { return this.service.batchLock(codes, lock); }

  @Post('codes/batch-cancel')
  @RequirePermissions('code:cancel')
  batchCancel(@Body('codes') codes: string[]) { return this.service.batchCancel(codes); }

  @Post('codes/batch-delete')
  @RequirePermissions('code:delete')
  batchDelete(@Body('codes') codes: string[]) { return this.service.batchDeleteCodes(codes); }

  @Post('codes/batch-update')
  @RequirePermissions('code:activate')
  batchUpdateCodes(@Body() body: Record<string, any>) { return this.service.batchUpdateCodes(body); }

  @SkipWrap()
  @Get('codes/qrcode/:code')
  @RequirePermissions('code:view')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  qrcode(@Param('code') code: string, @Query('payload') payload: string | undefined, @Request() req: any) { 
    const requestHost = this.getRequestHost(req);
    return this.service.qrcodeSvg(code, requestHost, payload); 
  }

  @Get('codes/qrcode/:code/meta')
  @RequirePermissions('code:view')
  qrcodeMeta(@Param('code') code: string, @Request() req: any) { 
    const requestHost = this.getRequestHost(req);
    return this.service.qrcodeMeta(code, requestHost); 
  }

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

  private getRequestHost(req: any): string | undefined {
    const forwarded = this.safeRequestOrigin(req.headers?.['x-forwarded-proto'], req.headers?.['x-forwarded-host']);
    if (forwarded) return forwarded;
    return this.safeRequestOrigin(req.protocol || req.headers?.['x-forwarded-proto'] || 'http', req.get?.('Host') || req.headers?.host);
  }

  @Get('trace/workflow/overview')
  @RequirePermissions('trace:view')
  traceWorkflowOverview() { return this.service.traceWorkflowOverview(); }

  @Post('trace/workflow/auto-sync')
  @RequirePermissions('trace:manage')
  traceWorkflowAutoSync(@Body() body: Record<string, any>) { return this.service.autoSyncTrace(body); }

  @Get('trace/automation/overview')
  @RequirePermissions('trace:view')
  traceAutomationOverview(@Query('module') module?: string) { this.ensureAiEnabled(); return this.service.traceAutomationOverview(module); }

  @Post('trace/automation/inspect')
  @RequirePermissions('trace:view')
  inspectTraceAutomation(@Body() body: Record<string, any>) {
    this.ensureAiEnabled();
    return this.service.runTraceAutomation({ ...(body || {}), dry_run: true });
  }

  @Post('trace/automation/run')
  @RequirePermissions('trace:manage')
  runTraceAutomation(@Body() body: Record<string, any>) { this.ensureAiEnabled(); return this.service.runTraceAutomation(body || {}); }

  @Get('trace/no/:traceNo')
  @RequirePermissions('trace:view')
  traceByNo(@Param('traceNo') traceNo: string) { return this.service.traceByNo(traceNo); }

  @Post('trace/auto-sync')
  @RequirePermissions('trace:manage')
  autoSyncTrace(@Body() body: Record<string, any>) { return this.service.autoSyncTrace(body); }

  @Post('trace/:id/node')
  @RequirePermissions('trace:manage')
  addTraceNode(@Param('id') id: string, @Body() body: Record<string, any>) { return this.service.addTraceNode(id, body); }

  @SkipWrap()
  @Get('box/:id/qrcode')
  @RequirePermissions('box:view')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  boxQrcode(@Param('id') id: string) {
    return this.service.boxQrcodeSvg(id);
  }

  @Post('box/:id/codes')
  @RequirePermissions('box:manage')
  addBoxCodes(@Param('id') id: string, @Body('codes') codes: string[]) { return this.service.addBoxCodes(id, codes); }

  @Post('box/:id/seal')
  @RequirePermissions('box:manage')
  sealBox(@Param('id') id: string) { return this.service.setBoxStatus(id, 1); }

  @Get('shipments/resolve/:scan')
  @RequirePermissions('shipment:view')
  resolveShipment(@Param('scan') scan: string) { return this.service.shipmentScanPreview(scan); }

  @SkipWrap()
  @Get('shipments/:id/qrcode')
  @RequirePermissions('shipment:view')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  shipmentQrcode(@Param('id') id: string, @Request() req: any) {
    return this.service.shipmentQrcodeSvg(id, this.getRequestHost(req));
  }

  @Get('shipments/:id/qrcode/meta')
  @RequirePermissions('shipment:view')
  shipmentQrcodeMeta(@Param('id') id: string, @Request() req: any) {
    return this.service.shipmentQrcodeMeta(id, this.getRequestHost(req));
  }

  @Post('shipments/:id/ship')
  @RequirePermissions('shipment:manage')
  ship(@Param('id') id: string, @Body() body: Record<string, any>) { return this.service.updateShipmentStatus(id, 1, body); }

  @Post('shipments/:id/receive')
  @RequirePermissions('shipment:manage')
  receive(@Param('id') id: string) { return this.service.updateShipmentStatus(id, 2); }

  @Post('shipments/:id/exception')
  @RequirePermissions('shipment:manage')
  exception(@Param('id') id: string, @Body('remark') remark: string) { return this.service.updateShipmentStatus(id, 3, { remark }); }

  @Put('shipments/:id/logistics')
  @RequirePermissions('shipment:manage')
  updateLogistics(@Param('id') id: string, @Body() body: Record<string, any>) { return this.service.update('shipments', id, body); }

  @Post('returns/:id/accept')
  @RequirePermissions('return:manage')
  acceptReturn(@Param('id') id: string, @Body('remark') remark: string) { return this.service.updateReturnStatus(id, 1, remark); }

  @Post('returns/:id/complete')
  @RequirePermissions('return:complete')
  completeReturn(@Param('id') id: string) { return this.service.updateReturnStatus(id, 2); }

  @Post('returns/:id/reject')
  @RequirePermissions('return:manage')
  rejectReturn(@Param('id') id: string, @Body('remark') remark: string) { return this.service.updateReturnStatus(id, 3, remark); }

  @Get(':resource')
  list(@Param('resource') resource: string, @Query() query: Record<string, any>, @CurrentUser() user?: AuthUser) {
    this.ensureResourcePermission(user, resource, 'view');
    return this.service.list(resource, query);
  }

  @Get(':resource/:id')
  detail(@Param('resource') resource: string, @Param('id') id: string, @CurrentUser() user?: AuthUser) {
    this.ensureResourcePermission(user, resource, 'view');
    return this.service.detail(resource, id);
  }

  @Post(':resource')
  create(@Param('resource') resource: string, @Body() body: Record<string, any>, @CurrentUser() user?: AuthUser) {
    this.ensureResourcePermission(user, resource, 'manage');
    return this.service.create(resource, body);
  }

  @Put(':resource/:id')
  update(@Param('resource') resource: string, @Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user?: AuthUser) {
    this.ensureResourcePermission(user, resource, 'manage');
    return this.service.update(resource, id, body);
  }

  @Delete(':resource/:id')
  remove(@Param('resource') resource: string, @Param('id') id: string, @CurrentUser() user?: AuthUser) {
    this.ensureResourcePermission(user, resource, 'manage');
    return this.service.remove(resource, id);
  }
}
