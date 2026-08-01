import { Module } from '@nestjs/common';
import { AntiChannelingController } from './anti-channeling.controller.js';
import { AntiChannelingService } from './anti-channeling.service.js';

@Module({
  controllers: [AntiChannelingController],
  providers: [AntiChannelingService],
  exports: [AntiChannelingService],
})
export class AntiChannelingModule {}
