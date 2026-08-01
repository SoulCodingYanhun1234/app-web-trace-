import { request } from './http';
import { AI_FEATURE_ENABLED } from '@/config/features';

export function createCrudApi(base: string) {
  return {
    list(params?: any) { return request.get(base, params, { cacheTtl: 5_000 }); },
    detail(id: number | string) { return request.get(`${base}/${id}`, undefined, { cacheTtl: 10_000 }); },
    create(data: any) { return request.post(base, data); },
    update(id: number | string, data: any) { return request.put(`${base}/${id}`, data); },
    remove(id: number | string) { return request.delete(`${base}/${id}`); },
  };
}

export const productsApi = {
  ...createCrudApi('/products'),
  select() { return request.get('/products/select', undefined, { cacheTtl: 60_000 }); },
  categories() { return request.get('/products/categories', undefined, { cacheTtl: 60_000 }); },
  manufacturers() { return request.get('/products/manufacturers/select', undefined, { cacheTtl: 60_000 }); },
};

export const manufacturersApi = {
  ...createCrudApi('/manufacturers'),
  select() { return request.get('/manufacturers/select', undefined, { cacheTtl: 60_000 }); },
};


export const partnersApi = {
  ...createCrudApi('/partners'),
  select(params?: any) { return request.get('/partners/select', params, { cacheTtl: 60_000 }); },
};

export const productRegionsApi = {
  ...createCrudApi('/product-regions'),
};

export const codesApi = {
  list(params?: any) { return request.get('/codes', params, { cacheTtl: 3_000 }); },
  batches(params?: any) { return request.get('/codes/batches', params, { cacheTtl: 30_000 }); },
  stats(product_id?: number) { return request.get('/codes/stats', product_id ? { product_id } : undefined, { cacheTtl: 8_000, silent: true }); },
  generate(data: any) { return request.post('/codes/generate', data); },
  qrcode(code: string) { return request.get(`/codes/qrcode/${encodeURIComponent(code)}/meta`); },
  qrcodeBlob(code: string) { return request.get<Blob>(`/codes/qrcode/${encodeURIComponent(code)}`, undefined, { responseType: 'blob', skipDedup: true }); },
  batchActivate(codes: string[]) { return request.post('/codes/batch-activate', { codes }, { timeout: 120_000, skipDedup: true, silent: true }); },
  batchLock(codes: string[], lock: boolean) { return request.post('/codes/batch-lock', { codes, lock }, { timeout: 120_000, skipDedup: true, silent: true }); },
  batchCancel(codes: string[]) { return request.post('/codes/batch-cancel', { codes }, { timeout: 120_000, skipDedup: true, silent: true }); },
  batchDelete(codes: string[]) { return request.post('/codes/batch-delete', { codes }, { timeout: 120_000, skipDedup: true, silent: true }); },
  batchUpdate(data: { codes?: string[]; filters?: Record<string, any>; patch: Record<string, any>; limit?: number }) { return request.post('/codes/batch-update', data, { timeout: 120_000, skipDedup: true, silent: true }); },
};

export const queryApi = {
  post(data: any) { return request.post('/query', data); },
  get(params: any) { return request.get('/query', params); },
};


export const antiChannelingApi = {
  overview() { return request.get('/anti-channeling/overview', undefined, { cacheTtl: 5_000, silent: true }); },
  unread(limit = 5) { return request.get('/anti-channeling/unread', { limit }, { cacheTtl: 10_000, silent: true }); },
  analytics(params?: any) { return request.get('/anti-channeling/analytics', params, { cacheTtl: 10_000, silent: true }); },
  mapData(params?: any) { return request.get('/anti-channeling/map-data', params, { cacheTtl: 10_000, silent: true }); },
  alerts(params?: any) { return request.get('/anti-channeling/alerts', params, { cacheTtl: 3_000 }); },
  detail(id: number | string) { return request.get(`/anti-channeling/alerts/${encodeURIComponent(String(id))}`, undefined, { cacheTtl: 5_000 }); },
  createAlert(data: any) { return request.post('/anti-channeling/alerts', data); },
  ack(id: number | string, data: any = {}) { return request.post(`/anti-channeling/alerts/${encodeURIComponent(String(id))}/ack`, data); },
  process(id: number | string, data: any = {}) { return request.post(`/anti-channeling/alerts/${encodeURIComponent(String(id))}/process`, data); },
  close(id: number | string, data: any = {}) { return request.post(`/anti-channeling/alerts/${encodeURIComponent(String(id))}/close`, data); },
  batchAck(ids: number[]) { return request.post('/anti-channeling/alerts/batch-ack', { ids }); },
  clearAlerts(data: { ids?: number[]; filters?: Record<string, any>; confirm_all?: boolean }) { return request.post('/anti-channeling/alerts/clear', data); },
  rules() { return request.get('/anti-channeling/rules', undefined, { cacheTtl: 10_000 }); },
  updateRule(id: number | string, data: any) { return request.put(`/anti-channeling/rules/${encodeURIComponent(String(id))}`, data); },
  notifications(params?: any) { return request.get('/anti-channeling/notifications', params, { cacheTtl: 5_000 }); },
  retryNotification(id: number | string) { return request.post(`/anti-channeling/notifications/${encodeURIComponent(String(id))}/retry`, {}); },
  evaluate(data: any) { return request.post('/anti-channeling/evaluate', data); },
  evaluateBatch(codes: any[]) { return request.post('/anti-channeling/evaluate-batch', { codes }); },
  evaluateShipment(data: any) { return request.post('/anti-channeling/evaluate-shipment', data); },
  shipmentPreCheck(data: any) { return request.post('/anti-channeling/shipment-pre-check', data); },
  agentRisk(limit = 20) { return request.get('/anti-channeling/agent-risk', { limit }, { cacheTtl: 10_000 }); },
  codeTrajectory(code: string, days = 30) { return request.get('/anti-channeling/code-trajectory', { code, days }, { cacheTtl: 5_000 }); },
};

function aiFeatureDisabled(): Promise<never> {
  return Promise.reject(new Error('AI 功能已通过环境变量关闭'));
}

const localAiRiskOverview = {
  generated_at: new Date().toISOString(), mode: 'rule-engine',
  kpis: { ai_scanned: 0, complete_traces: 0, complete_rate: 0, anomaly_traces: 0, pending_tasks: 0 },
  pipeline: [
    { key: 'archive', label: '产品与批次归档', status: 'healthy', value: '0 条', detail: '产品、防伪码、批次与生产信息统一归档' },
    { key: 'binding', label: '一物一码关联', status: 'healthy', value: '0 条', detail: '仅防伪码作为单品身份进入溯源链' },
    { key: 'route', label: '装箱与物流续写', status: 'healthy', value: '0 条', detail: '装箱、发货、退货与查询节点自动续写' },
    { key: 'quality', label: '链路完整性研判', status: 'healthy', value: '0%', detail: '模型检查缺失字段、节点覆盖与时序一致性' },
  ],
  tasks: [], model_count: 0, trace_count: 0,
};
const localAiModels = { providers: [
  { id: 'openai-compatible', name: 'OpenAI 兼容模型', model: 'gpt-4o-mini', enabled: false, specialty: '溯源链完整性与异常研判' },
  { id: 'qwen-compatible', name: '通义千问兼容模型', model: 'qwen-plus', enabled: false, specialty: '中文溯源字段解释与归因' },
  { id: 'deepseek-compatible', name: 'DeepSeek 兼容模型', model: 'deepseek-chat', enabled: false, specialty: '溯源节点时序与缺失摘要' },
], configured: false, protocol: 'OpenAI Compatible' };
export const aiRiskApi = {
  overview() { if (!AI_FEATURE_ENABLED) return aiFeatureDisabled(); return request.get('/ai-risk/overview', undefined, { cacheTtl: 10_000, silent: true }).catch(() => localAiRiskOverview); },
  models() { if (!AI_FEATURE_ENABLED) return aiFeatureDisabled(); return request.get('/ai-risk/models', undefined, { cacheTtl: 30_000, silent: true }).catch(() => localAiModels); },
  analyze(data: any) { if (!AI_FEATURE_ENABLED) return aiFeatureDisabled(); return request.post('/ai-risk/analyze', data, { silent: true }).catch(() => ({ risk_level: '需补全', confidence: 72, summary: '规则引擎已完成溯源链完整性检查，建议补齐缺失节点后重新同步。', evidence: ['产品、批次、防伪码与 trace_chain 将被交叉检查'], actions: ['补齐缺失字段', '重新执行溯源自动同步'], provider: '规则引擎', model_used: false })); },
};

export const traceApi = {
  ...createCrudApi('/trace'),
  detailByNo(traceNo: string) { return request.get(`/trace/no/${encodeURIComponent(traceNo)}`, undefined, { cacheTtl: 10_000 }); },
  addNode(id: number | string, data: any) { return request.post(`/trace/${id}/node`, data); },
  autoSync(data: any = {}) { return request.post('/trace/auto-sync', data); },
};

export const traceWorkflowApi = {
  overview() { return request.get('/trace/workflow/overview', undefined, { cacheTtl: 8_000, silent: true }); },
  autoSync(data: any = {}) { return request.post('/trace/workflow/auto-sync', data, { timeout: 120_000, skipDedup: true }); },
};

const localTraceAutomationOverview = {
  enabled: true,
  mode: 'rule-engine-assisted',
  overall: { total: 0, automated: 0, pending: 0, score: 100, status: 'healthy' },
  policy: { anti_channeling_code_type: 'anti_fake_code_only', skipped_code_types: ['box', 'shipment', 'product', 'trace', 'return_order'], trace_write_mode: 'idempotent_merge' },
  modules: [],
  suggestions: ['自动化接口暂不可用，现有产品、码、装箱和发货业务仍会按内置规则续写溯源链。'],
};
export const traceAutomationApi = {
  overview(module = 'all') { if (!AI_FEATURE_ENABLED) return aiFeatureDisabled(); return request.get('/trace/automation/overview', { module }, { cacheTtl: 5_000, silent: true }).catch(() => localTraceAutomationOverview); },
  inspect(data: any = {}) { if (!AI_FEATURE_ENABLED) return aiFeatureDisabled(); return request.post('/trace/automation/inspect', data, { timeout: 120_000, skipDedup: true }); },
  run(data: any = {}) { if (!AI_FEATURE_ENABLED) return aiFeatureDisabled(); return request.post('/trace/automation/run', data, { timeout: 180_000, skipDedup: true }); },
};

export const boxApi = {
  ...createCrudApi('/box'),
  addCodes(id: number | string, codes: string[]) { return request.post(`/box/${id}/codes`, { codes }); },
  seal(id: number | string) { return request.post(`/box/${id}/seal`); },
  qrcodeBlob(idOrCode: number | string) { return request.get<Blob>(`/box/${encodeURIComponent(String(idOrCode))}/qrcode`, undefined, { responseType: 'blob', skipDedup: true, silent: true }); },
  qrcodeImageUrl(idOrCode: number | string) { return `${request.baseURL || ''}/box/${encodeURIComponent(String(idOrCode))}/qrcode?t=${Date.now()}`; },
};

export const shipmentsApi = {
  ...createCrudApi('/shipments'),
  ship(id: number | string, data: any) { return request.post(`/shipments/${id}/ship`, data); },
  receive(id: number | string) { return request.post(`/shipments/${id}/receive`); },
  exception(id: number | string, remark: string) { return request.post(`/shipments/${id}/exception`, { remark }); },
  updateLogistics(id: number | string, data: any) { return request.put(`/shipments/${id}/logistics`, data); },
  qrcodeBlob(id: number | string) { return request.get<Blob>(`/shipments/${encodeURIComponent(String(id))}/qrcode`, undefined, { responseType: 'blob', skipDedup: true }); },
  qrcodeMeta(id: number | string) { return request.get(`/shipments/${encodeURIComponent(String(id))}/qrcode/meta`); },
  resolveScan(scan: string | number) { return request.get(`/shipments/resolve/${encodeURIComponent(String(scan))}`, undefined, { cacheTtl: 3_000 }); },
};

export const returnsApi = {
  ...createCrudApi('/returns'),
  accept(id: number | string, remark: string) { return request.post(`/returns/${id}/accept`, { remark }); },
  complete(id: number | string) { return request.post(`/returns/${id}/complete`); },
  reject(id: number | string, remark: string) { return request.post(`/returns/${id}/reject`, { remark }); },
};

export const agentsApi = {
  ...createCrudApi('/agents'),
  select() { return request.get('/agents/select', undefined, { cacheTtl: 60_000 }); },
};

export const certificatesApi = createCrudApi('/certificates');
export const processApi = createCrudApi('/process');

export const systemApi = {
  params(group = 'basic') { return request.get('/system/params', { group }, { cacheTtl: 30_000 }); },
  updateParam(key: string, param_value: any, group = 'basic') { return request.put(`/system/params/${encodeURIComponent(key)}`, { param_value }, { params: { group } }); },
  admins(params?: any) { return request.get('/system/admins', params, { cacheTtl: 5_000 }); },
  adminDetail(id: number | string) { return request.get(`/system/admins/${id}`, undefined, { cacheTtl: 5_000 }); },
  createAdmin(data: any) { return request.post('/system/admins', data); },
  updateAdmin(id: number | string, data: any) { return request.put(`/system/admins/${id}`, data); },
  updateAdminStatus(id: number | string, status: number) { return request.put(`/system/admins/${id}/status`, { status }); },
  updateAdminPermissions(id: number | string, data: any) { return request.put(`/system/admins/${id}/permissions`, data); },
  permissions() { return request.get('/system/permissions', undefined, { cacheTtl: 30_000 }); },
  modules() { return request.get('/system/modules', undefined, { cacheTtl: 30_000 }); },
  updateModules(data: any) { return request.put('/system/modules', data); },
  syncPermissions() { return request.post('/system/permissions/sync'); },
  roles(params?: any) { return request.get('/system/roles', params, { cacheTtl: 5_000 }); },
  createRole(data: any) { return request.post('/system/roles', data); },
  updateRole(id: number | string, data: any) { return request.put(`/system/roles/${id}`, data); },
  removeRole(id: number | string) { return request.delete(`/system/roles/${id}`); },
  logs(params?: any) { return request.get('/system/logs', params, { cacheTtl: 5_000 }); },
  queryLogs(params?: any) { return request.get('/system/query-logs', params, { cacheTtl: 5_000 }); },
  moduleRelations() { return request.get('/system/module-relations', undefined, { cacheTtl: 60_000 }); },
};

export const settingsApi = {
  branding() { return request.get('/settings/branding', undefined, { cacheTtl: 60_000, silent: true }); },
  groups() { return request.get('/settings/groups', undefined, { cacheTtl: 60_000 }); },
  detail(group: string) { return request.get('/settings/' + encodeURIComponent(group), undefined, { cacheTtl: 20_000 }); },
  saveGroup(group: string, data: Record<string, any>) { return request.put('/settings/' + encodeURIComponent(group) + '/batch', { settings: data }); },
  updateOne(group: string, key: string, value: any) { return request.put('/settings/' + encodeURIComponent(group) + '/' + encodeURIComponent(key), { value }); },
};
export const exportApi = {
  codes(params?: any) { return request.download('/export/codes', params, 'codes.csv'); },
  queryLogs(params?: any) { return request.download('/export/query-logs', params, 'query-logs.csv'); },
  antiChannelingAlerts(params?: any) { return request.download('/export/anti-channeling-alerts', params, `anti-channeling-alerts-${Date.now()}.csv`); },
  qrcodeZip(params?: { batch_no?: string; product_id?: number; codes?: string; format?: 'svg' | 'png' }) {
    const format = params?.format || 'svg';
    return request.download('/export/codes/qrcode-zip', params, `qr-codes-${format}-${Date.now()}.zip`);
  },
  boxesCsv(params?: { codes?: string; product_id?: number; batch_no?: string; box_no?: string; status?: number }) {
    return request.download('/export/boxes', params, `box-codes-${Date.now()}.csv`);
  },
  async boxQrcodeZip(params?: { codes?: string; format?: 'svg' | 'png' }) {
    const format = params?.format === 'png' ? 'png' : 'svg';
    const filename = `box-qr-codes-${format}-${Date.now()}.zip`;
    try {
      return await request.download('/export/box-qrcode-zip', params, filename, { silent: true });
    } catch (error: any) {
      if (error?.response?.status !== 404) throw error;
      return request.download('/export/boxes/qrcode-zip', params, filename, { silent: true });
    }
  },
};

export const scannerApi = {
  workflows() { return request.get('/scanner/workflows', undefined, { cacheTtl: 60_000 }); },
  resolve(code: string) { return request.post('/scanner/resolve', { code }); },
  flow(code: string) { return request.get(`/scanner/flow/${encodeURIComponent(code)}`, undefined, { cacheTtl: 3_000 }); },
  execute(data: { workflow: string; code: string; target_id?: number | string; payload?: any }) { return request.post('/scanner/execute', data); },
  batchExecute(data: { workflow: string; codes: string[] | string; target_id?: number | string; payload?: any }) { return request.post('/scanner/batch-execute', data); },
  search(keyword: string) { return request.get('/scanner/search', { keyword }, { cacheTtl: 3_000 }); },
};

export const setupApi = {
  status() { return request.get('/setup/status', undefined, { cacheTtl: 2_000, silent: true }); },
  initialize(data: any) { return request.post('/setup/initialize', data); },
};

export const traceabilityV1Api = {
  generateCodes(data: any) { return request.post('/v1/codes/generate', data, { timeout: 120_000, skipDedup: true }); },
  importCodes(data: any) { return request.post('/v1/codes/import', data, { timeout: 120_000, skipDedup: true }); },
  verifyCode(code: string) { return request.get(`/v1/codes/${encodeURIComponent(code)}/verify`, undefined, { cacheTtl: 5_000 }); },
  createPackagingRelation(data: any) { return request.post('/v1/packaging/relation', data, { timeout: 120_000, skipDedup: true }); },
  packagingTree(code: string) { return request.get(`/v1/packaging/tree/${encodeURIComponent(code)}`, undefined, { cacheTtl: 5_000 }); },
  createBatch(data: any) { return request.post('/v1/batches', data); },
  addBatchStep(batchCode: string, data: any) { return request.post(`/v1/batches/${encodeURIComponent(batchCode)}/steps`, data); },
  warehouseIn(data: any) { return request.post('/v1/warehouse/in', data, { timeout: 120_000, skipDedup: true }); },
  shipmentOut(data: any) { return request.post('/v1/shipment/out', data, { timeout: 120_000, skipDedup: true }); },
  traceability(code: string) { return request.get(`/v1/traceability/${encodeURIComponent(code)}`, undefined, { cacheTtl: 5_000 }); },
  marketScan(data: any) { return request.post('/v1/scans/market', data); },
  violations(params?: any) { return request.get('/v1/violations', params, { cacheTtl: 5_000 }); },
  handleViolation(violationId: string, data: any) { return request.post(`/v1/violations/${encodeURIComponent(violationId)}/handle`, data); },
};

export const traceabilityV2Api = {
  topology() { return request.get('/v2/topology', undefined, { cacheTtl: 30_000, silent: true }); },
  systemConfig() { return request.get('/v2/config/system', undefined, { cacheTtl: 30_000, silent: true }); },
  updateSystemConfig(data: any) { return request.put('/v2/config/system', data); },
  codeFormats() { return request.get('/v2/code-formats', undefined, { cacheTtl: 30_000, silent: true }); },
  saveCodeFormat(data: any) { return request.post('/v2/code-formats', data); },
  generateCodes(data: any) { return request.post('/v2/codes/generate', data, { timeout: 120_000, skipDedup: true }); },
  verifyCode(code: string) { return request.get(`/v2/codes/${encodeURIComponent(code)}/verify`, undefined, { cacheTtl: 5_000 }); },
  rules(params?: any) { return request.get('/v2/rules', params, { cacheTtl: 10_000, silent: true }); },
  saveRule(data: any) { return request.post('/v2/rules', data); },
  testRules(data: any) { return request.post('/v2/rules/test', data); },
  marketScan(data: any) { return request.post('/v2/scans/market', data); },
  realtimeMetrics() { return request.get('/v2/analytics/realtime', undefined, { cacheTtl: 8_000, silent: true }); },
  cacheStatus() { return request.get('/v2/cache/status', undefined, { cacheTtl: 8_000, silent: true }); },
  invalidateCache(data: any) { return request.post('/v2/cache/invalidate', data); },
  tenants(params?: any) { return request.get('/v2/api-tenants', params, { cacheTtl: 15_000, silent: true }); },
  saveTenant(data: any) { return request.post('/v2/api-tenants', data); },
  edgeNodes() { return request.get('/v2/edge-nodes', undefined, { cacheTtl: 15_000, silent: true }); },
  edgeHeartbeat(data: any) { return request.post('/v2/edge-nodes/heartbeat', data); },
  offlineScan(data: any) { return request.post('/v2/edge-nodes/offline-scan', data); },
  syncEdgeEvents(data: any) { return request.post('/v2/edge-nodes/sync', data); },
};
