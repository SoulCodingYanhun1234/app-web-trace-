import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { AntiChannelingService } from './anti-channeling.service.js';

@ApiBearerAuth()
@ApiTags('企业防窜预警')
@Controller('anti-channeling')
export class AntiChannelingController {
  constructor(private readonly service: AntiChannelingService) {}

  @Get('overview')
  @RequirePermissions('anti-channeling:view')
  overview() { return this.service.overview(); }

  @Get('unread')
  @RequirePermissions('anti-channeling:view')
  unread(@Query('limit') limit?: string) { return this.service.unread(Number(limit || 5)); }

  @Get('analytics')
  @RequirePermissions('anti-channeling:view')
  analytics(@Query() query: Record<string, any>) { return this.service.analytics(query); }

  @Get('agent-risk')
  @RequirePermissions('anti-channeling:view')
  agentRisk(@Query('limit') limit?: string) { return this.service.agentRiskScores(Number(limit || 20)); }

  @Get('map-data')
  @RequirePermissions('anti-channeling:view')
  mapData(@Query() query: Record<string, any>) { return this.service.mapData(query); }


  @Get('code-trajectory')
  @RequirePermissions('anti-channeling:view')
  codeTrajectory(@Query('code') code: string, @Query('days') days?: string) {
    return this.service.codeTrajectory(code, Number(days || 30));
  }

  @Get('notifications')
  @RequirePermissions('anti-channeling:view')
  notifications(@Query() query: Record<string, any>) { return this.service.listNotifications(query); }

  @Post('notifications/:id/retry')
  @RequirePermissions('anti-channeling:manage')
  retryNotification(@Param('id') id: string) { return this.service.retryNotification(id); }

  @Get('rules')
  @RequirePermissions('anti-channeling:view')
  rules() { return this.service.listRules(); }

  @Put('rules/:id')
  @RequirePermissions('anti-channeling:manage')
  updateRule(@Param('id') id: string, @Body() body: Record<string, any>) { return this.service.updateRule(id, body); }

  @Get('alerts')
  @RequirePermissions('anti-channeling:view')
  alerts(@Query() query: Record<string, any>) { return this.service.listAlerts(query); }

  @Get('alerts/:id')
  @RequirePermissions('anti-channeling:view')
  detail(@Param('id') id: string) { return this.service.alertDetail(id); }

  @Post('alerts')
  @RequirePermissions('anti-channeling:manage')
  createAlert(@Body() body: Record<string, any>, @CurrentUser() user?: AuthUser) {
    return this.service.createManualAlert(body, user);
  }

  @Post('alerts/:id/ack')
  @RequirePermissions('anti-channeling:manage')
  ack(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user?: AuthUser) {
    return this.service.updateAlertStatus(id, 1, body, user);
  }

  @Post('alerts/:id/process')
  @RequirePermissions('anti-channeling:manage')
  process(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user?: AuthUser) {
    return this.service.updateAlertStatus(id, 2, body, user);
  }

  @Post('alerts/:id/close')
  @RequirePermissions('anti-channeling:manage')
  close(@Param('id') id: string, @Body() body: Record<string, any>, @CurrentUser() user?: AuthUser) {
    return this.service.updateAlertStatus(id, Number(body.status || 3), body, user);
  }

  @Post('alerts/batch-ack')
  @RequirePermissions('anti-channeling:manage')
  batchAck(@Body() body: { ids: number[] }, @CurrentUser() user?: AuthUser) {
    return Promise.all((body.ids || []).map((id) => this.service.updateAlertStatus(id, 1, { handle_result: '批量确认' }, user)));
  }

  @Post('alerts/clear')
  @RequirePermissions('anti-channeling:manage')
  clearAlerts(@Body() body: Record<string, any>, @CurrentUser() user?: AuthUser) {
    return this.service.clearAlerts(body, user);
  }

  @Post('evaluate')
  @RequirePermissions('anti-channeling:manage')
  evaluate(@Body() body: Record<string, any>) { return this.service.evaluateScan(body as any); }

  @Post('evaluate-batch')
  @RequirePermissions('anti-channeling:manage')
  evaluateBatch(@Body() body: { codes: any[] }) { return this.service.evaluateBatchCodeScans(body.codes || []); }

  @Post('evaluate-shipment')
  @RequirePermissions('anti-channeling:manage')
  evaluateShipment(@Body() body: Record<string, any>) { return this.service.evaluateShipmentByInput(body); }

  @Post('shipment-pre-check')
  @RequirePermissions('anti-channeling:manage')
  shipmentPreCheck(@Body() body: Record<string, any>) { return this.service.evaluateShipmentPreCheck(body); }
}
