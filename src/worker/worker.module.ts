import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RedisModule } from '../redis/redis.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { ResourcesModule } from '../resources/resources.module.js';
import { CodeGenerationProcessor } from './code-generation.processor.js';
import { QueryLogProcessor } from './query-log.processor.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    LoggerModule.forRoot({ pinoHttp: { transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined } }),
    PrismaModule,
    RedisModule,
    QueueModule,
    ResourcesModule,
  ],
  providers: [CodeGenerationProcessor, QueryLogProcessor],
})
export class WorkerModule {}
