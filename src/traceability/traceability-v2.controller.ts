import { Body, Controller, Get, Headers, Ip, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { TraceabilityV2Service } from './traceability-v2.service.js';

@ApiBearerAuth()
@ApiTags('溯源系统 V2')
@Controller('v2')
export class TraceabilityV2Controller {
  constructor(private readonly service: TraceabilityV2Service) {}

  @Get('topology')
  @RequirePermissions('trace:view')
  topology() { return this.service.topology(); }

  @Get('config/system')
  @RequirePermissions('system:view')
  systemConfig() { return this.service.getSystemConfig(); }

  @Put('config/system')
  @RequirePermissions('system:manage')
  updateSystemConfig(@Body() body: Record<string, any>) { return this.service.updateSystemConfig(body); }

  @Get('code-formats')
  @RequirePermissions('code:view')
  codeFormats() { return this.service.listCodeFormats(); }

  @Post('code-formats')
  @RequirePermissions('code:generate')
  saveCodeFormat(@Body() body: Record<string, any>) { return this.service.saveCodeFormat(body); }

  @Post('codes/generate')
  @RequirePermissions('code:generate')
  generateCodes(@Body() body: Record<string, any>) { return this.service.generateCodesV2(body); }

  @Public()
  @Get('codes/:code/verify')
  verifyCode(@Param('code') code: string, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.service.verifyCodeV2(code, { ip, userAgent });
  }

  @Post('rules')
  @RequirePermissions('anti-channeling:manage')
  saveRule(@Body() body: Record<string, any>) { return this.service.saveRule(body); }

  @Get('rules')
  @RequirePermissions('anti-channeling:view')
  rules(@Query() query: Record<string, any>) { return this.service.listRules(query); }

  @Put('rules/:ruleId')
  @RequirePermissions('anti-channeling:manage')
  updateRule(@Param('ruleId') ruleId: string, @Body() body: Record<string, any>) { return this.service.saveRule({ ...body, ruleId }); }

  @Post('rules/test')
  @RequirePermissions('anti-channeling:view')
  testRules(@Body() body: Record<string, any>) { return this.service.evaluateScan(body, true); }

  @Public()
  @Post('scans/market')
  marketScan(@Body() body: Record<string, any>, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.service.evaluateScan(body, false, { ip, userAgent });
  }

  @Get('analytics/realtime')
  @RequirePermissions('dashboard:view')
  realtimeMetrics() { return this.service.realtimeMetrics(); }

  @Get('cache/status')
  @RequirePermissions('system:view')
  cacheStatus() { return this.service.cacheStatus(); }

  @Post('cache/invalidate')
  @RequirePermissions('system:manage')
  invalidateCache(@Body() body: Record<string, any>) { return this.service.invalidateCache(body); }

  @Get('api-tenants')
  @RequirePermissions('system:view')
  tenants(@Query() query: Record<string, any>) { return this.service.listTenants(query); }

  @Post('api-tenants')
  @RequirePermissions('system:manage')
  saveTenant(@Body() body: Record<string, any>) { return this.service.saveTenant(body); }

  @Get('edge-nodes')
  @RequirePermissions('system:view')
  edgeNodes() { return this.service.listEdgeNodes(); }

  @Post('edge-nodes/heartbeat')
  @RequirePermissions('system:manage')
  edgeHeartbeat(@Body() body: Record<string, any>) { return this.service.edgeHeartbeat(body); }

  @Post('edge-nodes/offline-scan')
  @RequirePermissions('scanner:scan')
  offlineScan(@Body() body: Record<string, any>) { return this.service.recordOfflineScan(body); }

  @Post('edge-nodes/sync')
  @RequirePermissions('system:manage')
  syncEdgeEvents(@Body() body: Record<string, any>) { return this.service.syncEdgeEvents(body); }
}
