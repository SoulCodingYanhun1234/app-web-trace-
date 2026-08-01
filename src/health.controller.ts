import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';

@ApiTags('健康检查')
@Public()
@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
