const FALSE_VALUES = new Set(['0', 'false', 'off', 'no', 'disabled']);
const TRUE_VALUES = new Set(['1', 'true', 'on', 'yes', 'enabled']);

export function envFeatureEnabled(value: unknown, fallback = true): boolean {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (FALSE_VALUES.has(normalized)) return false;
  if (TRUE_VALUES.has(normalized)) return true;
  return fallback;
}

export function isAiFeatureEnabled(value: unknown = process.env.AI_FEATURE_ENABLED): boolean {
  return envFeatureEnabled(value, false);
}
