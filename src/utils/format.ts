import dayjs from 'dayjs';

const MAX_SCAN_CODE_LENGTH = 128;
const MAX_SCAN_URL_LENGTH = 2048;
const RAW_CODE_PREFIX_RE = /^(?:code|qr|sn|barcode|anti[-_]?fake[-_]?code|antiFakeCode|box|carton|ship|shipment|return|trace|region|防伪码|二维码|箱码|物流单号)[:：=]/i;

function cleanControlChars(value: unknown) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
}

function safeDecode(value: unknown) {
  const text = String(value || '');
  try { return decodeURIComponent(text); } catch { return text; }
}

export function normalizeCodeText(input: unknown) {
  const raw = cleanControlChars(input);
  if (!raw || raw.length > MAX_SCAN_URL_LENGTH) return '';
  const finalize = (value: unknown) => {
    const text = cleanControlChars(value)
      .replace(RAW_CODE_PREFIX_RE, '')
      .replace(/^\*|\*$/g, '')
      .trim();
    return text && text.length <= MAX_SCAN_CODE_LENGTH ? text : '';
  };

  const fromParams = (params: URLSearchParams) => {
    for (const key of ['code', 'anti_fake_code', 'antiFakeCode', 'q', 'barcode', 'sn', 'c', 'box', 'carton', 'shipment', 'trace', 'region']) {
      const value = params.get(key);
      if (value) return finalize(value);
    }
    return '';
  };

  try {
    const url = new URL(raw);
    const queryCode = fromParams(url.searchParams);
    if (queryCode) return queryCode;
    if (url.hash) {
      const hashQuery = url.hash.includes('?') ? url.hash.slice(url.hash.indexOf('?') + 1) : '';
      if (hashQuery) {
        const hashCode = fromParams(new URLSearchParams(hashQuery));
        if (hashCode) return hashCode;
      }
    }
    const parts = url.pathname.split('/').filter(Boolean);
    const index = parts.findIndex((part) => ['verify', 'v', 'query', 'code', 'codes', 'qr', 'box', 'carton', 'shipment', 'trace', 'region'].includes(part.toLowerCase()));
    if (index >= 0 && parts[index + 1]) return finalize(safeDecode(parts[index + 1]));
    if (parts.length) return finalize(safeDecode(parts[parts.length - 1]));
  } catch {
    // 普通条码不是 URL，继续兼容 code=xxx / 防伪码：xxx 等扫码内容。
  }

  const queryLike = raw.match(/(?:^|[?&#;\s,，])(?:code|anti_fake_code|antiFakeCode|q|barcode|sn|c|box|carton|shipment|return|trace|region)=([^&#;\s,，]+)/i);
  if (queryLike?.[1]) return finalize(safeDecode(queryLike[1]));
  return finalize(raw);
}


export function fmtTime(value?: string) {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD HH:mm');
}

export function fmtDate(value?: string) {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD');
}

export function fmtDateTime(value?: string) {
  if (!value) return '-';
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
}

export function normalizePage(payload: any) {
  if (!payload) return { list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
  if (Array.isArray(payload)) return { list: payload, pagination: { page: 1, pageSize: payload.length, total: payload.length, totalPages: 1 } };
  return {
    list: payload.list || payload.rows || [],
    pagination: payload.pagination || {
      page: Number(payload.page || 1),
      pageSize: Number(payload.pageSize || payload.limit || 20),
      total: Number(payload.total || payload.list?.length || payload.rows?.length || 0),
      totalPages: Number(payload.totalPages || 1),
    },
  };
}

export function splitCodes(text: string | string[] | undefined | null) {
  const raw = Array.isArray(text) ? text : String(text || '').split(/[\s,，;；|]+/);
  const seen = new Set<string>();
  const items: string[] = [];
  raw.forEach((value) => {
    const code = normalizeCodeText(value);
    if (code && !seen.has(code)) {
      seen.add(code);
      items.push(code);
    }
  });
  return items;
}

export function cleanObject<T = any>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cleanObject(item)).filter((item) => item !== undefined && item !== '') as T;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([key, item]) => {
      const next = cleanObject(item);
      if (next !== undefined && next !== null && next !== '') result[key] = next;
    });
    return result as T;
  }
  return value;
}

export function asArray(data: any) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export function displayValue(value: any) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
