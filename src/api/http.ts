import axios, { AxiosError, type AxiosRequestConfig } from 'axios';
import { ElMessage as Message } from 'element-plus';
import { getActivePinia } from 'pinia';
import router from '@/router';
import { useAuthStore } from '@/stores/auth';
import { cleanObject } from '@/utils/format';
import { stableStringify } from '@/utils/performance';
import { getAccessToken, getJwtPayload, isJwtExpired } from '@/utils/security';

export interface ApiResponse<T = any> {
  code: number;
  message?: string;
  data: T;
  timestamp?: number;
}

export interface PageResult<T = any> {
  list: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type FastRequestConfig = AxiosRequestConfig & {
  cacheTtl?: number;
  skipDedup?: boolean;
  silent?: boolean;
  skipAuthRefresh?: boolean;
  skipAuthRedirect?: boolean;
  silentStatuses?: number[];
};

export const apiBaseURL = import.meta.env.VITE_API_BASE_URL || '/api';

const service = axios.create({
  baseURL: apiBaseURL,
  timeout: 30000,
  withCredentials: false,
  headers: {
    Accept: 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

const pendingGetMap = new Map<string, Promise<any>>();
const responseCache = new Map<string, { expire: number; value: any }>();
const RESPONSE_CACHE_MAX_ENTRIES = 300;
let responseCacheEpoch = 0;

function authCacheScope() {
  const token = getAccessToken();
  if (!token) return 'public';
  const payload = getJwtPayload(token);
  const identity = payload?.id ?? payload?.sub ?? payload?.username ?? 'authenticated';
  const session = payload?.sessionStartedAt ?? payload?.iat ?? 'session';
  return `${String(identity)}:${String(session)}`;
}

function makeGetKey(url: string, params: any, config: FastRequestConfig) {
  return stableStringify({
    method: 'GET',
    url,
    params: cleanObject(params || {}),
    responseType: config.responseType || 'json',
    auth: authCacheScope(),
  });
}

function makePendingKey(responseKey: string, config: FastRequestConfig) {
  return stableStringify({
    responseKey,
    timeout: config.timeout ?? 30_000,
    silent: Boolean(config.silent),
    skipAuthRefresh: Boolean(config.skipAuthRefresh),
    skipAuthRedirect: Boolean(config.skipAuthRedirect),
    silentStatuses: [...(config.silentStatuses || [])].sort((a, b) => a - b),
  });
}

function pruneResponseCache(now = Date.now()) {
  for (const [key, entry] of responseCache) {
    if (entry.expire <= now) responseCache.delete(key);
  }
  while (responseCache.size > RESPONSE_CACHE_MAX_ENTRIES) {
    const oldestKey = responseCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    responseCache.delete(oldestKey);
  }
}

function readResponseCache(key: string, now: number) {
  const cached = responseCache.get(key);
  if (!cached) return undefined;
  if (cached.expire <= now) {
    responseCache.delete(key);
    return undefined;
  }
  // Map insertion order gives us a compact LRU without another bookkeeping structure.
  responseCache.delete(key);
  responseCache.set(key, cached);
  return cached;
}

function writeResponseCache(key: string, value: any, ttl: number) {
  const now = Date.now();
  pruneResponseCache(now);
  responseCache.delete(key);
  responseCache.set(key, { expire: now + ttl, value });
  pruneResponseCache(now);
}

export function clearRequestCache() {
  responseCache.clear();
  pendingGetMap.clear();
  // A GET started before a successful mutation must not repopulate stale data afterwards.
  responseCacheEpoch += 1;
}

let lastAuthRedirectAt = 0;

function redirectVerify(message = '登录已失效，请重新验证身份') {
  const auth = useAuthStore();
  auth.clearAuth();
  const currentPath = router.currentRoute.value.path;
  if (currentPath !== '/login' && !currentPath.startsWith('/error/')) {
    router.replace({ path: '/login', query: { redirect: currentPath } });
  }
  const now = Date.now();
  if (now - lastAuthRedirectAt > 1500) {
    lastAuthRedirectAt = now;
    Message.warning(message);
  }
}

service.interceptors.request.use(async (config) => {
  const requestConfig = config as FastRequestConfig;
  const activePinia = getActivePinia();
  const auth = activePinia ? useAuthStore(activePinia) : null;
  // A valid seven-day session may have an expired 24-hour access token. Refresh it before protected calls
  // instead of forcing the user to log in again on every page/browser restart.
  if (auth?.refreshToken && !requestConfig.skipAuthRefresh) await auth.ensureSession();
  const token = getAccessToken();
  if (token) {
    if (isJwtExpired(token)) {
      if (!requestConfig.skipAuthRedirect) redirectVerify();
      return Promise.reject(new Error('登录凭证已过期'));
    }
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.params = cleanObject(config.params || {});
  if (config.data && !(config.data instanceof FormData)) config.data = cleanObject(config.data);
  return config;
});

function formatErrorMessage(value: any) {
  if (Array.isArray(value)) return value.join('；');
  if (value && typeof value === 'object') return value.message || value.error || JSON.stringify(value);
  return value || '请求失败';
}

service.interceptors.response.use(
  (response) => {
    const payload = response.data;
    if (response.config.responseType === 'blob') return payload;
    if (payload && typeof payload.code !== 'undefined' && payload.code !== 200) {
      if (payload.code === 401) redirectVerify();
      if (!(response.config as FastRequestConfig).silent) Message.error(formatErrorMessage(payload.message));
      return Promise.reject(payload);
    }
    if (payload && typeof payload.success !== 'undefined' && payload.success === false) {
      if (!(response.config as FastRequestConfig).silent) Message.error(formatErrorMessage(payload.message));
      return Promise.reject(payload);
    }
    return payload?.data ?? payload;
  },
  async (error: AxiosError<any>) => {
    const status = error.response?.status;
    const config = error.config as FastRequestConfig | undefined;
    let responseData: any = error.response?.data;
    if (responseData instanceof Blob) {
      try {
        const text = await responseData.text();
        responseData = text ? JSON.parse(text) : undefined;
      } catch {
        responseData = undefined;
      }
    }
    const msg = formatErrorMessage(responseData?.message || responseData?.error || error.message || '网络异常');
    (error as any).userMessage = msg;
    const silentStatus = typeof status === 'number' && config?.silentStatuses?.includes(status);
    if (status === 401 && !config?.skipAuthRedirect) redirectVerify();
    else if (!config?.silent && !silentStatus && msg !== '登录凭证已过期') {
      const type = status === 429 ? 'warning' : 'error';
      Message[type](msg);
    }
    return Promise.reject(error);
  },
);

export const request = {
  baseURL: apiBaseURL,
  get<T = any>(url: string, params?: any, config: FastRequestConfig = {}) {
    const finalParams = cleanObject(params || {});
    const key = makeGetKey(url, finalParams, config);
    const pendingKey = makePendingKey(key, config);
    const now = Date.now();
    const cached = config.cacheTtl ? readResponseCache(key, now) : undefined;
    if (cached) return Promise.resolve(cached.value as T);
    if (!config.skipDedup && pendingGetMap.has(pendingKey)) return pendingGetMap.get(pendingKey) as Promise<T>;
    const requestEpoch = responseCacheEpoch;

    const promise = service
      .get<T, T>(url, { params: finalParams, ...config })
      .then((data) => {
        if (config.cacheTtl && requestEpoch === responseCacheEpoch) writeResponseCache(key, data, config.cacheTtl);
        return data;
      })
      .finally(() => {
        // A cache clear may have allowed a newer request with the same key to start.
        // The older request must not remove that newer in-flight entry.
        if (pendingGetMap.get(pendingKey) === promise) pendingGetMap.delete(pendingKey);
      });

    if (!config.skipDedup) pendingGetMap.set(pendingKey, promise);
    return promise;
  },
  post<T = any>(url: string, data?: any, config?: FastRequestConfig) {
    return service.post<T, T>(url, data, config).then((res) => { clearRequestCache(); return res; });
  },
  put<T = any>(url: string, data?: any, config?: FastRequestConfig) {
    return service.put<T, T>(url, data, config).then((res) => { clearRequestCache(); return res; });
  },
  delete<T = any>(url: string, config?: FastRequestConfig) {
    return service.delete<T, T>(url, config).then((res) => { clearRequestCache(); return res; });
  },
  upload<T = any>(url: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return service.post<T, T>(url, form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((res) => { clearRequestCache(); return res; });
  },
  download(url: string, params?: any, filename = 'download.csv', config: FastRequestConfig = {}) {
    return service.get<Blob, Blob>(url, {
      ...config,
      params: cleanObject(params || {}),
      responseType: 'blob',
      skipDedup: true,
    } as FastRequestConfig).then((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.rel = 'noopener';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    });
  },
};
