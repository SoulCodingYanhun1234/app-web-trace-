import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module.js';
import { TraceabilityV2Controller } from './traceability-v2.controller.js';
import { TraceabilityV2Service } from './traceability-v2.service.js';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [TraceabilityV2Controller],
  providers: [TraceabilityV2Service],
  exports: [TraceabilityV2Service],
})
export class TraceabilityV2Module {}
