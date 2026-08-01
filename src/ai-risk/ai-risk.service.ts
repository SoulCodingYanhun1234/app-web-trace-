import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

type ProviderConfig = {
  id: string;
  name: string;
  model: string;
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  specialty: string;
};

type TraceRecordLike = Record<string, any> & {
  id: number | string;
  trace_no?: string | null;
  anti_fake_code?: string | null;
  trace_chain?: unknown;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
};

type TraceAssessment = {
  trace: TraceRecordLike;
  chain: any[];
  issues: string[];
};

@Injectable()
export class AiRiskService {
  private readonly logger = new Logger(AiRiskService.name);

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  private providers(): ProviderConfig[] {
    const raw = this.config.get<string>('AI_MODEL_PROVIDERS', '');
    let parsed: any[] = [];
    if (raw) {
      try { parsed = JSON.parse(raw); } catch { this.logger.warn('AI_MODEL_PROVIDERS 不是有效 JSON，将使用环境变量配置'); }
    }
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map((item, index) => ({
        id: String(item.id || `provider-${index + 1}`),
        name: String(item.name || item.id || `模型 ${index + 1}`),
        model: String(item.model || 'gpt-4o-mini'),
        baseUrl: String(item.baseUrl || item.base_url || 'https://api.openai.com/v1').replace(/\/$/, ''),
        apiKey: item.apiKey || item.api_key || (item.apiKeyEnv || item.api_key_env ? this.config.get<string>(String(item.apiKeyEnv || item.api_key_env), '') : ''),
        enabled: item.enabled !== false,
        specialty: String(item.specialty || '溯源链完整性与异常研判'),
      }));
    }
    const apiKey = this.config.get<string>('OPENAI_API_KEY', '');
    return [{
      id: 'openai-compatible',
      name: this.config.get<string>('AI_MODEL_NAME', 'OpenAI 兼容模型'),
      model: this.config.get<string>('AI_MODEL', 'gpt-4o-mini'),
      baseUrl: (this.config.get<string>('AI_BASE_URL', 'https://api.openai.com/v1') || '').replace(/\/$/, ''),
      apiKey,
      enabled: Boolean(apiKey),
      specialty: '溯源链完整性、时序与缺失字段研判',
    }];
  }

  models() {
    const providers = this.providers();
    return {
      providers: providers.map((item) => ({ id: item.id, name: item.name, model: item.model, enabled: item.enabled && Boolean(item.apiKey), specialty: item.specialty })),
      configured: providers.some((item) => item.enabled && Boolean(item.apiKey)),
      protocol: 'OpenAI Compatible',
      updated_at: new Date().toISOString(),
    };
  }

  private traceChain(value: unknown): any[] {
    if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object');
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
      } catch { return []; }
    }
    return [];
  }

  private traceIssues(trace: Record<string, any>) {
    const chain = this.traceChain(trace.trace_chain);
    const nodeText = chain.map((node) => `${node.node_type || ''} ${node.node_name || ''} ${node.content || ''}`).join(' ');
    const issues: string[] = [];
    if (!trace.product_id) issues.push('未关联产品档案');
    if (!trace.anti_fake_code) issues.push('未关联防伪码');
    if (!trace.batch_no) issues.push('缺少生产批次');
    if (!trace.production_date) issues.push('缺少生产日期');
    if (chain.length < 3) issues.push(`溯源节点偏少（当前 ${chain.length} 个）`);
    if (!/生产|加工|入库|product/i.test(nodeText)) issues.push('缺少生产或入库节点');
    if (!/质检|检验|合格|quality/i.test(nodeText)) issues.push('缺少质检节点');
    if (!/装箱|发货|物流|仓储|box|shipment|logistics/i.test(nodeText)) issues.push('缺少装箱、发货或物流节点');
    return { chain, issues };
  }

  async overview() {
    const traces: TraceRecordLike[] = await this.prisma.traceRecord.findMany({
      orderBy: { updated_at: 'desc' },
      take: 200,
    }).catch((): TraceRecordLike[] => []);
    const assessed: TraceAssessment[] = traces.map((trace: TraceRecordLike): TraceAssessment => ({
      trace,
      ...this.traceIssues(trace),
    }));
    const complete = assessed.filter((item) => item.issues.length === 0);
    const abnormal = assessed.filter((item) => item.issues.length >= 3);
    const tasks = assessed
      .filter((item) => item.issues.length > 0)
      .sort((a, b) => b.issues.length - a.issues.length)
      .slice(0, 8)
      .map((item) => ({
        id: `trace-${item.trace.id}`,
        record_id: item.trace.id,
        type: 'trace',
        severity: item.issues.length >= 4 ? 'danger' : 'warning',
        title: item.issues.length >= 4 ? '溯源链需重点补全' : '溯源链存在缺失项',
        subject: item.trace.trace_no || item.trace.anti_fake_code || `溯源记录 #${item.trace.id}`,
        detail: item.issues.join('；'),
        reasons: item.issues,
        time: item.trace.updated_at || item.trace.created_at,
        trace_record: item.trace,
      }));
    const completeRate = traces.length ? Math.round((complete.length / traces.length) * 10000) / 100 : 0;

    return {
      generated_at: new Date().toISOString(),
      mode: this.providers().some((item) => item.enabled && item.apiKey) ? 'model-assisted' : 'rule-engine',
      kpis: {
        ai_scanned: traces.length,
        complete_traces: complete.length,
        complete_rate: completeRate,
        anomaly_traces: abnormal.length,
        pending_tasks: tasks.length,
      },
      pipeline: [
        { key: 'archive', label: '产品与批次归档', status: traces.length ? 'healthy' : 'attention', value: `${traces.length} 条`, detail: '产品、防伪码、批次与生产信息统一归档' },
        { key: 'binding', label: '一物一码关联', status: assessed.some((item) => !item.trace.anti_fake_code) ? 'attention' : 'healthy', value: `${assessed.filter((item) => item.trace.anti_fake_code).length} 条`, detail: '仅防伪码作为单品身份进入溯源链' },
        { key: 'route', label: '装箱与物流续写', status: assessed.some((item) => item.issues.some((issue) => issue.includes('装箱'))) ? 'attention' : 'healthy', value: `${assessed.filter((item) => !item.issues.some((issue) => issue.includes('装箱'))).length} 条`, detail: '装箱、发货、退货与查询节点自动续写' },
        { key: 'quality', label: '链路完整性研判', status: abnormal.length ? 'attention' : 'healthy', value: `${completeRate}%`, detail: '模型检查缺失字段、节点覆盖与时序一致性' },
      ],
      tasks,
      model_count: this.providers().filter((item) => item.enabled && item.apiKey).length,
      trace_count: traces.length,
    };
  }

  async analyze(payload: Record<string, any>) {
    const trace = payload.trace_record || payload.evidence || payload;
    const local = this.localTraceDecision(trace, payload);
    const provider = this.providers().find((item) => item.enabled && item.apiKey);
    if (!provider) return { ...local, provider: '规则引擎', model_used: false, generated_at: new Date().toISOString() };

    const text = JSON.stringify({
      subject: payload.subject || trace.trace_no || trace.anti_fake_code || '当前溯源记录',
      trace_record: trace,
      known_issues: payload.reasons || local.evidence,
      instruction: '检查溯源链完整性、节点时序、关键字段缺失和业务链路一致性。不要把箱码、发货码或其他业务码当成防窜预警对象。',
    });

    try {
      const response = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.1,
          max_tokens: 800,
          messages: [
            { role: 'system', content: '你是企业产品溯源分析助手。只基于提供的产品、批次、防伪码和 trace_chain 做审慎分析。输出简洁 JSON，字段为 risk_level、confidence、summary、evidence、actions。防窜预警只适用于防伪码，不对箱码、发货码、产品码或溯源码下防窜结论。' },
            { role: 'user', content: text.slice(0, 14_000) },
          ],
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`provider ${response.status}`);
      const json: any = await response.json();
      const content = json?.choices?.[0]?.message?.content || '';
      const parsed = this.parseJson(content);
      return {
        ...local,
        ...parsed,
        confidence: Math.max(0, Math.min(100, Number(parsed.confidence ?? local.confidence) || local.confidence)),
        evidence: Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 8).map(String) : local.evidence,
        actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 8).map(String) : local.actions,
        provider: provider.name,
        model: provider.model,
        model_used: true,
        generated_at: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.warn(`AI 模型调用失败，回退规则引擎: ${error instanceof Error ? error.message : String(error)}`);
      return { ...local, provider: `${provider.name}（回退规则引擎）`, model_used: false, generated_at: new Date().toISOString() };
    }
  }

  private parseJson(value: string): Record<string, any> {
    const cleaned = String(value).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(cleaned);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return { summary: cleaned.slice(0, 1000) };
    }
  }

  private localTraceDecision(trace: Record<string, any>, payload: Record<string, any>) {
    const { chain, issues } = this.traceIssues(trace || {});
    const suppliedReasons = Array.isArray(payload.reasons) ? payload.reasons.map(String) : [];
    const evidence = Array.from(new Set([...suppliedReasons, ...issues]));
    const issueCount = evidence.length;
    const riskLevel = issueCount >= 4 ? '需重点补全' : issueCount > 0 ? '需补全' : '链路完整';
    const confidence = Math.min(96, 72 + Math.min(chain.length, 8) * 2 + Math.min(issueCount, 5));
    return {
      risk_level: riskLevel,
      confidence,
      summary: issueCount
        ? `当前溯源链识别到 ${issueCount} 项缺失或待核验内容，建议补齐后再作为完整链路对外展示。`
        : '产品、批次、防伪码及主要业务节点已形成完整溯源链，暂未发现明显缺失。',
      evidence: evidence.length ? evidence : [`已识别 ${chain.length} 个溯源节点，关键字段齐全`],
      actions: issueCount
        ? ['补齐缺失的产品、批次或防伪码关联', '确认生产、质检、装箱和物流节点均已自动续写', '复核节点时间顺序并重新执行溯源自动同步']
        : ['保持自动同步开启', '定期抽查节点时间与业务单据一致性'],
    };
  }
}
