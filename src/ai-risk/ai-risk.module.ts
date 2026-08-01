import { Module } from '@nestjs/common';
import { AiRiskController } from './ai-risk.controller.js';
import { AiRiskService } from './ai-risk.service.js';

@Module({
  controllers: [AiRiskController],
  providers: [AiRiskService],
  exports: [AiRiskService],
})
export class AiRiskModule {}
