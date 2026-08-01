import { PrismaClient } from '@prisma/client';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

type CountValue = bigint | number | string | null | undefined;

type VaultStatusRow = {
  plaintext_rows: CountValue;
  incomplete_rows: CountValue;
  orphan_locator_rows: CountValue;
  invalid_encrypted_rows: CountValue;
};

type VaultKeyRow = {
  code_key_id: string | null;
  row_count: CountValue;
};

export type AntiFakeCodeVaultReadiness = {
  plaintextRows: number;
  incompleteRows: number;
  orphanLocatorRows: number;
  invalidEncryptedRows: number;
  unavailableKeys: Array<{ keyId: string; rows: number }>;
};

function envBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value).trim().toLowerCase());
}

function count(value: CountValue) {
  const parsed = Number(value || 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('anti-counterfeit vault readiness returned an invalid row count');
  return parsed;
}

export function requiresEncryptedAntiFakeVault(env: Record<string, string | undefined> = process.env) {
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const required = envBoolean(env.ANTI_FAKE_VAULT_REQUIRED, production);
  const allowPlaintext = envBoolean(env.ANTI_FAKE_VAULT_ALLOW_PLAINTEXT_READ, !production);
  return required && !allowPlaintext;
}

export function readinessFailureMessage(status: AntiFakeCodeVaultReadiness) {
  const problems: string[] = [];
  if (status.plaintextRows) problems.push(`${status.plaintextRows} plaintext row(s)`);
  if (status.incompleteRows) problems.push(`${status.incompleteRows} partially encrypted row(s)`);
  if (status.orphanLocatorRows) problems.push(`${status.orphanLocatorRows} locator row(s) without ciphertext`);
  if (status.invalidEncryptedRows) problems.push(`${status.invalidEncryptedRows} encrypted row(s) with invalid hash/locator metadata`);
  for (const missing of status.unavailableKeys) {
    problems.push(`${missing.rows} row(s) require unavailable vault key ${missing.keyId}`);
  }
  if (!problems.length) return null;
  return `[anti-fake-vault] Refusing strict startup: ${problems.join(', ')}. `
    + 'Run "npm run db:migrate:anti-fake-code-vault" for a dry run, then '
    + '"npm run db:migrate:anti-fake-code-vault -- --apply" with the complete vault key ring.';
}

export async function inspectAntiFakeCodeVault(
  prisma: PrismaClient,
  vault: AntiCounterfeitCodeVault,
): Promise<AntiFakeCodeVaultReadiness> {
  const rows = await prisma.$queryRawUnsafe<VaultStatusRow[]>(
    `SELECT
       SUM(CASE
         WHEN code_ciphertext IS NULL AND code_iv IS NULL AND code_tag IS NULL AND code_key_id IS NULL
          AND code NOT LIKE 'AV1.%'
         THEN 1 ELSE 0 END) AS plaintext_rows,
       SUM(CASE
         WHEN ((code_ciphertext IS NOT NULL) + (code_iv IS NOT NULL) + (code_tag IS NOT NULL) + (code_key_id IS NOT NULL)) NOT IN (0, 4)
         THEN 1 ELSE 0 END) AS incomplete_rows,
       SUM(CASE
         WHEN code_ciphertext IS NULL AND code_iv IS NULL AND code_tag IS NULL AND code_key_id IS NULL
          AND code LIKE 'AV1.%'
         THEN 1 ELSE 0 END) AS orphan_locator_rows,
       SUM(CASE
         WHEN code_ciphertext IS NOT NULL AND code_iv IS NOT NULL AND code_tag IS NOT NULL AND code_key_id IS NOT NULL
          AND (
            code_hash IS NULL
            OR code_hash NOT REGEXP '^[0-9a-f]{64}$'
            OR BINARY code <> BINARY CONCAT('AV1.', code_hash)
          )
         THEN 1 ELSE 0 END) AS invalid_encrypted_rows
     FROM anti_fake_codes`,
  );
  const keyRows = await prisma.$queryRawUnsafe<VaultKeyRow[]>(
    `SELECT code_key_id, COUNT(1) AS row_count
       FROM anti_fake_codes
      WHERE code_ciphertext IS NOT NULL
      GROUP BY code_key_id`,
  );
  const row = rows[0] || {} as VaultStatusRow;
  return {
    plaintextRows: count(row.plaintext_rows),
    incompleteRows: count(row.incomplete_rows),
    orphanLocatorRows: count(row.orphan_locator_rows),
    invalidEncryptedRows: count(row.invalid_encrypted_rows),
    unavailableKeys: keyRows
      .filter((item) => !vault.hasKey(item.code_key_id))
      .map((item) => ({ keyId: String(item.code_key_id || '<missing>'), rows: count(item.row_count) })),
  };
}

export async function assertAntiFakeCodeVaultReady(
  env: Record<string, string | undefined> = process.env,
) {
  if (!requiresEncryptedAntiFakeVault(env)) return;

  const vault = new AntiCounterfeitCodeVault(env);
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const message = readinessFailureMessage(await inspectAntiFakeCodeVault(prisma, vault));
    if (message) throw new Error(message);
  } catch (error) {
    const message = String((error as Error)?.message || error);
    if (message.startsWith('[anti-fake-vault]')) throw error;
    throw new Error(
      '[anti-fake-vault] Unable to verify encrypted code storage. Apply database migrations before starting the service. '
      + message,
      { cause: error },
    );
  } finally {
    await prisma.$disconnect();
  }
}
