/**
 * 安全工具：输入验证、XSS 防护、数据清理。
 * 注意：前端清理只能提升展示安全，服务端仍必须做鉴权、限流和字段校验。
 */

const DANGEROUS_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form']);
const SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const URI_ATTRS = new Set(['href', 'src', 'xlink:href', 'formaction', 'poster']);

/** HTML 实体编码，防止文本被当作 HTML 执行。 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeAttrUrl(value: string) {
  const raw = String(value || '').trim().replace(/[\u0000-\u001f\u007f\s]+/g, '');
  if (!raw) return true;
  if (raw.startsWith('#') || raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) return true;
  try {
    const parsed = new URL(raw, window.location.origin);
    return SAFE_URL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

/** 移除潜在危险的 HTML 标签和属性，保留基础排版标签。 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';

  const template = document.createElement('template');
  template.innerHTML = input;

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const nodes: Element[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Element);

  nodes.forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (DANGEROUS_TAGS.has(tag)) {
      el.remove();
      return;
    }

    [...el.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value || '';
      if (name.startsWith('on') || name === 'srcdoc' || name === 'style') {
        el.removeAttribute(attr.name);
        return;
      }
      if (URI_ATTRS.has(name) && !isSafeAttrUrl(value)) {
        el.removeAttribute(attr.name);
      }
    });

    if (tag === 'a') {
      el.setAttribute('rel', 'noopener noreferrer nofollow');
      if (el.getAttribute('target') === '_blank') el.setAttribute('target', '_blank');
    }
  });

  return template.innerHTML;
}

/** 安全文本显示，去除所有 HTML 标签。 */
export function stripHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** 验证并清理 URL。 */
export function sanitizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const raw = url.trim();

  if (raw.startsWith('/')) return raw.startsWith('//') ? '#' : raw;
  if (raw.startsWith('./') || raw.startsWith('../')) return raw;

  try {
    const parsed = new URL(raw, window.location.origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '#';
    return parsed.toString();
  } catch {
    return '#';
  }
}

/** 输入验证 - 邮箱 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/** 输入验证 - 手机号（中国） */
export function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone.trim());
}

/** 输入验证 - URL */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/** 安全截取字符串 */
export function safeTruncate(str: string, maxLength: number, suffix = '...'): string {
  if (!str || typeof str !== 'string') return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + suffix;
}

/** 安全 JSON 解析 */
export function safeJsonParse<T = any>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/** 安全对象访问 */
export function safeGet<T = any>(obj: any, path: string, fallback: T): T {
  if (!obj || !path) return fallback;
  const keys = path.split('.');
  let result: any = obj;

  for (const key of keys) {
    if (result === null || result === undefined) return fallback;
    result = result[key];
  }

  return (result === null || result === undefined) ? fallback : result;
}

/** 清理输入，移除不可见字符 */
export function cleanInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim();
}

/** 生成安全的随机 ID */
export function generateSecureId(length = 16): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);

  for (let i = 0; i < length; i += 1) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

/** 验证文件类型 */
export function isValidFileType(file: File, allowedTypes: string[]): boolean {
  if (!file || !allowedTypes?.length) return false;
  return allowedTypes.some((type) => {
    if (type.startsWith('.')) return file.name.toLowerCase().endsWith(type.toLowerCase());
    return file.type.toLowerCase().includes(type.toLowerCase());
  });
}

/** 验证文件大小 */
export function isValidFileSize(file: File, maxSizeMB: number): boolean {
  if (!file) return false;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  return file.size <= maxSizeBytes;
}
