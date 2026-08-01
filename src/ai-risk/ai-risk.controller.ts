import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators/permissions.decorator.js';
import { ConfigService } from '@nestjs/config';
import { isAiFeatureEnabled } from '../common/feature-flags.js';
import { AiRiskService } from './ai-risk.service.js';

@ApiBearerAuth()
@ApiTags('AI 溯源研判')
@Controller('ai-risk')
export class AiRiskController {
  constructor(private readonly service: AiRiskService, private readonly config: ConfigService) {}

  private ensureAiEnabled() {
    if (!isAiFeatureEnabled(this.config.get('AI_FEATURE_ENABLED'))) {
      throw new NotFoundException('AI 功能未启用');
    }
  }

  @Get('overview')
  @RequirePermissions('trace:view')
  overview() { this.ensureAiEnabled(); return this.service.overview(); }

  @Get('models')
  @RequirePermissions('trace:view')
  models() { this.ensureAiEnabled(); return this.service.models(); }

  @Post('analyze')
  @RequirePermissions('trace:view')
  analyze(@Body() body: Record<string, any>) { this.ensureAiEnabled(); return this.service.analyze(body || {}); }
}
