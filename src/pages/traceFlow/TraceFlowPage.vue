<template>
  <IosPage class="trace-flow-guide-page">
    <IosPageHero
      eyebrow="TRACE WORKFLOW · 全链路自动化"
      title="溯源流程向导"
      description="从产品建档到出库发货，按业务顺序完成配置，系统将自动生成并持续补齐溯源链。"
    >
      <div class="hero-status">
        <span class="status-indicator" :class="{ disabled: automation.enabled === false }" />
        <span>{{ automation.enabled === false ? '自动化引擎已关闭' : '自动化引擎运行中' }}</span>
        <span class="status-separator" />
        <span>{{ completedStepCount }}/{{ displaySteps.length }} 个环节已有数据</span>
      </div>
      <template #actions>
        <el-button class="refresh-button" :loading="loading" @click="loadOverview(true)">
          <template #icon><AppIcon name="refresh" /></template>
          刷新状态
        </el-button>
        <el-button type="primary" :loading="syncing" @click="runAutoSync">
          <template #icon><AppIcon name="trace" /></template>
          一键补齐溯源
        </el-button>
      </template>
    </IosPageHero>

    <AiTraceAutomationPanel v-if="AI_FEATURE_ENABLED" module-key="all" @completed="loadOverview(false)" />

    <section class="workflow-board" aria-labelledby="workflow-board-title">
      <div class="workflow-board-head">
        <div>
          <div class="section-kicker">CORE WORKFLOW</div>
          <h3 id="workflow-board-title">业务主链</h3>
          <p>按顺序推进各环节，点击节点可直接进入对应业务页面。</p>
        </div>
        <div class="workflow-completion" aria-label="流程完成度">
          <span>流程完成度</span>
          <strong>{{ workflowCompletion }}%</strong>
        </div>
      </div>

      <div class="workflow-track">
        <button
          v-for="(step, index) in displaySteps"
          :key="step.key"
          type="button"
          class="workflow-stage"
          :class="stepState(step, index)"
          :aria-label="`进入${cleanStepTitle(step.title)}`"
          @click="go(step.route)"
        >
          <span class="stage-marker">
            <AppIcon :name="stepIcon(step, index)" :size="20" />
          </span>
          <span class="stage-copy">
            <span class="stage-order">第 {{ index + 1 }} 步</span>
            <strong>{{ cleanStepTitle(step.title) }}</strong>
            <span class="stage-status">{{ stepStatusText(step, index) }}</span>
          </span>
          <AppIcon class="stage-arrow" name="chevronRight" :size="16" />
        </button>
      </div>
      <div class="workflow-board-foot">
        <div class="workflow-note">
          <AppIcon name="spark" :size="17" />
          <span>市场扫码会继续写入溯源链；仅防伪码扫码触发防窜检测。</span>
        </div>
        <div class="workflow-progress-bar" aria-hidden="true">
          <span :style="{ width: `${workflowCompletion}%` }" />
        </div>
      </div>
    </section>

    <IosStatGrid class="summary-grid" mini>
      <IosStatCard
        v-for="item in overviewStats"
        :key="item.label"
        :label="item.label"
        :value="item.value"
        :icon="item.icon"
        :tone="item.tone"
        mini
      />
    </IosStatGrid>

    <div class="control-grid">
      <IosGlassCard class="automation-card">
        <div class="automation-head">
          <div>
            <div class="section-kicker">AUTOMATION</div>
            <h3>自动溯源规则</h3>
            <p>{{ automation.rule || '产品、码、装箱和发货动作会自动续写溯源链。' }}</p>
          </div>
          <el-tag :type="automation.enabled === false ? 'danger' : 'success'" effect="light" round>
            {{ automation.enabled === false ? '已关闭' : '运行中' }}
          </el-tag>
        </div>
        <div class="automation-rule-list">
          <div v-for="rule in automationRules" :key="rule.label" class="automation-rule">
            <span class="rule-icon"><AppIcon :name="rule.icon" :size="17" /></span>
            <span>{{ rule.label }}</span>
            <span class="rule-state">自动</span>
          </div>
        </div>
      </IosGlassCard>

      <IosGlassCard class="implementation-card">
        <div class="panel-heading">
          <div>
            <div class="section-kicker">DATA OVERVIEW</div>
            <h3>流程数据概览</h3>
            <p>批次、生产、包装、入库与扫码数据汇总。</p>
          </div>
          <AppIcon name="chart" :size="20" />
        </div>
        <div class="implementation-grid">
          <div v-for="item in implementationStats" :key="item.label" class="implementation-metric" :class="{ danger: item.danger }">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>
      </IosGlassCard>
    </div>

    <IosGlassCard class="v2-card" title="V2 企业级灵活架构" subtitle="按 v2.0 方案补充可配置码制式、规则引擎、ML 风险评分、多级缓存、边缘节点和 API 租户能力。">
      <div class="v2-grid">
        <div class="v2-panel">
          <div class="section-kicker">CODE FORMAT</div>
          <strong>{{ v2.codeFormats.length || 4 }}</strong>
          <span>可配置码制式</span>
          <p>{{ defaultFormatText }}</p>
        </div>
        <div class="v2-panel">
          <div class="section-kicker">RULE ENGINE</div>
          <strong>{{ v2.rules.length || 3 }}</strong>
          <span>防窜规则</span>
          <p>区域围栏 + 高频扫码 + ML 综合评分</p>
        </div>
        <div class="v2-panel">
          <div class="section-kicker">EDGE</div>
          <strong>{{ v2.edgeNodes.length || 0 }}</strong>
          <span>边缘节点</span>
          <p>工厂/仓库离线扫码队列与云端同步</p>
        </div>
        <div class="v2-panel">
          <div class="section-kicker">API MARKET</div>
          <strong>{{ v2.tenants.length || 1 }}</strong>
          <span>API 租户</span>
          <p>多租户配额、权限范围与认证策略</p>
        </div>
      </div>
      <div class="v2-metrics">
        <el-tag effect="plain">今日扫码：{{ v2.metrics.scansToday ?? '-' }}</el-tag>
        <el-tag effect="plain">今日防窜：{{ v2.metrics.violationsToday ?? '-' }}</el-tag>
        <el-tag effect="plain">缓存命中率：{{ percent(v2.cache?.l1?.hitRate) }}</el-tag>
        <el-tag effect="plain">事件积压：{{ v2.metrics.eventBacklog ?? '-' }}</el-tag>
      </div>
    </IosGlassCard>

    <IosGlassCard title="最近业务记录" subtitle="用于确认从建档到发货的链路是否已经开始流转。">
      <div class="latest-grid">
        <div class="latest-panel">
          <h4>最新产品</h4>
          <el-empty v-if="!latest.products.length" description="暂无产品" :image-size="72" />
          <ul v-else>
            <li v-for="item in latest.products" :key="item.id">
              <strong>{{ item.product_name || item.product_code || item.id }}</strong>
              <span>{{ item.batch_no || '未填批次' }}</span>
            </li>
          </ul>
        </div>
        <div class="latest-panel">
          <h4>最新装箱</h4>
          <el-empty v-if="!latest.boxes.length" description="暂无装箱" :image-size="72" />
          <ul v-else>
            <li v-for="item in latest.boxes" :key="item.id">
              <strong>{{ item.box_no || item.id }}</strong>
              <span>{{ boxStatusText(item.status) }}</span>
            </li>
          </ul>
        </div>
        <div class="latest-panel">
          <h4>最新发货</h4>
          <el-empty v-if="!latest.shipments.length" description="暂无发货单" :image-size="72" />
          <ul v-else>
            <li v-for="item in latest.shipments" :key="item.id">
              <strong>{{ item.shipment_no || item.id }}</strong>
              <span>{{ item.region_group || item.receiver || shipmentStatusText(item.status) }}</span>
            </li>
          </ul>
        </div>
      </div>
    </IosGlassCard>
  </IosPage>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage as Message } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import AiTraceAutomationPanel from '@/components/AiTraceAutomationPanel.vue';
import { AI_FEATURE_ENABLED } from '@/config/features';
import { IosGlassCard, IosPage, IosPageHero, IosStatCard, IosStatGrid } from '@/components/ios27';
import { traceWorkflowApi, traceabilityV2Api } from '@/api/resources';

const router = useRouter();
const loading = ref(false);
const syncing = ref(false);
const summary = reactive<Record<string, number>>({});
const automation = reactive<Record<string, any>>({});
const latest = reactive<Record<string, any[]>>({ products: [], boxes: [], shipments: [] });
const steps = ref<any[]>([]);
const v2 = reactive<Record<string, any>>({ codeFormats: [], rules: [], edgeNodes: [], tenants: [], metrics: {}, cache: {}, config: {}, topology: {} });

const fallbackSteps = [
  { key: 'base', title: '基础资料配置', route: '/products', total: 0, done: 0, auto: '录入商品名称、规格、品牌、批号等信息；公司不再必填。' },
  { key: 'codes', title: '生成溯源码', route: '/codes', total: 0, done: 0, auto: '选择产品后批量生成防伪码，自动继承产品批次。' },
  { key: 'trace', title: '建立批次与溯源环节', route: '/trace', total: 0, done: 0, auto: '产品、生产流程和防伪码自动写入溯源链。' },
  { key: 'bind', title: '码与产品关联', route: '/box', total: 0, done: 0, auto: '扫码装箱后自动形成单品码、箱码层级关系。' },
  { key: 'stock', title: '生产入库', route: '/box', total: 0, done: 0, auto: '封箱后视为生产入库，库存状态和溯源节点自动更新。' },
  { key: 'ship', title: '出库发货', route: '/shipments', total: 0, done: 0, auto: '发货时绑定经销商/区域/时间，自动生成防窜流向依据。' },
];

const displaySteps = computed(() => steps.value.length ? steps.value : fallbackSteps);

const overviewStats = computed(() => [
  { label: '产品档案', value: summary.products || 0, icon: 'product', tone: 'cyan' as const },
  { label: '防伪码', value: summary.codes || 0, icon: 'code', tone: 'indigo' as const },
  { label: '溯源记录', value: summary.traces || 0, icon: 'trace', tone: 'teal' as const },
  { label: '装箱记录', value: summary.boxes || 0, icon: 'box', tone: 'violet' as const },
  { label: '发货单', value: summary.shipments || 0, icon: 'shipment', tone: 'amber' as const },
  { label: '已发货', value: summary.shipped_shipments || 0, icon: 'shield', tone: 'mint' as const },
]);

const implementationStats = computed(() => [
  { label: '批次档案', value: summary.production_batches || 0 },
  { label: '生产环节', value: summary.production_steps || 0 },
  { label: '包装层级', value: summary.packaging_relations || 0 },
  { label: '入库记录', value: summary.warehouse_in_records || 0 },
  { label: '市场扫码', value: summary.market_scans || 0 },
  { label: '防窜记录', value: summary.channel_violations || 0, danger: true },
]);

const automationRules = [
  { label: '产品建档自动入链', icon: 'product' },
  { label: '生成码自动绑定批次', icon: 'code' },
  { label: '装箱自动建立层级', icon: 'box' },
  { label: '发货自动绑定流向', icon: 'shipment' },
  { label: '防窜读取授权地区', icon: 'shield' },
];

const completedStepCount = computed(() => displaySteps.value.filter((step) => Number(step.done || 0) > 0).length);
const nextPendingStepIndex = computed(() => displaySteps.value.findIndex((step) => Number(step.done || 0) <= 0));
const workflowCompletion = computed(() => {
  if (!displaySteps.value.length) return 0;
  const progress = displaySteps.value.reduce((total, step) => {
    const stepTotal = Number(step.total || 0);
    const done = Number(step.done || 0);
    if (stepTotal > 0) return total + Math.min(Math.max(done / stepTotal, 0), 1);
    return total + (done > 0 ? 1 : 0);
  }, 0);
  return Math.round((progress / displaySteps.value.length) * 100);
});


const defaultFormatText = computed(() => {
  const defaultId = v2.config?.codeFormat?.defaultPattern || 'STD_24';
  const item = Array.isArray(v2.codeFormats) ? v2.codeFormats.find((format: any) => format.formatId === defaultId || format.format_id === defaultId) : null;
  return item ? `${defaultId} / ${item.formatName || item.format_name}` : `${defaultId} / 标准 24 位码`;
});

function cleanStepTitle(title: string) {
  return String(title || '未命名环节').replace(/^Step\s*\d+\s*/i, '');
}

function stepIcon(step: any, index: number) {
  const icons: Record<string, string> = {
    base: 'product',
    codes: 'code',
    trace: 'trace',
    bind: 'box',
    stock: 'chart',
    ship: 'shipment',
  };
  return icons[String(step?.key || '')] || ['product', 'code', 'trace', 'box', 'chart', 'shipment'][index] || 'process';
}

function stepState(step: any, index: number) {
  if (Number(step?.done || 0) > 0) return 'is-complete';
  if (index === nextPendingStepIndex.value) return 'is-current';
  return 'is-pending';
}

function stepStatusText(step: any, index: number) {
  const done = Number(step?.done || 0);
  const total = Number(step?.total || 0);
  if (done > 0 && total > 0) return `${done} / ${total} 已完成`;
  if (done > 0) return `已有 ${done} 条数据`;
  if (index === nextPendingStepIndex.value) return '建议从这里开始';
  return '待前序环节完成';
}

function go(path: string) {
  if (path) router.push(path);
}

function boxStatusText(value: any) {
  const status = Number(value || 0);
  if (status === 2) return '已发货';
  if (status === 1) return '已封箱';
  return '待装箱';
}

function shipmentStatusText(value: any) {
  const status = Number(value || 0);
  if (status === 3) return '异常';
  if (status === 2) return '已签收';
  if (status === 1) return '已发货';
  return '待发货';
}

function percent(value: any) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '-';
  return `${Math.round(num * 100)}%`;
}

async function loadV2Overview() {
  try {
    const [config, formats, rules, metrics, cache, tenants, edgeNodes, topology] = await Promise.allSettled([
      traceabilityV2Api.systemConfig(),
      traceabilityV2Api.codeFormats(),
      traceabilityV2Api.rules(),
      traceabilityV2Api.realtimeMetrics(),
      traceabilityV2Api.cacheStatus(),
      traceabilityV2Api.tenants({ limit: 20 }),
      traceabilityV2Api.edgeNodes(),
      traceabilityV2Api.topology(),
    ]);
    if (config.status === 'fulfilled') v2.config = config.value || {};
    if (formats.status === 'fulfilled') v2.codeFormats = Array.isArray(formats.value) ? formats.value : [];
    if (rules.status === 'fulfilled') v2.rules = Array.isArray(rules.value) ? rules.value : [];
    if (metrics.status === 'fulfilled') v2.metrics = metrics.value || {};
    if (cache.status === 'fulfilled') v2.cache = cache.value || {};
    if (tenants.status === 'fulfilled') v2.tenants = Array.isArray(tenants.value) ? tenants.value : [];
    if (edgeNodes.status === 'fulfilled') v2.edgeNodes = Array.isArray(edgeNodes.value) ? edgeNodes.value : [];
    if (topology.status === 'fulfilled') v2.topology = topology.value || {};
  } catch {
    // v2 接口部署前不影响原有流程使用
  }
}

async function loadOverview(showMessage = false) {
  loading.value = true;
  try {
    const res = await traceWorkflowApi.overview();
    Object.assign(summary, res?.summary || {});
    Object.assign(automation, res?.automation || {});
    latest.products = Array.isArray(res?.latest?.products) ? res.latest.products : [];
    latest.boxes = Array.isArray(res?.latest?.boxes) ? res.latest.boxes : [];
    latest.shipments = Array.isArray(res?.latest?.shipments) ? res.latest.shipments : [];
    steps.value = Array.isArray(res?.steps) ? res.steps : [];
    await loadV2Overview();
    if (showMessage) Message.success('流程状态已刷新');
  } catch {
    if (showMessage) Message.warning('暂时无法读取流程概览，可继续使用各业务页面');
  } finally {
    loading.value = false;
  }
}

async function runAutoSync() {
  syncing.value = true;
  try {
    const res = await traceWorkflowApi.autoSync({});
    Message.success(`自动同步完成：${Number(res?.total || 0)} 条溯源记录已处理`);
    await loadOverview(false);
  } finally {
    syncing.value = false;
  }
}

onMounted(() => {
  loadOverview(false);
  loadV2Overview();
});
</script>

<style scoped>
.trace-flow-guide-page {
  --tf-surface: var(--ui-surface, var(--surface-solid, #fff));
  --tf-surface-muted: color-mix(in srgb, var(--tf-surface) 88%, #eaf1f8);
  --tf-line: var(--ui-line, rgba(148, 163, 184, .24));
  --tf-text: var(--ui-text, var(--text-1, #172033));
  --tf-text-muted: var(--ui-text-muted, var(--text-3, #64748b));
  --tf-primary: var(--ui-accent, var(--el-color-primary, #2563eb));
  --tf-success: #159b68;
  --tf-warning: #d97706;
  gap: 14px !important;
}

.trace-flow-guide-page :deep(.ios27-page-hero) {
  min-height: 150px !important;
  margin: 0 !important;
  padding: 24px 26px !important;
  border: 1px solid var(--tf-line) !important;
  border-radius: 8px !important;
  background: linear-gradient(112deg, var(--tf-surface) 0%, color-mix(in srgb, var(--tf-surface) 88%, #eaf2ff) 68%, color-mix(in srgb, var(--tf-surface) 90%, #e9f8f0) 100%) !important;
  box-shadow: 0 8px 24px rgba(30, 64, 112, .08) !important;
}

.trace-flow-guide-page :deep(.ios27-page-hero::before),
.trace-flow-guide-page :deep(.ios27-page-hero::after) {
  display: none !important;
}

.trace-flow-guide-page :deep(.eyebrow),
.section-kicker {
  margin-bottom: 7px;
  padding: 0;
  color: var(--tf-primary);
  background: transparent;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.trace-flow-guide-page :deep(.page-title) {
  color: var(--tf-text) !important;
  font-size: 30px !important;
  line-height: 1.2;
  letter-spacing: 0 !important;
}

.trace-flow-guide-page :deep(.page-desc) {
  max-width: 780px;
  margin-top: 9px;
  color: var(--tf-text-muted) !important;
  font-size: 14px;
  line-height: 1.65;
}

.trace-flow-guide-page :deep(.ios27-hero-actions) {
  min-width: 150px;
  flex-direction: column;
  align-items: stretch;
}

.trace-flow-guide-page :deep(.ios27-hero-actions .el-button) {
  width: 100%;
  min-height: 40px;
  margin: 0;
  border-radius: 7px !important;
}

.hero-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 15px;
  color: var(--tf-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tf-success);
  box-shadow: 0 0 0 4px rgba(21, 155, 104, .12);
}

.status-indicator.disabled {
  background: #dc2626;
  box-shadow: 0 0 0 4px rgba(220, 38, 38, .12);
}

.status-separator {
  width: 1px;
  height: 12px;
  margin: 0 2px;
  background: var(--tf-line);
}

.workflow-board {
  padding: 22px 24px 18px;
  border: 1px solid var(--tf-line);
  border-radius: 8px;
  background: var(--tf-surface);
  box-shadow: 0 8px 24px rgba(30, 64, 112, .06);
}

.workflow-board-head,
.automation-head,
.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.workflow-board-head h3,
.automation-head h3,
.panel-heading h3 {
  margin: 0;
  color: var(--tf-text) !important;
  font-size: 18px;
  line-height: 1.35;
  letter-spacing: 0;
}

.workflow-board-head p,
.automation-head p,
.panel-heading p {
  margin: 5px 0 0;
  color: var(--tf-text-muted);
  font-size: 13px;
  line-height: 1.55;
}

.workflow-completion {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 0 0 auto;
  color: var(--tf-text-muted);
  font-size: 12px;
}

.workflow-completion strong {
  color: var(--tf-text);
  font-size: 22px;
  line-height: 1;
}

.workflow-track {
  position: relative;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0;
  margin: 24px 0 18px;
}

.workflow-track::before {
  content: "";
  position: absolute;
  top: 23px;
  left: 8.33%;
  right: 8.33%;
  height: 2px;
  background: var(--tf-line);
}

.workflow-stage {
  position: relative;
  z-index: 1;
  min-width: 0;
  min-height: 120px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--tf-text);
  font: inherit;
  text-align: center;
  cursor: pointer;
}

.workflow-stage:focus-visible {
  outline: 2px solid var(--tf-primary);
  outline-offset: 4px;
  border-radius: 6px;
}

.stage-marker {
  position: relative;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin: 0 auto 12px;
  border: 2px solid var(--tf-line);
  border-radius: 50%;
  background: var(--tf-surface);
  color: var(--tf-text-muted);
  transition: transform .16s ease, border-color .16s ease, color .16s ease, background-color .16s ease;
}

.workflow-stage:hover .stage-marker {
  transform: translateY(-2px);
  border-color: var(--tf-primary);
  color: var(--tf-primary);
}

.workflow-stage.is-complete .stage-marker {
  border-color: rgba(21, 155, 104, .28);
  background: color-mix(in srgb, var(--tf-surface) 78%, #d9f7e9);
  color: var(--tf-success);
}

.workflow-stage.is-current .stage-marker {
  border-color: var(--tf-primary);
  background: color-mix(in srgb, var(--tf-surface) 78%, #dbeafe);
  color: var(--tf-primary);
  box-shadow: 0 0 0 5px rgba(37, 99, 235, .08);
}

.stage-copy {
  display: grid;
  gap: 4px;
  justify-items: center;
  min-width: 0;
}

.stage-order {
  color: var(--tf-text-muted);
  font-size: 11px;
}

.stage-copy strong {
  min-width: 0;
  color: var(--tf-text);
  font-size: 14px;
  line-height: 1.35;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.stage-status {
  color: var(--tf-text-muted);
  font-size: 11px;
  line-height: 1.35;
}

.workflow-stage.is-complete .stage-status { color: var(--tf-success); }
.workflow-stage.is-current .stage-status { color: var(--tf-primary); font-weight: 700; }
.stage-arrow { display: none; }

.workflow-board-foot {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  align-items: center;
  gap: 24px;
  padding-top: 15px;
  border-top: 1px solid var(--tf-line);
}

.workflow-note {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--tf-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.workflow-note :deep(.app-icon) { color: var(--tf-warning); }

.workflow-progress-bar {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tf-line) 60%, transparent);
}

.workflow-progress-bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--tf-success);
  transition: width .24s ease;
}

.summary-grid {
  grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
  gap: 12px !important;
}

.summary-grid :deep(.ios27-stat-card) {
  min-height: 104px;
  padding: 0;
  border: 1px solid var(--tf-line) !important;
  border-radius: 8px !important;
  background: var(--tf-surface) !important;
  box-shadow: 0 5px 16px rgba(30, 64, 112, .05) !important;
}

.summary-grid :deep(.ios27-stat-card::after) { display: none; }

.summary-grid :deep(.ios27-stat-card .el-card__body) {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 11px;
  padding: 17px !important;
}

.summary-grid :deep(.ios27-stat-icon) {
  grid-row: 1 / 3;
  width: 38px !important;
  height: 38px !important;
  margin: 0 !important;
  border-radius: 7px !important;
}

.summary-grid :deep(.mini-stat-label) {
  color: var(--tf-text-muted);
  font-size: 12px;
}

.summary-grid :deep(.mini-stat-value) {
  margin-top: 1px !important;
  color: var(--tf-text) !important;
  font-size: 24px;
  line-height: 1.15;
  letter-spacing: 0;
}

.summary-grid :deep(.ios27-stat-card:nth-child(1) .ios27-stat-icon) { color: #2563eb; background: color-mix(in srgb, var(--tf-surface) 78%, #dbeafe); }
.summary-grid :deep(.ios27-stat-card:nth-child(2) .ios27-stat-icon) { color: #7c3aed; background: color-mix(in srgb, var(--tf-surface) 78%, #e9ddff); }
.summary-grid :deep(.ios27-stat-card:nth-child(3) .ios27-stat-icon) { color: #0f8a74; background: color-mix(in srgb, var(--tf-surface) 78%, #cef4e9); }
.summary-grid :deep(.ios27-stat-card:nth-child(4) .ios27-stat-icon) { color: #087ea4; background: color-mix(in srgb, var(--tf-surface) 78%, #d5f2f8); }
.summary-grid :deep(.ios27-stat-card:nth-child(5) .ios27-stat-icon) { color: #b45309; background: color-mix(in srgb, var(--tf-surface) 78%, #ffedc7); }
.summary-grid :deep(.ios27-stat-card:nth-child(6) .ios27-stat-icon) { color: #15803d; background: color-mix(in srgb, var(--tf-surface) 78%, #d8f2df); }

.control-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}

.automation-card,
.implementation-card,
.v2-card,
.trace-flow-guide-page > :deep(.ios27-glass-card) {
  border: 1px solid var(--tf-line) !important;
  border-radius: 8px !important;
  background: var(--tf-surface) !important;
  box-shadow: 0 6px 20px rgba(30, 64, 112, .05) !important;
}

.automation-card,
.implementation-card { height: 100%; }

.automation-head p { max-width: 520px; }

.automation-rule-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
  margin-top: 18px;
  border-top: 1px solid var(--tf-line);
}

.automation-rule {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 48px;
  border-bottom: 1px solid var(--tf-line);
  color: var(--tf-text);
  font-size: 13px;
}

.rule-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--tf-primary);
  background: color-mix(in srgb, var(--tf-surface) 76%, #dbeafe);
}

.rule-state {
  color: var(--tf-success);
  font-size: 11px;
  font-weight: 700;
}

.panel-heading > :deep(.app-icon) {
  flex: 0 0 auto;
  color: var(--tf-primary);
}

.implementation-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 18px;
  border-top: 1px solid var(--tf-line);
  border-left: 1px solid var(--tf-line);
}

.implementation-metric {
  display: grid;
  gap: 6px;
  min-height: 78px;
  padding: 13px 14px;
  border-right: 1px solid var(--tf-line);
  border-bottom: 1px solid var(--tf-line);
  background: var(--tf-surface-muted);
}

.implementation-metric span {
  color: var(--tf-text-muted);
  font-size: 12px;
}

.implementation-metric strong {
  color: var(--tf-text) !important;
  font-size: 23px;
  line-height: 1;
  letter-spacing: 0;
}

.implementation-metric.danger strong { color: #dc2626 !important; }

.v2-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0 0 16px;
  border-top: 1px solid var(--tf-line);
  border-bottom: 1px solid var(--tf-line);
}

.v2-panel {
  display: grid;
  gap: 6px;
  min-height: 130px;
  padding: 17px 18px;
  border-right: 1px solid var(--tf-line);
}

.v2-panel:last-child { border-right: 0; }

.v2-panel strong {
  color: var(--tf-text) !important;
  font-size: 27px;
  line-height: 1;
  letter-spacing: 0;
}

.v2-panel > span {
  color: var(--tf-text) !important;
  font-size: 13px;
  font-weight: 800;
}

.v2-panel p {
  margin: 0;
  color: var(--tf-text-muted);
  font-size: 12px;
  line-height: 1.55;
}

.v2-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.v2-metrics :deep(.el-tag) { border-radius: 5px; }

.latest-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.latest-panel {
  min-width: 0;
  padding: 2px 18px;
  border-right: 1px solid var(--tf-line);
}

.latest-panel:first-child { padding-left: 0; }
.latest-panel:last-child { padding-right: 0; border-right: 0; }

.latest-panel h4 {
  margin: 0 0 12px;
  color: var(--tf-text);
  font-size: 14px;
  letter-spacing: 0;
}

.latest-panel ul {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.latest-panel li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  padding: 7px 0;
  border-bottom: 1px solid var(--tf-line);
}

.latest-panel strong {
  min-width: 0;
  overflow: hidden;
  color: var(--tf-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.latest-panel li span {
  flex: 0 0 auto;
  color: var(--tf-text-muted);
  font-size: 11px;
}

:global(html[data-theme="dark"] .trace-flow-guide-page) {
  --tf-surface: #111c2e;
  --tf-surface-muted: #162338;
  --tf-line: rgba(148, 163, 184, .20);
  --tf-text: #f1f5f9;
  --tf-text-muted: #9aabc1;
}

:global(html[data-theme="dark"] .trace-flow-guide-page .summary-grid .mini-stat-value),
:global(html[data-theme="dark"] .trace-flow-guide-page .automation-head h3),
:global(html[data-theme="dark"] .trace-flow-guide-page .implementation-metric strong),
:global(html[data-theme="dark"] .trace-flow-guide-page .v2-panel strong),
:global(html[data-theme="dark"] .trace-flow-guide-page .v2-panel > span) {
  color: #f1f5f9 !important;
}

:global(html[data-theme="dark"] .trace-flow-guide-page .implementation-metric.danger strong) {
  color: #fb7185 !important;
}

@media (max-width: 1400px) {
  .workflow-track {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .workflow-track::before { display: none; }
  .workflow-stage {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 10px;
    min-height: 82px;
    padding: 10px 12px;
    border: 1px solid var(--tf-line);
    border-radius: 7px;
    background: var(--tf-surface-muted);
    text-align: left;
  }
  .stage-marker { width: 42px; height: 42px; margin: 0; }
  .stage-copy { justify-items: start; }
  .stage-arrow { display: block; color: var(--tf-text-muted); }
  .summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
}

@media (max-width: 1080px) {
  .control-grid { grid-template-columns: 1fr; }
  .v2-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .v2-panel:nth-child(2) { border-right: 0; }
  .v2-panel:nth-child(-n+2) { border-bottom: 1px solid var(--tf-line); }
}

@media (max-width: 760px) {
  .trace-flow-guide-page :deep(.ios27-page-hero) {
    min-height: 0 !important;
    padding: 20px !important;
  }
  .trace-flow-guide-page :deep(.page-title) { font-size: 25px !important; }
  .trace-flow-guide-page :deep(.ios27-hero-actions) {
    display: grid !important;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }
  .trace-flow-guide-page :deep(.ios27-hero-actions .el-space__item) { width: 100%; }
  .workflow-board { padding: 18px; }
  .workflow-board-head { align-items: flex-end; }
  .workflow-board-head p { display: none; }
  .workflow-track { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 18px; }
  .workflow-board-foot { grid-template-columns: 1fr; gap: 12px; }
  .workflow-progress-bar { order: -1; }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
  .automation-rule-list { grid-template-columns: 1fr; }
  .implementation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .latest-grid { grid-template-columns: 1fr; }
  .latest-panel,
  .latest-panel:first-child,
  .latest-panel:last-child {
    padding: 16px 0;
    border-right: 0;
    border-bottom: 1px solid var(--tf-line);
  }
  .latest-panel:first-child { padding-top: 0; }
  .latest-panel:last-child { padding-bottom: 0; border-bottom: 0; }
}

@media (max-width: 520px) {
  .hero-status .status-separator,
  .hero-status .status-separator + span { display: none; }
  .workflow-board-head { align-items: flex-start; }
  .workflow-completion { display: grid; gap: 3px; text-align: right; }
  .workflow-track { grid-template-columns: 1fr; }
  .workflow-stage { min-height: 72px; }
  .summary-grid { grid-template-columns: 1fr !important; }
  .implementation-grid,
  .v2-grid { grid-template-columns: 1fr; }
  .v2-panel,
  .v2-panel:nth-child(2) {
    border-right: 0;
    border-bottom: 1px solid var(--tf-line);
  }
  .v2-panel:last-child { border-bottom: 0; }
}
</style>
