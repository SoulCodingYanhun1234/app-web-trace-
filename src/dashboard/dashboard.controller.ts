import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service.js';

@ApiBearerAuth()
@ApiTags('仪表盘')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  summary() { return this.service.summary(); }

  @Get('trend')
  trend(@Query('days') days?: string) { return this.service.trend(days); }

  @Get('code-distribution')
  distribution() { return this.service.codeDistribution(); }

  @Get('recent-queries')
  recentQueries(@Query('limit') limit?: string) { return this.service.recentQueries(Number(limit || 10)); }

  @Get('agent-rank')
  agentRank(@Query('limit') limit?: string) { return this.service.agentRank(Number(limit || 10)); }

  @Get('anti-channeling-summary')
  antiChannelingSummary() { return this.service.antiChannelingSummary(); }
}

