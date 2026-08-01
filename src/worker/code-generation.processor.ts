import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResourcesService } from '../resources/resources.service.js';
import { AntiCounterfeitCodePolicy } from '../common/anti-counterfeit-code.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 16);

@Injectable()
@Processor('code-generation')
export class CodeGenerationProcessor extends WorkerHost {
  private readonly codePolicy = new AntiCounterfeitCodePolicy();
  private readonly codeVault = new AntiCounterfeitCodeVault();

  constructor(private readonly prisma: PrismaService, private readonly resources: ResourcesService) {
    super();
  }

  async process(job: Job<Record<string, any>>) {
    const { product_id, count = 1, batch_no, prefix = '', expires_at } = job.data;
    const total = Math.min(Math.max(Number(count), 1), 100000);
    const batchNo = String(batch_no || '').trim();
    if (!batchNo) throw new Error('请手动填写生产批号');
    const productId = product_id ? Number(product_id) : null;
    if (!productId || !Number.isInteger(productId) || productId <= 0) {
      throw new Error('请先创建并选择产品，再生成防伪码');
    }
    const expiresAt = expires_at ? new Date(expires_at) : null;
    const productData = await this.resources.productOwnershipSnapshotForCodes(productId);
    if (!productData.product_id) throw new Error('所选产品不存在，请先创建产品再生成防伪码');
    const chunkSize = 1000;
    let inserted = 0;

    for (let i = 0; i < total; i += chunkSize) {
      const chunk = Array.from({ length: Math.min(chunkSize, total - i) }, () => {
        const code = this.codePolicy.issueOrLegacy(() => nanoid());
        return {
          __plaintext: code,
          ...productData,
          product_id: productId,
          batch_no: batchNo,
          ...this.codeVault.persistence(code),
          prefix: String(prefix || '').slice(0, 32) || null,
          status: job.data.auto_activate !== false ? 1 : 0,
          anti_channeling_enabled: job.data.anti_channeling_enabled !== false,
          activated_at: job.data.auto_activate !== false ? new Date() : null,
          expires_at: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        };
      });
      const storedChunk = chunk.map(({ __plaintext, ...row }) => row);
      const result = await this.prisma.antiFakeCode.createMany({ data: storedChunk, skipDuplicates: true });
      inserted += result.count;
      const createdStoredRows = await this.prisma.antiFakeCode.findMany({
        where: { code_hash: { in: chunk.map((item) => item.code_hash) } },
      }).catch(() => storedChunk);
      const createdRows = this.codeVault.hydrateMany(createdStoredRows as any[]);
      await this.resources.recordTraceForCodes(createdRows, '防伪码异步生成', {
        node_type: '防伪码',
        trace_key: `code-async-batch-generated:${batchNo}:${i}`,
        content: `异步批次 ${batchNo} 自动生成防伪码`,
        product_id: productId,
        batch_no: batchNo,
        expires_at: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
        detail: {
          expires_at: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null,
          anti_channeling_enabled: job.data.anti_channeling_enabled !== false,
        },
      }, { dedupeEvent: true }).catch(() => undefined);
      await job.updateProgress(Math.floor((inserted / total) * 100));
    }

    return { count: inserted, batch_no: batchNo };
  }
}
