import { envFeatureEnabled } from '@/config/features';
import {
  DEFAULT_PUBLIC_VERIFY_HOSTS,
  evaluateVerifyHostname,
  parseVerifyAllowedHosts,
  type VerifyHostDecision,
} from '@/utils/verifyDomain';

const configuredHosts = parseVerifyAllowedHosts(import.meta.env.VITE_VERIFY_ALLOWED_HOSTS);

export const PUBLIC_VERIFY_ALLOWED_HOSTS = configuredHosts.length
  ? configuredHosts
  : [...DEFAULT_PUBLIC_VERIFY_HOSTS];

// This identifier is intentionally public. It helps the API select a site policy, but is never an API secret.
export const PUBLIC_VERIFY_SITE_ID = String(import.meta.env.VITE_VERIFY_SITE_ID || 'trace-official-web')
  .trim()
  .replace(/[^a-zA-Z0-9._-]/g, '')
  .slice(0, 64) || 'trace-official-web';

const VERIFY_DOMAIN_LOCK_ENABLED = envFeatureEnabled(import.meta.env.VITE_VERIFY_DOMAIN_LOCK_ENABLED, true);
const ALLOW_PRIVATE_DEV_HOSTS = envFeatureEnabled(import.meta.env.VITE_VERIFY_ALLOW_PRIVATE_DEV_HOSTS, true);
const REQUIRE_HTTPS = envFeatureEnabled(import.meta.env.VITE_VERIFY_REQUIRE_HTTPS, true);

function browserHostname() {
  return typeof window === 'undefined' ? '' : window.location.hostname;
}

function browserOrigin() {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

function browserProtocol() {
  return typeof window === 'undefined' ? '' : window.location.protocol;
}

export function getPublicVerifyHostDecision(hostname = browserHostname()): VerifyHostDecision {
  return evaluateVerifyHostname(hostname, {
    allowedHosts: PUBLIC_VERIFY_ALLOWED_HOSTS,
    development: import.meta.env.DEV,
    allowPrivateDevelopmentHosts: ALLOW_PRIVATE_DEV_HOSTS,
    lockEnabled: VERIFY_DOMAIN_LOCK_ENABLED,
    protocol: browserProtocol(),
    requireHttps: !import.meta.env.DEV && REQUIRE_HTTPS,
  });
}

export function isCurrentPublicVerifyHostAllowed() {
  return getPublicVerifyHostDecision().allowed;
}

export class UntrustedVerifyHostError extends Error {
  readonly code = 'UNTRUSTED_VERIFY_HOST';

  constructor() {
    super('当前地址不是官方防伪验证入口，请重新扫描产品包装上的官方二维码');
    this.name = 'UntrustedVerifyHostError';
  }
}

export function assertCurrentPublicVerifyHost() {
  const decision = getPublicVerifyHostDecision();
  if (!decision.allowed) throw new UntrustedVerifyHostError();
  return decision;
}

export function createPublicVerifyRequestNonce() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (item) => item.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function publicVerifyRequestHeaders(flowNonce = createPublicVerifyRequestNonce()) {
  assertCurrentPublicVerifyHost();
  return {
    'X-Verify-Site-Id': PUBLIC_VERIFY_SITE_ID,
    'X-Verify-Page-Origin': browserOrigin(),
    'X-Verify-Request-Nonce': flowNonce,
  };
}
