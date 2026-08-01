import dayjs from 'dayjs';
import { normalizeCodeText } from './format';

export type LowCodePreset = {
  label: string;
  description?: string;
  values: Record<string, any> | (() => Record<string, any>);
};

export type LowCodeStep = {
  title: string;
  description: string;
};

export function resolvePresetValues(preset: LowCodePreset) {
  return typeof preset.values === 'function' ? preset.values() : preset.values;
}

export function makeBatchNo(prefix = 'BATCH') {
  const safePrefix = String(prefix || 'BATCH').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase() || 'BATCH';
  return `${safePrefix}${dayjs().format('YYYYMMDDHHmmss')}`;
}

export function makeNo(prefix = 'NO') {
  const safePrefix = String(prefix || 'NO').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase() || 'NO';
  return `${safePrefix}${dayjs().format('YYYYMMDDHHmmss')}`;
}

export function todayDate() {
  return dayjs().format('YYYY-MM-DD');
}

export function futureDate(days = 365) {
  return dayjs().add(days, 'day').format('YYYY-MM-DD');
}

export function nowDateTime() {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

export function makeTraceChainTemplate(kind = '标准链路') {
  return {
    模板: kind,
    节点: [
      { 节点: '原料入库', 内容: '记录原料来源、供应商、批次和入库时间。', 状态: '待完善' },
      { 节点: '生产加工', 内容: '记录生产车间、生产线、操作员和生产时间。', 状态: '待完善' },
      { 节点: '质量检测', 内容: '记录质检结果、质检员、检测报告编号。', 状态: '待完善' },
      { 节点: '仓储发货', 内容: '记录仓库、装箱、物流单号和目的地。', 状态: '待完善' },
    ],
  };
}

export function parseBatchText(text: string) {
  const raw = String(text || '')
    .split(/[\s,，;；|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const items: string[] = [];
  const duplicated: string[] = [];
  raw.forEach((item) => {
    const code = normalizeCodeText(item);
    if (!code) return;
    if (seen.has(code)) duplicated.push(code);
    else {
      seen.add(code);
      items.push(code);
    }
  });
  return { raw, items, duplicated };
}

export function formatLines(items: string[]) {
  return items.join('\n');
}
