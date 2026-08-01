import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordService } from './password.service.js';
import { RedisService } from '../redis/redis.service.js';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { AuthUser } from '../common/types/auth-user.js';
import type { StringValue } from 'ms';
import { buildEnterpriseModules } from '../system/module-catalog.js';
import { envFeatureEnabled } from '../common/feature-flags.js';
import type { LoginCodeDto, LoginDto } from './dto.js';
import QRCode from 'qrcode';

import { setTimeout as sleep } from 'node:timers/promises';

const GENERIC_LOGIN_ERROR = '账号或密码错误';
const LOGIN_SCOPE_ACCOUNT_IP = 'account_ip';
const LOGIN_SCOPE_ACCOUNT = 'account';
const LOGIN_SCOPE_IP = 'ip';
const LOGIN_CODE_CHANNELS = new Set(['email', 'phone']);
const WECHAT_ACCESS_TOKEN_URL = 'https://api.weixin.qq.com/sns/oauth2/access_token';
const WECHAT_USERINFO_URL = 'https://api.weixin.qq.com/sns/userinfo';

type LocalBucket = { count: number; expiresAt: number };
type LocalLoginCode = { hash: string; expiresAt: number; attempts: number };
type LoginMeta = {
  ip?: string;
  userAgent?: string;
  loginEntry?: string;
  origin?: string;
  forwardedHost?: string;
  host?: string;
};

function parsePermissionArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item: any) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((item: any) => String(item).trim()).filter(Boolean);
    } catch {
      return value.split(/[\s,，;；]+/).map((item: any) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function publicAdmin(row: any, permissions?: string[], extras: Record<string, any> = {}) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    real_name: row.real_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    avatar: row.avatar,
    last_login_at: row.last_login_at,
    permissions: permissions ?? parsePermissionArray(row.permissions),
    ...extras,
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private async writeLoginLog(input: { admin?: any; username?: string; ip?: string; userAgent?: string; success: boolean; reason?: string }) {
    await this.prisma.loginLog.create({
      data: {
        admin_id: input.admin?.id ?? null,
        username: input.admin?.username ?? input.username ?? null,
        ip: input.ip ?? null,
        user_agent: input.userAgent ?? null,
        success: input.success,
        reason: input.reason ?? null,
      },
    }).catch(() => undefined);
  }

  private readonly localLoginBuckets = new Map<string, LocalBucket>();
  private readonly localLoginLocks = new Map<string, number>();
  private readonly localLoginCodes = new Map<string, LocalLoginCode>();
  private readonly localLoginCodeCooldowns = new Map<string, number>();
  private readonly localWechatStates = new Map<string, number>();

  private digestPart(value: string) {
    return createHash('sha256').update(value || 'unknown').digest('hex').slice(0, 32);
  }

  private loginScopeKeys(username: string, ip?: string) {
    const normalizedUsername = String(username || '').trim().toLowerCase() || 'empty';
    const normalizedIp = String(ip || 'unknown').trim().toLowerCase() || 'unknown';
    return [
      `${LOGIN_SCOPE_ACCOUNT_IP}:${this.digestPart(`${normalizedUsername}|${normalizedIp}`)}`,
      `${LOGIN_SCOPE_ACCOUNT}:${this.digestPart(normalizedUsername)}`,
      `${LOGIN_SCOPE_IP}:${this.digestPart(normalizedIp)}`,
    ];
  }

  private loginFailKey(scopeKey: string) {
    return `login:fail:${scopeKey}`;
  }

  private loginLockKey(scopeKey: string) {
    return `login:lock:${scopeKey}`;
  }

  private pruneLocalLoginState(now = Date.now()) {
    for (const [key, bucket] of this.localLoginBuckets) {
      if (bucket.expiresAt <= now) this.localLoginBuckets.delete(key);
    }
    for (const [key, expiresAt] of this.localLoginLocks) {
      if (expiresAt <= now) this.localLoginLocks.delete(key);
    }
  }

  private recordLocalFailedLogin(scopeKey: string, windowSeconds: number, lockSeconds: number, maxAttempts: number) {
    const now = Date.now();
    this.pruneLocalLoginState(now);
    const failKey = this.loginFailKey(scopeKey);
    const existing = this.localLoginBuckets.get(failKey);
    const bucket = existing && existing.expiresAt > now
      ? existing
      : { count: 0, expiresAt: now + windowSeconds * 1000 };
    bucket.count += 1;
    this.localLoginBuckets.set(failKey, bucket);
    if (bucket.count >= maxAttempts) {
      this.localLoginLocks.set(this.loginLockKey(scopeKey), now + lockSeconds * 1000);
    }
  }

  private clearLocalFailedLogin(scopeKeys: string[]) {
    scopeKeys.forEach((scopeKey) => {
      this.localLoginBuckets.delete(this.loginFailKey(scopeKey));
      this.localLoginLocks.delete(this.loginLockKey(scopeKey));
    });
  }

  private loginEntrySecret() {
    return String(
      this.config.get<string>('ADMIN_LOGIN_ENTRY_SECRET')
      || this.config.get<string>('LOGIN_ENTRY_SECRET')
      || '',
    ).trim();
  }

  private configuredHostSet(key: string, fallback: string[]) {
    const configured = String(this.config.get<string>(key) || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    return new Set(configured.length ? configured : fallback);
  }

  private normalizeRequestHostname(value?: string) {
    const raw = String(value || '').split(',')[0].trim();
    if (!raw) return '';
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      return url.hostname.toLowerCase();
    } catch {
      return raw.replace(/^\[|\]$/g, '').replace(/:\d+$/, '').toLowerCase();
    }
  }

  private loginRequestHostname(input: { origin?: string; forwardedHost?: string; host?: string }) {
    return this.normalizeRequestHostname(input.origin)
      || this.normalizeRequestHostname(input.forwardedHost)
      || this.normalizeRequestHostname(input.host);
  }

  private loginEntryRequired(input: { origin?: string; forwardedHost?: string; host?: string }) {
    const hostname = this.loginRequestHostname(input);
    const directHosts = this.configuredHostSet('ADMIN_DIRECT_LOGIN_HOSTS', [
      'workpanel.0office.top',
      'localhost',
      '127.0.0.1',
    ]);
    const entryRequiredHosts = this.configuredHostSet('ADMIN_ENTRY_REQUIRED_HOSTS', [
      'qr.0office.top',
    ]);

    if (directHosts.has(hostname)) return false;
    if (entryRequiredHosts.has(hostname)) return true;
    // 对未明确列入直达白名单的域名保持原有安全策略：配置了 entry 密钥就必须校验。
    return Boolean(this.loginEntrySecret());
  }

  private secureEquals(left: string, right: string) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async assertLoginEntryAllowed(input: {
    username: string;
    ip?: string;
    userAgent?: string;
    loginEntry?: string;
    origin?: string;
    forwardedHost?: string;
    host?: string;
  }) {
    if (!this.loginEntryRequired(input)) return;

    const expected = this.loginEntrySecret();
    if (!expected) {
      await this.writeLoginLog({
        username: input.username,
        ip: input.ip,
        userAgent: input.userAgent,
        success: false,
        reason: `入口保护域名未配置登录密钥：${this.loginRequestHostname(input) || 'unknown'}`,
      });
      throw new ForbiddenException('管理端登录入口尚未配置');
    }

    const actual = String(input.loginEntry || '').trim();
    if (actual && this.secureEquals(actual, expected)) return;

    await this.recordFailedLogin(input.username, input.ip);
    await this.writeLoginLog({
      username: input.username,
      ip: input.ip,
      userAgent: input.userAgent,
      success: false,
      reason: '管理端登录入口校验失败',
    });
    throw new ForbiddenException('管理端登录入口校验失败');
  }

  private async assertLoginNotLocked(username: string, ip?: string) {
    const scopeKeys = this.loginScopeKeys(username, ip);
    this.pruneLocalLoginState();
    if (scopeKeys.some((scopeKey) => this.localLoginLocks.has(this.loginLockKey(scopeKey)))) {
      throw new ForbiddenException('登录失败次数过多，账号或当前网络已临时锁定，请稍后再试');
    }

    const locked = await Promise.all(scopeKeys.map((scopeKey) => this.redis.get(this.loginLockKey(scopeKey)).catch(() => null)));
    if (locked.some(Boolean)) throw new ForbiddenException('登录失败次数过多，账号或当前网络已临时锁定，请稍后再试');
  }

  private async recordFailedLogin(username: string, ip?: string) {
    const maxAttempts = Math.max(Number(this.config.get('LOGIN_MAX_FAILED_ATTEMPTS', 5)) || 5, 3);
    const windowSeconds = Math.max(Number(this.config.get('LOGIN_FAIL_WINDOW_SECONDS', 600)) || 600, 60);
    const lockSeconds = Math.max(Number(this.config.get('LOGIN_LOCK_SECONDS', 600)) || 600, 60);
    const scopeKeys = this.loginScopeKeys(username, ip);

    await Promise.all(scopeKeys.map(async (scopeKey) => {
      this.recordLocalFailedLogin(scopeKey, windowSeconds, lockSeconds, maxAttempts);
      const failKey = this.loginFailKey(scopeKey);
      const count = await this.redis.incr(failKey).catch(() => 1);
      if (count === 1) await this.redis.expire(failKey, windowSeconds).catch(() => undefined);
      if (count >= maxAttempts) {
        await this.redis.set(this.loginLockKey(scopeKey), '1', 'EX', lockSeconds).catch(() => undefined);
      }
    }));
  }

  private async clearFailedLogin(username: string, ip?: string) {
    const scopeKeys = this.loginScopeKeys(username, ip);
    this.clearLocalFailedLogin(scopeKeys);
    const keys = scopeKeys.flatMap((scopeKey) => [this.loginFailKey(scopeKey), this.loginLockKey(scopeKey)]);
    await this.redis.del(...keys).catch(() => undefined);
  }

  private async slowDownFailedLogin() {
    const minMs = Math.max(Number(this.config.get('LOGIN_FAILURE_DELAY_MIN_MS', 250)) || 250, 0);
    const maxMs = Math.max(Number(this.config.get('LOGIN_FAILURE_DELAY_MAX_MS', 900)) || 900, minMs);
    const delayMs = Math.min(maxMs, minMs + Math.floor(Math.random() * Math.max(maxMs - minMs, 1)));
    if (delayMs > 0) await sleep(delayMs);
  }

  private envValue(keys: string[], fallback = '') {
    for (const key of keys) {
      const value = this.config.get<string>(key);
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return fallback;
  }

  private envFlag(keys: string[], fallback = false) {
    for (const key of keys) {
      const value = this.config.get<string>(key);
      if (value !== undefined && value !== null && String(value).trim() !== '') return envFeatureEnabled(value, fallback);
    }
    return fallback;
  }

  private loginChannelConfig() {
    const usernamePassword = this.envFlag(['AUTH_USERNAME_PASSWORD_LOGIN_ENABLED', 'LOGIN_USERNAME_PASSWORD_ENABLED'], true);
    const emailPassword = this.envFlag(['AUTH_EMAIL_PASSWORD_LOGIN_ENABLED', 'LOGIN_EMAIL_PASSWORD_ENABLED'], false);
    const emailCode = this.envFlag(['AUTH_EMAIL_CODE_LOGIN_ENABLED', 'LOGIN_EMAIL_CODE_ENABLED'], false);
    const phonePassword = this.envFlag(['AUTH_PHONE_PASSWORD_LOGIN_ENABLED', 'LOGIN_PHONE_PASSWORD_ENABLED'], false);
    const phoneCode = this.envFlag(['AUTH_PHONE_CODE_LOGIN_ENABLED', 'LOGIN_PHONE_CODE_ENABLED'], false);
    const wechatQr = this.envFlag(['AUTH_WECHAT_QR_LOGIN_ENABLED', 'WECHAT_LOGIN_ENABLED', 'LOGIN_WECHAT_ENABLED'], false);
    return { usernamePassword, emailPassword, emailCode, phonePassword, phoneCode, wechatQr };
  }

  loginOptions() {
    const config = this.loginChannelConfig();
    const wechatConfigured = Boolean(this.wechatAppId() && this.wechatAppSecret());
    return {
      password: {
        enabled: config.usernamePassword || config.emailPassword || config.phonePassword,
        account_types: {
          username: config.usernamePassword,
          email: config.emailPassword,
          phone: config.phonePassword,
        },
      },
      verification_code: {
        email: config.emailCode,
        phone: config.phoneCode,
        ttl_seconds: this.loginCodeTtlSeconds(),
        resend_seconds: this.loginCodeResendSeconds(),
      },
      wechat: {
        enabled: config.wechatQr && wechatConfigured,
        qrcode: true,
        configured: wechatConfigured,
      },
    };
  }

  private loginCodeTtlSeconds() {
    return Math.max(Number(this.config.get('AUTH_LOGIN_CODE_TTL_SECONDS', 300)) || 300, 60);
  }

  private loginCodeResendSeconds() {
    return Math.max(Number(this.config.get('AUTH_LOGIN_CODE_RESEND_SECONDS', 60)) || 60, 10);
  }

  private normalizeEmail(value: unknown) {
    return String(value || '').trim().toLowerCase().slice(0, 128);
  }

  private normalizePhone(value: unknown) {
    return String(value || '').trim().replace(/[\s-]/g, '').slice(0, 32);
  }

  private normalizeLoginTarget(channel: 'email' | 'phone', value: unknown) {
    return channel === 'email' ? this.normalizeEmail(value) : this.normalizePhone(value);
  }

  private classifyPasswordAccount(account: string): 'email' | 'phone' | 'username' {
    const value = String(account || '').trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
    if (/^\+?\d{6,20}$/.test(value.replace(/[\s-]/g, ''))) return 'phone';
    return 'username';
  }

  private loginCodeStorageKey(channel: 'email' | 'phone', target: string) {
    return `login:code:${channel}:${this.digestPart(target.toLowerCase())}`;
  }

  private loginCodeCooldownKey(channel: 'email' | 'phone', target: string) {
    return `login:code:cooldown:${channel}:${this.digestPart(target.toLowerCase())}`;
  }

  private loginCodeHash(channel: 'email' | 'phone', target: string, code: string) {
    const secret = this.config.get<string>('JWT_SECRET') || 'login-code';
    return createHash('sha256').update(`${channel}|${target.toLowerCase()}|${code}|${secret}`).digest('hex');
  }

  private pruneLocalLoginCodes(now = Date.now()) {
    for (const [key, value] of this.localLoginCodes) {
      if (value.expiresAt <= now) this.localLoginCodes.delete(key);
    }
    for (const [key, expiresAt] of this.localLoginCodeCooldowns) {
      if (expiresAt <= now) this.localLoginCodeCooldowns.delete(key);
    }
    for (const [key, expiresAt] of this.localWechatStates) {
      if (expiresAt <= now) this.localWechatStates.delete(key);
    }
  }

  private async setLoginCode(key: string, hash: string, ttlSeconds: number) {
    const payload = JSON.stringify({ hash, attempts: 0 });
    this.localLoginCodes.set(key, { hash, attempts: 0, expiresAt: Date.now() + ttlSeconds * 1000 });
    await this.redis.set(key, payload, 'EX', ttlSeconds).catch(() => undefined);
  }

  private async readLoginCode(key: string): Promise<LocalLoginCode | null> {
    this.pruneLocalLoginCodes();
    const redisValue = await this.redis.get(key).catch(() => null);
    if (redisValue) {
      try {
        const parsed = JSON.parse(redisValue);
        return { hash: String(parsed.hash || ''), attempts: Number(parsed.attempts || 0), expiresAt: Date.now() + this.loginCodeTtlSeconds() * 1000 };
      } catch {
        return null;
      }
    }
    return this.localLoginCodes.get(key) || null;
  }

  private async deleteLoginCode(key: string) {
    this.localLoginCodes.delete(key);
    await this.redis.del(key).catch(() => undefined);
  }

  private async setCodeCooldown(key: string, seconds: number) {
    this.localLoginCodeCooldowns.set(key, Date.now() + seconds * 1000);
    await this.redis.set(key, '1', 'EX', seconds).catch(() => undefined);
  }

  private async hasCodeCooldown(key: string) {
    this.pruneLocalLoginCodes();
    if (this.localLoginCodeCooldowns.has(key)) return true;
    return Boolean(await this.redis.get(key).catch(() => null));
  }

  private async findActiveAdminByChannel(channel: 'username' | 'email' | 'phone', target: string) {
    if (channel === 'username') {
      const admin = await this.prisma.admin.findUnique({ where: { username: target } });
      return admin?.status === 1 ? admin : null;
    }
    const rows = channel === 'email'
      ? await this.prisma.admin.findMany({ where: { email: target }, take: 2 })
      : await this.prisma.admin.findMany({
        where: { OR: Array.from(new Set([target, this.normalizePhone(target)])).map((phone) => ({ phone })) },
        take: 2,
      });
    const active = rows.filter((item: any) => item.status === 1);
    return active.length === 1 ? active[0] : null;
  }

  private async deliverLoginCode(input: { channel: 'email' | 'phone'; target: string; code: string }) {
    const webhookUrl = this.envValue(['AUTH_LOGIN_CODE_WEBHOOK_URL', 'LOGIN_CODE_WEBHOOK_URL']);
    if (webhookUrl) {
      const token = this.envValue(['AUTH_LOGIN_CODE_WEBHOOK_TOKEN', 'LOGIN_CODE_WEBHOOK_TOKEN']);
      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          channel: input.channel,
          target: input.target,
          code: input.code,
          purpose: 'admin_login',
          ttl_seconds: this.loginCodeTtlSeconds(),
        }),
      }).catch(() => undefined);
    }
    if (this.envFlag(['AUTH_LOGIN_CODE_CONSOLE', 'LOGIN_CODE_CONSOLE'], false)) {
      console.log(`[login-code] ${input.channel} ${input.target}: ${input.code}`);
    }
  }

  async sendLoginCode(dto: LoginCodeDto, meta: LoginMeta) {
    const channel = dto.channel;
    if (!LOGIN_CODE_CHANNELS.has(channel)) throw new BadRequestException('验证码渠道不支持');
    const config = this.loginChannelConfig();
    if ((channel === 'email' && !config.emailCode) || (channel === 'phone' && !config.phoneCode)) {
      throw new ForbiddenException('该验证码登录渠道未启用');
    }
    const debugEcho = this.envFlag(['AUTH_LOGIN_CODE_DEBUG_ECHO', 'LOGIN_CODE_DEBUG_ECHO'], process.env.NODE_ENV !== 'production');
    const consoleDelivery = this.envFlag(['AUTH_LOGIN_CODE_CONSOLE', 'LOGIN_CODE_CONSOLE'], false);
    const webhookDelivery = Boolean(this.envValue(['AUTH_LOGIN_CODE_WEBHOOK_URL', 'LOGIN_CODE_WEBHOOK_URL']));
    if (!debugEcho && !consoleDelivery && !webhookDelivery) {
      throw new ForbiddenException('验证码发送服务未配置');
    }
    const target = this.normalizeLoginTarget(channel, dto.target);
    if (!target) throw new BadRequestException('验证码接收账号不能为空');
    await this.assertLoginNotLocked(target, meta.ip);
    await this.assertLoginEntryAllowed({
      username: target,
      ip: meta.ip,
      userAgent: meta.userAgent,
      loginEntry: meta.loginEntry,
      origin: meta.origin,
      forwardedHost: meta.forwardedHost,
      host: meta.host,
    });
    const cooldownKey = this.loginCodeCooldownKey(channel, target);
    if (await this.hasCodeCooldown(cooldownKey)) throw new BadRequestException('验证码发送过于频繁，请稍后再试');

    const admin = await this.findActiveAdminByChannel(channel, target);
    const code = String(randomInt(100000, 1000000));
    if (admin) {
      await this.setLoginCode(this.loginCodeStorageKey(channel, target), this.loginCodeHash(channel, target, code), this.loginCodeTtlSeconds());
      await this.deliverLoginCode({ channel, target, code });
    }
    await this.setCodeCooldown(cooldownKey, this.loginCodeResendSeconds());
    await this.writeLoginLog({
      admin: admin || undefined,
      username: admin?.username || target,
      ip: meta.ip,
      userAgent: meta.userAgent,
      success: Boolean(admin),
      reason: admin ? '发送登录验证码' : '验证码账号不存在、重复或被禁用',
    });
    return {
      sent: true,
      ttl_seconds: this.loginCodeTtlSeconds(),
      resend_seconds: this.loginCodeResendSeconds(),
      ...(debugEcho && admin ? { debug_code: code } : {}),
    };
  }

  private async assertValidLoginCode(channel: 'email' | 'phone', target: string, code: string) {
    const key = this.loginCodeStorageKey(channel, target);
    const stored = await this.readLoginCode(key);
    if (!stored || stored.hash !== this.loginCodeHash(channel, target, code)) {
      throw new BadRequestException('验证码错误或已过期');
    }
    await this.deleteLoginCode(key);
  }

  private wechatAppId() {
    return this.envValue(['AUTH_WECHAT_APP_ID', 'WECHAT_LOGIN_APP_ID']);
  }

  private wechatAppSecret() {
    return this.envValue(['AUTH_WECHAT_APP_SECRET', 'WECHAT_LOGIN_APP_SECRET']);
  }

  private wechatRedirectUri(fallback?: string) {
    return this.envValue(['AUTH_WECHAT_REDIRECT_URI', 'WECHAT_LOGIN_REDIRECT_URI'], String(fallback || '').trim());
  }

  private wechatStateKey(state: string) {
    return `login:wechat:state:${this.digestPart(state)}`;
  }

  private wechatStateSignature(nonce: string) {
    const secret = this.envValue(['AUTH_WECHAT_STATE_SECRET', 'WECHAT_LOGIN_STATE_SECRET'], this.config.get<string>('JWT_SECRET') || '');
    return createHmac('sha256', secret).update(nonce).digest('base64url').slice(0, 32);
  }

  private async storeWechatState(state: string, ttlSeconds: number) {
    const key = this.wechatStateKey(state);
    this.localWechatStates.set(key, Date.now() + ttlSeconds * 1000);
    await this.redis.set(key, '1', 'EX', ttlSeconds).catch(() => undefined);
  }

  private async consumeWechatState(state: string) {
    const [nonce, signature] = String(state || '').split('.');
    if (!nonce || !signature || !this.secureEquals(signature, this.wechatStateSignature(nonce))) return false;
    const key = this.wechatStateKey(state);
    this.pruneLocalLoginCodes();
    const valid = this.localWechatStates.has(key) || Boolean(await this.redis.get(key).catch(() => null));
    this.localWechatStates.delete(key);
    await this.redis.del(key).catch(() => undefined);
    return valid;
  }

  private wechatBindings() {
    const raw = this.envValue(['AUTH_WECHAT_LOGIN_BINDINGS', 'WECHAT_LOGIN_BINDINGS'], '{}');
    const result = new Map<string, string>();
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((item: any) => {
          const username = String(item?.username || '').trim();
          [item?.openid, item?.unionid].filter(Boolean).forEach((id) => result.set(String(id).trim(), username));
        });
      } else if (parsed && typeof parsed === 'object') {
        Object.entries(parsed).forEach(([id, username]) => result.set(String(id).trim(), String(username || '').trim()));
      }
    } catch {
      raw.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => {
        const separator = item.indexOf(':');
        if (separator > 0) result.set(item.slice(0, separator).trim(), item.slice(separator + 1).trim());
      });
    }
    return result;
  }

  async wechatQrCode(redirectUri?: string) {
    const config = this.loginChannelConfig();
    const appId = this.wechatAppId();
    const appSecret = this.wechatAppSecret();
    const callback = this.wechatRedirectUri(redirectUri);
    if (!config.wechatQr) throw new ForbiddenException('微信扫码登录未启用');
    if (!appId || !appSecret || !callback) throw new ForbiddenException('微信扫码登录配置不完整');

    const nonce = randomBytes(18).toString('base64url');
    const state = `${nonce}.${this.wechatStateSignature(nonce)}`;
    const ttlSeconds = 300;
    await this.storeWechatState(state, ttlSeconds);
    const params = new URLSearchParams({
      appid: appId,
      redirect_uri: callback,
      response_type: 'code',
      scope: 'snsapi_login',
      state,
    });
    const authorizeUrl = `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
    const qrSvg = await QRCode.toString(authorizeUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 260 });
    return {
      state,
      authorize_url: authorizeUrl,
      qr_svg: qrSvg,
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    };
  }

  private async exchangeWechatCode(code: string) {
    const query = new URLSearchParams({
      appid: this.wechatAppId(),
      secret: this.wechatAppSecret(),
      code,
      grant_type: 'authorization_code',
    });
    const tokenResponse = await fetch(`${WECHAT_ACCESS_TOKEN_URL}?${query.toString()}`);
    const tokenData: any = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || tokenData.errcode || !tokenData.openid) throw new UnauthorizedException('微信验证码校验失败');
    if (tokenData.unionid) return tokenData;
    const userQuery = new URLSearchParams({
      access_token: String(tokenData.access_token || ''),
      openid: String(tokenData.openid || ''),
      lang: 'zh_CN',
    });
    const userResponse = await fetch(`${WECHAT_USERINFO_URL}?${userQuery.toString()}`);
    const userData: any = await userResponse.json().catch(() => ({}));
    return { ...tokenData, ...(!userData.errcode ? userData : {}) };
  }

  private async adminFromWechatCode(code: string, state: string) {
    if (!this.loginChannelConfig().wechatQr) throw new ForbiddenException('微信扫码登录未启用');
    if (!await this.consumeWechatState(state)) throw new UnauthorizedException('微信扫码登录状态已失效，请刷新二维码');
    const identity = await this.exchangeWechatCode(code);
    const bindings = this.wechatBindings();
    const username = bindings.get(String(identity.unionid || '')) || bindings.get(String(identity.openid || ''));
    if (!username) throw new UnauthorizedException('当前微信账号未绑定后台账号');
    return this.findActiveAdminByChannel('username', username);
  }

  private async rolePermissions(adminId: number) {
    const userRoles = await this.prisma.userRole.findMany({ where: { user_id: adminId }, select: { role_id: true } });
    const roleIds = userRoles.map((item: any) => item.role_id);
    if (!roleIds.length) return { roleIds: [], roleCodes: [], permissionCodes: [] };

    const [roles, rolePermissions] = await Promise.all([
      this.prisma.role.findMany({ where: { id: { in: roleIds }, status: 1 }, select: { id: true, role_code: true, role_name: true } }),
      this.prisma.rolePermission.findMany({ where: { role_id: { in: roleIds } }, select: { permission_id: true } }),
    ]);
    const activeRoleIds = new Set(roles.map((item: any) => item.id));
    const permissionIds = Array.from(new Set(rolePermissions.map((item: any) => item.permission_id)));
    const permissions = permissionIds.length
      ? await this.prisma.permission.findMany({ where: { id: { in: permissionIds } }, select: { permission_code: true } })
      : [];
    return {
      roleIds: roleIds.filter((id: any) => activeRoleIds.has(id)),
      roleCodes: roles.map((item: any) => item.role_code),
      permissionCodes: permissions.map((item: any) => item.permission_code),
    };
  }

  private async effectivePermissions(admin: any) {
    const direct = parsePermissionArray(admin.permissions);
    if (Number(admin.role) === 1 || direct.includes('*')) return ['*'];
    const roleInfo = await this.rolePermissions(Number(admin.id));
    return Array.from(new Set([...direct, ...roleInfo.permissionCodes]));
  }

  private async visibleModules() {
    const row = await this.prisma.systemSetting.findUnique({
      where: { group_key_setting_key: { group_key: 'account_role_permission', setting_key: 'module_catalog' } },
      select: { setting_value: true },
    }).catch(() => null);
    return buildEnterpriseModules(row?.setting_value)
      .filter((item: any) => item.enabled !== false)
      .map((item: any) => ({
        module_key: item.module_key,
        module_name: item.module_name,
        route: item.route,
        icon: item.icon,
        sort: item.sort,
      }));
  }

  private async tokenPayload(admin: any): Promise<AuthUser> {
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      permissions: await this.effectivePermissions(admin),
    };
  }

  private authSessionIdleSeconds() {
    return Math.max(60, Number(this.config.get('AUTH_SESSION_IDLE_TIMEOUT_SECONDS', 604800)) || 604800);
  }

  private numericClaim(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
  }

  private assertSessionWindow(payload: Partial<AuthUser> & { iat?: number }) {
    const now = Math.floor(Date.now() / 1000);
    const sessionStartedAt = this.numericClaim(payload.sessionStartedAt) || this.numericClaim(payload.iat) || now;
    const lastActivityAt = this.numericClaim(payload.lastActivityAt) || this.numericClaim(payload.iat) || sessionStartedAt;
    if (now >= lastActivityAt + this.authSessionIdleSeconds()) {
      throw new UnauthorizedException('连续 7 天未操作，登录已失效');
    }
    return { sessionStartedAt, lastActivityAt };
  }

  private tokenTtlSeconds(token?: string) {
    if (!token) return 3600;
    const decoded = this.jwt.decode(token) as { exp?: number } | null;
    if (!decoded?.exp) return 3600;
    return Math.max(60, Math.min(decoded.exp - Math.floor(Date.now() / 1000), 86400 * 30));
  }

  async sign(payload: AuthUser, previousSession?: Partial<AuthUser> & { iat?: number }) {
    const now = Math.floor(Date.now() / 1000);
    const inheritedStart = this.numericClaim(previousSession?.sessionStartedAt) || this.numericClaim(previousSession?.iat);
    const sessionStartedAt = inheritedStart || now;
    const sessionPayload: AuthUser = {
      ...payload,
      sessionStartedAt,
      lastActivityAt: now,
    };
    const options: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '24h') as StringValue,
    };
    const token = await this.jwt.signAsync(sessionPayload, options);

    const refreshOptions: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as StringValue,
    };
    const refreshToken = await this.jwt.signAsync(sessionPayload, refreshOptions);
    return {
      token,
      refreshToken,
      session: {
        idle_timeout_seconds: this.authSessionIdleSeconds(),
        idle_expires_at: new Date((now + this.authSessionIdleSeconds()) * 1000).toISOString(),
      },
    };
  }

  private async completeLogin(admin: any, identity: string, meta: LoginMeta, reason?: string) {
    if (!admin || admin.status !== 1) {
      await this.recordFailedLogin(identity, meta.ip);
      await this.writeLoginLog({ username: identity, ip: meta.ip, userAgent: meta.userAgent, success: false, reason: reason || '账号不存在、重复或被禁用' });
      await this.slowDownFailedLogin();
      throw new BadRequestException(GENERIC_LOGIN_ERROR);
    }
    await this.clearFailedLogin(identity, meta.ip);
    await this.prisma.admin.update({ where: { id: admin.id }, data: { last_login_at: new Date() } });
    await this.writeLoginLog({ admin, ip: meta.ip, userAgent: meta.userAgent, success: true, reason });
    const payload = await this.tokenPayload(admin);
    const roleInfo = await this.rolePermissions(admin.id);
    const tokens = await this.sign(payload);
    return { ...tokens, admin: publicAdmin(admin, payload.permissions, { role_ids: roleInfo.roleIds, role_codes: roleInfo.roleCodes, modules: await this.visibleModules() }) };
  }

  async login(dto: LoginDto, meta: LoginMeta) {
    const channel = dto.channel || 'password';
    const identity = channel === 'password'
      ? String(dto.account || dto.username || '').trim()
      : channel === 'email_code'
        ? this.normalizeEmail(dto.email)
        : channel === 'phone_code'
          ? this.normalizePhone(dto.phone)
          : `wechat:${String(dto.state || '').slice(0, 32)}`;

    if (!identity) throw new BadRequestException('登录账号不能为空');
    await this.assertLoginNotLocked(identity, meta.ip);
    await this.assertLoginEntryAllowed({
      username: identity,
      ip: meta.ip,
      userAgent: meta.userAgent,
      loginEntry: meta.loginEntry,
      origin: meta.origin,
      forwardedHost: meta.forwardedHost,
      host: meta.host,
    });

    if (channel === 'password') {
      const password = String(dto.password || '');
      if (!password) throw new BadRequestException('密码不能为空');
      const accountType = this.classifyPasswordAccount(identity);
      const config = this.loginChannelConfig();
      const enabled = accountType === 'username'
        ? config.usernamePassword
        : accountType === 'email'
          ? config.emailPassword
          : config.phonePassword;
      if (!enabled) throw new ForbiddenException('该账号类型的密码登录未启用');
      const normalizedIdentity = accountType === 'email'
        ? this.normalizeEmail(identity)
        : accountType === 'phone'
          ? this.normalizePhone(identity)
          : identity;
      const admin = await this.findActiveAdminByChannel(accountType, normalizedIdentity);
      if (!admin || !await this.passwords.verify(admin.password_hash, password)) {
        await this.recordFailedLogin(identity, meta.ip);
        await this.writeLoginLog({ admin: admin || undefined, username: identity, ip: meta.ip, userAgent: meta.userAgent, success: false, reason: admin ? '密码错误' : '账号不存在、重复或被禁用' });
        await this.slowDownFailedLogin();
        throw new BadRequestException(GENERIC_LOGIN_ERROR);
      }
      return this.completeLogin(admin, identity, meta, `${accountType} 密码登录`);
    }

    if (channel === 'email_code' || channel === 'phone_code') {
      const codeChannel = channel === 'email_code' ? 'email' : 'phone';
      const config = this.loginChannelConfig();
      if ((codeChannel === 'email' && !config.emailCode) || (codeChannel === 'phone' && !config.phoneCode)) {
        throw new ForbiddenException('该验证码登录渠道未启用');
      }
      const code = String(dto.code || '').trim();
      if (!code) throw new BadRequestException('验证码不能为空');
      const admin = await this.findActiveAdminByChannel(codeChannel, identity);
      try {
        await this.assertValidLoginCode(codeChannel, identity, code);
      } catch (error) {
        await this.recordFailedLogin(identity, meta.ip);
        await this.writeLoginLog({ admin: admin || undefined, username: identity, ip: meta.ip, userAgent: meta.userAgent, success: false, reason: '登录验证码错误或已过期' });
        throw error;
      }
      return this.completeLogin(admin, identity, meta, `${codeChannel} 验证码登录`);
    }

    if (channel === 'wechat_qr') {
      const code = String(dto.wechatCode || dto.code || '').trim();
      const state = String(dto.state || '').trim();
      if (!code || !state) throw new BadRequestException('微信验证码或登录状态缺失');
      const admin = await this.adminFromWechatCode(code, state);
      return this.completeLogin(admin, identity, meta, '微信扫码登录');
    }

    throw new BadRequestException('登录渠道不支持');
  }

  private tokenBlacklistKey(token: string) {
    const digest = createHash('sha256').update(token).digest('hex');
    return `token:blacklist:${digest}`;
  }

  private async blacklistToken(token?: string) {
    if (!token || token.split('.').length !== 3) return;
    await this.redis.set(this.tokenBlacklistKey(token), '1', 'EX', this.tokenTtlSeconds(token)).catch(() => undefined);
  }

  private async isTokenBlacklisted(token?: string) {
    if (!token) return false;
    return Boolean(await this.redis.get(this.tokenBlacklistKey(token)).catch(() => null));
  }

  async logout(token?: string, refreshToken?: string) {
    await Promise.all([this.blacklistToken(token), this.blacklistToken(refreshToken)]);
    return null;
  }

  async refresh(refreshToken: string) {
    try {
      if (!refreshToken || await this.isTokenBlacklisted(refreshToken)) throw new UnauthorizedException('刷新 token 已失效');
      const payload = await this.jwt.verifyAsync<AuthUser & { iat?: number }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      this.assertSessionWindow(payload);
      const admin = await this.prisma.admin.findUnique({ where: { id: Number(payload.id) } });
      if (!admin || admin.status !== 1) throw new UnauthorizedException('账号不存在或已禁用');
      return this.sign(await this.tokenPayload(admin), payload);
    } catch {
      throw new UnauthorizedException('刷新 token 失败');
    }
  }

  async profile(userId: number) {
    const admin = await this.prisma.admin.findUnique({ where: { id: userId } });
    if (!admin) throw new UnauthorizedException('账号不存在');
    const payload = await this.tokenPayload(admin);
    const roleInfo = await this.rolePermissions(admin.id);
    return publicAdmin(admin, payload.permissions, { role_ids: roleInfo.roleIds, role_codes: roleInfo.roleCodes, modules: await this.visibleModules() });
  }

  async updateProfile(userId: number, data: Record<string, any>) {
    const admin = await this.prisma.admin.update({
      where: { id: userId },
      data: {
        real_name: data.real_name,
        email: data.email,
        phone: data.phone,
        avatar: data.avatar,
      },
    });
    const payload = await this.tokenPayload(admin);
    const roleInfo = await this.rolePermissions(admin.id);
    return publicAdmin(admin, payload.permissions, { role_ids: roleInfo.roleIds, role_codes: roleInfo.roleCodes, modules: await this.visibleModules() });
  }

  async changePassword(userId: number, oldPassword: string, newPassword: string) {
    const admin = await this.prisma.admin.findUnique({ where: { id: userId } });
    if (!admin) throw new UnauthorizedException('账号不存在');
    const ok = await this.passwords.verify(admin.password_hash, oldPassword);
    if (!ok) throw new BadRequestException('旧密码错误');
    await this.prisma.admin.update({
      where: { id: userId },
      data: { password_hash: await this.passwords.hash(newPassword) },
    });
    return null;
  }
}
