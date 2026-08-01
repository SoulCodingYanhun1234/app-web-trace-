import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import fastifyHelmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { isIP } from 'node:net';
import { AppModule } from './app.module.js';
import { PrismaService } from './prisma/prisma.service.js';
import { isAiFeatureEnabled } from './common/feature-flags.js';

function trustProxySetting(): boolean | string[] {
  const raw = String(process.env.TRUST_PROXY || '').trim();
  if (!raw) return ['loopback', 'linklocal', 'uniquelocal'];
  if (['0', 'false', 'off', 'no'].includes(raw.toLowerCase())) return false;
  if (['1', 'true', 'on', 'yes'].includes(raw.toLowerCase())) {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
      throw new Error('TRUST_PROXY=true is forbidden in production; configure explicit proxy CIDRs');
    }
    return true;
  }
  const namedRanges = new Set(['loopback', 'linklocal', 'uniquelocal']);
  const rules = raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  for (const rule of rules) {
    if (namedRanges.has(rule)) continue;
    const [address, prefixText, extra] = rule.split('/');
    const family = isIP(address);
    const maxPrefix = family === 4 ? 32 : family === 6 ? 128 : -1;
    const prefix = prefixText === undefined ? maxPrefix : Number(prefixText);
    if (extra !== undefined || maxPrefix < 0 || !Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
      throw new Error(`Invalid TRUST_PROXY rule: ${rule}`);
    }
  }
  return rules;
}

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      trustProxy: trustProxySetting(),
      bodyLimit: Number(process.env.REQUEST_BODY_LIMIT_BYTES || 2 * 1024 * 1024),
      maxParamLength: 256,
    }),
    { bufferLogs: true },
  );

  const apiPrefix = process.env.API_PREFIX || 'api';
  const corsOriginSources = [
    process.env.CORS_ORIGIN || 'http://localhost:5173',
    process.env.PUBLIC_FRONTEND_BASE_URL,
    process.env.FRONTEND_BASE_URL,
    process.env.WEB_BASE_URL,
    process.env.H5_DOMAIN,
    process.env.PUBLIC_H5_DOMAIN,
    process.env.VERIFY_DOMAIN,
  ];
  const corsOriginItems = corsOriginSources
    .flatMap((value) => String(value || '').split(','))
    .map((item: any) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const corsOriginSet = new Set<string>();
  const corsHostSuffixes: string[] = [];
  let allowAllCorsOrigins = false;

  const rememberCorsOrigin = (item: string) => {
    if (!item) return;
    if (item === '*') {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('CORS_ORIGIN=* is forbidden in production');
      }
      allowAllCorsOrigins = true;
      return;
    }
    if (item.startsWith('*.')) {
      corsHostSuffixes.push(item.slice(1).toLowerCase());
      return;
    }

    const candidates = item.includes('://') ? [item] : [`https://${item}`, `http://${item}`];
    for (const candidate of candidates) {
      try {
        const url = new URL(candidate);
        corsOriginSet.add(url.origin);
      } catch {
        // ignore invalid CORS entries instead of making the API fail to boot
      }
    }
  };
  corsOriginItems.forEach(rememberCorsOrigin);

  const isCorsOriginAllowed = (origin?: string) => {
    // 允许同源/服务端调用；浏览器跨域请求必须命中白名单。
    if (!origin) return true;
    if (allowAllCorsOrigins) return true;
    try {
      const url = new URL(origin);
      const normalizedOrigin = url.origin;
      const hostname = url.hostname.toLowerCase();
      if (corsOriginSet.has(normalizedOrigin)) return true;
      if (corsHostSuffixes.some((suffix) => hostname.endsWith(suffix))) return true;
      if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '::1'].includes(hostname)) return true;
    } catch {
      return false;
    }
    return false;
  };

  await app.register(fastifyHelmet as any, {
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    hidePoweredBy: true,
  });
  app.enableCors({
    origin: (origin, callback) => {
      if (isCorsOriginAllowed(origin)) return callback(null, true);
      return callback(new Error(`当前域名不在 CORS 白名单内：${origin || 'unknown'}`), false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization', 'Content-Type', 'X-Requested-With', 'X-CSRF-Token', 'X-Login-Entry',
      'X-Verify-Site-Id', 'X-Verify-Page-Origin', 'X-Verify-Request-Nonce', 'X-Verify-Challenge',
    ],
    credentials: false,
  });

  await app.register(multipart as any, {
    limits: {
      fileSize: Number(process.env.UPLOAD_MAX_BYTES || 20 * 1024 * 1024),
      files: 1,
    },
  });
  await app.register(fastifyStatic as any, {
    root: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    prefix: '/uploads/',
    decorateReply: false,
    cacheControl: true,
    maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
    setHeaders: (res: any) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; sandbox");
    },
  });

  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(new ValidationPipe({
    // 保留白名单清洗，但不再因为前端表单携带 id/status/预览字段等冗余字段直接报错。
    // 这样系统管理、模块编辑器和通用 CRUD 在迭代字段时更稳，真正可写字段仍由 DTO + Service 决定。
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  const swaggerDefault = process.env.NODE_ENV === 'production' ? 'false' : 'true';
  if (String(process.env.SWAGGER_ENABLED || swaggerDefault) === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Trace Enterprise API')
      .setDescription('防伪溯源企业版 NestJS API')
      .setVersion('3.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    if (!isAiFeatureEnabled()) {
      for (const pathKey of Object.keys(document.paths || {})) {
        if (/\/ai-risk(?:\/|$)/.test(pathKey) || /\/trace\/automation(?:\/|$)/.test(pathKey)) {
          delete document.paths[pathKey];
        }
      }
    }
    SwaggerModule.setup(`${apiPrefix}/${process.env.SWAGGER_PATH || 'docs'}`, app, document);
  }

  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  await app.listen(Number(process.env.APP_PORT || 3000), process.env.APP_HOST || '0.0.0.0');
}

const logger = new Logger('Bootstrap');

bootstrap().catch((error) => {
  logger.error('Application bootstrap failed', error);
  process.exit(1);
});
