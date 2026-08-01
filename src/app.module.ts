import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { ExportModule } from './export/export.module.js';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { QueryModule } from './query/query.module.js';
import { QueueModule } from './queue/queue.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ResourcesModule } from './resources/resources.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { SystemModule } from './system/system.module.js';
import { UploadModule } from './upload/upload.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { ScannerModule } from './scanner/scanner.module.js';
import { AntiChannelingModule } from './anti-channeling/anti-channeling.module.js';
import { UapiModule } from './uapi/uapi.module.js';
import { TraceabilityV1Module } from './traceability/traceability-v1.module.js';
import { TraceabilityV2Module } from './traceability/traceability-v2.module.js';
import { MetricsInterceptor } from './metrics/metrics.interceptor.js';
import { SetupController } from './setup.controller.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';
import { AuditInterceptor } from './common/interceptors/audit.interceptor.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';
import { AiRiskModule } from './ai-risk/ai-risk.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
        serializers: {
          req(req) {
            return { id: req.id, method: req.method, url: req.url, remoteAddress: req.remoteAddress };
          },
        },
      },
    }),
    ThrottlerModule.forRoot([{
      ttl: Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60) * 1000,
      limit: Number(process.env.RATE_LIMIT_MAX || 200),
    }]),
    JwtModule.register({}),
    PrismaModule,
    RedisModule,
    QueueModule,
    AuthModule,
    QueryModule,
    DashboardModule,
    SettingsModule,
    SystemModule,
    UploadModule,
    ExportModule,
    MetricsModule,
    ScannerModule,
    AntiChannelingModule,
    AiRiskModule,
    UapiModule,
    TraceabilityV1Module,
    TraceabilityV2Module,
    // Keep the generic resource controller after all fixed-prefix modules so /settings/* and /scanner/* are not swallowed by :resource routes.
    ResourcesModule,
  ],
  controllers: [HealthController, SetupController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
