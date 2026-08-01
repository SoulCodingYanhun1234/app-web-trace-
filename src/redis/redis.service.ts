import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(config: ConfigService) {
    try {
      const host = config?.get?.('REDIS_HOST') || 'localhost';
      const port = Number(config?.get?.('REDIS_PORT') || 6379);
      const password = config?.get?.('REDIS_PASSWORD') || undefined;
      const db = Number(config?.get?.('REDIS_DB') || 0);

      this.client = new Redis({
        host,
        port,
        password,
        db,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });

      this.client.on('error', (error: Error) => {
        this.logger.warn(`Redis 连接异常: ${error.message}`);
      });

      this.client.on('connect', () => {
        this.logger.log('Redis 连接成功');
      });
    } catch (error) {
      this.logger.error(`Redis 初始化失败: ${error}`);
      this.client = null;
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  get(key: string) {
    if (!this.client) return Promise.resolve(null);
    return this.client.get(key);
  }

  set(key: string, value: string, mode?: 'EX' | 'PX', ttl?: number) {
    if (!this.client) return Promise.resolve('OK');
    if (mode && ttl !== undefined) {
      return this.client.set(key, value, mode as any, ttl as any);
    }
    return this.client.set(key, value);
  }

  incr(key: string) {
    if (!this.client) return Promise.resolve(1);
    return this.client.incr(key);
  }

  expire(key: string, seconds: number) {
    if (!this.client) return Promise.resolve(1);
    return this.client.expire(key, seconds);
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean | null> {
    if (!this.client) return null;
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  sadd(key: string, ...members: string[]) {
    if (!this.client) return Promise.resolve(null);
    return this.client.sadd(key, ...members);
  }

  scard(key: string) {
    if (!this.client) return Promise.resolve(null);
    return this.client.scard(key);
  }

  del(...keys: string[]) {
    if (!this.client) return Promise.resolve(0);
    return this.client.del(...keys);
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }
}
