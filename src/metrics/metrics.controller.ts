import { Controller, ForbiddenException, Get, Header, Headers, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { SkipWrap } from '../common/decorators/skip-wrap.decorator.js';
import { MetricsService } from './metrics.service.js';

@ApiTags('监控')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly service: MetricsService) {}

  @Get()
  @Public()
  @SkipWrap()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics(@Headers('x-metrics-token') headerToken?: string, @Query('token') queryToken?: string) {
    const token = String(process.env.METRICS_TOKEN || '').trim();
    const publicEnabled = String(process.env.METRICS_PUBLIC ?? (process.env.NODE_ENV === 'production' ? 'false' : 'true')) === 'true';
    if (token) {
      const provided = String(headerToken || queryToken || '').trim();
      if (provided !== token) throw new ForbiddenException('监控指标令牌不正确');
    } else if (!publicEnabled) {
      throw new ForbiddenException('生产环境默认不公开监控指标，请设置 METRICS_TOKEN 或 METRICS_PUBLIC=true');
    }
    return this.service.metrics();
  }

  @Get('snapshot')
  @RequirePermissions('log:view')
  snapshot() {
    return this.service.snapshot();
  }
}
