import { createPublicVerifyRequestNonce, publicVerifyRequestHeaders } from '@/config/publicVerification';

// Verification challenges are bound to the page origin by the API. Keep this
// client on the current site's reverse-proxied API even when admin APIs use a
// separately hosted VITE_API_BASE_URL.
const PUBLIC_API_BASE_URL = '/api';

export interface PublicApiResponse<T = any> {
  code?: number;
  success?: boolean;
  message?: string;
  data?: T;
  [key: string]: any;
}

type PublicRequestOptions = RequestInit & {
  optional?: boolean;
  verificationNonce?: string;
};

function joinUrl(base: string, path: string) {
  const normalizedBase = (base || '/api').replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object' && payload ? (payload.message || payload.error) : payload;
    throw new Error(message || `请求失败：${response.status}`);
  }

  if (payload && typeof payload === 'object') {
    const body = payload as PublicApiResponse<T>;
    if (typeof body.code !== 'undefined' && body.code !== 200) throw new Error(body.message || '请求失败');
    if (typeof body.success !== 'undefined' && body.success === false) throw new Error(body.message || '请求失败');
    return (typeof body.data !== 'undefined' ? body.data : body) as T;
  }

  return payload as T;
}

export async function publicRequest<T = any>(path: string, options: PublicRequestOptions = {}) {
  const { optional, verificationNonce, headers, ...init } = options;
  const url = joinUrl(PUBLIC_API_BASE_URL, path);

  try {
    const response = await fetch(url, {
      ...init,
      // The public verification flow is intended for same-origin Web/API deployment.
      // Its short-lived challenge is returned by preflight and sent only with the matching code request.
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
        ...publicVerifyRequestHeaders(verificationNonce),
      },
    });
    return await parseResponse<T>(response);
  } catch (error) {
    if (optional) return undefined as T;
    throw error;
  }
}

export const publicSettingsApi = {
  queryPanel() {
    return publicRequest<Record<string, any> | undefined>('/settings/public/query-panel', {
      method: 'GET',
      optional: true,
    });
  },
};

export const publicQueryApi = {
  async preflight(code: string) {
    const verificationNonce = createPublicVerifyRequestNonce();
    const response = await publicRequest<{ challenge: string; expires_at: string; site_id: string; location_required: boolean }>(`/query/preflight/${encodeURIComponent(code)}`, {
      method: 'GET',
      verificationNonce,
    });
    return { ...response, request_nonce: verificationNonce };
  },
  verify(data: Record<string, any> & { challenge: string }, verificationNonce: string) {
    return publicRequest('/query', {
      method: 'POST',
      body: JSON.stringify(data),
      verificationNonce,
    });
  },
};
