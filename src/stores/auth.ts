import { defineStore } from 'pinia';
import { authApi, type AdminUser, type AuthLoginRequest } from '@/api/auth';
import {
  AUTH_SESSION_IDLE_MS,
  clearAuthSnapshot,
  getAuthSnapshot,
  getJwtPayload,
  isAuthSessionActive,
  isJwtExpired,
  isJwtLike,
  setAuthSnapshot,
  trimText,
} from '@/utils/security';

interface AuthState {
  token: string;
  refreshToken: string;
  admin: AdminUser | null;
  sessionStartedAt: number;
  lastActivityAt: number;
}

let refreshInFlight: Promise<boolean> | null = null;
let sessionMonitorInstalled = false;
let sessionMonitorTimer = 0;
let lastActivityWriteAt = 0;

function normalizeModuleKey(moduleOrPermission?: string) {
  if (!moduleOrPermission) return '';
  const raw = String(moduleOrPermission).split(':')[0];
  const aliases: Record<string, string> = {
    admin: 'system', log: 'system', upload: 'system', export: 'system', codes: 'code', products: 'product',
    shipments: 'shipment', returns: 'return', agents: 'agent', productRegions: 'product-region',
  };
  return aliases[raw] || raw;
}

function initialState(): AuthState {
  const snapshot = getAuthSnapshot<AdminUser>();
  return {
    token: snapshot.token,
    refreshToken: snapshot.refreshToken,
    admin: snapshot.admin,
    sessionStartedAt: snapshot.sessionStartedAt,
    lastActivityAt: snapshot.lastActivityAt,
  };
}

function claimSeconds(token: string, key: string) {
  const value = Number(getJwtPayload(token)?.[key]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function shouldRenewToken(token: string) {
  if (!isJwtLike(token) || isJwtExpired(token, 90)) return true;
  const now = Math.floor(Date.now() / 1000);
  const lastActivity = claimSeconds(token, 'lastActivityAt') || claimSeconds(token, 'iat') || now;
  // Keep the server-side sliding activity claim within a short window of real interaction, without refreshing on every click.
  return now - lastActivity >= 15 * 60;
}

function emitSessionExpired() {
  window.dispatchEvent(new CustomEvent('auth:expired'));
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => initialState(),
  getters: {
    isLogin: (state) => isAuthSessionActive(state),
    isSuperAdmin: (state) => state.admin?.role === 1 || Boolean(state.admin?.permissions?.includes('*')),
    isModuleEnabled: (state) => (moduleOrPermission?: string) => {
      if (!moduleOrPermission) return true;
      if (state.admin?.role === 1 || state.admin?.permissions?.includes('*')) return true;
      const modules = state.admin?.modules || [];
      const moduleKey = normalizeModuleKey(moduleOrPermission);
      if (!modules.length) return true;
      return modules.some((item) => item.module_key === moduleKey);
    },
    hasPermission: (state) => (permission?: string | string[]) => {
      const permissions = state.admin?.permissions || [];
      if (state.admin?.role === 1 || permissions.includes('*')) return true;
      if (!permission) return true;
      const required = Array.isArray(permission) ? permission : [permission];
      return required.every((item) => permissions.includes(item));
    },
    canAccess: (state) => (meta?: Record<string, any>) => {
      const permissions = state.admin?.permissions || [];
      if (state.admin?.role === 1 || permissions.includes('*')) return true;
      if (meta?.superOnly) return false;
      const required = meta?.permission;
      if (required) {
        const list = Array.isArray(required) ? required : [required];
        if (!list.every((item) => permissions.includes(item))) return false;
      }
      const firstPermission = Array.isArray(required) ? required[0] : required;
      const modules = state.admin?.modules || [];
      if (firstPermission && modules.length) {
        const moduleKey = normalizeModuleKey(String(meta?.module || firstPermission));
        if (!modules.some((item) => item.module_key === moduleKey)) return false;
      }
      return true;
    },
  },
  actions: {
    hydrate() {
      const snapshot = getAuthSnapshot<AdminUser>();
      this.token = snapshot.token;
      this.refreshToken = snapshot.refreshToken;
      this.admin = snapshot.admin;
      this.sessionStartedAt = snapshot.sessionStartedAt;
      this.lastActivityAt = snapshot.lastActivityAt;
    },
    setAuth(token: string, refreshToken: string, admin?: AdminUser) {
      if (!isJwtLike(token) || !isJwtLike(refreshToken)) {
        this.clearAuth();
        throw new Error('登录凭证无效');
      }
      const current = getAuthSnapshot<AdminUser>();
      const sessionStartedAt = claimSeconds(token, 'sessionStartedAt') * 1000 || current.sessionStartedAt || Date.now();
      const lastActivityAt = claimSeconds(token, 'lastActivityAt') * 1000 || Date.now();
      this.token = token;
      this.refreshToken = refreshToken;
      if (admin) this.admin = admin;
      this.sessionStartedAt = sessionStartedAt;
      this.lastActivityAt = lastActivityAt;
      setAuthSnapshot(token, refreshToken, this.admin, { sessionStartedAt, lastActivityAt });
    },
    clearAuth() {
      this.token = '';
      this.refreshToken = '';
      this.admin = null;
      this.sessionStartedAt = 0;
      this.lastActivityAt = 0;
      clearAuthSnapshot();
    },
    async refreshSession(force = false) {
      if (refreshInFlight) return refreshInFlight;
      if (!isAuthSessionActive(this)) {
        this.clearAuth();
        return false;
      }
      if (!force && !shouldRenewToken(this.token)) return true;
      refreshInFlight = (async () => {
        try {
          const data = await authApi.refresh(this.refreshToken);
          this.setAuth(data.token, data.refreshToken, this.admin || undefined);
          return true;
        } catch {
          this.clearAuth();
          emitSessionExpired();
          return false;
        } finally {
          refreshInFlight = null;
        }
      })();
      return refreshInFlight;
    },
    async ensureSession() {
      if (!isAuthSessionActive(this)) {
        this.clearAuth();
        return false;
      }
      return this.refreshSession(false);
    },
    async recordActivity() {
      if (!this.isLogin) return false;
      const now = Date.now();
      if (now - lastActivityWriteAt >= 30_000) {
        lastActivityWriteAt = now;
        this.lastActivityAt = now;
        setAuthSnapshot(this.token, this.refreshToken, this.admin, {
          sessionStartedAt: this.sessionStartedAt,
          lastActivityAt: now,
        });
      }
      return this.refreshSession(false);
    },
    startSessionMonitor() {
      if (sessionMonitorInstalled) return;
      sessionMonitorInstalled = true;
      const touch = () => { void this.recordActivity(); };
      ['pointerdown', 'keydown', 'touchstart', 'focus'].forEach((eventName) => window.addEventListener(eventName, touch, { passive: true }));
      document.addEventListener('visibilitychange', () => { if (!document.hidden) touch(); });
      window.addEventListener('storage', (event) => {
        if (["trace_admin_token", "trace_admin_refresh_token", "trace_admin_session_started_at", "trace_admin_last_activity_at"].includes(event.key || '')) this.hydrate();
      });
      sessionMonitorTimer = window.setInterval(() => {
        this.hydrate();
        if (!this.isLogin) {
          this.clearAuth();
          emitSessionExpired();
          return;
        }
        // An open dashboard with periodic user activity should never silently cross the idle boundary.
        if (Date.now() - this.lastActivityAt >= AUTH_SESSION_IDLE_MS) {
          this.clearAuth();
          emitSessionExpired();
        }
      }, 60_000);
      void sessionMonitorTimer;
    },
    async login(username: string, password: string) {
      const data = await authApi.login({ username: trimText(username, 64), password: String(password || '') });
      this.setAuth(data.token, data.refreshToken, data.admin);
    },
    async loginWith(data: AuthLoginRequest) {
      const payload: AuthLoginRequest = data.channel === 'password'
        ? { channel: 'password', account: trimText(data.account, 128), password: String(data.password || '') }
        : data.channel === 'email_code'
          ? { channel: 'email_code', email: trimText(data.email, 128), code: trimText(data.code, 8) }
          : data.channel === 'phone_code'
            ? { channel: 'phone_code', phone: trimText(data.phone, 32), code: trimText(data.code, 8) }
            : { channel: 'wechat_qr', wechatCode: trimText(data.wechatCode, 256), state: trimText(data.state, 256) };
      const result = await authApi.login(payload);
      this.setAuth(result.token, result.refreshToken, result.admin);
    },
    async loadProfile(silent = false) {
      const admin = await authApi.profile({ silent });
      this.admin = admin;
      if (this.token) setAuthSnapshot(this.token, this.refreshToken, admin, {
        sessionStartedAt: this.sessionStartedAt,
        lastActivityAt: this.lastActivityAt,
      });
      return admin;
    },
    async logout() {
      const refreshToken = this.refreshToken;
      try { await authApi.logout(refreshToken); } finally { this.clearAuth(); }
    },
  },
});
