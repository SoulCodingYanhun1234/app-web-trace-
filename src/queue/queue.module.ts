import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { QueueProducerService } from './queue-producer.service.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: Number(config.get<number>('REDIS_PORT', 6379)),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          db: Number(config.get<number>('REDIS_DB', 0)),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'code-generation' },
      { name: 'query-log' },
      { name: 'statistics' },
      { name: 'export' },
      { name: 'notification' },
    ),
  ],
  providers: [QueueProducerService],
  exports: [BullModule, QueueProducerService],
})
export class QueueModule {}
