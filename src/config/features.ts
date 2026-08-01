const FALSE_VALUES = new Set(['0', 'false', 'off', 'no', 'disabled']);
const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes', 'enabled']);

export function envFeatureEnabled(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (FALSE_VALUES.has(normalized)) return false;
  if (TRUE_VALUES.has(normalized)) return true;
  return fallback;
}

// AI 页面默认关闭；只有 WEB .env 显式设置为 true/on/yes/1/enabled 才显示。
export const AI_FEATURE_ENABLED = envFeatureEnabled(import.meta.env.VITE_AI_FEATURE_ENABLED, false);
