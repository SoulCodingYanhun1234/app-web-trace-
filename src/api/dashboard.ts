import { request } from './http';
import { envFeatureEnabled } from '@/config/features';

const REALTIME = { cacheTtl: 0, skipDedup: true, silent: true };

const localSummary = {
  products: 128,
  codes: 125600,
  boxes: 3680,
  queries: 89520,
  agents: 56,
  shipments: 1240,
  todayQueries: 1256,
  fakeCount: 156,
};

const localTrend = Array.from({ length: 14 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (13 - i));
  return {
    date: date.toISOString().split('T')[0],
    queries: Math.floor(Math.random() * 500) + 200,
    verified: Math.floor(Math.random() * 300) + 150,
    abnormal: Math.floor(Math.random() * 50) + 10,
    active: Math.floor(Math.random() * 100) + 20,
  };
});

const localDistribution = [
  { status: 1, total: 85000 },
  { status: 0, total: 32000 },
  { status: 2, total: 5600 },
  { status: 3, total: 3000 },
];

const localRecentQueries = Array.from({ length: 10 }, (_, i) => ({
  id: `log-${i}`,
  code: `CODE${String(100000 + i).padStart(8, '0')}`,
  result: Math.random() > 0.1 ? 1 : 0,
  created_at: new Date(Date.now() - i * 3600000).toISOString(),
}));

const localAgentRank = [
  { agent_id: 1, agent_name: '北京经销商', count: 256 },
  { agent_id: 2, agent_name: '上海经销商', count: 189 },
  { agent_id: 3, agent_name: '广州经销商', count: 156 },
  { agent_id: 4, agent_name: '深圳经销商', count: 142 },
  { agent_id: 5, agent_name: '杭州经销商', count: 128 },
];

const localAntiChannelingSummary = {
  total: 156,
  pending: 23,
  severe: 8,
  today: 5,
  type_rank: [
    { name: 'geo_mismatch', count: 45 },
    { name: 'ip_high_frequency', count: 32 },
    { name: 'fake_code_scan', count: 28 },
    { name: 'same_code_multi_region', count: 22 },
    { name: 'locked_code_scan', count: 18 },
  ],
  area_rank: [
    { name: '北京市', count: 35 },
    { name: '上海市', count: 28 },
    { name: '广东省', count: 22 },
  ],
};

export const DASHBOARD_LOCAL_DATA_ENABLED = envFeatureEnabled(
  import.meta.env.VITE_USE_LOCAL_DASHBOARD,
  import.meta.env.DEV,
);

async function safeRequest(fn: () => Promise<any>, localData: any) {
  if (DASHBOARD_LOCAL_DATA_ENABLED) {
    return new Promise((resolve) => setTimeout(() => resolve(localData), 300));
  }
  return fn();
}

export const dashboardApi = {
  summary() { return safeRequest(() => request.get('/dashboard/summary', undefined, REALTIME), localSummary); },
  trend() { return safeRequest(() => request.get('/dashboard/trend', undefined, REALTIME), localTrend); },
  distribution() { return safeRequest(() => request.get('/dashboard/code-distribution', undefined, REALTIME), localDistribution); },
  recentQueries(limit = 10) { return safeRequest(() => request.get('/dashboard/recent-queries', { limit }, REALTIME), localRecentQueries.slice(0, limit)); },
  agentRank() { return safeRequest(() => request.get('/dashboard/agent-rank', undefined, REALTIME), localAgentRank); },
  antiChannelingSummary() { return safeRequest(() => request.get('/dashboard/anti-channeling-summary', undefined, REALTIME), localAntiChannelingSummary); },
};
