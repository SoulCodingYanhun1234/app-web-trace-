import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  });

  await app.listen(3000);
  logger.log('Application is running on: http://localhost:3000');
}

bootstrap().catch(err => {
  logger.error('Application bootstrap failed', err);
  process.exit(1);
});
