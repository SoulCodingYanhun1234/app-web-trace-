import { Body, Controller, Get, Headers, Ip, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { TraceabilityV1Service } from './traceability-v1.service.js';

@ApiBearerAuth()
@ApiTags('溯源系统 V1')
@Controller('v1')
export class TraceabilityV1Controller {
  constructor(private readonly service: TraceabilityV1Service) {}

  @Post('codes/generate')
  @RequirePermissions('code:generate')
  generateCodes(@Body() body: Record<string, any>) {
    return this.service.generateCodes(body);
  }

  @Post('codes/import')
  @RequirePermissions('code:generate')
  importCodes(@Body() body: Record<string, any>) {
    return this.service.importCodes(body);
  }

  @Public()
  @Get('codes/:code/verify')
  verifyCode(@Param('code') code: string) {
    return this.service.verifyCode(code);
  }

  @Post('packaging/relation')
  @RequirePermissions('box:manage')
  createRelation(@Body() body: Record<string, any>) {
    return this.service.createPackagingRelation(body);
  }

  @Get('packaging/tree/:code')
  @RequirePermissions('box:view')
  packagingTree(@Param('code') code: string) {
    return this.service.packagingTree(code);
  }

  @Post('batches')
  @RequirePermissions('trace:manage')
  createBatch(@Body() body: Record<string, any>) {
    return this.service.createBatch(body);
  }

  @Post('batches/:batchCode/steps')
  @RequirePermissions('trace:manage')
  addBatchStep(@Param('batchCode') batchCode: string, @Body() body: Record<string, any>) {
    return this.service.addBatchStep(batchCode, body);
  }

  @Post('warehouse/in')
  @RequirePermissions('box:manage')
  warehouseIn(@Body() body: Record<string, any>) {
    return this.service.warehouseIn(body);
  }

  @Post('shipment/out')
  @RequirePermissions('shipment:manage')
  shipmentOut(@Body() body: Record<string, any>) {
    return this.service.shipmentOut(body);
  }

  @Public()
  @Get('traceability/:code')
  traceability(@Param('code') code: string) {
    return this.service.queryTraceability(code);
  }

  @Public()
  @Post('scans/market')
  marketScan(@Body() body: Record<string, any>, @Ip() ip: string, @Headers('user-agent') userAgent?: string) {
    return this.service.marketScan(body, { ip, userAgent });
  }

  @Get('violations')
  @RequirePermissions('anti-channeling:view')
  violations(@Query() query: Record<string, any>) {
    return this.service.listViolations(query);
  }

  @Post('violations/:violationId/handle')
  @RequirePermissions('anti-channeling:manage')
  handleViolation(@Param('violationId') violationId: string, @Body() body: Record<string, any>) {
    return this.service.handleViolation(violationId, body);
  }

  @Put('violations/:violationId')
  @RequirePermissions('anti-channeling:manage')
  updateViolation(@Param('violationId') violationId: string, @Body() body: Record<string, any>) {
    return this.service.handleViolation(violationId, body);
  }
}
