import { Module } from '@nestjs/common';
import { ResourcesModule } from '../resources/resources.module.js';
import { AntiChannelingModule } from '../anti-channeling/anti-channeling.module.js';
import { ScannerController } from './scanner.controller.js';
import { ScannerService } from './scanner.service.js';

@Module({
  imports: [ResourcesModule, AntiChannelingModule],
  controllers: [ScannerController],
  providers: [ScannerService],
})
export class ScannerModule {}
