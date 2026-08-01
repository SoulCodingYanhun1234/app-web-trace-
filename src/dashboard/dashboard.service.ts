import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

@Injectable()
export class DashboardService {
  private readonly codeVault = new AntiCounterfeitCodeVault();
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      products,
      codes,
      boxes,
      logQueries,
      agents,
      shipments,
      fakeCount,
      codeQueryAgg,
      logTodayQueries,
      todayTouchedCodes,
    ] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.antiFakeCode.count(),
      this.prisma.box.count(),
      this.prisma.queryLog.count(),
      this.prisma.agent.count(),
      this.prisma.shipment.count(),
      this.prisma.queryLog.count({ where: { result: 0 } }),
      this.prisma.antiFakeCode.aggregate({ _sum: { query_count: true }, where: { query_count: { gt: 0 } } }),
      this.prisma.queryLog.count({ where: { created_at: { gte: today } } }),
      this.prisma.antiFakeCode.count({ where: { last_query_at: { gte: today } } }),
    ]);

    const codeQueries = numberValue(codeQueryAgg._sum.query_count);

    // 首页“今日查询”必须统计今天实际发生的查询日志。
    // 旧数据没有 query_logs 时，只能用今天发生过扫码的防伪码数量兜底，不能把某个码累计 query_count 全部算到今天。
    return {
      products,
      codes,
      boxes,
      queries: Math.max(logQueries, codeQueries),
      agents,
      shipments,
      todayQueries: logTodayQueries || todayTouchedCodes,
      fakeCount,
    };
  }

  async trend(days?: number | string) {
    const length = clampInt(days, 14, 7, 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (length - 1));

    const buckets = new Map<string, { date: string; count: number; queries: number; verified: number; abnormal: number; active: number; query_count: number }>();
    for (let i = 0; i < length; i += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      const key = dayKey(date);
      buckets.set(key, { date: key, count: 0, queries: 0, verified: 0, abnormal: 0, active: 0, query_count: 0 });
    }

    const [logs, queriedCodes, activatedCodes] = await Promise.all([
      this.prisma.queryLog.findMany({
        where: { created_at: { gte: start } },
        select: { created_at: true, result: true },
        orderBy: { created_at: 'asc' },
        take: 50000,
      }),
      this.prisma.antiFakeCode.findMany({
        where: {
          query_count: { gt: 0 },
          OR: [
            { last_query_at: { gte: start } },
            { first_query_at: { gte: start } },
          ],
        },
        select: { first_query_at: true, last_query_at: true, query_count: true, status: true },
        take: 50000,
      }),
      this.prisma.antiFakeCode.findMany({
        where: { activated_at: { gte: start } },
        select: { activated_at: true },
        take: 50000,
      }),
    ]);

    for (const row of logs) {
      const bucket = buckets.get(dayKey(row.created_at));
      if (!bucket) continue;
      bucket.queries += 1;
      bucket.query_count += 1;
      bucket.count += 1;
      if (Number(row.result) === 1) bucket.verified += 1;
      if (Number(row.result) === 0) bucket.abnormal += 1;
    }

    // 如果历史版本只更新了防伪码表，没有写 query_logs，只能按“当天被查询过的码数”兜底为 1 次。
    // 不能把 anti_fake_codes.query_count 累计值挂到 last_query_at 当天，否则趋势图会显示某个码的累计查询次数。
    for (const row of queriedCodes) {
      const date = row.last_query_at || row.first_query_at;
      if (!date) continue;
      const bucket = buckets.get(dayKey(date));
      if (!bucket) continue;
      if (bucket.query_count > 0) continue;
      const fallbackCount = 1;
      bucket.queries += fallbackCount;
      bucket.query_count += fallbackCount;
      bucket.count += fallbackCount;
      if ([1, 4].includes(Number(row.status))) bucket.verified += fallbackCount;
    }

    for (const row of activatedCodes) {
      if (!row.activated_at) continue;
      const bucket = buckets.get(dayKey(row.activated_at));
      if (bucket) bucket.active += 1;
    }

    return Array.from(buckets.values());
  }


  private rankPlainRows(rows: any[], keyFn: (item: any) => string, limit = 8) {
    const map = new Map<string, number>();
    rows.forEach((item: any) => {
      const key = keyFn(item) || '未识别';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  async antiChannelingSummary() {
    const table = (this.prisma as any).antiChannelingAlert;
    if (!table) {
      return {
        total: 0,
        pending: 0,
        severe: 0,
        today: 0,
        type_rank: [],
        area_rank: [],
        dealer_rank: [],
        map_hotspots: [],
        map_flows: [],
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = new Date(Date.now() - 30 * 86400 * 1000);

    const [total, pending, severe, todayCount, rows] = await Promise.all([
      table.count({}).catch(() => 0),
      table.count({ where: { status: { in: [0, 1, 2] } } }).catch(() => 0),
      table.count({ where: { severity: { gte: 4 }, status: { lt: 3 } } }).catch(() => 0),
      table.count({ where: { created_at: { gte: today } } }).catch(() => 0),
      table.findMany({
        where: { created_at: { gte: since } },
        select: {
          alert_type: true,
          severity: true,
          status: true,
          agent_id: true,
          agent_name: true,
          authorized_region: true,
          authorized_province: true,
          actual_location: true,
          actual_province: true,
        },
        orderBy: { created_at: 'desc' },
        take: 3000,
      }).catch(() => []),
    ]);

    const type_rank = this.rankPlainRows(rows, (item: any) => item.alert_type);
    const area_rank = this.rankPlainRows(rows, (item: any) => item.actual_province || '未识别');
    const dealer_rank = this.rankPlainRows(rows, (item: any) => item.agent_name || (item.agent_id ? `代理商#${item.agent_id}` : ''));

    const actualMap = new Map<string, number>();
    const authMap = new Map<string, number>();
    const flowMap = new Map<string, any>();
    for (const item of rows) {
      const actualProvince = String(item.actual_province || '').trim();
      const authProvince = String(item.authorized_province || '').trim();
      if (actualProvince) actualMap.set(actualProvince, (actualMap.get(actualProvince) || 0) + 1);
      if (authProvince) authMap.set(authProvince, (authMap.get(authProvince) || 0) + 1);
      if (actualProvince && authProvince && actualProvince !== authProvince) {
        const key = `${authProvince}→${actualProvince}`;
        const existed = flowMap.get(key);
        if (existed) existed.count += 1;
        else {
          flowMap.set(key, {
            from: item.authorized_region || authProvince,
            fromProvince: authProvince,
            to: item.actual_location || actualProvince,
            toProvince: actualProvince,
            count: 1,
          });
        }
      }
    }

    const map_hotspots = [
      ...Array.from(actualMap.entries()).map(([province, count]) => ({ province, count, isActual: true })),
      ...Array.from(authMap.entries()).map(([province, count]) => ({ province, count, isActual: false })),
    ].sort((a, b) => b.count - a.count).slice(0, 30);
    const map_flows = Array.from(flowMap.values()).sort((a: any, b: any) => b.count - a.count).slice(0, 20);

    return { total, pending, severe, today: todayCount, type_rank, area_rank, dealer_rank, map_hotspots, map_flows };
  }


  async codeDistribution() {
    const rows = await this.prisma.antiFakeCode.groupBy({ by: ['status'], _count: { _all: true } });
    return rows.map((row: { status: number; _count: { _all: number } }) => ({ status: row.status, total: row._count._all }));
  }

  async recentQueries(limit = 10) {
    const take = Math.min(Math.max(Number(limit), 1), 100);
    const storedLogs = await this.prisma.queryLog.findMany({ orderBy: { id: 'desc' }, take });
    const logHashes = storedLogs.map((item: any) => this.codeVault.hashFromReference(item.code)).filter(Boolean) as string[];
    const logCodeRows = logHashes.length ? await this.prisma.antiFakeCode.findMany({
      where: { code_hash: { in: logHashes } },
      select: { code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true },
    }) : [];
    const codeByReference = new Map<string, string>();
    for (const stored of logCodeRows) {
      const hydrated = this.codeVault.hydrate(stored as any);
      codeByReference.set(this.codeVault.reference(hydrated.code), hydrated.code);
    }
    const logs = storedLogs.map((item: any) => ({ ...item, code: codeByReference.get(String(item.code || '')) || item.code }));
    if (logs.length >= take) return logs;

    const existingCodes = new Set(logs.map((item: any) => String(item.code || '')).filter(Boolean));
    const fallbackCodes = await this.prisma.antiFakeCode.findMany({
      where: { query_count: { gt: 0 }, last_query_at: { not: null } },
      select: {
        code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true,
        status: true, query_count: true, first_query_at: true, last_query_at: true,
      },
      orderBy: { last_query_at: 'desc' },
      take: take * 2,
    });

    const fallback = this.codeVault.hydrateMany(fallbackCodes as any[])
      .filter((item: any) => !existingCodes.has(String(item.code || '')))
      .slice(0, take - logs.length)
      .map((item: any) => ({
        id: `code-${item.code}`,
        code: item.code,
        result: [1, 4].includes(Number(item.status)) ? 1 : 0,
        channel: 'code-table',
        location: null,
        ip: null,
        user_agent: null,
        query_count: item.query_count || 0,
        created_at: item.last_query_at,
        updated_at: item.last_query_at,
      }));

    return [...logs, ...fallback];
  }

  async agentRank(limit = 10) {
    const take = Math.min(Math.max(Number(limit), 1), 50);
    const grouped = await this.prisma.shipment.groupBy({
      by: ['agent_id'],
      where: { agent_id: { not: null } },
      _count: { _all: true },
    });
    const rows = grouped.sort((a: any, b: any) => b._count._all - a._count._all).slice(0, take);
    const ids = rows.map((row: any) => Number(row.agent_id)).filter((id: any) => Number.isFinite(id));
    const agents: any[] = ids.length ? await this.prisma.agent.findMany({ where: { id: { in: ids } }, select: { id: true, agent_name: true, agent_code: true } }) : [];
    const agentMap = new Map<number, any>(agents.map((agent: any) => [Number(agent.id), agent]));
    return rows.map((row: any) => {
      const agent = agentMap.get(Number(row.agent_id));
      return {
        agent_id: row.agent_id,
        agent_name: agent?.agent_name || agent?.agent_code || `Agent #${row.agent_id}`,
        count: row._count._all,
      };
    });
  }
}
