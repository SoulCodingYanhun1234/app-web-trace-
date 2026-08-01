<template>
  <IosPage class="ai-trace-page">
    <IosPageHero
      eyebrow="AI TRACE ANALYSIS"
      title="AI 溯源研判工作台"
      description="基于产品、批次、防伪码和 trace_chain，检查链路完整性、关键字段缺失与节点时序；防窜预警仅针对防伪码。"
    >
      <template #actions>
        <el-tag :type="isModelMode ? 'success' : 'info'" effect="light">
          <AppIcon :name="isModelMode ? 'spark' : 'shield'" :size="14" />
          {{ isModelMode ? '模型协同运行中' : '规则引擎运行中' }}
        </el-tag>
        <el-button @click="openModels"><AppIcon name="api" /> 模型接入</el-button>
        <el-button type="primary" :loading="loading" @click="loadOverview"><AppIcon name="refresh" /> 刷新研判</el-button>
      </template>
    </IosPageHero>

    <section class="trace-ai-kpis" aria-label="AI 溯源指标">
      <article v-for="item in kpiItems" :key="item.label" class="trace-ai-kpi">
        <div><span>{{ item.label }}</span><AppIcon :name="item.icon" :size="18" /></div>
        <strong>{{ item.value }}</strong>
        <small>{{ item.detail }}</small>
      </article>
    </section>

    <section class="trace-ai-grid">
      <IosGlassCard>
        <template #header>
          <div class="card-head">
            <div><strong>溯源链自动检查</strong><span>从产品建档到装箱、发货与查询的自动续写状态</span></div>
            <el-tag size="small" type="success" effect="plain">{{ overview.model_count || 0 }} 个模型位</el-tag>
          </div>
        </template>
        <div class="pipeline-list">
          <div v-for="(item, index) in overview.pipeline || []" :key="item.key" class="pipeline-row">
            <span class="pipeline-index">0{{ index + 1 }}</span>
            <div class="pipeline-copy"><strong>{{ item.label }}</strong><small>{{ item.detail }}</small></div>
            <div class="pipeline-result"><b>{{ item.value }}</b><el-tag size="small" :type="item.status === 'healthy' ? 'success' : 'warning'">{{ item.status === 'healthy' ? '正常' : '需关注' }}</el-tag></div>
          </div>
        </div>
      </IosGlassCard>

      <IosGlassCard>
        <template #header>
          <div class="card-head"><div><strong>研判边界</strong><span>模型只处理溯源数据，不扩大防窜对象</span></div><AppIcon name="shield" :size="20" /></div>
        </template>
        <div class="boundary-list">
          <div><AppIcon name="trace" :size="18" /><span><b>溯源分析对象</b>产品、批次、防伪码、生产/质检/装箱/物流节点</span></div>
          <div><AppIcon name="risk" :size="18" /><span><b>防窜预警对象</b>仅防伪码扫码；箱码、产品码、发货码和溯源码不触发</span></div>
          <div><AppIcon name="spark" :size="18" /><span><b>模型降级策略</b>未配置或调用失败时，自动使用本地规则完成完整性检查</span></div>
        </div>
        <el-button class="trace-entry" type="primary" plain @click="$router.push('/trace')">进入溯源管理</el-button>
      </IosGlassCard>
    </section>

    <IosGlassCard>
      <template #header>
        <div class="card-head">
          <div><strong>待补全溯源链</strong><span>按缺失项数量排序，可直接发起单条模型研判</span></div>
          <el-tag type="warning" effect="light">{{ tasks.length }} 条待处理</el-tag>
        </div>
      </template>
      <div class="responsive-table-wrap">
        <el-table :data="tasks" size="small" empty-text="当前溯源链完整，无待办记录">
          <el-table-column label="级别" width="96">
            <template #default="{ row }"><el-tag :type="row.severity === 'danger' ? 'danger' : 'warning'" size="small">{{ row.severity === 'danger' ? '重点' : '待补全' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="溯源对象" min-width="220">
            <template #default="{ row }"><div class="task-subject"><strong>{{ row.subject }}</strong><span>{{ row.title }}</span></div></template>
          </el-table-column>
          <el-table-column label="缺失摘要" min-width="360" show-overflow-tooltip><template #default="{ row }">{{ row.detail }}</template></el-table-column>
          <el-table-column label="更新时间" width="170"><template #default="{ row }">{{ formatTime(row.time) }}</template></el-table-column>
          <el-table-column label="动作" width="120" align="right"><template #default="{ row }"><el-button text type="primary" @click="reviewTask(row)">AI 研判</el-button></template></el-table-column>
        </el-table>
      </div>
    </IosGlassCard>

    <el-dialog v-model="modelsVisible" title="溯源模型接入状态" width="680px">
      <div class="model-intro"><AppIcon name="api" :size="16" /><span>{{ models.protocol || 'OpenAI Compatible' }}；密钥仅保存在 API 服务端。</span></div>
      <div class="model-list">
        <div v-for="model in models.providers || []" :key="model.id" class="model-row">
          <AppIcon name="spark" :size="18" />
          <div><strong>{{ model.name }}</strong><span>{{ model.model }} · {{ model.specialty }}</span></div>
          <el-tag :type="model.enabled ? 'success' : 'info'">{{ model.enabled ? '已启用' : '待配置' }}</el-tag>
        </div>
      </div>
      <el-alert type="info" :closable="false" title="服务端配置方式" description="通过 AI_MODEL_PROVIDERS JSON 或 OPENAI_API_KEY / AI_BASE_URL / AI_MODEL 接入 OpenAI 兼容模型；未配置时自动使用规则引擎。" />
    </el-dialog>

    <el-drawer v-model="analysisVisible" title="AI 溯源研判" size="min(560px, 100vw)">
      <div v-loading="analysisLoading" class="analysis-body">
        <div class="analysis-subject"><span>研判对象</span><strong>{{ selectedTask?.subject || '溯源记录' }}</strong><small>{{ selectedTask?.detail }}</small></div>
        <template v-if="analysis">
          <div class="analysis-score"><span>完整性结论</span><strong>{{ analysis.risk_level }}</strong><em>置信度 {{ analysis.confidence || 0 }}%</em></div>
          <section><label>研判摘要</label><p>{{ analysis.summary }}</p></section>
          <section><label>关键证据</label><ul><li v-for="(item, index) in analysis.evidence || []" :key="index">{{ item }}</li></ul></section>
          <section><label>建议动作</label><ol><li v-for="(item, index) in analysis.actions || []" :key="index">{{ item }}</li></ol></section>
          <div class="analysis-meta"><span>来源：{{ analysis.provider || '规则引擎' }}</span><el-tag size="small" :type="analysis.model_used ? 'success' : 'info'">{{ analysis.model_used ? '模型辅助' : '规则兜底' }}</el-tag></div>
        </template>
      </div>
    </el-drawer>
  </IosPage>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import { IosGlassCard, IosPage, IosPageHero } from '@/components/ios27';
import { aiRiskApi } from '@/api/resources';

const loading = ref(false);
const overview = ref<any>({ kpis: {}, pipeline: [], tasks: [] });
const models = ref<any>({ providers: [] });
const modelsVisible = ref(false);
const analysisVisible = ref(false);
const analysisLoading = ref(false);
const analysis = ref<any>(null);
const selectedTask = ref<any>(null);

const isModelMode = computed(() => overview.value.mode === 'model-assisted');
const tasks = computed(() => overview.value.tasks || []);
const kpiItems = computed(() => [
  { label: '已检查溯源记录', value: overview.value.kpis?.ai_scanned || 0, detail: '本轮进入规则/模型分析的记录', icon: 'trace' },
  { label: '完整溯源链', value: overview.value.kpis?.complete_traces || 0, detail: `完整率 ${overview.value.kpis?.complete_rate || 0}%`, icon: 'shield' },
  { label: '重点缺失链路', value: overview.value.kpis?.anomaly_traces || 0, detail: '存在 3 项及以上缺失', icon: 'risk' },
  { label: '待补全任务', value: overview.value.kpis?.pending_tasks || 0, detail: '可进入单条 AI 研判', icon: 'spark' },
]);

async function loadOverview() {
  loading.value = true;
  try { overview.value = await aiRiskApi.overview(); }
  finally { loading.value = false; }
}
async function openModels() {
  modelsVisible.value = true;
  models.value = await aiRiskApi.models();
}
async function reviewTask(task: any) {
  selectedTask.value = task;
  analysisVisible.value = true;
  analysisLoading.value = true;
  analysis.value = null;
  try {
    analysis.value = await aiRiskApi.analyze({
      analysis_type: 'trace',
      subject: task.subject,
      reasons: task.reasons || String(task.detail || '').split('；').filter(Boolean),
      trace_record: task.trace_record || {},
    });
  } catch {
    ElMessage.error('溯源研判服务暂时不可用');
  } finally { analysisLoading.value = false; }
}
function formatTime(value: any) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN', { hour12: false });
}

onMounted(loadOverview);
</script>

<style scoped>
.ai-trace-page { display: grid; gap: 18px; }
.trace-ai-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.trace-ai-kpi { padding: 18px; border: 1px solid rgba(148,163,184,.24); border-radius: 22px; background: rgba(255,255,255,.78); box-shadow: 0 14px 32px rgba(15,23,42,.06); }
.trace-ai-kpi div, .card-head, .pipeline-row, .model-row, .analysis-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.trace-ai-kpi span, .trace-ai-kpi small, .card-head span, .pipeline-copy small, .task-subject span, .model-row span, .analysis-subject span, .analysis-subject small { color: var(--text-3, #64748b); }
.trace-ai-kpi strong { display: block; margin: 12px 0 6px; font-size: 30px; }
.trace-ai-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr); gap: 18px; }
.card-head > div { display: grid; gap: 4px; }
.card-head strong { font-size: 16px; }
.pipeline-list { display: grid; gap: 10px; }
.pipeline-row { padding: 14px; border: 1px solid rgba(148,163,184,.2); border-radius: 16px; }
.pipeline-index { font-weight: 900; color: #2563eb; }
.pipeline-copy { flex: 1; display: grid; gap: 4px; }
.pipeline-result { display: flex; align-items: center; gap: 10px; }
.boundary-list { display: grid; gap: 12px; }
.boundary-list > div { display: flex; align-items: flex-start; gap: 10px; padding: 13px; border-radius: 15px; background: rgba(241,245,249,.72); }
.boundary-list span { display: grid; gap: 4px; line-height: 1.55; }
.trace-entry { width: 100%; margin-top: 16px; }
.task-subject { display: grid; gap: 3px; }
.model-intro { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; color: #64748b; }
.model-list { display: grid; gap: 10px; margin-bottom: 16px; }
.model-row { padding: 13px; border: 1px solid #e2e8f0; border-radius: 14px; }
.model-row > div { flex: 1; display: grid; gap: 4px; }
.analysis-body { min-height: 240px; }
.analysis-subject { display: grid; gap: 5px; padding: 16px; border-radius: 16px; background: #f8fafc; }
.analysis-score { display: grid; gap: 6px; margin: 16px 0; padding: 18px; border-radius: 18px; color: #fff; background: linear-gradient(135deg, #2563eb, #0ea5e9); }
.analysis-score strong { font-size: 26px; }
.analysis-score em { font-style: normal; opacity: .86; }
.analysis-body section { margin: 18px 0; }
.analysis-body label { font-weight: 800; }
.analysis-body p, .analysis-body li { line-height: 1.75; color: #475569; }
@media (max-width: 1000px) { .trace-ai-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .trace-ai-grid { grid-template-columns: 1fr; } }
@media (max-width: 600px) { .trace-ai-kpis { grid-template-columns: 1fr; } .pipeline-row { align-items: flex-start; flex-wrap: wrap; } }
</style>
