import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsInterceptor } from './metrics.interceptor.js';
import { MetricsService } from './metrics.service.js';

@Module({
  imports: [PrismaModule, QueueModule],
  controllers: [MetricsController],
  providers: [MetricsService, MetricsInterceptor],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
