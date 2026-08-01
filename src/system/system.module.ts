import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

@Module({
  imports: [AuthModule, SettingsModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
