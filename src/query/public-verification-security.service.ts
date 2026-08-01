import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';

type ChallengePayload = {
  v: 1;
  sid: string;
  aud: string;
  code: string;
  nonce: string;
  flow: string;
  browser: string;
  iat: number;
  exp: number;
};

type SiteContext = {
  siteId: string;
  audience: string;
  hostname: string;
  requestNonce: string;
};

const CHALLENGE_VERSION = 'VC1';
const TOKEN_RE = /^VC1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/;
const VERIFY_BROWSER_COOKIE = 'trace_verify_browser';
const BROWSER_COOKIE_RE = /^[A-Za-z0-9_-]{43}$/;

function booleanValue(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function firstHeader(value: unknown) {
  return String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim();
}

function cookieValue(header: unknown, name: string) {
  const cookies = String(header || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 1 || cookie.slice(0, separator).trim() !== name) continue;
    return cookie.slice(separator + 1).trim();
  }
  return '';
}

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
}

function hostnameMatches(hostname: string, rule: string) {
  const normalizedRule = normalizeHostname(rule);
  if (!normalizedRule.startsWith('*.')) return hostname === normalizedRule;
  const suffix = normalizedRule.slice(2);
  return hostname !== suffix && hostname.endsWith(`.${suffix}`);
}

function parseAllowedHosts(value: unknown) {
  return Array.from(new Set(String(value || '').split(',').map((item) => {
    const raw = item.trim().toLowerCase();
    if (!raw) return '';
    if (raw.startsWith('*.')) return `*.${normalizeHostname(raw.slice(2))}`;
    try {
      return normalizeHostname(new URL(raw.includes('://') ? raw : `https://${raw}`).hostname);
    } catch {
      return '';
    }
  }).filter(Boolean)));
}

function normalizeOrigin(value: string) {
  if (!value || value === 'null') return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.origin.toLowerCase();
  } catch {
    return '';
  }
}

function digest(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

@Injectable()
export class PublicVerificationSecurityService implements OnModuleInit {
  private readonly memoryChallenges = new Map<string, number>();
  private readonly memoryDistinct = new Map<string, { values: Set<string>; expiresAt: number }>();

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    if (!this.production()) return;
    if (!this.allowedHosts().length) throw new Error('PUBLIC_VERIFY_ALLOWED_HOSTS must be configured in production');
    this.challengeSecret();
  }

  private production() {
    return String(this.config.get('NODE_ENV') || process.env.NODE_ENV || '').toLowerCase() === 'production';
  }

  private allowedHosts() {
    const configured = this.config.get('PUBLIC_VERIFY_ALLOWED_HOSTS') || process.env.PUBLIC_VERIFY_ALLOWED_HOSTS;
    const hosts = parseAllowedHosts(configured);
    if (hosts.length) return hosts;
    return this.production() ? [] : ['localhost', '127.0.0.1', '::1'];
  }

  private siteId() {
    return String(this.config.get('PUBLIC_VERIFY_SITE_ID') || 'trace-official-web')
      .trim().replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64) || 'trace-official-web';
  }

  private challengeSecret() {
    const encoded = String(this.config.get('PUBLIC_VERIFY_CHALLENGE_SECRET_BASE64') || '').trim();
    const raw = encoded
      ? Buffer.from(encoded, 'base64')
      : Buffer.from(String(this.config.get('PUBLIC_VERIFY_CHALLENGE_SECRET') || '').trim(), 'utf8');
    const normalized = raw.toString('utf8').toLowerCase();
    if (raw.length >= 32 && !/(change[_-]?me|replace[_-]?with|example|default)/.test(normalized)) return raw;
    if (this.production()) {
      throw new ServiceUnavailableException('公开验码挑战密钥未配置');
    }
    return createHash('sha256').update('trace-enterprise-development-verify-challenge', 'utf8').digest();
  }

  private strictRedis() {
    return booleanValue(this.config.get('PUBLIC_VERIFY_REQUIRE_REDIS'), this.production());
  }

  private bindBrowserCookie() {
    return booleanValue(this.config.get('PUBLIC_VERIFY_BIND_COOKIE'), this.production());
  }

  private browserCookie(req: FastifyRequest) {
    const existing = cookieValue(req.headers.cookie, VERIFY_BROWSER_COOKIE);
    return BROWSER_COOKIE_RE.test(existing) ? existing : randomBytes(32).toString('base64url');
  }

  private browserCookieHeader(value: string) {
    const secure = this.production() ? '; Secure' : '';
    return `${VERIFY_BROWSER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=300${secure}`;
  }

  private requestSite(req: FastifyRequest): SiteContext {
    const origin = normalizeOrigin(firstHeader(req.headers.origin));
    const refererRaw = firstHeader(req.headers.referer);
    const referer = normalizeOrigin(refererRaw);
    // Fastify resolves req.host through the configured trustProxy policy. This
    // keeps the public origin intact behind a trusted reverse proxy without
    // accepting a spoofed X-Forwarded-Host from direct clients.
    const host = firstHeader(req.host || req.headers.host).toLowerCase();
    const protocol = String((req as any).protocol || '').toLowerCase() || (this.production() ? 'https' : 'http');
    const hostOrigin = normalizeOrigin(`${protocol}://${host}`);
    const standardOrigins = [origin, referer, hostOrigin].filter(Boolean);
    if (new Set(standardOrigins).size > 1) {
      void this.recordEvent('VERIFY_STANDARD_ORIGIN_MISMATCH', '', req.ip, '', 'Origin、Referer 与 Host 不一致', {
        origin: origin || null,
        referer: referer || null,
        host_origin: hostOrigin || null,
      });
      throw new ForbiddenException('验码请求来源不一致');
    }
    const audience = origin || referer || hostOrigin;
    if (!audience) throw new ForbiddenException('无法确认官方验码站点');

    const url = new URL(audience);
    const hostname = normalizeHostname(url.hostname);
    const allowed = this.allowedHosts();
    if (!allowed.length || !allowed.some((rule) => hostnameMatches(hostname, rule))) {
      void this.recordEvent('UNTRUSTED_VERIFY_SITE', '', req.ip, '', '来源域名不在验码白名单', { audience, hostname });
      throw new ForbiddenException('当前地址不是官方防伪验证入口');
    }
    if (this.production() && url.protocol !== 'https:' && !booleanValue(this.config.get('PUBLIC_VERIFY_ALLOW_HTTP'), false)) {
      throw new ForbiddenException('官方防伪验证入口必须使用 HTTPS');
    }

    const expectedSiteId = this.siteId();
    const requestedSiteId = firstHeader(req.headers['x-verify-site-id']);
    if (this.production() && requestedSiteId !== expectedSiteId) {
      throw new ForbiddenException('验码站点标识无效');
    }
    const pageOrigin = normalizeOrigin(firstHeader(req.headers['x-verify-page-origin']));
    if (pageOrigin && pageOrigin !== audience) {
      void this.recordEvent('VERIFY_ORIGIN_MISMATCH', '', req.ip, '', '页面声明来源与标准来源头不一致', { audience, page_origin: pageOrigin });
      throw new ForbiddenException('验码页面来源不一致');
    }
    const requestNonce = firstHeader(req.headers['x-verify-request-nonce']);
    if (requestNonce && (requestNonce.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(requestNonce))) {
      throw new ForbiddenException('验码请求随机数无效');
    }
    if (booleanValue(this.config.get('PUBLIC_VERIFY_REQUIRE_REQUEST_NONCE'), this.production()) && !requestNonce) {
      throw new ForbiddenException('验码请求缺少流程随机数');
    }
    const fetchSite = firstHeader(req.headers['sec-fetch-site']).toLowerCase();
    if (this.production() && fetchSite && fetchSite !== 'same-origin') {
      throw new ForbiddenException('验码请求必须来自官方同源页面');
    }
    return { siteId: expectedSiteId, audience, hostname, requestNonce };
  }

  private sign(payloadText: string) {
    return createHmac('sha256', this.challengeSecret()).update(`${CHALLENGE_VERSION}.${payloadText}`, 'ascii').digest('base64url');
  }

  assertOfficialSite(req: FastifyRequest) {
    return this.requestSite(req);
  }

  issueChallenge(req: FastifyRequest, rawCode: string, setCookie?: (header: string) => void) {
    const code = String(rawCode || '').trim();
    const site = this.requestSite(req);
    const browserCookie = this.browserCookie(req);
    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.min(Math.max(Number(this.config.get('PUBLIC_VERIFY_CHALLENGE_TTL_SECONDS') || 60), 15), 120);
    const payload: ChallengePayload = {
      v: 1,
      sid: site.siteId,
      aud: site.audience,
      code: digest(code),
      nonce: randomBytes(18).toString('base64url'),
      flow: digest(site.requestNonce),
      browser: digest(browserCookie),
      iat: now,
      exp: now + ttl,
    };
    if (this.bindBrowserCookie()) setCookie?.(this.browserCookieHeader(browserCookie));
    const payloadText = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return {
      challenge: `${CHALLENGE_VERSION}.${payloadText}.${this.sign(payloadText)}`,
      expires_at: new Date(payload.exp * 1000).toISOString(),
      site_id: site.siteId,
      // 防窜授权使用浏览器直连 UAPI 的 /network/myip 获取访问者公网省市。
      // 查询服务会校验该响应中的公网 IP 与本次 API 请求 IP，再参与授权判定。
      location_required: true,
    };
  }

  private parseChallenge(token: string): ChallengePayload {
    const match = TOKEN_RE.exec(String(token || '').trim());
    if (!match) throw new ForbiddenException('验码挑战无效');
    const [, payloadText, suppliedSignature] = match;
    const expectedSignature = this.sign(payloadText);
    const supplied = Buffer.from(suppliedSignature, 'ascii');
    const expected = Buffer.from(expectedSignature, 'ascii');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new ForbiddenException('验码挑战无效');
    }
    let payload: ChallengePayload;
    try {
      payload = JSON.parse(Buffer.from(payloadText, 'base64url').toString('utf8')) as ChallengePayload;
    } catch {
      throw new ForbiddenException('验码挑战无效');
    }
    if (payload.v !== 1 || !payload.nonce || !payload.aud || !payload.code || !payload.flow || !payload.browser || !Number.isInteger(payload.exp)) {
      throw new ForbiddenException('验码挑战无效');
    }
    return payload;
  }

  private async consumeNonce(nonce: string, ttlSeconds: number) {
    const key = `verify:challenge:used:${digest(nonce)}`;
    try {
      const accepted = await this.redis.setIfAbsent(key, '1', ttlSeconds);
      if (accepted !== null) return accepted;
      if (this.strictRedis()) throw new ServiceUnavailableException('验码防重放服务暂不可用');
    } catch (error) {
      if (this.strictRedis()) {
        if (error instanceof ServiceUnavailableException) throw error;
        throw new ServiceUnavailableException('验码防重放服务暂不可用');
      }
      // Development can fall back to a process-local replay cache.
    }
    const now = Date.now();
    const existed = this.memoryChallenges.get(key);
    if (existed && existed > now) return false;
    this.memoryChallenges.set(key, now + ttlSeconds * 1000);
    if (this.memoryChallenges.size > 20_000) {
      for (const [itemKey, expiresAt] of this.memoryChallenges.entries()) {
        if (expiresAt <= now) this.memoryChallenges.delete(itemKey);
      }
    }
    return true;
  }

  async verifyChallenge(req: FastifyRequest, rawCode: string, token: string | undefined) {
    const site = this.requestSite(req);
    const required = booleanValue(this.config.get('PUBLIC_VERIFY_REQUIRE_CHALLENGE'), this.production());
    if (!token && !required) return site;
    if (!token) throw new ForbiddenException('请先从官方页面获取验码挑战');

    const payload = this.parseChallenge(token);
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now || payload.iat > now + 5 || payload.exp - payload.iat > 120) {
      throw new ForbiddenException('验码挑战已过期');
    }
    if (payload.sid !== site.siteId || payload.aud !== site.audience || payload.code !== digest(String(rawCode || '').trim())) {
      await this.recordEvent('VERIFY_CHALLENGE_MISMATCH', rawCode, req.ip, '', '挑战与站点或防伪码不匹配', { audience: site.audience });
      throw new ForbiddenException('验码挑战与当前请求不匹配');
    }
    if (payload.flow !== digest(site.requestNonce)) {
      await this.recordEvent('VERIFY_CHALLENGE_FLOW_MISMATCH', rawCode, req.ip, '', '挑战与当前浏览器请求流程不匹配');
      throw new ForbiddenException('验码挑战与当前请求流程不匹配');
    }
    if (this.bindBrowserCookie()) {
      const browserCookie = cookieValue(req.headers.cookie, VERIFY_BROWSER_COOKIE);
      if (!BROWSER_COOKIE_RE.test(browserCookie) || payload.browser !== digest(browserCookie)) {
        await this.recordEvent('VERIFY_CHALLENGE_BROWSER_MISMATCH', rawCode, req.ip, '', '挑战与官方页面浏览器会话不匹配');
        throw new ForbiddenException('验码挑战与当前浏览器会话不匹配');
      }
    }
    if (!await this.consumeNonce(payload.nonce, Math.max(payload.exp - now, 1))) {
      await this.recordEvent('VERIFY_CHALLENGE_REPLAY', rawCode, req.ip, '', '重复使用一次性验码挑战');
      throw new ConflictException('验码挑战已使用，请重新获取');
    }
    return site;
  }

  private memoryDistinctCount(key: string, value: string, ttlSeconds: number) {
    const now = Date.now();
    let bucket = this.memoryDistinct.get(key);
    if (!bucket || bucket.expiresAt <= now) {
      bucket = { values: new Set<string>(), expiresAt: now + ttlSeconds * 1000 };
      this.memoryDistinct.set(key, bucket);
    }
    bucket.values.add(value);
    return bucket.values.size;
  }

  private async distinctCount(key: string, value: string, ttlSeconds: number) {
    try {
      const added = await this.redis.sadd(key, value);
      if (added !== null) {
        await this.redis.expire(key, ttlSeconds);
        return Number(await this.redis.scard(key) || 0);
      }
      if (this.strictRedis()) throw new ServiceUnavailableException('验码行为风控服务暂不可用');
    } catch (error) {
      if (this.strictRedis()) {
        if (error instanceof ServiceUnavailableException) throw error;
        throw new ServiceUnavailableException('验码行为风控服务暂不可用');
      }
      // Development can fall back to process-local tracking.
    }
    return this.memoryDistinctCount(key, value, ttlSeconds);
  }

  async enforceBehavior(rawCode: string, meta: { ip?: string; deviceId?: string }) {
    const codeHash = digest(rawCode);
    const windowSeconds = Math.min(Math.max(Number(this.config.get('PUBLIC_QUERY_DISTINCT_WINDOW_SECONDS') || 300), 60), 3600);
    const limit = Math.min(Math.max(Number(this.config.get('PUBLIC_QUERY_DISTINCT_CODE_LIMIT') || 20), 5), 500);
    const subjects = [
      meta.ip && { type: 'ip', value: meta.ip },
      meta.deviceId && { type: 'device', value: meta.deviceId },
    ].filter(Boolean) as Array<{ type: string; value: string }>;
    for (const subject of subjects) {
      const subjectHash = digest(subject.value);
      const count = await this.distinctCount(`risk:distinct:${subject.type}:${subjectHash}`, codeHash, windowSeconds);
      if (count > limit) {
        await this.recordEvent('BULK_CODE_ENUMERATION', rawCode, meta.ip, meta.deviceId, '短时间查询大量不同防伪码', {
          scope: subject.type,
          distinct_codes: count,
          window_seconds: windowSeconds,
          limit,
        });
        throw new HttpException('异常批量查询已被拦截', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  async recordEvent(eventType: string, code: string, ip: string | undefined, deviceId: string | undefined, reason: string, payload: Record<string, any> = {}) {
    await this.prisma.riskEvent.create({
      data: {
        event_type: eventType.slice(0, 64),
        code: code ? digest(code) : null,
        ip: ip ? digest(ip) : null,
        device_id: deviceId ? digest(deviceId) : null,
        reason: reason.slice(0, 255),
        payload,
      },
    }).catch(() => undefined);
  }
}
