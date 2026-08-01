import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const started = Date.now();

    return next.handle().pipe(tap({
      next: () => this.write(req, 200, started),
      error: (error) => this.write(req, error?.status || 500, started),
    }));
  }

  private write(req: any, status: number, started: number) {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    if (req.url?.includes('/auth/login') || req.url?.includes('/query')) return;
    const user = req.user;
    this.prisma.auditLog.create({
      data: {
        admin_id: user?.id || null,
        username: user?.username || null,
        module: String(req.url || '').split('/').filter(Boolean)[1] || 'system',
        action: req.method,
        path: req.url,
        ip: req.ip,
        user_agent: req.headers?.['user-agent'] || null,
        status,
      },
    }).catch(() => undefined);
  }
}
