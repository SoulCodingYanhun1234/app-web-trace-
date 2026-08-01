import { BadRequestException } from '@nestjs/common';

export function toNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function pageParams(query: Record<string, any>) {
  const page = Math.max(toNumber(query.page, 1), 1);
  // 企业后台默认每页不超过 100 条，避免新手误选超大分页拖慢数据库与浏览器渲染。
  const pageSize = Math.min(Math.max(toNumber(query.pageSize, 20), 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function safeId(value: unknown, field = 'id'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestException(`${field} 参数不合法`);
  return n;
}

export function safeText(value: unknown, maxLength = 255): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function pickAllowed(data: Record<string, any>, allowed?: string[]) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BadRequestException('请求体必须为对象');
  if (!allowed) return data;
  return Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
}

export function safeJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
