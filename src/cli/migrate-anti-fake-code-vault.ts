import { PrismaClient } from '@prisma/client';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

type LegacyRow = {
  id: number;
  code: string;
  code_hash: string | null;
};

export type AntiFakeCodeVaultMigrationOptions = {
  apply?: boolean;
  batchSize?: number;
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
};

function normalizeBatchSize(value: unknown) {
  const parsed = Number(value || 250);
  if (!Number.isFinite(parsed)) return 250;
  return Math.min(Math.max(Math.trunc(parsed), 1), 1000);
}

export async function migrateAntiFakeCodeVault(options: AntiFakeCodeVaultMigrationOptions = {}) {
  const apply = options.apply === true;
  const batchSize = normalizeBatchSize(options.batchSize);
  const log = options.log || console.log;
  const vault = new AntiCounterfeitCodeVault({
    ...(options.env || process.env),
    ANTI_FAKE_VAULT_REQUIRED: 'true',
    ANTI_FAKE_VAULT_ALLOW_PLAINTEXT_READ: 'true',
  });
  const prisma = new PrismaClient();

  const where = {
    code_ciphertext: null,
    NOT: { code: { startsWith: 'AV1.' } },
  } as const;

  async function readBatch(): Promise<LegacyRow[]> {
    return prisma.antiFakeCode.findMany({
      where,
      select: { id: true, code: true, code_hash: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
  }

  try {
    await prisma.$connect();
    if (!apply) {
      const [rows, total] = await Promise.all([
        readBatch(),
        prisma.antiFakeCode.count({ where }),
      ]);
      log(`[dry-run] ${total} plaintext rows require encryption.`);
      log(`[dry-run] First batch contains ${rows.length} rows. Re-run with --apply to modify them.`);
      return { migrated: 0, remaining: total };
    }

    let migrated = 0;
    while (true) {
      const rows = await readBatch();
      if (!rows.length) break;
      for (const row of rows) {
        const plaintext = String(row.code || '');
        const encrypted = vault.persistence(plaintext);
        if (row.code_hash && String(row.code_hash).toLowerCase() !== encrypted.code_hash) {
          throw new Error(`row ${row.id} has a code_hash mismatch; refusing to encrypt inconsistent data`);
        }
        if (vault.reveal(encrypted) !== plaintext) {
          throw new Error(`row ${row.id} failed the in-process encryption verification`);
        }
        const affected = await prisma.$executeRaw`
          UPDATE anti_fake_codes
             SET code = ${encrypted.code},
                 code_hash = ${encrypted.code_hash},
                 code_ciphertext = ${encrypted.code_ciphertext},
                 code_iv = ${encrypted.code_iv},
                 code_tag = ${encrypted.code_tag},
                 code_key_id = ${encrypted.code_key_id}
           WHERE id = ${row.id}
             AND code_ciphertext IS NULL
             AND BINARY code = BINARY ${plaintext}
        `;
        if (affected !== 1) throw new Error(`row ${row.id} changed concurrently; aborting`);
      }
      migrated += rows.length;
      log(`[progress] encrypted ${migrated} anti-counterfeit rows`);
    }
    log(`[complete] encrypted ${migrated} rows; plaintext code values were replaced by AV1 locators`);
    return { migrated, remaining: 0 };
  } finally {
    await prisma.$disconnect();
  }
}
