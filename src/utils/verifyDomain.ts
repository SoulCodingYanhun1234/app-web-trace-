export const DEFAULT_PUBLIC_VERIFY_HOSTS = ['qr.0office.top'] as const;

export type VerifyHostDecisionReason = 'allowed' | 'lock-disabled' | 'development-host' | 'insecure-protocol' | 'untrusted-host';

export interface VerifyHostDecision {
  allowed: boolean;
  hostname: string;
  reason: VerifyHostDecisionReason;
}

export interface VerifyHostPolicy {
  allowedHosts: readonly string[];
  development?: boolean;
  allowPrivateDevelopmentHosts?: boolean;
  lockEnabled?: boolean;
  protocol?: string;
  requireHttps?: boolean;
}

function hostnameFromUrl(value: string) {
  try {
    const candidate = value.includes('://') ? value : `https://${value}`;
    return new URL(candidate).hostname;
  } catch {
    return '';
  }
}

export function normalizeVerifyHostname(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace(/\.+$/, '');
  if (!raw) return '';
  const parsed = hostnameFromUrl(raw);
  return String(parsed || raw).trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
}

function normalizeAllowedHost(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('*.')) {
    const suffix = normalizeVerifyHostname(raw.slice(2));
    return suffix ? `*.${suffix}` : '';
  }
  return normalizeVerifyHostname(raw);
}

export function parseVerifyAllowedHosts(value: unknown) {
  const items = Array.isArray(value) ? value : String(value || '').split(',');
  return Array.from(new Set(items.map(normalizeAllowedHost).filter(Boolean)));
}

export function verifyHostnameMatches(hostname: unknown, allowedHost: unknown) {
  const normalizedHostname = normalizeVerifyHostname(hostname);
  const normalizedRule = normalizeAllowedHost(allowedHost);
  if (!normalizedHostname || !normalizedRule) return false;
  if (!normalizedRule.startsWith('*.')) return normalizedHostname === normalizedRule;

  const suffix = normalizedRule.slice(2);
  return normalizedHostname !== suffix && normalizedHostname.endsWith(`.${suffix}`);
}

export function isPrivateDevelopmentHostname(hostname: unknown) {
  const normalized = normalizeVerifyHostname(hostname);
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '::1' || normalized === '0.0.0.0') return true;
  if (normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;

  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) return false;
  return octets[0] === 127
    || octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 169 && octets[1] === 254);
}

export function evaluateVerifyHostname(hostname: unknown, policy: VerifyHostPolicy): VerifyHostDecision {
  const normalized = normalizeVerifyHostname(hostname);
  if (policy.lockEnabled === false) return { allowed: true, hostname: normalized, reason: 'lock-disabled' };

  const protocol = String(policy.protocol || '').trim().toLowerCase().replace(/:$/, '');
  if (policy.requireHttps && protocol && protocol !== 'https') {
    return { allowed: false, hostname: normalized, reason: 'insecure-protocol' };
  }

  const allowedHosts = parseVerifyAllowedHosts(policy.allowedHosts);
  if (allowedHosts.some((allowedHost) => verifyHostnameMatches(normalized, allowedHost))) {
    return { allowed: true, hostname: normalized, reason: 'allowed' };
  }

  if (policy.development && policy.allowPrivateDevelopmentHosts !== false && isPrivateDevelopmentHostname(normalized)) {
    return { allowed: true, hostname: normalized, reason: 'development-host' };
  }

  return { allowed: false, hostname: normalized, reason: 'untrusted-host' };
}
