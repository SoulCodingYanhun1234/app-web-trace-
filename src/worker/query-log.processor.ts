import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

@Injectable()
@Processor('query-log')
export class QueryLogProcessor extends WorkerHost {
  private readonly codeVault = new AntiCounterfeitCodeVault();
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<Record<string, any>>) {
    const data = job.data;
    await this.prisma.queryLog.create({
      data: {
        code: data.code ? this.codeVault.reference(String(data.code)) : null,
        result: Number(data.result || 0),
        channel: data.channel || 'web',
        location: data.location || null,
        location_source: data.location_source || null,
        location_verified: data.location_verified === true,
        ip: data.ip || null,
        user_agent: data.user_agent || null,
        query_count: Number(data.query_count || 0),
      },
    });
    if (data.update_code !== false && data.code_id) {
      await this.prisma.antiFakeCode.update({
        where: { id: Number(data.code_id) },
        data: {
          status: data.is_real ? 4 : undefined,
          query_count: Number(data.query_count || 0),
          first_query_at: data.first_query_at ? new Date(data.first_query_at) : undefined,
          last_query_at: new Date(),
        },
      }).catch(() => undefined);
    }
    return { ok: true };
  }
}
