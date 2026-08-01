import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker/worker.module.js';

const logger = new Logger('WorkerBootstrap');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  const nestLogger = app.get(Logger);
  app.useLogger(nestLogger);

  logger.log('BullMQ worker started: code-generation, query-log');
}

bootstrap().catch((error) => {
  logger.error('Failed to start worker', error);
  process.exit(1);
});
