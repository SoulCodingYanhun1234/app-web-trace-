import { Module } from '@nestjs/common';
import { ResourcesModule } from '../resources/resources.module.js';
import { TraceabilityV1Controller } from './traceability-v1.controller.js';
import { TraceabilityV1Service } from './traceability-v1.service.js';

@Module({
  imports: [ResourcesModule],
  controllers: [TraceabilityV1Controller],
  providers: [TraceabilityV1Service],
  exports: [TraceabilityV1Service],
})
export class TraceabilityV1Module {}
