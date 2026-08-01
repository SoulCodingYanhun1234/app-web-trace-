import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service.js';

@Injectable()
export class UapiService {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.baseUrl = String(this.config.get('UAPI_BASE_URL') || 'https://uapis.cn/api/v1').replace(/\/+$/, '');
    this.apiKey = String(this.config.get('UAPI_API_KEY') || this.config.get('UAPI_KEY') || '').trim();
  }

  private cleanParams(params: Record<string, any> = {}) {
    return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  }

  private buildUrl(path: string, params: Record<string, any> = {}) {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [key, value] of Object.entries(this.cleanParams(params))) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private cacheKey(path: string, params: Record<string, any> = {}) {
    return `uapi:${path}:${JSON.stringify(this.cleanParams(params))}`;
  }

  async get(path: string, params: Record<string, any> = {}, ttlSeconds = 300) {
    const isMyIp = path === '/network/myip';
    const requestParams = isMyIp ? { ...params, source: 'commercial' } : params;
    if (isMyIp && !this.apiKey) throw new ServiceUnavailableException('未配置 UAPI_API_KEY，无法请求公网位置');
    const key = this.cacheKey(path, requestParams);
    const cached = await this.redis.get(key).catch(() => null);
    if (cached) {
      try { return JSON.parse(cached); } catch { await this.redis.del(key).catch(() => undefined); }
    }

    const timeoutMs = Number(this.config.get('UAPI_TIMEOUT_MS') || 5000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { Accept: 'application/json, text/plain, */*' };
      if (this.apiKey) headers.Authorization = /^Bearer\s/i.test(this.apiKey) ? this.apiKey : `Bearer ${this.apiKey}`;
      const response = await fetch(this.buildUrl(path, requestParams), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : await response.text();
      if (!response.ok) throw new ServiceUnavailableException(`UAPI 请求失败：${response.status}`);
      await this.redis.set(key, JSON.stringify(payload), 'EX', ttlSeconds).catch(() => undefined);
      return payload;
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new ServiceUnavailableException('UAPI 请求超时');
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(error?.message || 'UAPI 请求失败');
    } finally {
      clearTimeout(timer);
    }
  }
}
