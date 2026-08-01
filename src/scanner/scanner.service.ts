import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ResourcesService } from '../resources/resources.service.js';
import { AntiChannelingService } from '../anti-channeling/anti-channeling.service.js';
import { safeJsonArray } from '../common/utils.js';
import { normalizeWorkflowKey, workflowList, workflowMeta, type WorkflowKey } from './workflow-meta.js';
import { classifyRegionFromCode, type ScanRegion } from './region-classifier.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';

const MAX_SCAN_CODE_LENGTH = 128;
const MAX_SCAN_URL_LENGTH = 2048;
const RAW_CODE_PREFIX_RE = /^(?:code|qr|sn|barcode|anti[-_]?fake[-_]?code|antiFakeCode|box|carton|ship|shipment|return|trace|region|防伪码|二维码|箱码|物流单号)[:：=]/i;

type Flow = {
  code: string;
  type: string;
  anti_fake_code: any;
  product: any;
  region: any;
  region_scan: ScanRegion;
  trace: any;
  box: any;
  boxes: any[];
  shipment: any;
  shipments: any[];
  return_order: any;
  chain: Array<Record<string, any>>;
  next_action: string;
};

@Injectable()
export class ScannerService {
  private readonly codeVault = new AntiCounterfeitCodeVault();
  constructor(private readonly prisma: PrismaService, private readonly resources: ResourcesService, private readonly antiChanneling: AntiChannelingService) {}

  private async findAntiFakeCode(code: string) {
    const row = await this.prisma.antiFakeCode.findFirst({
      where: { OR: [{ code_hash: this.codeVault.hash(code) }, { code }] },
    }).catch(() => null);
    return row ? this.codeVault.hydrate(row as any) : null;
  }

  private async findAntiFakeCodes(codes: string[]) {
    if (!codes.length) return [];
    const rows = await this.prisma.antiFakeCode.findMany({
      where: this.codeVault.whereForCodes(codes),
    }).catch(() => []);
    return this.codeVault.hydrateMany(rows as any[]);
  }

  workflows() {
    return workflowList();
  }

  private normalizeCode(input: unknown) {
    const raw = String(input || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (!raw) throw new BadRequestException('扫码内容不能为空');
    if (raw.length > MAX_SCAN_URL_LENGTH) throw new BadRequestException('扫码内容过长，请确认二维码内容是否正确');

    const finalize = (value: unknown) => {
      const text = String(value || '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(RAW_CODE_PREFIX_RE, '')
        .replace(/^\*|\*$/g, '')
        .trim();
      if (!text) throw new BadRequestException('扫码内容不能为空');
      if (text.length > MAX_SCAN_CODE_LENGTH) throw new BadRequestException(`扫码内容不能超过 ${MAX_SCAN_CODE_LENGTH} 个字符`);
      return text;
    };

    try {
      const url = new URL(raw);
      const queryCode = url.searchParams.get('code') || url.searchParams.get('anti_fake_code') || url.searchParams.get('antiFakeCode') || url.searchParams.get('q') || url.searchParams.get('barcode') || url.searchParams.get('sn') || url.searchParams.get('c') || url.searchParams.get('box') || url.searchParams.get('carton') || url.searchParams.get('shipment') || url.searchParams.get('trace') || url.searchParams.get('region');
      if (queryCode) return finalize(queryCode);
      const parts = url.pathname.split('/').filter(Boolean);
      const verifyIndex = parts.findIndex((part) => ['verify', 'v', 'query', 'code', 'codes', 'qr', 'box', 'carton', 'shipment', 'trace', 'region'].includes(part.toLowerCase()));
      if (verifyIndex >= 0 && parts[verifyIndex + 1]) return finalize(decodeURIComponent(parts[verifyIndex + 1]));
      if (parts.length) return finalize(decodeURIComponent(parts[parts.length - 1]));
    } catch {
      // 普通条码不是 URL，继续按原文本处理。
    }

    const queryLike = raw.match(/(?:^|[?&#;\s,，])(?:code|anti_fake_code|antiFakeCode|q|barcode|sn|c|box|carton|shipment|return|trace|region)=([^&#;\s,，]+)/i);
    if (queryLike?.[1]) { try { return finalize(decodeURIComponent(queryLike[1])); } catch { return finalize(queryLike[1]); } }
    return finalize(raw);
  }

  private async findBoxByScan(code: string) {
    const normalized = this.normalizeCode(code);
    const byNo = await this.prisma.box.findFirst({ where: { box_no: normalized } }).catch(() => null);
    if (byNo) return byNo;
    const asNumber = Number(normalized);
    if (Number.isInteger(asNumber) && asNumber > 0) {
      const byId = await this.prisma.box.findUnique({ where: { id: asNumber } }).catch(() => null);
      if (byId) return byId;
    }
    return null;
  }

  private async requireBoxByScan(scan: unknown) {
    const code = this.normalizeCode(scan);
    const box = await this.findBoxByScan(code);
    if (!box) throw new NotFoundException('箱子不存在，请确认扫描的是箱号或箱子ID');
    return box;
  }

  private async findShipmentByScan(code: string) {
    const normalized = this.normalizeCode(code);
    const byNo = await this.prisma.shipment.findFirst({ where: { shipment_no: normalized } }).catch(() => null);
    if (byNo) return byNo;
    const asNumber = Number(normalized);
    if (Number.isInteger(asNumber) && asNumber > 0) {
      const byId = await this.prisma.shipment.findUnique({ where: { id: asNumber } }).catch(() => null);
      if (byId) return byId;
    }
    return null;
  }

  private async requireShipmentByScan(scan: unknown) {
    const code = this.normalizeCode(scan);
    const shipment = await this.findShipmentByScan(code);
    if (!shipment) throw new NotFoundException('发货单不存在，请确认扫描的是发货单号或填写的是发货单ID');
    return shipment;
  }

  private async requireAgent(agentInput: unknown) {
    const raw = String(agentInput || '').trim();
    if (!raw) throw new BadRequestException('请选择归属代理商');
    const asNumber = Number(raw);
    let agent: any = null;
    if (Number.isInteger(asNumber) && asNumber > 0) {
      agent = await this.prisma.agent.findUnique({ where: { id: asNumber } }).catch(() => null);
    }
    if (!agent) {
      agent = await this.prisma.agent.findFirst({
        where: {
          OR: [
            { agent_code: raw },
            { agent_name: raw },
            { agent_name: { contains: raw } },
          ],
        },
        orderBy: { id: 'desc' },
      }).catch(() => null);
    }
    if (!agent) throw new NotFoundException('代理商不存在，请先在企业主体管理中维护');
    if (Number(agent.status) !== 1) throw new BadRequestException('该代理商已被禁用，不能归属发货');
    return agent;
  }

  private async requireProductRegion(regionInput: unknown) {
    const raw = String(regionInput || '').trim();
    if (!raw) throw new BadRequestException('请选择归属地区');
    const asNumber = Number(raw);
    let region: any = null;
    if (Number.isInteger(asNumber) && asNumber > 0) {
      region = await this.prisma.productRegion.findUnique({ where: { id: asNumber } }).catch(() => null);
    }
    if (!region) {
      region = await this.prisma.productRegion.findFirst({
        where: {
          OR: [
            { region_group: raw },
            { region_group: { contains: raw } },
            { province_name: raw },
            { city_name: raw },
          ],
        },
        orderBy: { id: 'desc' },
      }).catch(() => null);
    }
    if (!region) throw new NotFoundException('地区分类不存在，请先在地区分类中维护');
    if (Number(region.status ?? 1) !== 1) throw new BadRequestException('该地区分类已禁用，不能归属发货');
    return region;
  }

  private shipmentNo() {
    return `SHIP${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  }

  private async createAttributedShipment(agentInput: unknown, regionInput: unknown, payload: Record<string, any> = {}) {
    const region = regionInput ? await this.requireProductRegion(regionInput) : null;
    const agent = agentInput ? await this.requireAgent(agentInput) : (region?.agent_id ? await this.requireAgent(region.agent_id) : null);
    if (!agent) throw new BadRequestException('请选择收件代理商');
    const authorization = this.resources.resolveShipmentAgentLocation(agent);
    if (!authorization.province_name || !authorization.city_name) {
      throw new BadRequestException('所选收件代理商必须配置完整省、市位置');
    }
    if (!String(agent.address || '').trim()) throw new BadRequestException('所选收件代理商尚未配置详细地址，请先完善代理商档案');

    const data: Record<string, any> = {
      shipment_no: String(payload.shipment_no || '').trim() || this.shipmentNo(),
      agent_id: agent.id,
      distributor: agent.agent_name || agent.agent_code || null,
      receiver: String(agent.agent_name || agent.agent_code || '').slice(0, 64) || null,
      receiver_phone: agent.contact_phone || null,
      receiver_address: authorization.receiver_address || authorization.raw_address || null,
      sender_address: authorization.receiver_address || authorization.raw_address || null,
      authorization_address: authorization.raw_address || null,
      authorization_level: authorization.city_name ? 'city' : 'province',
      authorization_source: authorization.basis,
      province_name: authorization.province_name || null,
      city_name: authorization.city_name || null,
      region_group: authorization.region_group || null,
      box_ids: [],
      status: 0,
    };
    for (const key of ['logistics_company', 'logistics_no', 'sender', 'remark']) {
      if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') data[key] = payload[key];
    }
    if (region && !data.remark) data.remark = `扫码发货；关联地区：${region.region_group || [region.province_name, region.city_name].filter(Boolean).join(' / ') || region.id}`;

    const shipment = await this.prisma.shipment.create({ data });
    return { agent, region, shipment };
  }

  private async findReturnByScan(code: string) {
    const normalized = this.normalizeCode(code);
    const byNo = await this.prisma.returnOrder.findFirst({ where: { return_no: normalized } }).catch(() => null);
    if (byNo) return byNo;
    const asNumber = Number(normalized);
    if (Number.isInteger(asNumber) && asNumber > 0) {
      const byId = await this.prisma.returnOrder.findUnique({ where: { id: asNumber } }).catch(() => null);
      if (byId) return byId;
    }
    return null;
  }

  private async productById(productId?: number | null) {
    return productId ? this.prisma.product.findUnique({ where: { id: productId } }).catch(() => null) : null;
  }

  private async productByCode(productCode?: string | null) {
    const code = String(productCode || '').trim();
    if (!code) return null;
    return this.prisma.product.findFirst({ where: { product_code: code } }).catch(() => null);
  }

  private async regionByScan(scan: ScanRegion, product?: any) {
    const productCode = String(product?.product_code || scan.product_code || '').trim();
    if (!productCode && !product?.id) return null;
    const where: Record<string, any> = { OR: [] };
    if (product?.id) where.OR.push({ product_id: Number(product.id) });
    if (productCode) where.OR.push({ product_code: productCode });
    if (scan.province_name) where.province_name = scan.province_name;
    if (scan.city_name) where.city_name = scan.city_name;
    if (!where.OR.length) delete where.OR;
    const exact = await this.prisma.productRegion.findFirst({ where, orderBy: { id: 'desc' } }).catch(() => null);
    if (exact) return exact;
    if (!productCode) return null;
    return this.prisma.productRegion.findFirst({ where: { product_code: productCode }, orderBy: { id: 'desc' } }).catch(() => null);
  }

  private async syncRegionScan(scan: ScanRegion, product?: any, code?: string) {
    const productCode = String(product?.product_code || scan.product_code || '').trim();
    if (!productCode || !scan.province_name) return null;
    const existing = await this.regionByScan(scan, product);
    const data: Record<string, any> = {
      product_id: product?.id || existing?.product_id || null,
      product_code: productCode,
      product_name: product?.product_name || existing?.product_name || `${productCode}产品`,
      brand: product?.brand || existing?.brand || null,
      category: product?.category || existing?.category || null,
      province_code: scan.province_code || existing?.province_code || null,
      city_code: scan.city_code || existing?.city_code || null,
      province_name: scan.province_name,
      city_name: scan.city_name || null,
      region_group: scan.region_group || existing?.region_group || null,
      code_rule: scan.province_code && scan.city_code ? `FW-${scan.province_code}-${scan.city_code}-${productCode}-*` : existing?.code_rule || `${productCode}-*`,
      scan_count: Number(existing?.scan_count || 0) + 1,
      last_scan_code: code || scan.code,
      last_scan_at: new Date(),
      authorized_status: existing?.authorized_status || '正常授权',
      status: existing?.status ?? 1,
    };
    if (existing?.id) return this.prisma.productRegion.update({ where: { id: existing.id }, data }).catch(() => existing);
    return this.prisma.productRegion.create({ data }).catch(() => null);
  }

  private async boxesByCode(code: string, antiFakeCode?: any, directBox?: any) {
    if (directBox) return [directBox];
    try {
      const reference = this.codeVault.reference(code);
      const rows = await this.prisma.$queryRaw<any[]>`SELECT * FROM boxes WHERE JSON_CONTAINS(codes, JSON_QUOTE(${reference})) OR JSON_CONTAINS(codes, JSON_QUOTE(${code})) ORDER BY id DESC LIMIT 20`;
      if (rows.length) return rows;
    } catch {
      // JSON 查询失败时走小范围回退，避免阻断扫码主链路。
    }

    const where: Record<string, any> = {};
    if (antiFakeCode?.product_id) where.product_id = antiFakeCode.product_id;
    if (antiFakeCode?.batch_no) where.batch_no = antiFakeCode.batch_no;
    const candidates = await this.prisma.box.findMany({ where, orderBy: { id: 'desc' }, take: 200 }).catch(() => []);
    const reference = this.codeVault.reference(code);
    return candidates.filter((box: any) => {
      const stored = safeJsonArray(box.codes).map(String);
      return stored.includes(code) || stored.includes(reference);
    });
  }

  private async shipmentsByBoxes(boxes: any[], directShipment?: any) {
    if (directShipment) return [directShipment];
    const boxIds = boxes.map((box: any) => Number(box.id)).filter((id: number) => Number.isFinite(id));
    if (!boxIds.length) return [];
    const byRaw: any[] = [];
    for (const id of boxIds) {
      try {
        const rows = await this.prisma.$queryRaw<any[]>`SELECT * FROM shipments WHERE JSON_CONTAINS(box_ids, ${JSON.stringify(id)}) ORDER BY id DESC LIMIT 20`;
        byRaw.push(...rows);
      } catch {
        // 兼容非 MySQL 或 JSON 查询不可用的环境。
      }
    }
    if (byRaw.length) return Array.from(new Map(byRaw.map((row: any) => [row.id, row])).values());

    const candidates = await this.prisma.shipment.findMany({ orderBy: { id: 'desc' }, take: 500 }).catch(() => []);
    return candidates.filter((shipment: any) => safeJsonArray(shipment.box_ids).map(Number).some((id: number) => boxIds.includes(id)));
  }

  private buildChain(flow: Omit<Flow, 'chain' | 'next_action'>) {
    const chain = [
      flow.product && { key: 'product', label: '产品', status: flow.product.status, product_id: flow.product.id, product_code: flow.product.product_code, product_name: flow.product.product_name },
      flow.anti_fake_code && { key: 'code', label: '防伪码', status: flow.anti_fake_code.status, code: flow.anti_fake_code.code },
      flow.region && { key: 'region', label: '地区分类', status: flow.region.status, region_group: flow.region.region_group, province_name: flow.region.province_name, city_name: flow.region.city_name },
      flow.trace && { key: 'trace', label: '溯源', status: flow.trace.status, trace_no: flow.trace.trace_no, batch_no: flow.trace.batch_no },
      flow.box && { key: 'box', label: '装箱', status: flow.box.status, box_id: flow.box.id, box_no: flow.box.box_no, code_count: safeJsonArray(flow.box.codes).length },
      flow.shipment && { key: 'shipment', label: '发货', status: flow.shipment.status, shipment_id: flow.shipment.id, shipment_no: flow.shipment.shipment_no, logistics_no: flow.shipment.logistics_no },
    ].filter(Boolean) as Array<Record<string, any>>;
    const nextAction = !flow.anti_fake_code && !flow.trace ? '先生成并维护防伪码/溯源记录'
      : !flow.region ? '确认产品地区分类'
      : !flow.trace ? '补齐溯源记录'
      : !flow.box ? '扫码装箱'
      : !flow.shipment ? '加入发货单'
      : Number(flow.shipment.status) === 0 ? '确认发货'
      : Number(flow.shipment.status) === 1 ? '等待签收'
      : '链路完成';
    return { chain, next_action: nextAction };
  }

  async resolveFlow(input: string): Promise<Flow> {
    const code = this.normalizeCode(input);
    const [antiFakeCode, directBox, directShipment, returnOrder, directTrace, directProduct] = await Promise.all([
      this.findAntiFakeCode(code),
      this.findBoxByScan(code),
      this.findShipmentByScan(code),
      this.findReturnByScan(code),
      this.prisma.traceRecord.findFirst({ where: { OR: [{ trace_no: code }, { anti_fake_code: { in: [code, this.codeVault.reference(code)] } }] } }),
      this.prisma.product.findFirst({ where: { product_code: code } }).catch(() => null),
    ]);

    const boxes = await this.boxesByCode(code, antiFakeCode, directBox);
    const shipments = await this.shipmentsByBoxes(boxes, directShipment);
    const trace = directTrace || (antiFakeCode ? await this.prisma.traceRecord.findFirst({ where: { anti_fake_code: { in: [antiFakeCode.code, this.codeVault.reference(antiFakeCode.code)] } } }) : null);
    const scanRegion = classifyRegionFromCode(code, { batch_no: antiFakeCode?.batch_no || trace?.batch_no || directBox?.batch_no || boxes[0]?.batch_no });
    const product = await this.productById(antiFakeCode?.product_id || trace?.product_id || directBox?.product_id || boxes[0]?.product_id || directProduct?.id || null) || directProduct || await this.productByCode(scanRegion.product_code);
    const enrichedRegion = product && !scanRegion.product_code ? classifyRegionFromCode(code, { ...scanRegion, product_code: product.product_code, batch_no: antiFakeCode?.batch_no || trace?.batch_no || directBox?.batch_no || boxes[0]?.batch_no }) : scanRegion;
    const region = await this.regionByScan(enrichedRegion, product);
    const type = antiFakeCode ? 'anti_fake_code' : directBox ? 'box' : directShipment ? 'shipment' : returnOrder ? 'return_order' : trace ? 'trace' : directProduct ? 'product' : region ? 'product_region' : 'unknown';
    const base = {
      code,
      type,
      anti_fake_code: antiFakeCode,
      product,
      region,
      region_scan: enrichedRegion,
      trace,
      box: directBox || boxes[0] || null,
      boxes,
      shipment: directShipment || shipments[0] || null,
      shipments,
      return_order: returnOrder,
    };
    return { ...base, ...this.buildChain(base) };
  }

  async resolve(input: string) {
    const flow = await this.resolveFlow(input);
    const suggestions: WorkflowKey[] = [];
    if (flow.anti_fake_code) suggestions.push('classification_boxing', 'box_code_binding', 'traceability');
    if (flow.region) suggestions.push('classification_boxing', 'traceability');
    if (flow.trace) suggestions.push('traceability');
    if (flow.box || flow.shipment) suggestions.push('shipment_shipping');
    if (!suggestions.length) suggestions.push('traceability');

    return {
      input,
      ...flow,
      found: Boolean(flow.product || flow.anti_fake_code || flow.region || flow.box || flow.shipment || flow.return_order || flow.trace),
      suggestions: Array.from(new Set(suggestions)).map((key) => ({ value: key, ...workflowMeta[key] })),
      flow,
    };
  }

  async search(keyword: string) {
    const code = this.normalizeCode(keyword);
    const result = await this.resolve(code);
    return result.found ? [result] : [];
  }

  private splitCodes(value: unknown) {
    const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,，;；|]+/);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of raw) {
      const text = String(item || '').trim();
      if (!text) continue;
      const code = this.normalizeCode(text);
      if (code && !seen.has(code)) {
        seen.add(code);
        result.push(code);
      }
    }
    return result;
  }

  private async mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
    const results = new Array<R>(items.length);
    let index = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        results[current] = await worker(items[current]);
      }
    });
    await Promise.all(runners);
    return results;
  }

  async execute(body: Record<string, any>) {
    const workflow = normalizeWorkflowKey(body.workflow);
    const resolved = await this.resolve(body.code);
    const code = resolved.code;

    switch (workflow) {
      case 'classification_boxing':
        return this.classificationBoxing(code, body.target_id, body.payload || {});
      case 'box_code_binding':
        return this.boxCodeBinding([code], body.target_id, body.payload || {}, false);
      case 'traceability':
        return this.traceability(code, body.payload || body);
      case 'shipment_shipping':
        return this.shipmentShipping(code, body.target_id, body.payload || {});
      default:
        throw new BadRequestException('不支持的扫码业务动作');
    }
  }

  async batchExecute(body: Record<string, any>) {
    const normalizedBody: Record<string, any> = { ...body, payload: { ...(body.payload || {}) } };
    const workflow = normalizeWorkflowKey(normalizedBody.workflow);
    const codes = this.splitCodes(body.codes ?? body.code);
    const maxBatchCodes = workflow === 'box_code_binding' ? Number.POSITIVE_INFINITY : 500;
    if (!codes.length) throw new BadRequestException('批量扫码内容不能为空');
    if (Number.isFinite(maxBatchCodes) && codes.length > maxBatchCodes) throw new BadRequestException(`单次批量扫码最多支持 ${maxBatchCodes} 条`);

    let preparedTarget: { agent: any; region?: any; shipment: any } | null = null;
    const agentTarget = normalizedBody.payload.agent_id ?? normalizedBody.agent_id ?? normalizedBody.target_agent_id;
    const regionTarget = normalizedBody.payload.region_id ?? normalizedBody.region_id ?? normalizedBody.target_region_id;
    if (workflow === 'shipment_shipping' && !normalizedBody.target_id && (agentTarget || regionTarget)) {
      preparedTarget = await this.createAttributedShipment(agentTarget, regionTarget, normalizedBody.payload);
      normalizedBody.target_id = preparedTarget.shipment.id;
      normalizedBody.payload = {
        ...normalizedBody.payload,
        agent_id: preparedTarget.agent?.id,
        shipment_id: preparedTarget.shipment.id,
        shipment_no: preparedTarget.shipment.shipment_no,
        region_id: preparedTarget.region?.id,
      };
    }

    if (workflow === 'box_code_binding') {
      return this.boxCodeBinding(codes, normalizedBody.target_id, normalizedBody.payload, true);
    }

    const concurrency = preparedTarget ? 1 : Math.min(Math.max(Number(process.env.SCANNER_BATCH_CONCURRENCY || 8), 1), 16);
    const results = await this.mapLimit(codes, concurrency, async (code) => {
      try {
        const data = await this.execute({ ...normalizedBody, code });
        return { code: this.normalizeCode(code), ok: true, data };
      } catch (error: any) {
        return { code, ok: false, message: error?.response?.message || error?.message || '执行失败' };
      }
    });
    return {
      total: codes.length,
      success: results.filter((item: any) => item.ok).length,
      failed: results.filter((item: any) => !item.ok).length,
      target: preparedTarget ? {
        agent: preparedTarget.agent,
        region: preparedTarget.region,
        shipment: preparedTarget.shipment,
      } : undefined,
      results,
    };
  }

  private expectedBoxBindCount(payload: Record<string, any>) {
    const raw = payload?.expected_count ?? payload?.small_code_count ?? payload?.box_capacity ?? 0;
    if (raw === undefined || raw === null || raw === '') return 0;
    const count = Number(raw);
    if (!Number.isInteger(count) || count < 0) throw new BadRequestException('小码数量必须是大于等于 0 的整数，0 表示无上限');
    return count;
  }

  private async findBindableSmallCodeRows(codes: string[]) {
    const rows: any[] = [];
    const chunkSize = 1000;
    for (let i = 0; i < codes.length; i += chunkSize) {
      const chunk = codes.slice(i, i + chunkSize);
      const matches = await this.findAntiFakeCodes(chunk);
      rows.push(...matches.filter((row: any) => Number(row.status) !== 3));
    }
    return rows;
  }

  private boxPayloadCapacity(payload: Record<string, any>, fallback = 10) {
    const raw = payload?.box_capacity ?? payload?.capacity ?? payload?.expected_count ?? fallback;
    const capacity = Number(raw);
    if (!Number.isFinite(capacity) || capacity < 0 || capacity > 50000) throw new BadRequestException('箱容量必须是 0-50000 的数字');
    return Math.floor(capacity);
  }

  private async findOrCreateScannedBox(boxScan: unknown, payload: Record<string, any>, firstCode?: any) {
    const boxNo = this.normalizeCode(boxScan);
    const existing = await this.findBoxByScan(boxNo);
    if (existing) return existing;

    const sameAsSmallCode = await this.findAntiFakeCode(boxNo);
    if (sameAsSmallCode) throw new BadRequestException('最后一次扫描的是产品小码，不是箱码/大码；请确认扫描顺序为“小码...小码，最后箱码”');

    const requireExisting = payload?.require_existing_box === true || String(payload?.require_existing_box || '').toLowerCase() === 'true';
    if (requireExisting) throw new NotFoundException('未找到已生成的装箱二维码，请先在装箱管理生成大码，再按“小码...小码，最后大码”的顺序扫描');

    const capacity = this.boxPayloadCapacity(payload, this.expectedBoxBindCount(payload));
    const boxSpec = String(payload?.box_spec || payload?.spec || '').trim() || (capacity > 0 ? `${capacity}个/箱` : null);
    const boxType = String(payload?.box_type || payload?.type || '一箱一码').trim();
    try {
      return await this.prisma.box.create({
        data: {
          product_id: firstCode?.product_id || null,
          batch_no: firstCode?.batch_no || null,
          box_no: boxNo,
          box_capacity: capacity > 0 ? capacity : null,
          box_spec: boxSpec,
          box_type: boxType,
          codes: [],
          status: 0,
        },
      });
    } catch {
      const createdByOtherRequest = await this.findBoxByScan(boxNo);
      if (createdByOtherRequest) return createdByOtherRequest;
      throw new BadRequestException('箱码创建失败，请确认箱码是否重复或数据库状态是否正常');
    }
  }

  private async assertSmallCodesCanBind(codes: string[], box: any, expectedCount: number, enforceExactCount: boolean) {
    if (!codes.length) throw new BadRequestException('请先扫描产品小码');
    if (enforceExactCount && expectedCount > 0 && codes.length !== expectedCount) {
      throw new BadRequestException(`请先扫满 ${expectedCount} 个产品小码，再扫描已生成的箱码/大码；当前产品小码 ${codes.length} 个`);
    }

    const rows = await this.findBindableSmallCodeRows(codes);
    const rowMap = new Map<string, any>(rows.map((item: any) => [String(item.code), item]));
    const missing = codes.filter((code) => !rowMap.has(code));
    if (missing.length) throw new BadRequestException(`以下产品小码不存在或已注销：${missing.slice(0, 10).join('、')}${missing.length > 10 ? '...' : ''}`);

    const existing = safeJsonArray(box.codes).map((item: any) => String(item).trim()).filter(Boolean);
    const toAdd = codes.filter((code) => !existing.includes(code) && !existing.includes(this.codeVault.reference(code)));
    const capacity = Number(box.box_capacity || 0);
    if (capacity > 0 && existing.length + toAdd.length > capacity) {
      throw new BadRequestException(`箱码 ${box.box_no || box.id} 容量为 ${capacity}，当前已有 ${existing.length} 个，本次新增 ${toAdd.length} 个会超出容量`);
    }
    return rows;
  }

  private async boxCodeBinding(codesInput: string[], target: unknown, payload: Record<string, any>, batchMode: boolean) {
    const normalized = Array.from(new Set(codesInput.map((item) => this.normalizeCode(item)).filter(Boolean)));
    const expectedCount = this.expectedBoxBindCount(payload);
    let boxScan = target ? this.normalizeCode(target) : '';
    let smallCodes = normalized;

    if (!boxScan) {
      if (!batchMode) throw new BadRequestException('一箱一码绑定请使用“批量/连续扫描”：先扫产品小码，最后扫已生成的装箱二维码');
      if (normalized.length < 2) throw new BadRequestException('请至少扫描 1 个产品小码，并在最后扫描已生成的箱码/大码');
      boxScan = normalized[normalized.length - 1];
      smallCodes = normalized.slice(0, -1);
    }

    if (smallCodes.includes(boxScan)) throw new BadRequestException('箱码/大码不能和产品小码重复');
    if (batchMode && !target && expectedCount > 0 && smallCodes.length !== expectedCount) {
      throw new BadRequestException(`请先扫满 ${expectedCount} 个产品小码，再扫描已生成的箱码/大码；当前产品小码 ${smallCodes.length} 个`);
    }

    const smallRows = await this.findBindableSmallCodeRows(smallCodes);
    const smallRowMap = new Map<string, any>(smallRows.map((item: any) => [String(item.code), item]));
    const missingSmallCodes = smallCodes.filter((code) => !smallRowMap.has(code));
    if (missingSmallCodes.length) {
      throw new BadRequestException(`以下产品小码不存在或已注销：${missingSmallCodes.slice(0, 10).join('、')}${missingSmallCodes.length > 10 ? '...' : ''}`);
    }

    const firstCode = smallRowMap.get(smallCodes[0]) || smallRows[0];
    const box = await this.findOrCreateScannedBox(boxScan, payload, firstCode);
    if (Number(box.status) === 2) throw new BadRequestException('已发货箱子不能继续绑定小码');
    const validRows = await this.assertSmallCodesCanBind(smallCodes, box, expectedCount, batchMode && !target);
    const result = await this.resources.addBoxCodes(box.id, smallCodes);
    const updatedBox = await this.prisma.box.findUnique({ where: { id: box.id } }).catch(() => box);
    const product = await this.productById(updatedBox?.product_id || box.product_id || validRows[0]?.product_id || null);
    const flow = await this.resolveFlow(updatedBox?.box_no || box.box_no || String(box.id));
    return {
      action: 'box_code_binding',
      message: `一箱一码绑定完成：箱码 ${updatedBox?.box_no || box.box_no || box.id} 关联 ${smallCodes.length} 个产品小码`,
      input: boxScan,
      code: updatedBox?.box_no || box.box_no || boxScan,
      found: true,
      type: 'box',
      product_id: updatedBox?.product_id || box.product_id || validRows[0]?.product_id || null,
      product,
      batch_no: updatedBox?.batch_no || box.batch_no || validRows[0]?.batch_no || null,
      box_id: updatedBox?.id || box.id,
      box_no: updatedBox?.box_no || box.box_no,
      box: updatedBox || box,
      small_codes: smallCodes,
      expected_count: expectedCount,
      result,
      flow,
    };
  }

  private async classificationBoxing(code: string, target: unknown, payload: Record<string, any>) {
    const antiFakeCode = await this.findAntiFakeCode(code);
    if (!antiFakeCode) throw new NotFoundException('分类装箱只能扫描单品防伪码，请确认码是否存在');
    if (Number(antiFakeCode.status) === 3) throw new BadRequestException('已注销防伪码不能装箱');

    const product = await this.productById(antiFakeCode.product_id);
    const box = target ? await this.requireBoxByScan(target) : await this.findOrCreateAutoBox(antiFakeCode, payload);
    if (Number(box.status) === 2) throw new BadRequestException('已发货箱子不能继续装箱');
    if (antiFakeCode.product_id && box.product_id && Number(antiFakeCode.product_id) !== Number(box.product_id)) {
      throw new BadRequestException('防伪码产品与箱子产品不一致，不能混装');
    }
    if (antiFakeCode.batch_no && box.batch_no && String(antiFakeCode.batch_no) !== String(box.batch_no)) {
      throw new BadRequestException('防伪码批次与箱子批次不一致，不能混装');
    }

    const result = await this.resources.addBoxCodes(box.id, [code]);
    const regionScan = classifyRegionFromCode(code, { product_code: product?.product_code, batch_no: antiFakeCode.batch_no || undefined });
    const region = await this.syncRegionScan(regionScan, product, code);
    const updatedBox = await this.prisma.box.findUnique({ where: { id: box.id } }).catch(() => box);
    const flow = await this.resolveFlow(code);
    return {
      action: 'classification_boxing',
      message: '分类装箱完成',
      input: code,
      code,
      found: true,
      type: 'anti_fake_code',
      anti_fake_code: antiFakeCode,
      category: product?.category || '未分类',
      product_id: antiFakeCode.product_id,
      product,
      region,
      region_scan: regionScan,
      batch_no: antiFakeCode.batch_no,
      box: updatedBox || box,
      result,
      flow,
    };
  }

  private async findOrCreateAutoBox(antiFakeCode: any, payload: Record<string, any>) {
    const where: Record<string, any> = { status: { not: 2 } };
    if (antiFakeCode.product_id) where.product_id = antiFakeCode.product_id;
    if (antiFakeCode.batch_no) where.batch_no = antiFakeCode.batch_no;
    const candidates = await this.prisma.box.findMany({ where, orderBy: { id: 'desc' }, take: 50 }).catch(() => []);
    for (const box of candidates) {
      const codes = safeJsonArray(box.codes);
      const capacity = Number(box.box_capacity || 0);
      if (capacity <= 0 || codes.length < capacity) return box;
    }
    const capacity = Number(payload?.box_capacity || payload?.capacity || 0);
    const boxSpec = String(payload?.box_spec || payload?.spec || '').trim() || null;
    const boxType = String(payload?.box_type || payload?.type || '自动分类箱').trim();
    return this.resources.create('box', {
      product_id: antiFakeCode.product_id || null,
      batch_no: antiFakeCode.batch_no || null,
      box_capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
      box_spec: boxSpec,
      box_type: boxType,
      codes: [],
      status: 0,
    });
  }

  private async traceability(code: string, payload: Record<string, any> = {}) {
    const resolved = await this.resolve(code);
    if (!resolved.found) throw new NotFoundException('未找到产品、防伪码、溯源编号、箱号或发货单');

    let trace = resolved.trace || null;
    let traceChain = Array.isArray(trace?.trace_chain) ? trace.trace_chain : [];
    if (resolved.anti_fake_code) {
      const traces = await this.resources.recordTraceForCodes([resolved.anti_fake_code], '后台扫码溯源', {
        node_type: '查询',
        content: `后台扫码查看防伪码 ${resolved.anti_fake_code.code}`,
        anti_fake_code: resolved.anti_fake_code.code,
        code_status: resolved.anti_fake_code.status,
        query_count: resolved.anti_fake_code.query_count || 0,
        product_id: resolved.product?.id || resolved.anti_fake_code.product_id || null,
        product_code: resolved.product?.product_code || null,
        product_name: resolved.product?.product_name || null,
        batch_no: resolved.anti_fake_code.batch_no || null,
      });
      trace = traces.find((item: any) => String(item.anti_fake_code) === String(resolved.anti_fake_code.code)) || traces[0] || trace;
      traceChain = Array.isArray(trace?.trace_chain) ? trace.trace_chain : traceChain;
    } else if (resolved.box) {
      const boxTrace = await this.resources.recordBoxTraceEvent(resolved.box, '后台箱码溯源', {
        node_type: '查询',
        content: `后台扫码查看箱码 ${resolved.box.box_no || resolved.box.id}`,
      });
      trace = boxTrace.product || boxTrace.traces?.[0] || trace;
      traceChain = Array.isArray(boxTrace.trace_chain) ? boxTrace.trace_chain : traceChain;
    } else if (resolved.product) {
      trace = await this.resources.recordProductTraceEvent(resolved.product, '后台产品溯源', {
        node_type: '查询',
        content: `后台扫码查看产品 ${resolved.product.product_name || resolved.product.product_code || resolved.product.id}`,
      }) || trace;
      traceChain = Array.isArray(trace?.trace_chain) ? trace.trace_chain : traceChain;
    }

    const location = payload.location || payload.scan_location || [payload.province, payload.city].filter(Boolean).join('');
    const antiChanneling = await this.antiChanneling.evaluateScan({
      code,
      code_type: resolved.anti_fake_code ? 'anti_fake_code' : resolved.type || (resolved.box ? 'box' : resolved.product ? 'product' : resolved.trace ? 'trace' : 'unknown'),
      channel: payload.channel || 'scanner',
      location: location || undefined,
      province: payload.province || undefined,
      city: payload.city || undefined,
      ip: payload.ip || undefined,
      userAgent: payload.user_agent || payload.userAgent || undefined,
      device_id: payload.device_id || undefined,
      device_integrity: payload.device_integrity || undefined,
      jailbroken: payload.jailbroken === true,
      is_real: Boolean(resolved.anti_fake_code || resolved.box || resolved.product || resolved.trace),
      query_count: Number(resolved.anti_fake_code?.query_count || 0),
      anti_fake_code: resolved.anti_fake_code || undefined,
      box: resolved.box || undefined,
      product: resolved.product || undefined,
    }).catch(() => ({ alert_count: 0, alerts: [] }));

    return {
      action: 'traceability',
      message: trace ? '溯源记录已自动匹配/同步' : '已识别业务数据，但暂未维护溯源链路',
      ...resolved,
      trace,
      trace_chain: traceChain,
      anti_channeling: antiChanneling,
    };
  }

  private async shipmentShipping(code: string, target: unknown, payload: Record<string, any>) {
    const resolved = await this.resolve(code);
    if (resolved.type === 'shipment') return this.shipByScan(code, payload);

    if (target) {
      const shipment = await this.requireShipmentByScan(target);
      const box = await this.requireBoxByScan(code);
      return this.appendBoxToShipment(shipment.id, box, payload);
    }

    if (resolved.type === 'box') {
      throw new BadRequestException('扫描箱号发货前，请先填写发货单ID或发货单号；扫描发货单号可直接确认发货');
    }
    throw new BadRequestException('扫码发货只支持扫描箱号/箱子ID或发货单号');
  }

  private async appendBoxToShipment(shipmentId: number, box: any, payload: Record<string, any> = {}) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('发货单不存在');
    if (Number(box.status) === 2) throw new BadRequestException('该箱子已发货，不能重复加入发货单');
    if (Number(box.status) !== 1) throw new BadRequestException('箱子必须先封箱，才能加入发货单');
    const ids = safeJsonArray(shipment.box_ids).map((item: any) => Number(item)).filter((item: any) => Number.isFinite(item));
    if (!ids.includes(box.id)) ids.push(box.id);
    const shipmentData: Record<string, any> = { box_ids: ids };
    for (const key of ['logistics_company', 'logistics_no', 'sender', 'remark']) {
      if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') shipmentData[key] = payload[key];
    }
    const [updatedShipment, updatedBox] = await this.prisma.$transaction([
      this.prisma.shipment.update({ where: { id: shipment.id }, data: shipmentData }),
      this.prisma.box.update({ where: { id: box.id }, data: { status: Math.max(Number(box.status || 0), 1) } }),
    ]);
    await this.resources.syncShipmentTrace(updatedShipment, [updatedBox], '加入发货单');
    return { action: 'shipment_box_added', message: '箱子已加入发货单', input: updatedBox.box_no || String(updatedBox.id), code: updatedBox.box_no || String(updatedBox.id), found: true, type: 'box', shipment_id: updatedShipment.id, shipment_no: updatedShipment.shipment_no, shipment: updatedShipment, box_id: updatedBox.id, box_no: updatedBox.box_no, box: updatedBox, total: ids.length, flow: await this.resolveFlow(updatedBox.box_no || String(updatedBox.id)) };
  }

  private async shipByScan(scan: string | number, payload: Record<string, any>) {
    const shipment = await this.requireShipmentByScan(scan);
    await this.resources.updateShipmentStatus(shipment.id, 1, payload);
    const updated = await this.prisma.shipment.findUnique({ where: { id: shipment.id } }).catch(() => shipment);
    return { action: 'shipment_shipped', message: '发货单已确认发货', input: shipment.shipment_no || String(shipment.id), code: shipment.shipment_no || String(shipment.id), found: true, type: 'shipment', shipment_id: shipment.id, shipment_no: shipment.shipment_no, shipment: updated || shipment, flow: await this.resolveFlow(shipment.shipment_no || String(shipment.id)) };
  }
}
