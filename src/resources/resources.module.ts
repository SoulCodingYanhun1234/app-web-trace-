import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { ResourcesController } from './resources.controller.js';
import { ResourcesService } from './resources.service.js';
import { AntiChannelingModule } from '../anti-channeling/anti-channeling.module.js';

@Module({
  imports: [QueueModule, AntiChannelingModule],
  controllers: [ResourcesController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
