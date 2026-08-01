import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { QueryController } from './query.controller.js';
import { QueryService } from './query.service.js';
import { AntiCrawlerGuard } from '../common/anti-crawler.guard.js';
import { AntiChannelingModule } from '../anti-channeling/anti-channeling.module.js';
import { PublicVerificationSecurityService } from './public-verification-security.service.js';
import { ServerGeolocationService } from './server-geolocation.service.js';

@Module({
  imports: [QueueModule, ResourcesModule, AntiChannelingModule],
  controllers: [QueryController],
  providers: [QueryService, AntiCrawlerGuard, PublicVerificationSecurityService, ServerGeolocationService],
})
export class QueryModule {}
