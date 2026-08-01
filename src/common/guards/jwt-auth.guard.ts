import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { RedisService } from '../../redis/redis.service.js';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../types/auth-user.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private sessionPolicySeconds(key: 'AUTH_SESSION_IDLE_TIMEOUT_SECONDS' | 'AUTH_SESSION_MAX_AGE_SECONDS', fallback: number) {
    return Math.max(60, Number(this.config.get(key, fallback)) || fallback);
  }

  private assertSessionWindow(payload: AuthUser & { iat?: number }) {
    const now = Math.floor(Date.now() / 1000);
    const asSeconds = (value: unknown) => {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : 0;
    };
    // Backward-compatible fallback for old tokens issued before session claims were added.
    const startedAt = asSeconds(payload.sessionStartedAt) || asSeconds(payload.iat) || now;
    const lastActivityAt = asSeconds(payload.lastActivityAt) || asSeconds(payload.iat) || startedAt;
    const idleSeconds = this.sessionPolicySeconds('AUTH_SESSION_IDLE_TIMEOUT_SECONDS', 86400);
    const maxSeconds = Math.max(idleSeconds, this.sessionPolicySeconds('AUTH_SESSION_MAX_AGE_SECONDS', 604800));
    if (now >= startedAt + maxSeconds) throw new UnauthorizedException('登录会话已超过 7 天，请重新登录');
    if (now >= lastActivityAt + idleSeconds) throw new UnauthorizedException('超过 24 小时未操作，登录已失效');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const raw = req.headers?.authorization || '';
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
    if (!token) throw new UnauthorizedException('未登录或 token 缺失');

    const digest = createHash('sha256').update(token).digest('hex');
    const blocked = await this.redis.get(`token:blacklist:${digest}`).catch(() => null);
    if (blocked) throw new UnauthorizedException('登录已失效');

    try {
      const payload = await this.jwt.verifyAsync<AuthUser & { iat?: number }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
      this.assertSessionWindow(payload);
      req.user = {
        id: Number(payload.id),
        username: payload.username,
        role: Number(payload.role),
        permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      } satisfies AuthUser;
      return true;
    } catch {
      throw new UnauthorizedException('登录凭证无效或已过期');
    }
  }
}
