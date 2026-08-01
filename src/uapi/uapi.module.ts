import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module.js';
import { UapiController } from './uapi.controller.js';
import { UapiService } from './uapi.service.js';

@Module({
  imports: [RedisModule],
  controllers: [UapiController],
  providers: [UapiService],
  exports: [UapiService],
})
export class UapiModule {}
