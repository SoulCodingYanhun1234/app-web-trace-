export interface AuthSnapshot<T = any> {
  token: string;
  refreshToken: string;
  admin: T | null;
  sessionStartedAt: number;
  lastActivityAt: number;
}

const ACCESS_TOKEN_KEY = 'trace_admin_token';
const REFRESH_TOKEN_KEY = 'trace_admin_refresh_token';
const ADMIN_KEY = 'trace_admin_admin';
const SESSION_STARTED_AT_KEY = 'trace_admin_session_started_at';
const LAST_ACTIVITY_AT_KEY = 'trace_admin_last_activity_at';
const LEGACY_KEYS = ['token', 'refreshToken', 'admin'];

const LOGIN_GATE_KEY = 'trace_admin_login_gate_until';
const LOGIN_ENTRY_KEY = 'trace_admin_login_entry';
const LOGIN_GATE_TTL_MS = 5 * 60 * 1000;
const LOGIN_ENTRY_QUERY_KEYS = ['entry', 'loginEntry', 'k'];

export const AUTH_SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

function hostnameSet(value: unknown, fallback: string[]) {
  const configured = String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return new Set(configured.length ? configured : fallback);
}

const DIRECT_LOGIN_HOSTS = hostnameSet(import.meta.env.VITE_ADMIN_DIRECT_LOGIN_HOSTS, [
  'workpanel.0office.top',
  'localhost',
  '127.0.0.1',
]);

const ENTRY_REQUIRED_LOGIN_HOSTS = hostnameSet(import.meta.env.VITE_ADMIN_ENTRY_REQUIRED_HOSTS, [
  'qr.0office.top',
]);

export function currentHostname() {
  return String(window.location.hostname || '').trim().toLowerCase();
}

export function isLoginEntryRequiredForCurrentHost(hostname = currentHostname()) {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (DIRECT_LOGIN_HOSTS.has(normalized)) return false;
  if (ENTRY_REQUIRED_LOGIN_HOSTS.has(normalized)) return true;
  // 未明确列入直达白名单的生产域名继续采用入口保护，避免新增域名意外暴露登录页。
  return import.meta.env.PROD;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return decodeURIComponent(
    atob(padded)
      .split('')
      .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join(''),
  );
}

export function getJwtPayload(token?: string): Record<string, any> | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try { return JSON.parse(decodeBase64Url(parts[1])); } catch { return null; }
}

export function isJwtLike(token?: string) {
  return Boolean(token && token.split('.').length === 3);
}

export function isJwtExpired(token?: string, skewSeconds = 30) {
  if (!token) return true;
  const payload = getJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number') return true;
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000;
}

function epochMs(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  // JWT claims use seconds while browser storage uses milliseconds.
  return numeric < 100_000_000_000 ? Math.floor(numeric * 1000) : Math.floor(numeric);
}

function claimEpochMs(token: string, key: string) {
  return epochMs(getJwtPayload(token)?.[key]);
}

function firstQueryValue(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function extractLoginEntryFromQuery(query: Record<string, unknown> = {}) {
  for (const key of LOGIN_ENTRY_QUERY_KEYS) {
    const value = firstQueryValue(query[key]);
    if (value) return value.slice(0, 128);
  }
  return '';
}

export function openLoginGate(entry?: string) {
  sessionStorage.setItem(LOGIN_GATE_KEY, String(Date.now() + LOGIN_GATE_TTL_MS));
  const normalizedEntry = String(entry || '').trim().slice(0, 128);
  if (normalizedEntry) sessionStorage.setItem(LOGIN_ENTRY_KEY, normalizedEntry);
}

export function hasValidLoginGate() {
  const until = Number(sessionStorage.getItem(LOGIN_GATE_KEY) || 0);
  if (!Number.isFinite(until) || until <= Date.now()) {
    clearLoginGate();
    return false;
  }
  return true;
}

export function getLoginEntrySecret() {
  return hasValidLoginGate() ? (sessionStorage.getItem(LOGIN_ENTRY_KEY) || '') : '';
}

export function clearLoginGate() {
  sessionStorage.removeItem(LOGIN_GATE_KEY);
  sessionStorage.removeItem(LOGIN_ENTRY_KEY);
}

function sessionMeta(token: string, refreshToken: string, fallback?: Partial<AuthSnapshot>) {
  const now = Date.now();
  const sessionStartedAt = epochMs(fallback?.sessionStartedAt)
    || claimEpochMs(token, 'sessionStartedAt')
    || claimEpochMs(refreshToken, 'sessionStartedAt')
    || claimEpochMs(token, 'iat')
    || claimEpochMs(refreshToken, 'iat')
    || now;
  const lastActivityAt = epochMs(fallback?.lastActivityAt)
    || claimEpochMs(token, 'lastActivityAt')
    || claimEpochMs(refreshToken, 'lastActivityAt')
    || sessionStartedAt;
  return { sessionStartedAt, lastActivityAt };
}

export function isAuthSessionActive(snapshot: Partial<AuthSnapshot>) {
  if (!snapshot.refreshToken || !isJwtLike(snapshot.refreshToken) || isJwtExpired(snapshot.refreshToken, 0)) return false;
  const { lastActivityAt } = sessionMeta(snapshot.token || '', snapshot.refreshToken, snapshot);
  const now = Date.now();
  return now < lastActivityAt + AUTH_SESSION_IDLE_MS;
}

function legacySnapshot<T = any>(): AuthSnapshot<T> {
  const sessionToken = sessionStorage.getItem(ACCESS_TOKEN_KEY) || '';
  const sessionRefreshToken = sessionStorage.getItem(REFRESH_TOKEN_KEY) || '';
  const sessionAdmin = safeJsonParse<T | null>(sessionStorage.getItem(ADMIN_KEY), null);
  if (sessionToken || sessionRefreshToken) {
    return {
      token: sessionToken,
      refreshToken: sessionRefreshToken,
      admin: sessionAdmin,
      sessionStartedAt: epochMs(sessionStorage.getItem(SESSION_STARTED_AT_KEY)),
      lastActivityAt: epochMs(sessionStorage.getItem(LAST_ACTIVITY_AT_KEY)),
    };
  }
  return {
    token: localStorage.getItem('token') || '',
    refreshToken: localStorage.getItem('refreshToken') || '',
    admin: safeJsonParse<T | null>(localStorage.getItem('admin'), null),
    sessionStartedAt: 0,
    lastActivityAt: 0,
  };
}

export function getAuthSnapshot<T = any>(): AuthSnapshot<T> {
  let snapshot: AuthSnapshot<T> = {
    token: localStorage.getItem(ACCESS_TOKEN_KEY) || '',
    refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || '',
    admin: safeJsonParse<T | null>(localStorage.getItem(ADMIN_KEY), null),
    sessionStartedAt: epochMs(localStorage.getItem(SESSION_STARTED_AT_KEY)),
    lastActivityAt: epochMs(localStorage.getItem(LAST_ACTIVITY_AT_KEY)),
  };

  // Migrate old per-tab/session storage once so the same authenticated session is shared by all pages/tabs.
  if (!snapshot.token && !snapshot.refreshToken) {
    snapshot = legacySnapshot<T>();
    if (snapshot.token || snapshot.refreshToken) setAuthSnapshot(snapshot.token, snapshot.refreshToken, snapshot.admin, snapshot);
  }

  snapshot = { ...snapshot, ...sessionMeta(snapshot.token, snapshot.refreshToken, snapshot) };
  if (!isAuthSessionActive(snapshot)) {
    clearAuthSnapshot();
    return { token: '', refreshToken: '', admin: null, sessionStartedAt: 0, lastActivityAt: 0 };
  }
  return snapshot;
}

export function setAuthSnapshot<T = any>(token: string, refreshToken: string, admin?: T | null, meta?: Partial<AuthSnapshot>) {
  const normalized = sessionMeta(token, refreshToken, meta);
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken || '');
  localStorage.setItem(SESSION_STARTED_AT_KEY, String(normalized.sessionStartedAt));
  localStorage.setItem(LAST_ACTIVITY_AT_KEY, String(normalized.lastActivityAt));
  if (admin !== undefined) localStorage.setItem(ADMIN_KEY, JSON.stringify(admin));
  [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, ADMIN_KEY, SESSION_STARTED_AT_KEY, LAST_ACTIVITY_AT_KEY].forEach((key) => sessionStorage.removeItem(key));
  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function clearAuthSnapshot() {
  [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, ADMIN_KEY, SESSION_STARTED_AT_KEY, LAST_ACTIVITY_AT_KEY].forEach((key) => {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
  });
  LEGACY_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function getAccessToken() {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY) || '';
  return isJwtLike(token) && !isJwtExpired(token) ? token : '';
}

export function safeRedirectPath(value: unknown, fallback = '/dashboard') {
  const path = Array.isArray(value) ? value[0] : value;
  if (typeof path !== 'string') return fallback;
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) return fallback;
  const normalized = path.split('#')[0].split('?')[0].replace(/\/+$/, '') || '/';
  if (['/login', '/verify', '/v'].includes(normalized)) return fallback;
  return path;
}

export function trimText(value: string, maxLength = 200) {
  return String(value || '').trim().slice(0, maxLength);
}

let debugGuardInstalled = false;
let contextMenuHandler: ((event: MouseEvent) => void) | null = null;
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
let shortcutNoticeTimer = 0;

// P0 可用性优先：默认只启用快捷键/右键拦截。
// 破坏式开发者工具检测容易在 Edge/Chrome 浏览器工具栏、缩放、远程桌面、移动端 WebView 中误判白屏，
// 并且 secure-build 的 debugProtection 会在打开控制台时反复 debugger。
// 因此登录、初始化、防伪查询等入口必须彻底放行；真正安全以后端鉴权、权限、限流和日志为准。
const DEBUG_GUARD_BYPASS_PATHS = ['/login', '/setup', '/verify', '/v', '/query', '/error'];

function normalizeRoutePath(value: string) {
  const withoutQuery = String(value || '').split('?')[0].split('#')[0];
  if (!withoutQuery) return '/';
  const withSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return withSlash.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function currentRouteCandidates() {
  const pathname = normalizeRoutePath(window.location.pathname);
  const hashPath = window.location.hash.startsWith('#')
    ? normalizeRoutePath(window.location.hash.slice(1))
    : '';

  // 兼容子目录部署，例如 /admin/login、/trace-admin/query。
  const tailPaths = pathname.split('/').map((_, index, parts) => `/${parts.slice(index + 1).join('/')}`).filter((v) => v !== '/');

  return Array.from(new Set([pathname, hashPath, ...tailPaths].filter(Boolean)));
}

function pathMatchesDebugGuardBypass(path: string, base: string) {
  return path === base || path.startsWith(`${base}/`) || path.endsWith(base) || path.includes(`${base}/`);
}

function shouldBypassDebugGuardForCurrentPage(): boolean {
  return currentRouteCandidates().some((path) => (
    DEBUG_GUARD_BYPASS_PATHS.some((base) => pathMatchesDebugGuardBypass(path, base))
  ));
}

function shouldBlockDebugShortcuts(): boolean {
  return import.meta.env.PROD
    && import.meta.env.VITE_ALLOW_DEVTOOLS !== 'true'
    && !shouldBypassDebugGuardForCurrentPage();
}

function shouldEnableDevtoolsDetection(): boolean {
  // 兼容旧环境变量，但默认绝不启用破坏式检测。
  return import.meta.env.PROD
    && import.meta.env.VITE_ENABLE_DEVTOOLS_DETECTION === 'true'
    && import.meta.env.VITE_ALLOW_DEVTOOLS !== 'true'
    && !shouldBypassDebugGuardForCurrentPage();
}

function isEditableElement(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest?.('input, textarea, select, [contenteditable="true"], .allow-context-menu'));
}

function emitShortcutNotice() {
  const now = Date.now();
  if (now - shortcutNoticeTimer < 1200) return;
  shortcutNoticeTimer = now;
  window.dispatchEvent(new CustomEvent('admin:debug-shortcut-blocked'));
}

function blockBrowserDebugShortcut(event: KeyboardEvent) {
  if (!shouldBlockDebugShortcuts()) return;

  const key = event.key.toLowerCase();
  const blocked = event.key === 'F12'
    || event.code === 'F12'
    || (event.ctrlKey && event.shiftKey && ['i', 'j', 'c', 'k'].includes(key))
    || (event.metaKey && event.altKey && ['i', 'j', 'c', 'k'].includes(key))
    || (event.ctrlKey && ['u', 's'].includes(key))
    || (event.metaKey && ['u', 's'].includes(key));
  if (!blocked) return;

  event.preventDefault();
  event.stopImmediatePropagation?.();
  event.stopPropagation();
  emitShortcutNotice();
}

export function installProductionDebugGuard() {
  // 前端只能降低随意查看与误操作成本，不是安全边界；真正安全仍以后端鉴权、权限和日志为准。
  if (debugGuardInstalled || !shouldBlockDebugShortcuts()) return;
  debugGuardInstalled = true;

  keydownHandler = blockBrowserDebugShortcut;
  contextMenuHandler = (event: MouseEvent) => {
    if (!shouldBlockDebugShortcuts() || isEditableElement(event.target)) return;
    event.preventDefault();
  };

  document.addEventListener('keydown', keydownHandler, true);
  window.addEventListener('keydown', keydownHandler, true);
  document.addEventListener('contextmenu', contextMenuHandler, true);
}

export function uninstallDebugGuard() {
  if (keydownHandler) {
    document.removeEventListener('keydown', keydownHandler, true);
    window.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
  if (contextMenuHandler) {
    document.removeEventListener('contextmenu', contextMenuHandler, true);
    contextMenuHandler = null;
  }
  debugGuardInstalled = false;
  shortcutNoticeTimer = 0;
}

let devtoolsProbeTimer = 0;
let suspiciousCount = 0;

function isSafePageForBootstrap() {
  return shouldBypassDebugGuardForCurrentPage();
}

function engageDebugLock(reason = '检测到调试环境') {
  // 不再触发 debugger，也不再写入白色空页面。
  // 如果未来显式开启 DevTools 检测，只清理登录态并给出可见提示，避免生产现场无法排障。
  try { clearAuthSnapshot(); } catch {}
  try { sessionStorage.clear(); } catch {}
  try { localStorage.removeItem('trace_admin_admin'); } catch {}
  console.warn(reason);
}

function detectDevtoolsOpen() {
  if (!shouldEnableDevtoolsDetection() || isSafePageForBootstrap()) return;

  // 宽高检测只作为弱信号。浏览器收藏栏、侧边栏、系统缩放都可能造成 outer/inner 差值较大，
  // 必须连续多次命中且页面已经登录后才触发。
  const threshold = 260;
  const widthGap = Math.abs(window.outerWidth - window.innerWidth);
  const heightGap = Math.abs(window.outerHeight - window.innerHeight);
  const suspicious = widthGap > threshold || heightGap > threshold;
  suspiciousCount = suspicious ? suspiciousCount + 1 : 0;
  if (suspiciousCount >= 5) engageDebugLock();
}

export function installDevtoolsDetection() {
  if (!shouldEnableDevtoolsDetection() || devtoolsProbeTimer) return;
  window.setTimeout(() => { detectDevtoolsOpen(); }, 5000);
  devtoolsProbeTimer = window.setInterval(detectDevtoolsOpen, 3000);
  window.addEventListener('resize', detectDevtoolsOpen, true);
  window.addEventListener('focus', detectDevtoolsOpen, true);
}
