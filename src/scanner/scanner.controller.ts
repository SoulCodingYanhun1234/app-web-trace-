import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { ScannerService } from './scanner.service.js';

@ApiBearerAuth()
@ApiTags('后台扫码枪业务')
@Controller('scanner')
@RequirePermissions('scanner:use')
export class ScannerController {
  constructor(private readonly service: ScannerService) {}

  @Get('workflows')
  workflows() {
    return this.service.workflows();
  }

  @Get('resolve/:code')
  resolveByParam(@Param('code') code: string) {
    return this.service.resolve(code);
  }

  @Get('flow/:code')
  flow(@Param('code') code: string) {
    return this.service.resolveFlow(code);
  }

  @Post('resolve')
  resolve(@Body('code') code: string) {
    return this.service.resolve(code);
  }

  @Post('execute')
  @RequirePermissions('scanner:execute')
  execute(@Body() body: Record<string, any>) {
    return this.service.execute(body);
  }

  @Post('batch-execute')
  @RequirePermissions('scanner:execute')
  batchExecute(@Body() body: Record<string, any>) {
    return this.service.batchExecute(body);
  }

  @Get('search')
  search(@Query('keyword') keyword = '') {
    return this.service.search(keyword);
  }
}
