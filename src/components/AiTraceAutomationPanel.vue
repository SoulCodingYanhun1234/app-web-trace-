<template>
  <section v-if="AI_FEATURE_ENABLED" class="ai-trace-panel" :class="{ 'is-compact': compact }">
    <div class="ai-trace-head">
      <div class="ai-trace-title-wrap">
        <span class="ai-badge"><AppIcon name="spark" :size="15" /> AI 自动化溯源</span>
        <div>
          <h3>{{ title || defaultTitle }}</h3>
          <p>{{ description || defaultDescription }}</p>
        </div>
      </div>
      <div class="ai-trace-actions">
        <el-tag :type="overview.enabled === false ? 'danger' : 'success'" effect="light">
          {{ overview.enabled === false ? '自动化已关闭' : modeText }}
        </el-tag>
        <el-button :loading="inspecting" @click="inspectAutomation">
          <template #icon><AppIcon name="search" :size="16" /></template>
          立即巡检
        </el-button>
        <el-button v-if="canRun" type="primary" :loading="running" :disabled="overview.enabled === false" @click="runAutomation">
          <template #icon><AppIcon name="spark" :size="16" /></template>
          {{ moduleKey === 'all' ? '巡检并补齐全链路' : '巡检并自动补链' }}
        </el-button>
      </div>
    </div>

    <div class="policy-strip">
      <span><AppIcon name="shield" :size="14" /> 幂等补链，不重复追加相同节点</span>
      <span><AppIcon name="risk" :size="14" /> 防窜仅抽检风险候选，不逐码测试</span>
      <span><AppIcon name="region" :size="14" /> 同一位置只弹一条，10 秒自动关闭</span>
    </div>

    <div v-if="moduleKey === 'all'" class="ai-overall-row">
      <div class="score-ring" :class="statusClass(overview.overall?.status)">
        <strong>{{ overview.overall?.score ?? 100 }}</strong><span>健康分</span>
      </div>
      <div class="overall-metrics">
        <div><span>巡检对象</span><strong>{{ overview.overall?.total ?? 0 }}</strong></div>
        <div><span>已自动化</span><strong>{{ overview.overall?.automated ?? 0 }}</strong></div>
        <div><span>待处理</span><strong>{{ overview.overall?.pending ?? 0 }}</strong></div>
      </div>
      <div class="policy-note">
        <strong>自动化边界</strong>
        <span>系统只修复可推导的关联和溯源节点；批号、制造商、保质期等业务资料缺失时只提示，不自动编造。</span>
      </div>
    </div>

    <div v-if="visibleModules.length" class="module-grid" :class="{ single: moduleKey !== 'all' }">
      <article v-for="item in visibleModules" :key="item.key" class="module-card" :class="statusClass(item.status)">
        <div class="module-card-top">
          <div class="module-icon"><AppIcon :name="item.icon || iconFor(item.key)" :size="20" /></div>
          <div class="module-name"><strong>{{ item.title }}</strong><span>{{ item.score ?? 100 }} 分</span></div>
          <el-tag :type="tagType(item.status)" size="small" effect="plain">{{ statusText(item.status) }}</el-tag>
        </div>
        <p>{{ item.description }}</p>
        <div class="module-progress" aria-hidden="true">
          <span :style="{ width: `${coverage(item)}%` }" />
        </div>
        <div class="module-metrics">
          <span>总量 <b>{{ item.total ?? 0 }}</b></span>
          <span>已通过 <b>{{ item.automated ?? 0 }}</b></span>
          <span class="repairable">可自动修复 <b>{{ item.repairable ?? item.pending ?? 0 }}</b></span>
          <span :class="{ pending: Number(item.blocked || 0) > 0 }">需人工 <b>{{ item.blocked ?? 0 }}</b></span>
        </div>

        <div v-if="item.checks?.length" class="check-list">
          <div v-for="check in item.checks" :key="check.key" class="check-row">
            <span class="check-state" :class="Number(check.pending || 0) ? (check.repairable ? 'repair' : 'block') : 'pass'">
              {{ Number(check.pending || 0) ? (check.repairable ? '可修' : '待补') : '通过' }}
            </span>
            <div>
              <strong>{{ check.label }}</strong>
              <small>{{ check.passed ?? 0 }} / {{ check.total ?? 0 }}，待处理 {{ check.pending ?? 0 }}</small>
            </div>
          </div>
        </div>

        <div v-if="!compact && item.actions?.length" class="module-actions-list">
          <span v-for="action in item.actions" :key="action">{{ action }}</span>
        </div>
        <el-button v-if="moduleKey === 'all' && item.route" text type="primary" @click="go(item.route)">进入{{ item.title }}</el-button>
      </article>
    </div>

    <div v-if="overview.suggestions?.length && !compact" class="ai-suggestions">
      <span v-for="item in overview.suggestions" :key="item"><AppIcon name="shield" :size="14" />{{ item }}</span>
    </div>

    <el-dialog v-model="resultVisible" :title="lastResult?.dry_run ? 'AI 自动巡检结果' : 'AI 自动巡检与补链结果'" width="min(920px, 94vw)" append-to-body>
      <el-alert
        :type="lastResult?.success ? 'success' : 'warning'"
        :title="lastResult?.dry_run ? '巡检完成，未修改业务数据' : (lastResult?.success ? '自动巡检与补链完成' : '部分自动化任务执行失败')"
        :description="resultSummary"
        show-icon
        :closable="false"
      />
      <div class="result-list">
        <div v-for="item in lastResult?.results || []" :key="item.key" class="result-row">
          <div class="result-row-head">
            <el-tag :type="item.success ? 'success' : 'danger'">{{ moduleName(item.key) }}</el-tag>
            <span>{{ item.duration_ms || 0 }} ms</span>
          </div>
          <strong>{{ item.message || item.error || '执行完成' }}</strong>
          <div class="result-metrics">
            <span>扫描 {{ item.scanned || 0 }}</span>
            <span>候选 {{ item.candidates ?? '-' }}</span>
            <span>影响 {{ item.affected || 0 }}</span>
            <span>跳过 {{ item.skipped || 0 }}</span>
            <span>待处理 {{ item.before_pending || 0 }} → {{ item.after_pending || 0 }}</span>
          </div>
          <div class="phase-list">
            <span v-for="phase in item.phases || []" :key="phase.key" :class="`phase-${phase.status}`">
              {{ phase.label }} · {{ phaseText(phase.status) }}
            </span>
          </div>
          <div v-if="item.sampling" class="sampling-note">
            候选池 {{ item.sampling.candidate_pool || 0 }}，抽取 {{ item.sampling.sampled || 0 }}，抽样率 {{ Math.round(Number(item.sampling.sample_rate || 0) * 100) }}%，未逐码检查 {{ item.sampling.skipped_by_sampling || 0 }} 个。
          </div>
        </div>
      </div>
      <template #footer><el-button type="primary" @click="resultVisible = false">完成</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage as Message } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import { traceAutomationApi } from '@/api/resources';
import { AI_FEATURE_ENABLED } from '@/config/features';
import { useAuthStore } from '@/stores/auth';

const props = withDefaults(defineProps<{
  moduleKey?: 'all' | 'product' | 'codes' | 'trace' | 'box' | 'shipment' | 'anti-channeling';
  title?: string;
  description?: string;
  compact?: boolean;
  limit?: number;
}>(), { moduleKey: 'all', title: '', description: '', compact: false, limit: 100 });
const emit = defineEmits<{ completed: [result: any]; inspected: [result: any] }>();
const router = useRouter();
const auth = useAuthStore();
const loading = ref(false);
const inspecting = ref(false);
const running = ref(false);
const resultVisible = ref(false);
const lastResult = ref<any>(null);
const overview = reactive<any>({ enabled: true, mode: 'rule-engine-assisted', overall: {}, modules: [], suggestions: [], policy: {} });
const canRun = computed(() => auth.hasPermission('trace:manage'));
const visibleModules = computed(() => Array.isArray(overview.modules) ? overview.modules : []);
const moduleNames: Record<string, string> = { product: '产品管理', codes: '防伪码管理', trace: '溯源管理', box: '装箱管理', shipment: '发货管理', 'anti-channeling': '防窜预警' };
const defaultTitle = computed(() => props.moduleKey === 'all' ? '全链路 AI 自动化任务中心' : `${moduleNames[props.moduleKey] || '当前模块'}自动巡检与补链`);
const defaultDescription = computed(() => props.moduleKey === 'all'
  ? '统一执行产品、防伪码、溯源、装箱、发货和防窜的巡检、自动补链与结果复检。'
  : '先识别可自动修复的关联断点，再补写缺失溯源节点；不能推导的业务资料单独列为人工待办。');
const modeText = computed(() => overview.mode === 'ai-model-assisted' ? 'AI 模型辅助' : '规则引擎 + AI 工作流');
const resultSummary = computed(() => {
  const summary = lastResult.value?.summary || {};
  return `处理模块 ${summary.modules || 0} 个，成功 ${summary.succeeded || 0} 个，影响记录 ${summary.affected || 0} 条。`;
});

function tagType(status: string) { return status === 'healthy' ? 'success' : status === 'attention' ? 'warning' : 'danger'; }
function statusText(status: string) { return status === 'healthy' ? '正常' : status === 'attention' ? '待优化' : '需处理'; }
function statusClass(status: string) { return `is-${status || 'healthy'}`; }
function iconFor(key: string) { return ({ product: 'product', codes: 'code', trace: 'trace', box: 'box', shipment: 'shipment', 'anti-channeling': 'risk' } as any)[key] || 'spark'; }
function moduleName(key: string) { return moduleNames[key] || key; }
function go(path: string) { router.push(path); }
function coverage(item: any) {
  const total = Number(item?.total || 0);
  if (!total) return 100;
  return Math.max(0, Math.min(100, Math.round((Number(item?.automated || 0) / total) * 100)));
}
function phaseText(status: string) {
  return ({ completed: '完成', skipped: '未执行', planned: '待执行', pending: '复检中', attention: '需关注' } as Record<string, string>)[status] || status;
}
function requestPayload() {
  return {
    modules: props.moduleKey === 'all' ? ['all'] : [props.moduleKey],
    limit: props.limit,
    sample_rate: 0.2,
    max_candidates: Math.min(props.limit, 50),
    recent_hours: 24,
  };
}

async function load() {
  if (!AI_FEATURE_ENABLED) return;
  loading.value = true;
  try {
    const data = await traceAutomationApi.overview(props.moduleKey);
    Object.assign(overview, data || {});
  } finally { loading.value = false; }
}

async function inspectAutomation() {
  if (!AI_FEATURE_ENABLED) return;
  inspecting.value = true;
  try {
    const result = await traceAutomationApi.inspect(requestPayload());
    lastResult.value = result;
    resultVisible.value = true;
    Message.success('AI 自动巡检完成，未修改业务数据');
    await load();
    emit('inspected', result);
  } catch (error: any) {
    Message.error(error?.message || 'AI 自动巡检失败');
  } finally { inspecting.value = false; }
}

async function runAutomation() {
  if (!AI_FEATURE_ENABLED) return;
  running.value = true;
  try {
    const result = await traceAutomationApi.run(requestPayload());
    lastResult.value = result;
    resultVisible.value = true;
    Message.success(`AI 自动补链完成，影响 ${result?.summary?.affected || 0} 条记录`);
    await load();
    emit('completed', result);
  } catch (error: any) {
    Message.error(error?.message || 'AI 自动化执行失败');
  } finally { running.value = false; }
}

watch(() => props.moduleKey, () => { if (AI_FEATURE_ENABLED) void load(); });
onMounted(() => { if (AI_FEATURE_ENABLED) void load(); });
</script>

<style scoped>
.ai-trace-panel { margin: 0 0 16px; padding: 18px; border: 1px solid rgba(59,130,246,.2); border-radius: 22px; background: linear-gradient(135deg, rgba(239,246,255,.94), rgba(255,255,255,.86) 55%, rgba(240,253,250,.88)); box-shadow: 0 14px 36px rgba(37,99,235,.08); }
.ai-trace-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
.ai-trace-title-wrap { display: flex; gap: 14px; min-width: 0; }
.ai-badge { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 999px; color: #1d4ed8; background: rgba(219,234,254,.85); font-weight: 800; font-size: 12px; white-space: nowrap; }
.ai-trace-title-wrap h3 { margin: 0 0 6px; color: var(--soy-text-primary, #0f172a); font-size: 18px; }
.ai-trace-title-wrap p { margin: 0; color: var(--soy-text-secondary, #64748b); line-height: 1.65; }
.ai-trace-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
.policy-strip { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.policy-strip span { display: inline-flex; align-items: center; gap: 6px; padding: 6px 9px; border: 1px solid rgba(148,163,184,.18); border-radius: 999px; background: rgba(255,255,255,.68); color: #475569; font-size: 12px; }
.ai-overall-row { display: grid; grid-template-columns: 110px minmax(300px, 1fr) minmax(260px, .8fr); gap: 16px; align-items: center; margin-top: 18px; padding: 14px; border-radius: 18px; background: rgba(255,255,255,.62); }
.score-ring { width: 82px; height: 82px; display: grid; place-content: center; text-align: center; border: 7px solid #86efac; border-radius: 50%; background: #fff; }
.score-ring.is-attention { border-color: #fbbf24; }.score-ring.is-warning { border-color: #fb7185; }
.score-ring strong { font-size: 24px; line-height: 1; color: #0f172a; }.score-ring span { margin-top: 4px; color: #64748b; font-size: 11px; }
.overall-metrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; }
.overall-metrics div { padding: 12px; border-radius: 15px; background: rgba(248,250,252,.9); }.overall-metrics span { display: block; color: #64748b; font-size: 12px; }.overall-metrics strong { display: block; margin-top: 5px; color: #0f172a; font-size: 22px; }
.policy-note { padding: 12px 14px; border-left: 3px solid #10b981; border-radius: 12px; background: rgba(236,253,245,.8); }.policy-note strong,.policy-note span { display:block; }.policy-note strong { color:#047857; margin-bottom:4px; }.policy-note span { color:#475569; font-size:13px; line-height:1.55; }
.module-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px; margin-top: 16px; }.module-grid.single { grid-template-columns: minmax(0,1fr); }
.module-card { padding: 14px; border: 1px solid rgba(148,163,184,.24); border-radius: 18px; background: rgba(255,255,255,.76); }.module-card.is-attention { border-color: rgba(245,158,11,.36); }.module-card.is-warning { border-color: rgba(239,68,68,.36); }
.module-card-top { display:flex;align-items:center;gap:10px; }.module-icon { display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#eff6ff;color:#2563eb; }.module-name { min-width:0; flex:1; }.module-name strong,.module-name span { display:block; }.module-name strong { color:#0f172a; }.module-name span { color:#64748b;font-size:12px;margin-top:2px; }
.module-card p { min-height: 64px; margin: 12px 0; color:#64748b;font-size:13px;line-height:1.65; }.module-grid.single .module-card p { min-height: auto; }
.module-progress { height: 7px; overflow: hidden; margin: -2px 0 10px; border-radius: 999px; background: #e2e8f0; }.module-progress span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #2563eb, #22c55e); }
.module-metrics { display:flex;flex-wrap:wrap;gap:8px; }.module-metrics span { padding:5px 8px;border-radius:9px;background:#f8fafc;color:#64748b;font-size:12px; }.module-metrics b { color:#0f172a; }.module-metrics .repairable { background:#eff6ff;color:#1d4ed8; }.module-metrics .pending { background:#fff7ed;color:#c2410c; }
.check-list { display: grid; gap: 7px; margin-top: 12px; }
.check-row { display: grid; grid-template-columns: 42px minmax(0,1fr); gap: 9px; align-items: center; padding: 8px; border-radius: 12px; background: rgba(248,250,252,.82); }
.check-row div { min-width: 0; }.check-row strong,.check-row small { display: block; }.check-row strong { color: #334155; font-size: 12px; }.check-row small { margin-top: 2px; color: #94a3b8; font-size: 11px; }
.check-state { padding: 3px 5px; border-radius: 7px; text-align: center; font-size: 10px; font-weight: 800; }.check-state.pass { color: #047857; background: #d1fae5; }.check-state.repair { color: #1d4ed8; background: #dbeafe; }.check-state.block { color: #c2410c; background: #ffedd5; }
.module-actions-list { display:flex;flex-wrap:wrap;gap:6px;margin-top:12px; }.module-actions-list span { padding:4px 8px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px; }
.ai-suggestions { display:grid;gap:7px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(148,163,184,.2); }.ai-suggestions span { display:flex;gap:7px;align-items:flex-start;color:#475569;font-size:13px;line-height:1.5; }
.result-list { display:grid;gap:10px;margin-top:14px; }.result-row { display:grid;gap:8px;padding:13px;border-radius:14px;background:#f8fafc; }.result-row-head { display:flex;justify-content:space-between;gap:12px;align-items:center; }.result-row-head span { color:#94a3b8;font-size:12px; }.result-row > strong { color:#0f172a; }
.result-metrics,.phase-list { display:flex;flex-wrap:wrap;gap:6px; }.result-metrics span,.phase-list span { padding:4px 7px;border-radius:8px;background:#fff;color:#64748b;font-size:11px; }.phase-list .phase-completed { color:#047857;background:#d1fae5; }.phase-list .phase-skipped,.phase-list .phase-planned { color:#64748b;background:#e2e8f0; }.phase-list .phase-attention { color:#c2410c;background:#ffedd5; }
.sampling-note { padding: 8px 10px; border-radius: 10px; background: #eff6ff; color: #1e40af; font-size: 12px; line-height: 1.55; }
.is-compact { padding: 14px; }.is-compact .ai-trace-title-wrap p { font-size:13px; }.is-compact .module-card p { min-height:auto; }.is-compact .check-list { grid-template-columns: repeat(3, minmax(0,1fr)); }.is-compact .check-row { grid-template-columns: 38px minmax(0,1fr); }
@media (max-width: 1100px) { .module-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.ai-overall-row { grid-template-columns:90px 1fr; }.policy-note { grid-column:1/-1; }.is-compact .check-list { grid-template-columns: 1fr; } }
@media (max-width: 720px) { .ai-trace-head,.ai-trace-title-wrap { flex-direction:column; }.ai-trace-actions { justify-content:flex-start; }.module-grid { grid-template-columns:1fr; }.ai-overall-row { grid-template-columns:1fr; }.overall-metrics { grid-template-columns:repeat(3,minmax(0,1fr)); }.score-ring { width:72px;height:72px; }.module-card p { min-height:auto; }.policy-strip { display:grid; }.is-compact .check-list { grid-template-columns: 1fr; } }
</style>
