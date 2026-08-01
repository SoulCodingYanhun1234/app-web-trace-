<template>
  <IosPage class="dashboard-page">
    <IosPageHero :eyebrow="t('common.overview')" :title="t('dashboard.title')" :description="t('dashboard.desc')">
      <div class="dashboard-hero-status" role="status" aria-live="polite">
        <span class="status-dot" />
        <span>业务数据每 30 秒自动同步</span>
        <span class="status-divider" aria-hidden="true" />
        <span>{{ lastUpdatedText }}</span>
      </div>
      <template #actions>
        <el-tag class="dashboard-live-tag" effect="plain"><AppIcon name="chart" :size="14" /> 实时概览</el-tag>
        <el-button type="primary" :loading="loading" @click="loadDashboard(true)">
          <template #icon><AppIcon name="refresh" /></template>{{ t('common.refreshData') }}
        </el-button>
      </template>
    </IosPageHero>

    <el-alert
      v-if="dashboardError"
      class="dashboard-sync-alert"
      type="warning"
      show-icon
      :closable="false"
      :title="dashboardError"
    />

    <IosStatGrid>
      <IosStatCard
        v-for="item in stats"
        :key="item.key"
        :icon="item.icon"
        :tone="item.tone"
        :value="formatStatValue(summary[item.key])"
        :label="item.label"
        class="stat-card-interactive"
        role="button"
        tabindex="0"
        :aria-label="`查看${item.label}详情`"
        @click="navigateToDetail(item.key)"
        @keydown.enter="navigateToDetail(item.key)"
      />
    </IosStatGrid>

    <IosGlassCard v-if="antiChanneling.total > 0" class="channeling-strip channeling-strip-enhanced">
      <div class="channeling-strip-head">
        <span class="channeling-strip-label"><AppIcon name="risk" :size="16" /> 防窜预警</span>
        <el-button text size="small" type="primary" @click="$router.push('/anti-channeling')">查看详情 →</el-button>
      </div>
      <div class="channeling-strip-kpis">
        <div class="channeling-kpi danger channeling-kpi-danger-enhanced">
          <strong>{{ antiChanneling.pending || 0 }}</strong>
          <span>待处理</span>
        </div>
        <div class="channeling-kpi">
          <strong>{{ antiChanneling.today || 0 }}</strong>
          <span>今日新增</span>
        </div>
        <div class="channeling-kpi warning">
          <strong>{{ antiChanneling.severe || 0 }}</strong>
          <span>高危预警</span>
        </div>
        <div class="channeling-kpi">
          <strong>{{ antiChanneling.total || 0 }}</strong>
          <span>累计预警</span>
        </div>
      </div>
      <div v-if="(antiChanneling.type_rank || []).length" class="channeling-strip-types">
        <el-tag v-for="item in antiChanneling.type_rank.slice(0, 3)" :key="item.name" size="small" effect="plain" type="warning">
          {{ channelingTypeText(item.name) }} {{ item.count }}
        </el-tag>
      </div>
    </IosGlassCard>

    <el-row :gutter="16" class="dashboard-chart-row">
      <el-col :xs="24" :lg="16">
        <IosGlassCard class="table-card dashboard-chart-card trend-card">
          <template #header>
            <div class="chart-card-header">
              <div>
                <div class="chart-title">{{ t('dashboard.trendTitle') }}</div>
                <div class="chart-subtitle">{{ t('dashboard.trendSubtitle') }}</div>
              </div>
              <div class="trend-metric-switch">
                <el-segmented v-model="trendMetric" :options="trendMetricOptions" size="small" />
                <el-tag effect="light" type="primary">{{ t('common.realtime') }}</el-tag>
              </div>
            </div>
          </template>
          <div class="chart-shell trend-shell" :class="{ 'is-chart-loading': chartLoading }">
            <div v-show="chartLoading" class="chart-skeleton chart-skeleton-overlay">
              <div class="skeleton-line skeleton-line-40"></div>
              <div class="skeleton-line skeleton-line-25"></div>
              <div class="skeleton-chart-area"></div>
            </div>
            <div ref="trendRef" class="chart-box trend-chart"></div>
          </div>
        </IosGlassCard>
      </el-col>
      <el-col :xs="24" :lg="8">
        <IosGlassCard class="table-card dashboard-chart-card distribution-card">
          <template #header>
            <div class="chart-card-header">
              <div>
                <div class="chart-title">{{ t('dashboard.distributionTitle') }}</div>
                <div class="chart-subtitle">{{ t('dashboard.distributionSubtitle') }}</div>
              </div>
              <el-tag effect="light" type="success">{{ t('common.all') }} {{ distTotal }}</el-tag>
            </div>
          </template>
          <div class="distribution-shell" :class="{ 'is-chart-loading': chartLoading }">
            <div v-show="chartLoading" class="chart-skeleton chart-skeleton-overlay">
              <div class="skeleton-donut"></div>
              <div class="skeleton-legend">
                <div v-for="i in 4" :key="i" class="skeleton-legend-item"></div>
              </div>
            </div>
            <div class="distribution-chart-wrap">
              <div ref="distRef" class="chart-box dist-chart"></div>
            </div>
            <div class="dist-summary-list">
              <div v-for="item in distItems" :key="item.name" class="dist-summary-item" :style="{ '--dist-color': item.color }">
                <span class="dist-dot"></span>
                <span class="dist-name">{{ item.name }}</span>
                <strong>{{ item.value }}</strong>
                <em>{{ item.percent }}%</em>
              </div>
              <div v-if="!distItems.length" class="dist-empty">{{ t('dashboard.emptyDistribution') }}</div>
            </div>
          </div>
        </IosGlassCard>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :xs="24" :lg="12">
        <IosGlassCard class="table-card dashboard-table-card">
          <template #header>
            <div class="dashboard-panel-heading">
              <div class="dashboard-panel-title">
                <span class="dashboard-panel-icon"><AppIcon name="query" :size="17" /></span>
                <div>
                  <div class="chart-title">{{ t('dashboard.recentTitle') }}</div>
                  <div class="chart-subtitle">最新防伪验证结果</div>
                </div>
              </div>
              <el-tag effect="plain" size="small">{{ recent.length }} 条</el-tag>
            </div>
          </template>
          <div class="responsive-table-wrap">
            <el-table :data="recent" size="small" class="table-interactive" highlight-current-row @row-click="handleRecentRowClick">
              <el-table-column :label="t('dashboard.code')" prop="code">
                <template #default="{ row }">
                  <el-link type="primary" :underline="false">{{ row.code }}</el-link>
                </template>
              </el-table-column>
              <el-table-column :label="t('dashboard.result')" prop="result" :width="100">
                <template #default="{ row }"><el-tag :type="row.result === 1 || row.is_real ? 'success' : 'danger'">{{ row.result === 1 || row.is_real ? t('dashboard.real') : t('dashboard.abnormal') }}</el-tag></template>
              </el-table-column>
              <el-table-column :label="t('dashboard.time')" prop="created_at" :width="170" />
            </el-table>
          </div>
        </IosGlassCard>
      </el-col>
      <el-col :xs="24" :lg="12">
        <IosGlassCard class="table-card dashboard-table-card">
          <template #header>
            <div class="dashboard-panel-heading">
              <div class="dashboard-panel-title">
                <span class="dashboard-panel-icon tone-mint"><AppIcon name="agent" :size="17" /></span>
                <div>
                  <div class="chart-title">{{ t('dashboard.agentRank') }}</div>
                  <div class="chart-subtitle">按近期业务量实时排序</div>
                </div>
              </div>
              <el-tag effect="plain" size="small" type="success">{{ rank.length }} 个</el-tag>
            </div>
          </template>
          <div class="responsive-table-wrap">
            <el-table :data="rank" size="small" class="table-interactive" highlight-current-row @row-click="handleAgentRowClick">
              <el-table-column :label="t('dashboard.agent')" prop="agent_name">
                <template #default="{ row }">
                  <el-link type="primary" :underline="false">{{ row.agent_name }}</el-link>
                </template>
              </el-table-column>
              <el-table-column :label="t('dashboard.count')" prop="count" :width="120" />
            </el-table>
          </div>
        </IosGlassCard>
      </el-col>
    </el-row>
  </IosPage>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { EChartsType } from 'echarts/core';
import AppIcon from '@/components/AppIcon.vue';
import { IosGlassCard, IosPage, IosPageHero, IosStatCard, IosStatGrid } from '@/components/ios27';
import { dashboardApi } from '@/api/dashboard';
import { asArray } from '@/utils/format';
import { clearRequestCache } from '@/api/http';
import { useI18n } from '@/i18n';
import { runIdle } from '@/utils/performance';

interface DistItem {
  name: string;
  value: number;
  color: string;
  percent: string;
}

const router = useRouter();
const summary = shallowRef<Record<string, any>>({});
const recent = shallowRef<any[]>([]);
const rank = shallowRef<any[]>([]);
const antiChanneling = shallowRef<Record<string, any>>({});
const distItems = shallowRef<DistItem[]>([]);
const trendData = shallowRef<any[]>([]);
const distributionData = shallowRef<any[]>([]);
const loading = ref(false);
const chartLoading = ref(false);
const dashboardError = ref('');
const lastUpdatedAt = ref<Date | null>(null);
const trendRef = ref<HTMLDivElement>();
const distRef = ref<HTMLDivElement>();
let echartsLoader: Promise<typeof import('@/utils/dashboardCharts')> | null = null;
let trendChart: EChartsType | null = null;
let distChart: EChartsType | null = null;
let resizeObserver: ResizeObserver | null = null;
let loadSeq = 0;
let realtimeTimer: number | undefined;
const { t } = useI18n();
const trendMetric = ref<'queries' | 'verified' | 'abnormal' | 'active'>('queries');
const trendMetricOptions = [
  { label: '查询', value: 'queries' },
  { label: '验证', value: 'verified' },
  { label: '异常', value: 'abnormal' },
  { label: '活跃码', value: 'active' },
];

// ✨ 新增：统计卡片点击路由映射
const statRouteMap: Record<string, string> = {
  products: '/products',
  codes: '/codes',
  boxes: '/box',
  shipments: '/shipments',
  queries: '/query',
  todayQueries: '/query',
  fakeCount: '/query',
  agents: '/agents',
};

// ✨ 新增：统计卡片点击跳转
function navigateToDetail(key: string) {
  const route = statRouteMap[key];
  if (route) {
    router.push(route);
  }
}

// ✨ 新增：表格行点击事件
function handleRecentRowClick(row: any) {
  if (row.code) {
    router.push(`/query?code=${row.code}`);
  }
}

function handleAgentRowClick(row: any) {
  if (row.agent_id) {
    router.push(`/agents?id=${row.agent_id}`);
  }
}

const distTotal = computed(() => distItems.value.reduce((sum, item) => sum + item.value, 0));
const lastUpdatedText = computed(() => {
  if (!lastUpdatedAt.value) return '正在同步数据';
  return `更新于 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(lastUpdatedAt.value)}`;
});
const stats = computed(() => [
  { key: 'products', label: t('dashboard.stats.products'), icon: 'product', tone: 'indigo' as const },
  { key: 'codes', label: t('dashboard.stats.codes'), icon: 'code', tone: 'cyan' as const },
  { key: 'boxes', label: t('dashboard.stats.boxes'), icon: 'box', tone: 'teal' as const },
  { key: 'shipments', label: t('dashboard.stats.shipments'), icon: 'shipment', tone: 'mint' as const },
  { key: 'queries', label: t('dashboard.stats.queries'), icon: 'query', tone: 'sky' as const },
  { key: 'todayQueries', label: t('dashboard.stats.todayQueries'), icon: 'dashboard', tone: 'amber' as const },
  { key: 'fakeCount', label: t('dashboard.stats.fakeCount'), icon: 'delete', tone: 'rose' as const },
  { key: 'agents', label: t('dashboard.stats.agents'), icon: 'agent', tone: 'violet' as const },
]);

const statNumberFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });

function formatStatValue(value: unknown) {
  const number = Number(value);
  return statNumberFormatter.format(Number.isFinite(number) ? number : 0);
}

const distributionColors = ['#2563eb', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#64748b'];
const statusNameMap: Record<string, string> = {
  '0': '未激活',
  '1': '已激活',
  '2': '已锁定',
  '3': '已注销',
  '4': '已查询',
  active: '已激活',
  activated: '已激活',
  inactive: '未激活',
  locked: '已锁定',
  cancelled: '已注销',
  queried: '已查询',
  used: '已查询',
  fake: '异常查询',
};

function loadEcharts() {
  echartsLoader ||= import('@/utils/dashboardCharts');
  return echartsLoader;
}

function normalizeName(value: unknown) {
  const raw = String(value ?? '-');
  return statusNameMap[raw] || statusNameMap[raw.toLowerCase()] || raw;
}

function channelingTypeText(value: string) {
  const map: Record<string, string> = {
    geo_mismatch: '位置不符',
    location_unverified: '位置待核验',
    same_code_multi_region: '异地扫码',
    ip_high_frequency: '高频IP',
    device_risk: '设备风险',
    shipment_region_mismatch: '发货异常',
    fake_code_scan: '假码',
    expired_code_scan: '过期码',
    locked_code_scan: '锁定码',
  };
  return map[value] || value || '未知';
}

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function isDarkTheme() {
  return document.documentElement.dataset.theme === 'dark';
}

function chartThemeColors() {
  const dark = isDarkTheme();
  return {
    text: cssVar('--text-2', dark ? '#cbd8ea' : '#334e68'),
    muted: cssVar('--text-3', dark ? '#8ea4c0' : '#64748b'),
    line: cssVar('--line', dark ? 'rgba(148, 163, 184, .22)' : '#dbeafe'),
    split: dark ? 'rgba(148, 163, 184, .14)' : '#eef4ff',
    card: dark ? '#0b1728' : '#fff',
  };
}

function normalizeDistribution(data: any): DistItem[] {
  const arr = asArray(data).map((x: any) => ({
    name: normalizeName(x.name ?? x.status ?? x.label ?? x.key),
    value: Number(x.count ?? x.value ?? x.total ?? 0) || 0,
  })).filter((item: { name: string; value: number }) => item.value >= 0);
  const total = arr.reduce((sum: number, item: { name: string; value: number }) => sum + item.value, 0);
  return arr.map((item: { name: string; value: number }, index: number) => ({
    ...item,
    color: distributionColors[index % distributionColors.length],
    percent: total ? ((item.value / total) * 100).toFixed(1) : '0.0',
  }));
}

function hasRejected(results: PromiseSettledResult<unknown>[]) {
  return results.some((item) => item.status === 'rejected');
}

function allRejected(results: PromiseSettledResult<unknown>[]) {
  return results.every((item) => item.status === 'rejected');
}

function setSyncError(results: PromiseSettledResult<unknown>[], partialMessage: string, fullMessage: string) {
  if (!hasRejected(results)) return;
  dashboardError.value = allRejected(results) ? fullMessage : partialMessage;
}

async function renderTrend(data: any) {
  if (!trendRef.value) return;
  const echarts = await loadEcharts();
  const arr = asArray(data);
  const metricKey = trendMetric.value;
  const values = arr.map((x: any) => {
    if (metricKey === 'verified') return Number(x.verified ?? x.success ?? x.real ?? x.valid ?? x.count ?? x.value ?? 0);
    if (metricKey === 'abnormal') return Number(x.abnormal ?? x.fake ?? x.risk ?? x.failed ?? x.error ?? 0);
    if (metricKey === 'active') return Number(x.active ?? x.activated ?? x.codes ?? x.total ?? x.value ?? 0);
    return Number(x.queries ?? x.query_count ?? x.count ?? x.value ?? 0);
  });
  const metricLabel = trendMetricOptions.find((item) => item.value === metricKey)?.label || '趋势';
  const primary = cssVar('--primary', '#2563eb');
  const theme = chartThemeColors();
  trendChart ||= echarts.init(trendRef.value);
  trendChart.setOption({
    animationDuration: 520,
    color: [primary],
    grid: { left: 42, right: 26, top: 34, bottom: 38 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, .92)',
      borderWidth: 0,
      textStyle: { color: '#fff' },
      axisPointer: { type: 'line', lineStyle: { color: cssVar('--el-color-primary-light-5', '#93c5fd'), width: 1.5 } },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: arr.map((x: any) => x.date || x.day || x.name || '-'),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: theme.line } },
      axisLabel: { color: theme.muted },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: theme.split } },
      axisLabel: { color: theme.muted },
    },
    series: [{
      name: metricLabel,
      type: 'line',
      smooth: true,
      symbolSize: 7,
      showSymbol: values.length < 16,
      lineStyle: { width: 3, color: primary },
      itemStyle: { color: primary, borderColor: theme.card, borderWidth: 2 },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `rgba(${cssVar('--primary-rgb', '37, 99, 235')}, .24)` },
            { offset: 1, color: `rgba(${cssVar('--primary-rgb', '37, 99, 235')}, .02)` },
          ],
        },
      },
      data: values,
    }],
  }, true);
}
async function renderDist(data: any) {
  if (!distRef.value) return;
  const echarts = await loadEcharts();
  const normalized = normalizeDistribution(data);
  distItems.value = normalized;
  const total = normalized.reduce((sum, item) => sum + item.value, 0);
  const theme = chartThemeColors();
  distChart ||= echarts.init(distRef.value);
  distChart.setOption({
    animationDuration: 600,
    color: normalized.map((item) => item.color),
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(15, 23, 42, .92)',
      borderWidth: 0,
      textStyle: { color: '#fff' },
      formatter: '{b}<br/>数量：{c}<br/>占比：{d}%',
    },
    graphic: total ? [{
      type: 'text',
      left: 'center',
      top: '42%',
      style: {
        text: `${total}\n${t('common.all')}`, 
        textAlign: 'center',
        fill: theme.text,
        fontSize: 18,
        fontWeight: 800,
        lineHeight: 26,
      },
    }] : [],
    series: [{
      type: 'pie',
      radius: ['55%', '78%'],
      center: ['50%', '48%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderRadius: 10,
        borderColor: theme.card,
        borderWidth: 4,
      },
      label: {
        formatter: '{b}\n{d}%',
        color: theme.text,
        lineHeight: 18,
      },
      labelLine: {
        length: 12,
        length2: 8,
        lineStyle: { color: theme.line },
      },
      data: normalized.map((item) => ({ name: item.name, value: item.value })),
    }],
  }, true);
}

async function loadDashboard(force = false) {
  const seq = ++loadSeq;
  if (force) clearRequestCache();
  loading.value = true;
  dashboardError.value = '';
  try {
    const [s, r, a] = await Promise.allSettled([
      dashboardApi.summary(), dashboardApi.recentQueries(10), dashboardApi.agentRank(),
    ]);
    if (seq !== loadSeq) return;
    summary.value = s.status === 'fulfilled' ? (s.value || {}) : {};
    recent.value = r.status === 'fulfilled' ? asArray(r.value) : [];
    rank.value = a.status === 'fulfilled' ? asArray(a.value) : [];
    setSyncError(
      [s, r, a],
      '部分仪表盘数据同步失败，已显示当前可用数据。',
      '仪表盘数据同步失败，请检查后端服务后重试。',
    );
    if (!allRejected([s, r, a])) lastUpdatedAt.value = new Date();

    dashboardApi.antiChannelingSummary().then((data: any) => {
      antiChanneling.value = data || {};
    }).catch(() => {
      antiChanneling.value = {};
    });
  } finally {
    if (seq === loadSeq) loading.value = false;
  }

  chartLoading.value = true;
  runIdle(async () => {
    try {
      const [t, d] = await Promise.allSettled([dashboardApi.trend(), dashboardApi.distribution()]);
      if (seq !== loadSeq) return;
      setSyncError(
        [t, d],
        '部分图表数据同步失败，已显示当前可用图表。',
        '图表数据同步失败，请检查后端服务后重试。',
      );
      await nextTick();
      trendData.value = t.status === 'fulfilled' ? asArray(t.value) : [];
      distributionData.value = d.status === 'fulfilled' ? asArray(d.value) : [];
      await Promise.all([
        renderTrend(trendData.value),
        renderDist(distributionData.value),
      ]);
    } catch {
      if (seq === loadSeq) dashboardError.value = '图表渲染失败，请刷新页面后重试。';
    } finally {
      if (seq === loadSeq) chartLoading.value = false;
    }
  });
}

function bindResize() {
  if (!trendRef.value || !distRef.value) return;
  resizeObserver = new ResizeObserver(() => {
    trendChart?.resize();
    distChart?.resize();
  });
  resizeObserver.observe(trendRef.value);
  resizeObserver.observe(distRef.value);
}

function handleGlobalRefresh() {
  loadDashboard(true);
}

function handleVisibilityRefresh() {
  if (document.visibilityState === 'visible') loadDashboard(true);
}

function handleAppearanceUpdated() {
  void nextTick(() => {
    if (trendChart) void renderTrend(trendData.value);
    if (distChart) void renderDist(distributionData.value);
    trendChart?.resize();
    distChart?.resize();
  });
}

watch(trendMetric, () => { void renderTrend(trendData.value); });

onMounted(() => {
  loadDashboard();
  nextTick(bindResize);
  window.addEventListener('admin:refresh-page', handleGlobalRefresh);
  window.addEventListener('appearance-updated', handleAppearanceUpdated);
  document.addEventListener('visibilitychange', handleVisibilityRefresh);
  realtimeTimer = window.setInterval(() => loadDashboard(true), 30000);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  trendChart?.dispose();
  distChart?.dispose();
  if (realtimeTimer) window.clearInterval(realtimeTimer);
  window.removeEventListener('admin:refresh-page', handleGlobalRefresh);
  window.removeEventListener('appearance-updated', handleAppearanceUpdated);
  document.removeEventListener('visibilitychange', handleVisibilityRefresh);
});
</script>

<style scoped>
/* ========================================
   原有样式
   ======================================== */
.dashboard-page :deep(.page-hero) {
  background:
    radial-gradient(circle at 88% 18%, rgba(34, 211, 238, .18), transparent 28%),
    linear-gradient(115deg, rgba(37, 99, 235, .12), transparent 48%),
    var(--ui-surface) !important;
}

.dashboard-hero-status {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  color: var(--ui-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, .13);
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 4px rgba(34, 197, 94, .13); }
  50% { box-shadow: 0 0 0 6px rgba(34, 197, 94, .08); }
}

.status-divider { width: 1px; height: 12px; background: var(--ui-line-strong); }
.dashboard-live-tag { gap: 5px; color: var(--ui-accent) !important; background: rgba(37, 99, 235, .07) !important; }

.dashboard-sync-alert {
  margin-bottom: 16px;
  border-radius: 12px;
}

/* ========================================
   ✨ 优化：统计卡片交互增强
   ======================================== */
.dashboard-page :deep(.ios27-stat-card) {
  position: relative;
  min-height: 142px;
  border-color: var(--ui-line) !important;
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease !important;
}

.stat-card-interactive {
  cursor: pointer;
  user-select: none;
}

.stat-card-interactive:focus-visible {
  outline: 3px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: 12px;
}

.dashboard-page :deep(.ios27-stat-grid) {
  grid-auto-rows: minmax(142px, auto);
}

.dashboard-page :deep(.ios27-stat-card::after) {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 68px;
  height: 68px;
  border-radius: 0 0 0 54px;
  background: var(--stat-tint, rgba(37, 99, 235, .08));
  pointer-events: none;
  transition: opacity 200ms ease;
}

.dashboard-page :deep(.ios27-stat-card:hover) {
  transform: translateY(-3px);
  border-color: var(--stat-border, rgba(37, 99, 235, .22)) !important;
  box-shadow: 0 16px 34px rgba(15, 23, 42, .09) !important;
}

.dashboard-page :deep(.ios27-stat-card:hover::after) {
  opacity: 0.6;
}

.dashboard-page :deep(.ios27-stat-card .stat-icon) {
  position: relative;
  z-index: 1;
  width: 42px;
  height: 42px;
  border-radius: 14px !important;
  color: var(--stat-color, var(--ui-accent));
  background: var(--stat-tint, var(--ui-accent-soft)) !important;
  transition: transform 200ms ease;
}

.dashboard-page :deep(.ios27-stat-card:hover .stat-icon) {
  transform: scale(1.05);
}

.dashboard-page :deep(.ios27-stat-card .stat-value) {
  position: relative;
  z-index: 1;
  max-width: 100%;
  overflow: hidden;
  font-size: 30px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0 !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dashboard-page :deep(.ios27-stat-card .stat-label) {
  position: relative;
  z-index: 1;
  font-weight: 720;
}

.dashboard-page :deep(.tone-indigo) { --stat-color: #4f46e5; --stat-tint: rgba(79, 70, 229, .11); --stat-border: rgba(79, 70, 229, .28); }
.dashboard-page :deep(.tone-cyan) { --stat-color: #0891b2; --stat-tint: rgba(8, 145, 178, .11); --stat-border: rgba(8, 145, 178, .28); }
.dashboard-page :deep(.tone-teal) { --stat-color: #0f766e; --stat-tint: rgba(15, 118, 110, .11); --stat-border: rgba(15, 118, 110, .27); }
.dashboard-page :deep(.tone-sky) { --stat-color: #2563eb; --stat-tint: rgba(37, 99, 235, .10); --stat-border: rgba(37, 99, 235, .26); }
.dashboard-page :deep(.tone-violet) { --stat-color: #7c3aed; --stat-tint: rgba(124, 58, 237, .10); --stat-border: rgba(124, 58, 237, .26); }
.dashboard-page :deep(.tone-mint) { --stat-color: #059669; --stat-tint: rgba(5, 150, 105, .10); --stat-border: rgba(5, 150, 105, .25); }
.dashboard-page :deep(.tone-amber) { --stat-color: #d97706; --stat-tint: rgba(217, 119, 6, .10); --stat-border: rgba(217, 119, 6, .26); }
.dashboard-page :deep(.tone-rose) { --stat-color: #e11d48; --stat-tint: rgba(225, 29, 72, .10); --stat-border: rgba(225, 29, 72, .25); }

/* ========================================
   ✨ 优化：防窜预警视觉增强
   ======================================== */
.channeling-strip-enhanced {
  position: relative;
}

.channeling-strip-enhanced::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, #f59e0b, #ef4444);
  border-radius: 8px 0 0 8px;
}

.channeling-kpi-danger-enhanced {
  background: rgba(239, 68, 68, 0.08) !important;
  border-radius: 8px;
  padding: 12px;
  position: relative;
}

.channeling-kpi-danger-enhanced strong {
  font-size: 32px !important;
  color: #dc2626 !important;
  text-shadow: 0 0 20px rgba(239, 68, 68, 0.3);
  animation: pulse-warn 2s ease-in-out infinite;
}

.channeling-kpi-danger-enhanced::after {
  content: '!';
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #dc2626;
  color: white;
  font-size: 12px;
  font-weight: 700;
  border-radius: 50%;
  animation: pulse-alert 2s ease-in-out infinite;
}

@keyframes pulse-warn {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(0.98); }
}

@keyframes pulse-alert {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

/* ========================================
   ✨ 优化：骨架屏加载状态
   ======================================== */
.chart-skeleton {
  padding: 20px;
}

.distribution-shell {
  position: relative;
}

.chart-skeleton-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: var(--ui-surface-solid, var(--surface));
}

.is-chart-loading > :not(.chart-skeleton-overlay) {
  visibility: hidden;
}

.skeleton-line {
  height: 12px;
  background: linear-gradient(
    90deg,
    var(--el-fill-color-light) 25%,
    var(--el-fill-color) 50%,
    var(--el-fill-color-light) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 4px;
  margin-bottom: 8px;
}

.skeleton-line-40 {
  width: 40%;
}

.skeleton-line-25 {
  width: 25%;
}

.skeleton-chart-area {
  height: 280px;
  margin-top: 20px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-donut {
  width: 180px;
  height: 180px;
  margin: 20px auto;
  border-radius: 50%;
  background: var(--el-fill-color-light);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-legend {
  padding: 0 16px;
}

.skeleton-legend-item {
  height: 32px;
  margin-bottom: 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-legend-item:nth-child(1) { animation-delay: 0s; }
.skeleton-legend-item:nth-child(2) { animation-delay: 0.1s; }
.skeleton-legend-item:nth-child(3) { animation-delay: 0.2s; }
.skeleton-legend-item:nth-child(4) { animation-delay: 0.3s; }

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ========================================
   ✨ 优化：表格交互增强
   ======================================== */
.table-interactive :deep(.el-table__row) {
  cursor: pointer;
  transition: background-color 150ms ease;
}

.table-interactive :deep(.el-table__row:hover) {
  background-color: var(--el-fill-color-light) !important;
}

.table-interactive :deep(.el-table__row:focus) {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: -2px;
}

.table-interactive :deep(.el-link) {
  font-weight: 500;
}

/* ========================================
   原有面板样式
   ======================================== */
.dashboard-panel-heading,
.dashboard-panel-title { display: flex; align-items: center; }
.dashboard-panel-heading { justify-content: space-between; gap: 14px; }
.dashboard-panel-title { min-width: 0; gap: 11px; }
.dashboard-panel-icon {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: #2563eb;
  background: rgba(37, 99, 235, .10);
}
.dashboard-panel-icon.tone-mint { color: #059669; background: rgba(5, 150, 105, .10); }
.dashboard-table-card :deep(.el-card__header) { background: linear-gradient(180deg, rgba(248, 250, 252, .82), transparent) !important; }

/* ========================================
   响应式适配
   ======================================== */
@media (max-width: 760px) {
  .dashboard-hero-status { margin-top: 12px; }
  .status-divider { display: none; }
  .dashboard-live-tag { display: none; }
  .dashboard-page :deep(.ios27-stat-grid) { grid-auto-rows: minmax(126px, auto); }
  .dashboard-page :deep(.ios27-stat-card) { min-height: 126px; }
}

@media (prefers-reduced-motion: reduce) {
  .dashboard-page :deep(.ios27-stat-card) { transition: none !important; }
  .dashboard-page :deep(.ios27-stat-card:hover) { transform: none; }
  .status-dot,
  .channeling-kpi-danger-enhanced strong,
  .channeling-kpi-danger-enhanced::after,
  .skeleton-line,
  .skeleton-chart-area,
  .skeleton-donut,
  .skeleton-legend-item {
    animation: none !important;
  }
}
</style>
