import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const VAULT_CONTEXT = Buffer.from('trace-enterprise:anti-counterfeit-vault:v1\0', 'ascii');
const AES_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export const ANTI_COUNTERFEIT_VAULT_LOCATOR_PREFIX = 'AV1.';
export const ANTI_COUNTERFEIT_HASH_REFERENCE_PREFIX = 'AH1.';

export interface AntiCounterfeitVaultRow {
  code?: unknown;
  code_hash?: unknown;
  code_ciphertext?: unknown;
  code_iv?: unknown;
  code_tag?: unknown;
  code_key_id?: unknown;
  [key: string]: unknown;
}

export interface AntiCounterfeitVaultPersistence extends AntiCounterfeitVaultRow {
  code: string;
  code_hash: string;
  code_ciphertext: Buffer | null;
  code_iv: Buffer | null;
  code_tag: Buffer | null;
  code_key_id: string | null;
}

export class AntiCounterfeitVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AntiCounterfeitVaultError';
  }
}

function envBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function normalizeKeyId(value: unknown) {
  const kid = String(value || '').trim();
  if (!KEY_ID_RE.test(kid)) throw new AntiCounterfeitVaultError('anti-counterfeit vault key id has an invalid format');
  return kid;
}

function decodeKey(value: unknown) {
  const encoded = String(value || '').trim();
  if (!encoded) throw new AntiCounterfeitVaultError('anti-counterfeit vault key material is empty');
  const decoded = Buffer.from(encoded, 'base64url');
  if (decoded.length !== AES_KEY_BYTES) {
    throw new AntiCounterfeitVaultError(`anti-counterfeit vault keys must decode to exactly ${AES_KEY_BYTES} bytes`);
  }
  return decoded;
}

function keyRingFromEnv(env: Record<string, string | undefined>) {
  const raw = String(env.ANTI_FAKE_VAULT_KEYS || '').trim();
  if (!raw) return new Map<string, Buffer>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AntiCounterfeitVaultError('ANTI_FAKE_VAULT_KEYS must be a JSON object');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AntiCounterfeitVaultError('ANTI_FAKE_VAULT_KEYS must be a JSON object');
  }
  const ring = new Map<string, Buffer>();
  for (const [kid, material] of Object.entries(parsed as Record<string, unknown>)) {
    ring.set(normalizeKeyId(kid), decodeKey(material));
  }
  return ring;
}

function asBuffer(value: unknown, label: string, expectedLength?: number) {
  let buffer: Buffer;
  if (Buffer.isBuffer(value)) buffer = value;
  else if (value instanceof Uint8Array) buffer = Buffer.from(value);
  else if (typeof value === 'string' && value) buffer = Buffer.from(value, 'base64url');
  else throw new AntiCounterfeitVaultError(`encrypted anti-counterfeit ${label} is missing`);
  if (expectedLength !== undefined && buffer.length !== expectedLength) {
    throw new AntiCounterfeitVaultError(`encrypted anti-counterfeit ${label} has an invalid length`);
  }
  return buffer;
}

function constantTimeTextEqual(left: string, right: string) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function aad(kid: string, hash: string) {
  return Buffer.concat([
    VAULT_CONTEXT,
    Buffer.from(kid, 'ascii'),
    Buffer.from('\0', 'ascii'),
    Buffer.from(hash, 'ascii'),
  ]);
}

/**
 * Encrypts recoverable anti-counterfeit codes with AES-256-GCM while keeping
 * SHA-256 as the only database lookup key. The legacy `code` column contains
 * an opaque locator after encryption so existing non-null/unique constraints
 * remain deployable on populated databases.
 */
export class AntiCounterfeitCodeVault {
  readonly required: boolean;
  readonly allowPlaintextRead: boolean;
  readonly activeKeyId?: string;
  private readonly keys: Map<string, Buffer>;

  constructor(env: Record<string, string | undefined> = process.env) {
    const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
    this.required = envBoolean(env.ANTI_FAKE_VAULT_REQUIRED, production);
    this.allowPlaintextRead = envBoolean(env.ANTI_FAKE_VAULT_ALLOW_PLAINTEXT_READ, !production);
    this.keys = keyRingFromEnv(env);

    const active = String(env.ANTI_FAKE_VAULT_ACTIVE_KEY_ID || '').trim();
    if (active) {
      this.activeKeyId = normalizeKeyId(active);
      if (!this.keys.has(this.activeKeyId)) {
        throw new AntiCounterfeitVaultError('ANTI_FAKE_VAULT_ACTIVE_KEY_ID is not present in ANTI_FAKE_VAULT_KEYS');
      }
    }
    if (this.required && !this.activeKeyId) {
      throw new AntiCounterfeitVaultError('anti-counterfeit vault encryption is required but no active key is configured');
    }
  }

  isEnabled() {
    return Boolean(this.activeKeyId);
  }

  hasKey(keyId: unknown) {
    const candidate = String(keyId || '').trim();
    return candidate ? this.keys.has(candidate) : false;
  }

  hash(value: string) {
    return createHash('sha256').update(String(value), 'utf8').digest('hex');
  }

  locatorForHash(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new AntiCounterfeitVaultError('anti-counterfeit code hash has an invalid format');
    return `${ANTI_COUNTERFEIT_VAULT_LOCATOR_PREFIX}${hash}`;
  }

  reference(value: string) {
    const candidate = String(value || '').trim();
    if (candidate.startsWith(ANTI_COUNTERFEIT_HASH_REFERENCE_PREFIX)) {
      const hash = candidate.slice(ANTI_COUNTERFEIT_HASH_REFERENCE_PREFIX.length).toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new AntiCounterfeitVaultError('anti-counterfeit hash reference has an invalid format');
      return `${ANTI_COUNTERFEIT_HASH_REFERENCE_PREFIX}${hash}`;
    }
    return `${ANTI_COUNTERFEIT_HASH_REFERENCE_PREFIX}${this.hash(candidate)}`;
  }

  hashFromReference(value: unknown) {
    const candidate = String(value || '').trim();
    if (!candidate.startsWith(ANTI_COUNTERFEIT_HASH_REFERENCE_PREFIX)) return null;
    const hash = candidate.slice(ANTI_COUNTERFEIT_HASH_REFERENCE_PREFIX.length).toLowerCase();
    return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
  }

  persistence(value: string): AntiCounterfeitVaultPersistence {
    const code = String(value || '');
    if (!code) throw new AntiCounterfeitVaultError('anti-counterfeit code cannot be empty');
    const codeHash = this.hash(code);
    if (!this.activeKeyId) {
      if (this.required) throw new AntiCounterfeitVaultError('anti-counterfeit vault encryption is required');
      return {
        code,
        code_hash: codeHash,
        code_ciphertext: null,
        code_iv: null,
        code_tag: null,
        code_key_id: null,
      };
    }

    const key = this.keys.get(this.activeKeyId);
    if (!key) throw new AntiCounterfeitVaultError('active anti-counterfeit vault key is unavailable');
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(this.activeKeyId, codeHash));
    const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
    return {
      code: this.locatorForHash(codeHash),
      code_hash: codeHash,
      code_ciphertext: ciphertext,
      code_iv: iv,
      code_tag: cipher.getAuthTag(),
      code_key_id: this.activeKeyId,
    };
  }

  reveal(row: AntiCounterfeitVaultRow): string {
    const encryptedParts = [row.code_ciphertext, row.code_iv, row.code_tag, row.code_key_id];
    const encryptedCount = encryptedParts.filter((part) => part !== null && part !== undefined && part !== '').length;
    if (encryptedCount === 0) {
      const legacyCode = String(row.code || '');
      if (!legacyCode || legacyCode.startsWith(ANTI_COUNTERFEIT_VAULT_LOCATOR_PREFIX)) {
        throw new AntiCounterfeitVaultError('anti-counterfeit vault row has no recoverable code');
      }
      if (!this.allowPlaintextRead) {
        throw new AntiCounterfeitVaultError('plaintext anti-counterfeit rows are disabled; run the vault backfill first');
      }
      return legacyCode;
    }
    if (encryptedCount !== encryptedParts.length) {
      throw new AntiCounterfeitVaultError('anti-counterfeit vault row is only partially encrypted');
    }

    const kid = normalizeKeyId(row.code_key_id);
    const hash = String(row.code_hash || '').trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new AntiCounterfeitVaultError('encrypted anti-counterfeit row has no valid hash');
    const key = this.keys.get(kid);
    if (!key) throw new AntiCounterfeitVaultError(`anti-counterfeit vault key ${kid} is unavailable`);

    const ciphertext = asBuffer(row.code_ciphertext, 'ciphertext');
    const iv = asBuffer(row.code_iv, 'iv', IV_BYTES);
    const tag = asBuffer(row.code_tag, 'authentication tag', TAG_BYTES);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(aad(kid, hash));
      decipher.setAuthTag(tag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      if (!constantTimeTextEqual(this.hash(plaintext), hash)) {
        throw new AntiCounterfeitVaultError('decrypted anti-counterfeit code does not match its hash');
      }
      const locator = String(row.code || '');
      if (locator.startsWith(ANTI_COUNTERFEIT_VAULT_LOCATOR_PREFIX)
        && !constantTimeTextEqual(locator, this.locatorForHash(hash))) {
        throw new AntiCounterfeitVaultError('encrypted anti-counterfeit locator does not match its hash');
      }
      return plaintext;
    } catch (error) {
      if (error instanceof AntiCounterfeitVaultError) throw error;
      throw new AntiCounterfeitVaultError('anti-counterfeit vault authentication failed');
    }
  }

  hydrate<T extends AntiCounterfeitVaultRow>(row: T): Omit<T, 'code_ciphertext' | 'code_iv' | 'code_tag' | 'code_key_id'> & { code: string } {
    const hydrated: AntiCounterfeitVaultRow = { ...row, code: this.reveal(row) };
    delete hydrated.code_ciphertext;
    delete hydrated.code_iv;
    delete hydrated.code_tag;
    delete hydrated.code_key_id;
    return hydrated as Omit<T, 'code_ciphertext' | 'code_iv' | 'code_tag' | 'code_key_id'> & { code: string };
  }

  hydrateMany<T extends AntiCounterfeitVaultRow>(rows: T[]) {
    return rows.map((row) => this.hydrate(row));
  }

  whereForCodes(values: string[]) {
    const codes = Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
    const clauses: Array<Record<string, unknown>> = [
      { code_hash: { in: codes.map((code) => this.hash(code)) } },
    ];
    // Plaintext lookup is only needed while migrating legacy rows or during
    // development. Strict production mode must keep the database query on the
    // non-reversible hash column even if an unsafe row exists.
    if (this.allowPlaintextRead) clauses.push({ code: { in: codes } });
    return { OR: clauses };
  }
}
