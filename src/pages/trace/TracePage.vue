<template>
  <AiTraceAutomationPanel v-if="AI_FEATURE_ENABLED" module-key="trace" compact @completed="crudRef?.load()" />
  <CrudPage ref="crudRef" :config="config">
    <template #toolbar>
      <el-button @click="traceNoVisible=true">按溯源编号查询</el-button>
      <el-button v-if="AI_FEATURE_ENABLED" @click="openTraceModels">AI 模型接入</el-button>
      <el-button v-if="canManageTrace" type="primary" plain @click="autoSyncTrace">自动同步产品/防伪码溯源</el-button>
    </template>
    <template #row-actions="{ record }">
      <el-button v-if="AI_FEATURE_ENABLED" text type="primary" size="small" @click="analyzeTrace(record)">AI 研判</el-button>
      <el-button v-if="false" text type="primary" size="small" @click="openNode(record)">异常补录</el-button>
    </template>
  </CrudPage>
  <el-dialog v-model="nodeVisible" title="追加溯源节点" destroy-on-close append-to-body align-center :lock-scroll="true">
    <el-form :model="nodeForm" label-position="top">
      <div class="form-preset-bar">
        <span class="form-preset-label">节点模板：</span>
        <el-space wrap>
          <el-button v-for="tpl in nodeTemplates" :key="tpl.label" size="small" @click="applyNodeTemplate(tpl)">{{ tpl.label }}</el-button>
        </el-space>
      </div>
      <el-form-item label="节点名称" prop="node_name" required><el-input v-model="nodeForm.node_name" /></el-form-item>
      <el-form-item label="节点类型" prop="node_type" required><el-input v-model="nodeForm.node_type" placeholder="例如：原料、生产、质检、物流" /></el-form-item>
      <el-form-item label="内容"><el-input v-model="nodeForm.content" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" /></el-form-item>
      <el-form-item label="操作人"><el-input v-model="nodeForm.operator" /></el-form-item>
      <el-form-item label="地点"><el-input v-model="nodeForm.location" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="nodeVisible = false">取消</el-button>
      <el-button type="primary" @click="addNode">确定</el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="traceNoVisible" title="按溯源编号查询" destroy-on-close append-to-body align-center :lock-scroll="true">
    <el-input v-model="traceNo" placeholder="请输入溯源编号" />
    <template #footer>
      <el-button @click="traceNoVisible = false">取消</el-button>
      <el-button type="primary" @click="queryByTraceNo">查询</el-button>
    </template>
  </el-dialog>
  <el-drawer v-model="traceDetailVisible" title="溯源详情" :size="traceDrawerSize" class="trace-detail-drawer" append-to-body :lock-scroll="true">
    <div class="trace-detail-shell">
      <el-alert type="success" :closable="false" show-icon title="固定模板、产品档案、入库、装箱、发货、退货、扫码查询等节点由系统自动回填和续写，前台只展示完整流转过程。" class="trace-tip" />
      <div v-if="AI_FEATURE_ENABLED" class="trace-ai-toolbar">
        <el-button type="primary" plain @click="analyzeTrace(traceDetail)">AI 分析当前溯源链</el-button>
        <span>模型检查完整性、关键字段和节点时序；防窜判断仍仅针对防伪码。</span>
      </div>
      <div v-if="traceSummaryCards.length" class="trace-summary-grid">
        <div v-for="item in traceSummaryCards" :key="item.label" class="trace-summary-card">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
        </div>
      </div>
      <div class="trace-section-head">
        <div>
          <span class="trace-section-kicker">AUTO TRACE FLOW</span>
          <h3>全链路自动溯源</h3>
        </div>
        <el-tag effect="plain">{{ flowNodes.length }} 个节点</el-tag>
      </div>
      <el-empty v-if="!flowNodes.length" description="暂无溯源节点" />
      <div v-else class="trace-flow-chart">
      <div v-for="(node, index) in flowNodes" :key="node.trace_key || index" class="trace-flow-step">
        <div class="trace-flow-card" :class="nodeClass(node)">
          <div class="trace-flow-index">{{ index + 1 }}</div>
          <div class="trace-flow-card-body">
            <div class="trace-flow-title">{{ node.node_name || node.process_name || node.node_type || '溯源节点' }}</div>
            <div class="trace-flow-time">{{ formatNodeTime(node) || '自动记录时间' }}</div>
            <p>{{ node.content || node.process_content || '-' }}</p>
            <small>{{ compactNodeDetail(node) || '系统自动留存业务记录' }}</small>
          </div>
        </div>
        <div v-if="index < flowNodes.length - 1" class="trace-flow-arrow">→</div>
      </div>
      </div>
      <div class="trace-section-head is-detail">
        <div>
          <span class="trace-section-kicker">DETAIL ARCHIVE</span>
          <h3>完整字段档案</h3>
        </div>
        <el-tag type="success" effect="plain">响应式多段展示</el-tag>
      </div>
      <DetailDescriptions :data="traceDetailItems" :column="1" />
    </div>
  </el-drawer>

  <el-dialog v-if="AI_FEATURE_ENABLED" v-model="traceModelsVisible" title="溯源模型接入状态" width="680px" append-to-body>
    <div class="trace-model-intro">{{ traceModels.protocol || 'OpenAI Compatible' }}；密钥仅保存在 API 服务端。</div>
    <div class="trace-model-list">
      <div v-for="model in traceModels.providers || []" :key="model.id" class="trace-model-row">
        <div><strong>{{ model.name }}</strong><span>{{ model.model }} · {{ model.specialty }}</span></div>
        <el-tag :type="model.enabled ? 'success' : 'info'">{{ model.enabled ? '已启用' : '待配置' }}</el-tag>
      </div>
    </div>
    <el-alert type="info" :closable="false" title="配置说明" description="通过 AI_MODEL_PROVIDERS 或 OPENAI_API_KEY、AI_BASE_URL、AI_MODEL 接入 OpenAI 兼容模型；未配置时自动使用本地规则引擎。" />
  </el-dialog>

  <el-drawer v-if="AI_FEATURE_ENABLED" v-model="traceAnalysisVisible" title="AI 溯源研判" :size="traceAiDrawerSize" append-to-body>
    <div v-loading="traceAnalysisLoading" class="trace-ai-analysis">
      <div class="trace-ai-subject">
        <span>研判对象</span>
        <strong>{{ traceAnalysisSubject }}</strong>
      </div>
      <template v-if="traceAnalysis">
        <div class="trace-ai-score">
          <span>完整性结论</span>
          <strong>{{ traceAnalysis.risk_level || '待分析' }}</strong>
          <em>置信度 {{ traceAnalysis.confidence || 0 }}%</em>
        </div>
        <section><label>研判摘要</label><p>{{ traceAnalysis.summary }}</p></section>
        <section><label>关键证据</label><ul><li v-for="(item, index) in traceAnalysis.evidence || []" :key="index">{{ item }}</li></ul></section>
        <section><label>建议动作</label><ol><li v-for="(item, index) in traceAnalysis.actions || []" :key="index">{{ item }}</li></ol></section>
        <div class="trace-ai-meta"><span>来源：{{ traceAnalysis.provider || '规则引擎' }}</span><el-tag size="small" :type="traceAnalysis.model_used ? 'success' : 'info'">{{ traceAnalysis.model_used ? '模型辅助' : '规则兜底' }}</el-tag></div>
      </template>
    </div>
  </el-drawer>
</template>
<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useWindowSize } from '@vueuse/core';
import { ElMessage as Message } from 'element-plus';
import CrudPage from '@/components/CrudPage.vue';
import AiTraceAutomationPanel from '@/components/AiTraceAutomationPanel.vue';
import DetailDescriptions from '@/components/DetailDescriptions.vue';
import { aiRiskApi, traceApi, productsApi } from '@/api/resources';
import { statusMaps, toOptions } from '@/constants/status';
import { futureDate, makeBatchNo, makeTraceChainTemplate, todayDate } from '@/utils/lowcode';
import { useAuthStore } from '@/stores/auth';
import { AI_FEATURE_ENABLED } from '@/config/features';

const crudRef = ref();
const currentId = ref<number|string>();
const nodeVisible = ref(false);
const traceNoVisible = ref(false);
const traceDetailVisible = ref(false);
const traceNo = ref('');
const traceDetail = ref<any>({});
const nodeForm = reactive<any>({});
const traceModelsVisible = ref(false);
const traceModels = ref<any>({ providers: [] });
const traceAnalysisVisible = ref(false);
const traceAnalysisLoading = ref(false);
const traceAnalysis = ref<any>(null);
const traceAnalysisSubject = ref('溯源记录');

const auth = useAuthStore();
const { width: viewportWidth } = useWindowSize();
const canManageTrace = computed(() => auth.hasPermission('trace:manage'));
const traceDrawerSize = computed(() => {
  if (viewportWidth.value <= 760) return '100%';
  if (viewportWidth.value <= 1180) return '90%';
  return '1080px';
});
const traceAiDrawerSize = computed(() => viewportWidth.value <= 760 ? '100%' : '560px');
const nodeTemplates = [
  { label: '原料入库', values: { node_name: '原料入库', node_type: '原料', content: '记录原料来源、供应商、批次和入库时间。', operator: '系统管理员', location: '原料仓' } },
  { label: '生产加工', values: { node_name: '生产加工', node_type: '生产', content: '记录生产车间、生产线、操作员和生产时间。', operator: '生产员', location: '生产车间' } },
  { label: '质检合格', values: { node_name: '质检合格', node_type: '质检', content: '质量检测合格，允许进入装箱发货流程。', operator: '质检员', location: '质检室' } },
  { label: '仓储发货', values: { node_name: '仓储发货', node_type: '物流', content: '记录仓库、箱号、物流公司和物流单号。', operator: '仓库员', location: '成品仓' } },
];
const traceLabelMap: Record<string, string> = { id: 'ID', product_id: '关联产品', trace_no: '溯源编号', anti_fake_code: '防伪码', batch_no: '生产批号', production_date: '生产日期', expiry_date: '过期日期', production_place: '生成地点', manufacturer: '公司', trace_chain: '溯源链路', status: '状态', created_at: '创建时间', updated_at: '更新时间' };
const traceDetailItems = computed(() => Object.entries(traceDetail.value || {}).map(([key, value]) => ({ label: traceLabelMap[key] || key, value })));
const traceNodes = computed<any[]>(() => Array.isArray(traceDetail.value?.trace_chain) ? traceDetail.value.trace_chain : []);
const flowNodes = computed<any[]>(() => [...traceNodes.value].sort((a, b) => String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''))));
const traceSummaryCards = computed(() => [
  { label: '防伪码', value: pickTraceValue(['anti_fake_code', 'code']) },
  { label: '溯源编号', value: pickTraceValue(['trace_no']) },
  { label: '批次号', value: pickTraceValue(['batch_no']) },
  { label: '关联产品', value: pickTraceValue(['product_label', 'product_name', 'product_code', 'product_id']) },
  { label: '箱码/装箱', value: pickTraceValue(['box_no', 'box_code']) },
  { label: '发货/物流', value: pickTraceValue(['shipment_no', 'logistics_no']) },
  { label: '流向地区', value: pickTraceValue(['destination', 'receiver_address', 'province', 'city', '默认地区']) },
].filter((item) => item.value && item.value !== '-'));
const config = reactive({
  title: '溯源管理', shortTitle: '溯源记录', api: traceApi, detailApi: true, actionWidth: 250, scrollX: 1380, modalWidth: 920, detailWidth: 860, labelMap: traceLabelMap,
  createText: false, updateText: false, deleteText: false,
  createPermission: 'trace:manage', updatePermission: 'trace:manage', deletePermission: 'trace:manage',
  lowCode: {
    title: '溯源低代码助手',
    description: '固定溯源模板已内置，产品、防伪码、装箱、发货、退货和扫码查询会自动同步到 trace_chain，员工无需手动填写溯源内容。',
    formTips: ['免手动模式：入库、装箱、出库、退货、扫码查询会自动回填固定模板和业务字段。', '如需人工补录，请由管理员通过接口或数据库审计后处理，日常操作不再手动编辑溯源链。'],
    steps: [
      { title: '固定模板', description: '产地、规格、原料材质、执行标准、资质、仓储条件和保质期由系统自动回填。' },
      { title: '扫码串联', description: '扫码入库、扫码装箱、扫码出库即可自动绑定一箱一码和一物一码。' },
      { title: '闭环续写', description: '发货、物流、退货、复检、二次入库和扫码查询自动续写全生命周期链路。' },
    ],
    presets: [
      { label: '标准溯源链', description: '原料-生产-质检-仓储发货。', values: () => ({ batch_no: makeBatchNo('BATCH'), production_date: todayDate(), expiry_date: futureDate(365), status: 1, trace_chain: makeTraceChainTemplate('标准链路') }) },
      { label: '食品溯源链', description: '适合食品/农产品，默认一年有效期。', values: () => ({ batch_no: makeBatchNo('FOOD'), production_date: todayDate(), expiry_date: futureDate(365), status: 1, trace_chain: makeTraceChainTemplate('食品溯源链') }) },
      { label: '化妆品溯源链', description: '适合化妆品，默认三年有效期。', values: () => ({ batch_no: makeBatchNo('COS'), production_date: todayDate(), expiry_date: futureDate(1095), status: 1, trace_chain: makeTraceChainTemplate('化妆品溯源链') }) },
    ],
  },
  filters: [
    { key: 'product_id', label: '关联产品', type: 'select', options: [] as any[], placeholder: '请选择产品' },
    { key: 'batch_no', label: '批次号', type: 'input' },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.trace) },
  ],
  columns: [
    { title: '溯源编号', dataIndex: 'trace_no', width: 170 },
    { title: '关联产品', dataIndex: 'product_label', width: 220, render: (row:any) => row.product_label || row.product_id || '-' },
    { title: '防伪码', dataIndex: 'anti_fake_code', width: 170 },
    { title: '批次号', dataIndex: 'batch_no', width: 160 },
    { title: '生产日期', dataIndex: 'production_date', width: 120 },
    { title: '地点', dataIndex: 'production_place', width: 150 },
    { title: '公司', dataIndex: 'manufacturer', width: 140 },
    { title: '状态', dataIndex: 'status', statusModule: 'trace', width: 90 },
  ],
  formFields: [
    { key: 'product_id', label: '关联产品', type: 'select', required: true, options: [] as any[], placeholder: '请选择产品' },
    { key: 'anti_fake_code', label: '防伪码', required: true },
    { key: 'batch_no', label: '批次号', required: true },
    { key: 'production_date', label: '生产日期', type: 'date' },
    { key: 'expiry_date', label: '过期日期', type: 'date' },
    { key: 'production_place', label: '地点', quickOptions: ['生产车间A', '生产车间B', '深圳工厂', '广州工厂'] },
    { key: 'manufacturer', label: '公司', quickOptions: ['本厂生产', '委托生产', 'OEM工厂'] },
    { key: 'status', label: '状态', type: 'select', options: toOptions(statusMaps.trace) },
    { key: 'trace_chain', label: '溯源链可视化配置', type: 'json', span: 24 },
  ],
});
async function loadProductOptions() {
  try {
    const rows = await productsApi.select();
    for (const group of [config.filters, config.formFields]) {
      const field = group.find((item: any) => item.key === 'product_id');
      if (field) field.options = rows;
    }
  } catch {
    // 产品下拉失败不影响主功能
  }
}
function applyNodeTemplate(tpl: any) { Object.assign(nodeForm, tpl.values); }
function openNode(record: any) {
  currentId.value = record.id;
  Object.keys(nodeForm).forEach((k) => delete nodeForm[k]);
  nodeVisible.value = true;
}
async function addNode() {
  await traceApi.addNode(currentId.value!, { ...nodeForm });
  Message.success('节点已追加');
  nodeVisible.value = false;
  crudRef.value?.load();
}
onMounted(loadProductOptions);

function displayTraceValue(value: any) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  return '-';
}
function pickTraceValue(keys: string[]) {
  for (const key of keys) {
    const direct = traceDetail.value?.[key];
    const directText = displayTraceValue(direct);
    if (directText !== '-') return directText;
  }
  for (const node of traceNodes.value) {
    for (const key of keys) {
      const text = displayTraceValue(node?.[key] ?? node?.detail?.[key] ?? node?.extra_fields?.[key]);
      if (text !== '-') return text;
    }
  }
  return '-';
}
async function queryByTraceNo() {
  if (!traceNo.value) return Message.warning('请输入溯源编号');
  traceDetail.value = await traceApi.detailByNo(traceNo.value);
  traceNoVisible.value = false;
  traceDetailVisible.value = true;
}
function formatNodeTime(node: any) { return node?.timestamp ? String(node.timestamp).replace('T', ' ').slice(0, 19) : ''; }
function nodeClass(node: any) {
  const key = `${node?.node_type || ''}${node?.node_name || ''}${node?.trace_key || ''}`;
  if (/装箱|箱|box/i.test(key)) return 'is-box';
  if (/防伪|生成|code/i.test(key)) return 'is-code';
  if (/产品|生产|product/i.test(key)) return 'is-product';
  if (/发货|物流|仓储|shipment/i.test(key)) return 'is-logistics';
  if (/查询|扫码|verify|query/i.test(key)) return 'is-query';
  return '';
}

function compactNodeDetail(node: any) {
  return [
    node.node_type ? `类型：${node.node_type}` : '',
    node.product_name || node.product_code ? `产品：${node.product_name || node.product_code}` : '',
    node.anti_fake_code ? `防伪码：${node.anti_fake_code}` : '',
    node.batch_no ? `批次：${node.batch_no}` : '',
    node.box_no ? `箱码：${node.box_no}` : '',
    node.shipment_no ? `发货单：${node.shipment_no}` : '',
    node.operator ? `操作人：${node.operator}` : '',
    node.location ? `地点：${node.location}` : '',
  ].filter(Boolean).join(' ｜ ');
}
async function autoSyncTrace() {
  const result = await traceApi.autoSync({});
  Message.success(`已同步 ${result?.total || 0} 条溯源记录`);
  crudRef.value?.load();
}

async function openTraceModels() {
  if (!AI_FEATURE_ENABLED) return;
  traceModelsVisible.value = true;
  try { traceModels.value = await aiRiskApi.models(); }
  catch { Message.error('模型状态获取失败'); }
}

async function analyzeTrace(record: any) {
  if (!AI_FEATURE_ENABLED) return;
  traceAnalysisVisible.value = true;
  traceAnalysisLoading.value = true;
  traceAnalysis.value = null;
  try {
    let detail = record || {};
    if (record?.id && !Array.isArray(record?.trace_chain)) detail = await traceApi.detail(record.id);
    traceAnalysisSubject.value = detail?.trace_no || detail?.anti_fake_code || (detail?.id ? `溯源记录 #${detail.id}` : '当前溯源记录');
    traceAnalysis.value = await aiRiskApi.analyze({
      analysis_type: 'trace',
      subject: traceAnalysisSubject.value,
      trace_record: detail,
    });
  } catch {
    Message.error('AI 溯源研判失败');
  } finally {
    traceAnalysisLoading.value = false;
  }
}
</script>
<style scoped>
.trace-detail-shell { min-width: 0; }
.trace-tip { margin-bottom: 16px; }
.trace-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr));
  gap: 12px;
  margin-bottom: 18px;
}
.trace-summary-card {
  min-width: 0;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid #dbeafe;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  box-shadow: 0 8px 22px rgba(37, 99, 235, .06);
}
.trace-summary-card span {
  display: block;
  margin-bottom: 6px;
  color: #64748b;
  font-size: 12px;
}
.trace-summary-card strong {
  display: block;
  min-width: 0;
  color: #102a43;
  font-size: 15px;
  line-height: 1.45;
  word-break: break-word;
}
.trace-section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin: 18px 0 12px;
}
.trace-section-head.is-detail { margin-top: 22px; }
.trace-section-kicker {
  display: inline-flex;
  margin-bottom: 4px;
  color: #2563eb;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .12em;
}
.trace-section-head h3 {
  margin: 0;
  color: #102a43;
  font-size: 18px;
  font-weight: 900;
}
.trace-flow-chart {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
  gap: 12px;
  padding: 2px 2px 10px;
  margin-bottom: 10px;
}
.trace-flow-step {
  position: relative;
  display: flex;
  min-width: 0;
}
.trace-flow-card {
  position: relative;
  display: flex;
  gap: 12px;
  width: 100%;
  min-height: 154px;
  padding: 14px;
  border: 1px solid #dbeafe;
  border-radius: 18px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
}
.trace-flow-card::after {
  content: "";
  position: absolute;
  left: 30px;
  top: 46px;
  bottom: 14px;
  width: 2px;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(37, 99, 235, .18), transparent);
}
.trace-flow-card.is-product { border-color: #bfdbfe; background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%); }
.trace-flow-card.is-code { border-color: #bbf7d0; background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%); }
.trace-flow-card.is-box { border-color: #fed7aa; background: linear-gradient(180deg, #fff7ed 0%, #ffffff 100%); }
.trace-flow-card.is-logistics { border-color: #ddd6fe; background: linear-gradient(180deg, #f5f3ff 0%, #ffffff 100%); }
.trace-flow-card.is-query { border-color: #bae6fd; background: linear-gradient(180deg, #f0f9ff 0%, #ffffff 100%); }
.trace-flow-index {
  z-index: 1;
  display: grid;
  place-items: center;
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  border-radius: 999px;
  background: #1d4ed8;
  color: #fff;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(37, 99, 235, .20);
}
.trace-flow-card-body { min-width: 0; flex: 1; }
.trace-flow-title { font-weight: 800; color: #102a43; margin-bottom: 4px; word-break: break-word; }
.trace-flow-time { color: #2563eb; font-size: 12px; margin-bottom: 8px; }
.trace-flow-card p { margin: 0 0 8px; color: #4a5568; line-height: 1.6; word-break: break-word; }
.trace-flow-card small { display: block; color: #718096; line-height: 1.6; word-break: break-word; }
.trace-flow-arrow { display: none; }
@media (max-width: 760px) {
  .trace-summary-grid { grid-template-columns: 1fr; }
  .trace-section-head { align-items: flex-start; flex-direction: column; }
  .trace-flow-chart { grid-template-columns: 1fr; }
  .trace-flow-card { min-height: auto; }
}
:global(html[data-theme="dark"]) .trace-summary-card,
:global(html[data-theme="dark"]) .trace-flow-card {
  background: linear-gradient(180deg, rgba(17, 30, 49, .94), rgba(11, 23, 40, .90));
  border-color: rgba(148, 163, 184, .24);
}
:global(html[data-theme="dark"]) .trace-summary-card strong,
:global(html[data-theme="dark"]) .trace-section-head h3,
:global(html[data-theme="dark"]) .trace-flow-title {
  color: var(--text-1);
}
:global(html[data-theme="dark"]) .trace-summary-card span,
:global(html[data-theme="dark"]) .trace-flow-card p,
:global(html[data-theme="dark"]) .trace-flow-card small {
  color: var(--text-3);
}

.trace-ai-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: -4px 0 18px; padding: 12px 14px; border: 1px solid #dbeafe; border-radius: 16px; background: #f8fbff; }
.trace-ai-toolbar span { color: #64748b; font-size: 13px; }
.trace-model-intro { margin-bottom: 14px; color: #64748b; }
.trace-model-list { display: grid; gap: 10px; margin-bottom: 16px; }
.trace-model-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 14px; border: 1px solid #e2e8f0; border-radius: 14px; }
.trace-model-row > div { display: grid; gap: 4px; min-width: 0; }
.trace-model-row span { color: #64748b; font-size: 13px; }
.trace-ai-analysis { min-height: 260px; }
.trace-ai-subject { display: grid; gap: 5px; padding: 16px; border-radius: 16px; background: #f8fafc; }
.trace-ai-subject span { color: #64748b; }
.trace-ai-score { display: grid; gap: 6px; margin: 16px 0; padding: 18px; border-radius: 18px; color: #fff; background: linear-gradient(135deg, #2563eb, #0ea5e9); }
.trace-ai-score strong { font-size: 26px; }
.trace-ai-score em { font-style: normal; opacity: .86; }
.trace-ai-analysis section { margin: 18px 0; }
.trace-ai-analysis label { font-weight: 800; }
.trace-ai-analysis p, .trace-ai-analysis li { color: #475569; line-height: 1.75; }
.trace-ai-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
</style>
