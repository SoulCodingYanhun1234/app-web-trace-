import {
  KeyObject,
  createPrivateKey,
  createPublicKey,
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

export const ANTI_COUNTERFEIT_CODE_VERSION = 'AF2';
export const ANTI_COUNTERFEIT_CODE_LENGTH = 105;
export const LEGACY_ANTI_COUNTERFEIT_CODE_VERSION = 'AF1';
export const LEGACY_ANTI_COUNTERFEIT_CODE_LENGTH = 128;
export const ANTI_COUNTERFEIT_KEY_ID_LENGTH = 8;

const PAYLOAD_SCHEMA_VERSION = 1;
const COMPACT_NONCE_LENGTH = 12;
const COMPACT_PAYLOAD_TEXT_LENGTH = 16;
const LEGACY_NONCE_LENGTH = 16;
const LEGACY_PAYLOAD_LENGTH = 1 + 4 + LEGACY_NONCE_LENGTH;
const LEGACY_PAYLOAD_TEXT_LENGTH = 28;
const SIGNATURE_LENGTH = 64;
const SIGNATURE_TEXT_LENGTH = 86;
const KEY_ID_RE = /^[A-Za-z0-9_-]{8}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const SIGNING_CONTEXTS = {
  AF1: Buffer.from('trace-enterprise:anti-counterfeit-code:v1\0', 'ascii'),
  AF2: Buffer.from('trace-enterprise:anti-counterfeit-code:v2\0', 'ascii'),
} as const;

export type AntiCounterfeitKeyMaterial = string | Buffer | KeyObject;
export type AntiCounterfeitPublicKeyRing =
  | Readonly<Record<string, AntiCounterfeitKeyMaterial>>
  | ReadonlyMap<string, AntiCounterfeitKeyMaterial>;

export interface ParsedAntiCounterfeitCode {
  version: typeof ANTI_COUNTERFEIT_CODE_VERSION | typeof LEGACY_ANTI_COUNTERFEIT_CODE_VERSION;
  kid: string | null;
  issuedAt: Date | null;
  nonce: Buffer;
  payload: string;
  signature: string;
  unsignedCode: string;
}

export type VerifiedAntiCounterfeitCode = ParsedAntiCounterfeitCode & { kid: string };

export type AntiCounterfeitVerificationResult =
  | { valid: true; code: VerifiedAntiCounterfeitCode }
  | { valid: false; reason: 'MALFORMED' | 'UNKNOWN_KEY' | 'INVALID_SIGNATURE'; kid?: string };

export class AntiCounterfeitCodeFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AntiCounterfeitCodeFormatError';
  }
}

export class AntiCounterfeitCodeKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AntiCounterfeitCodeKeyError';
  }
}

function assertKeyId(kid: string): string {
  if (!KEY_ID_RE.test(kid)) {
    throw new AntiCounterfeitCodeKeyError('kid must be exactly 8 base64url characters');
  }
  return kid;
}

function decodeFixedBase64Url(value: string, byteLength: number, textLength: number, label: string): Buffer {
  if (value.length !== textLength || !BASE64URL_RE.test(value)) {
    throw new AntiCounterfeitCodeFormatError(`${label} has an invalid format`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== byteLength || decoded.toString('base64url') !== value) {
    throw new AntiCounterfeitCodeFormatError(`${label} is not canonical base64url`);
  }
  return decoded;
}

function signingInput(unsignedCode: string, version: ParsedAntiCounterfeitCode['version']): Buffer {
  return Buffer.concat([SIGNING_CONTEXTS[version], Buffer.from(unsignedCode, 'ascii')]);
}

function normalizePrivateKey(material: AntiCounterfeitKeyMaterial): KeyObject {
  let key: KeyObject;
  try {
    key = material instanceof KeyObject ? material : createPrivateKey(material);
  } catch {
    throw new AntiCounterfeitCodeKeyError('a valid Ed25519 private key is required for signing');
  }
  if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') {
    throw new AntiCounterfeitCodeKeyError('a valid Ed25519 private key is required for signing');
  }
  return key;
}

function normalizePublicKey(material: AntiCounterfeitKeyMaterial): KeyObject {
  let key: KeyObject;
  try {
    key = material instanceof KeyObject
      ? (material.type === 'public' ? material : createPublicKey(material))
      : createPublicKey(material);
  } catch {
    throw new AntiCounterfeitCodeKeyError('a valid Ed25519 public key is required for verification');
  }
  if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
    throw new AntiCounterfeitCodeKeyError('a valid Ed25519 public key is required for verification');
  }
  return key;
}

function keyRingEntries(keyRing: AntiCounterfeitPublicKeyRing) {
  return keyRing instanceof Map ? keyRing.entries() : Object.entries(keyRing);
}

function encodeIssuedAt(value: Date): number {
  const milliseconds = value.getTime();
  if (!Number.isFinite(milliseconds)) throw new RangeError('issuedAt must be a valid Date');
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 0 || seconds > 0xffff_ffff) {
    throw new RangeError('issuedAt must fit in an unsigned 32-bit Unix timestamp');
  }
  return seconds;
}

export function parseAntiCounterfeitCode(value: string): ParsedAntiCounterfeitCode {
  if (typeof value !== 'string') {
    throw new AntiCounterfeitCodeFormatError('code must be a string');
  }

  if (value.startsWith(ANTI_COUNTERFEIT_CODE_VERSION)) {
    if (value.length !== ANTI_COUNTERFEIT_CODE_LENGTH) {
      throw new AntiCounterfeitCodeFormatError(`compact code must be exactly ${ANTI_COUNTERFEIT_CODE_LENGTH} characters`);
    }
    const payload = value.slice(ANTI_COUNTERFEIT_CODE_VERSION.length, ANTI_COUNTERFEIT_CODE_VERSION.length + COMPACT_PAYLOAD_TEXT_LENGTH);
    const signature = value.slice(ANTI_COUNTERFEIT_CODE_VERSION.length + COMPACT_PAYLOAD_TEXT_LENGTH);
    const nonce = decodeFixedBase64Url(payload, COMPACT_NONCE_LENGTH, COMPACT_PAYLOAD_TEXT_LENGTH, 'payload');
    decodeFixedBase64Url(signature, SIGNATURE_LENGTH, SIGNATURE_TEXT_LENGTH, 'signature');
    return {
      version: ANTI_COUNTERFEIT_CODE_VERSION,
      kid: null,
      issuedAt: null,
      nonce,
      payload,
      signature,
      unsignedCode: `${ANTI_COUNTERFEIT_CODE_VERSION}${payload}`,
    };
  }

  if (!value.startsWith(`${LEGACY_ANTI_COUNTERFEIT_CODE_VERSION}.`) || value.length !== LEGACY_ANTI_COUNTERFEIT_CODE_LENGTH) {
    throw new AntiCounterfeitCodeFormatError('code has an unsupported format');
  }

  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== LEGACY_ANTI_COUNTERFEIT_CODE_VERSION || !KEY_ID_RE.test(parts[1])) {
    throw new AntiCounterfeitCodeFormatError('code header has an invalid format');
  }

  const [, kid, payload, signature] = parts;
  const payloadBytes = decodeFixedBase64Url(payload, LEGACY_PAYLOAD_LENGTH, LEGACY_PAYLOAD_TEXT_LENGTH, 'payload');
  decodeFixedBase64Url(signature, SIGNATURE_LENGTH, SIGNATURE_TEXT_LENGTH, 'signature');
  if (payloadBytes[0] !== PAYLOAD_SCHEMA_VERSION) {
    throw new AntiCounterfeitCodeFormatError('payload schema version is unsupported');
  }

  return {
    version: LEGACY_ANTI_COUNTERFEIT_CODE_VERSION,
    kid,
    issuedAt: new Date(payloadBytes.readUInt32BE(1) * 1000),
    nonce: Buffer.from(payloadBytes.subarray(5)),
    payload,
    signature,
    unsignedCode: `${LEGACY_ANTI_COUNTERFEIT_CODE_VERSION}.${kid}.${payload}`,
  };
}

export class AntiCounterfeitCodeSigner {
  readonly kid: string;
  private readonly privateKey: KeyObject;

  constructor(kid: string, privateKey: AntiCounterfeitKeyMaterial) {
    this.kid = assertKeyId(kid);
    this.privateKey = normalizePrivateKey(privateKey);
  }

  sign(options: { nonce?: Uint8Array } = {}): string {
    const nonce = options.nonce === undefined ? randomBytes(COMPACT_NONCE_LENGTH) : Buffer.from(options.nonce);
    if (nonce.length !== COMPACT_NONCE_LENGTH) throw new RangeError(`nonce must be exactly ${COMPACT_NONCE_LENGTH} bytes`);
    const payload = nonce.toString('base64url');
    const unsignedCode = `${ANTI_COUNTERFEIT_CODE_VERSION}${payload}`;
    const signature = cryptoSign(null, signingInput(unsignedCode, ANTI_COUNTERFEIT_CODE_VERSION), this.privateKey).toString('base64url');
    const code = `${unsignedCode}${signature}`;
    if (code.length !== ANTI_COUNTERFEIT_CODE_LENGTH) throw new Error('unexpected compact anti-counterfeit code length');
    return code;
  }

  signLegacy(options: { issuedAt?: Date; nonce?: Uint8Array } = {}): string {
    const nonce = options.nonce === undefined ? randomBytes(LEGACY_NONCE_LENGTH) : Buffer.from(options.nonce);
    if (nonce.length !== LEGACY_NONCE_LENGTH) throw new RangeError(`nonce must be exactly ${LEGACY_NONCE_LENGTH} bytes`);

    const payloadBytes = Buffer.alloc(LEGACY_PAYLOAD_LENGTH);
    payloadBytes[0] = PAYLOAD_SCHEMA_VERSION;
    payloadBytes.writeUInt32BE(encodeIssuedAt(options.issuedAt ?? new Date()), 1);
    nonce.copy(payloadBytes, 5);

    const payload = payloadBytes.toString('base64url');
    const unsignedCode = `${LEGACY_ANTI_COUNTERFEIT_CODE_VERSION}.${this.kid}.${payload}`;
    const signature = cryptoSign(null, signingInput(unsignedCode, LEGACY_ANTI_COUNTERFEIT_CODE_VERSION), this.privateKey).toString('base64url');
    const code = `${unsignedCode}.${signature}`;
    if (code.length !== LEGACY_ANTI_COUNTERFEIT_CODE_LENGTH) throw new Error('unexpected legacy anti-counterfeit code length');
    return code;
  }
}

export class AntiCounterfeitCodeVerifier {
  private readonly publicKeys = new Map<string, KeyObject>();

  constructor(keyRing: AntiCounterfeitPublicKeyRing) {
    for (const [kid, material] of keyRingEntries(keyRing)) {
      this.publicKeys.set(assertKeyId(kid), normalizePublicKey(material));
    }
  }

  verify(value: string): AntiCounterfeitVerificationResult {
    let code: ParsedAntiCounterfeitCode;
    try {
      code = parseAntiCounterfeitCode(value);
    } catch (error) {
      if (error instanceof AntiCounterfeitCodeFormatError) return { valid: false, reason: 'MALFORMED' };
      throw error;
    }

    const signature = Buffer.from(code.signature, 'base64url');
    if (code.kid) {
      const publicKey = this.publicKeys.get(code.kid);
      if (!publicKey) return { valid: false, reason: 'UNKNOWN_KEY', kid: code.kid };
      const valid = cryptoVerify(null, signingInput(code.unsignedCode, code.version), publicKey, signature);
      return valid ? { valid: true, code: { ...code, kid: code.kid } } : { valid: false, reason: 'INVALID_SIGNATURE', kid: code.kid };
    }

    if (!this.publicKeys.size) return { valid: false, reason: 'UNKNOWN_KEY' };
    for (const [kid, publicKey] of this.publicKeys.entries()) {
      if (cryptoVerify(null, signingInput(code.unsignedCode, code.version), publicKey, signature)) {
        return { valid: true, code: { ...code, kid } };
      }
    }
    return { valid: false, reason: 'INVALID_SIGNATURE' };
  }
}

export function generateAntiCounterfeitKeyPair(kid: string) {
  const normalizedKid = assertKeyId(kid);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    kid: normalizedKid,
    privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKey: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  };
}

function envBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function envKey(value: unknown, encodedValue: unknown) {
  const encoded = String(encodedValue || '').trim();
  if (encoded) return Buffer.from(encoded, 'base64').toString('utf8');
  return String(value || '').replace(/\\n/g, '\n').trim();
}

function publicKeyRingFromEnv(env: Record<string, string | undefined>) {
  const raw = String(env.ANTI_FAKE_VERIFY_PUBLIC_KEYS || '').trim();
  if (!raw) return {} as Record<string, AntiCounterfeitKeyMaterial>;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AntiCounterfeitCodeKeyError('ANTI_FAKE_VERIFY_PUBLIC_KEYS must be a JSON object');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AntiCounterfeitCodeKeyError('ANTI_FAKE_VERIFY_PUBLIC_KEYS must be a JSON object');
  }
  const ring: Record<string, AntiCounterfeitKeyMaterial> = {};
  for (const [kid, material] of Object.entries(parsed as Record<string, unknown>)) {
    ring[assertKeyId(kid)] = envKey(material, '');
  }
  return ring;
}

export type AntiCounterfeitCodeAssessment =
  | { accepted: true; signed: true; kid: string }
  | { accepted: true; signed: false; legacy: true }
  | { accepted: false; signed: boolean; reason: 'LEGACY_REJECTED' | 'MALFORMED' | 'UNKNOWN_KEY' | 'INVALID_SIGNATURE'; kid?: string };

export function isSignedAntiCounterfeitCodeCandidate(value: unknown) {
  const candidate = String(value || '').trim();
  return candidate.startsWith(ANTI_COUNTERFEIT_CODE_VERSION)
    || candidate.startsWith(`${LEGACY_ANTI_COUNTERFEIT_CODE_VERSION}.`);
}

/**
 * Environment-backed issuance and verification policy. Private key material is
 * only needed by processes that issue codes; verification nodes can use the
 * public key ring alone.
 */
export class AntiCounterfeitCodePolicy {
  readonly allowLegacyCodes: boolean;
  readonly requireSignedIssuance: boolean;
  private readonly signer?: AntiCounterfeitCodeSigner;
  private readonly verifier: AntiCounterfeitCodeVerifier;

  constructor(env: Record<string, string | undefined> = process.env) {
    const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
    this.allowLegacyCodes = envBoolean(env.ANTI_FAKE_ALLOW_LEGACY_CODES, !production);
    this.requireSignedIssuance = envBoolean(env.ANTI_FAKE_REQUIRE_SIGNED_CODES, production);

    const kid = String(env.ANTI_FAKE_SIGNING_KEY_ID || '').trim();
    const privateKey = envKey(env.ANTI_FAKE_SIGNING_PRIVATE_KEY, env.ANTI_FAKE_SIGNING_PRIVATE_KEY_BASE64);
    const ring = publicKeyRingFromEnv(env);
    if (kid || privateKey) {
      if (!kid || !privateKey) {
        throw new AntiCounterfeitCodeKeyError('ANTI_FAKE_SIGNING_KEY_ID and private key must be configured together');
      }
      this.signer = new AntiCounterfeitCodeSigner(kid, privateKey);
      ring[kid] = createPublicKey(privateKey);
    }
    if (this.requireSignedIssuance && !this.signer) {
      throw new AntiCounterfeitCodeKeyError('signed anti-counterfeit code issuance is required but no private key is configured');
    }
    this.verifier = new AntiCounterfeitCodeVerifier(ring);
  }

  canSign() {
    return Boolean(this.signer);
  }

  issue(options: { nonce?: Uint8Array } = {}) {
    if (!this.signer) {
      throw new AntiCounterfeitCodeKeyError('anti-counterfeit signing private key is not configured');
    }
    return this.signer.sign(options);
  }

  issueOrLegacy(legacyFactory: () => string) {
    if (this.signer) return this.signer.sign();
    if (this.requireSignedIssuance) {
      throw new AntiCounterfeitCodeKeyError('signed anti-counterfeit code issuance is required but no private key is configured');
    }
    return legacyFactory();
  }

  assess(value: string): AntiCounterfeitCodeAssessment {
    const candidate = String(value || '').trim();
    const signedCandidate = isSignedAntiCounterfeitCodeCandidate(candidate);
    if (!signedCandidate) {
      return this.allowLegacyCodes
        ? { accepted: true, signed: false, legacy: true }
        : { accepted: false, signed: false, reason: 'LEGACY_REJECTED' };
    }
    const result = this.verifier.verify(candidate);
    if (result.valid) return { accepted: true, signed: true, kid: result.code.kid };
    return { accepted: false, signed: true, reason: result.reason, kid: result.kid };
  }

  hash(value: string) {
    return createHash('sha256').update(String(value), 'utf8').digest('hex');
  }
}
