import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service.js';

function header(req: any, key: string) {
  const value = req.headers?.[key] || req.headers?.[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function traceIdFrom(req: any, requestId: string) {
  const direct = header(req, 'x-trace-id');
  if (direct) return String(direct).slice(0, 128);
  const traceparent = header(req, 'traceparent');
  const match = String(traceparent || '').match(/^[\da-f]{2}-([\da-f]{32})-/i);
  return match?.[1] || requestId;
}

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const reply = context.switchToHttp().getResponse();
    const route = req.routeOptions?.url || req.routerPath || req.url || 'unknown';
    const requestId = String(header(req, 'x-request-id') || req.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const traceId = traceIdFrom(req, requestId);
    req.request_id = requestId;
    req.trace_id = traceId;
    reply.header?.('X-Request-Id', requestId);
    reply.header?.('X-Trace-Id', traceId);

    const done = this.metrics.beginHttp(req.method, route);
    const base = {
      service: process.env.SERVICE_NAME || 'trace-enterprise-api',
      env: process.env.NODE_ENV || 'development',
      request_id: requestId,
      trace_id: traceId,
      user_id: req.user?.id || null,
      method: req.method,
      path: req.url,
      route,
    };

    return next.handle().pipe(tap({
      next: () => {
        const status = reply.statusCode || 200;
        const duration = done(status);
        req.log?.info?.({ ...base, status, duration_ms: Math.round(duration * 1000) }, 'http_request');
      },
      error: (error) => {
        const status = error?.status || error?.statusCode || 500;
        const duration = done(status);
        req.log?.error?.({ ...base, status, duration_ms: Math.round(duration * 1000), error_stack: error?.stack, error_message: error?.message }, 'http_request_error');
      },
    }));
  }
}
