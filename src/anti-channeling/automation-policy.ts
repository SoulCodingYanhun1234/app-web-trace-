export type AutomationQueryLog = {
  id?: number | string;
  code?: string | null;
  location?: string | null;
  location_verified?: boolean | null;
  ip?: string | null;
  channel?: string | null;
  query_count?: number | null;
  result?: number | null;
  created_at?: Date | string | null;
  [key: string]: unknown;
};

export type AlertLocationLike = {
  id?: number | string;
  alert_no?: string | null;
  actual_location?: string | null;
  actual_province?: string | null;
  actual_city?: string | null;
  ip?: string | null;
  severity?: number | null;
  last_seen_at?: Date | string | null;
  created_at?: Date | string | null;
  [key: string]: unknown;
};

function cleanToken(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[，,、|｜/\\>→—-]+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}
function canonicalLocationToken(value: unknown) {
  return cleanToken(value)
    .replace(/\//g, '')
    .replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市|区|县/g, '');
}


export function normalizeAlertLocationKey(alert: AlertLocationLike) {
  const locationParts = [alert.actual_province, alert.actual_city].map(canonicalLocationToken).filter(Boolean);
  const structured = Array.from(new Set(locationParts)).join('');
  const freeText = canonicalLocationToken(alert.actual_location);
  if (structured || freeText) return `location:${structured || freeText}`;
  const ip = cleanToken(alert.ip);
  if (ip) return `ip:${ip}`;
  return `alert:${cleanToken(alert.alert_no || alert.id || 'unknown')}`;
}

export function dedupeAlertsByLocation<T extends AlertLocationLike>(alerts: T[], limit = 5) {
  const groups = new Map<string, T & { location_alert_count: number; location_alert_ids: Array<number | string>; location_alert_nos: string[] }>();
  for (const alert of alerts || []) {
    const key = normalizeAlertLocationKey(alert);
    const existed = groups.get(key);
    if (!existed) {
      groups.set(key, {
        ...alert,
        location_key: key,
        location_alert_count: 1,
        location_alert_ids: alert.id === undefined ? [] : [alert.id],
        location_alert_nos: alert.alert_no ? [String(alert.alert_no)] : [],
      } as T & { location_alert_count: number; location_alert_ids: Array<number | string>; location_alert_nos: string[] });
      continue;
    }
    existed.location_alert_count += 1;
    if (alert.id !== undefined) existed.location_alert_ids.push(alert.id);
    if (alert.alert_no) existed.location_alert_nos.push(String(alert.alert_no));
    const currentSeverity = Number(existed.severity || 0);
    const nextSeverity = Number(alert.severity || 0);
    const currentTime = new Date(existed.last_seen_at || existed.created_at || 0).getTime();
    const nextTime = new Date(alert.last_seen_at || alert.created_at || 0).getTime();
    if (nextSeverity > currentSeverity || (nextSeverity === currentSeverity && nextTime > currentTime)) {
      const counts = {
        location_alert_count: existed.location_alert_count,
        location_alert_ids: existed.location_alert_ids,
        location_alert_nos: existed.location_alert_nos,
      };
      Object.assign(existed, alert, counts, { location_key: key });
    }
  }
  return Array.from(groups.values())
    .sort((a, b) => {
      const severityDiff = Number(b.severity || 0) - Number(a.severity || 0);
      if (severityDiff) return severityDiff;
      return new Date(b.last_seen_at || b.created_at || 0).getTime() - new Date(a.last_seen_at || a.created_at || 0).getTime();
    })
    .slice(0, Math.max(1, Math.floor(limit || 5)));
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function timeValue(value: unknown) {
  const parsed = new Date(value as any).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectAntiChannelingCandidates<T extends AutomationQueryLog>(
  logs: T[],
  options: { sampleRate?: number; maxCandidates?: number } = {},
) {
  const sampleRate = Math.max(0.05, Math.min(0.5, Number(options.sampleRate ?? 0.2) || 0.2));
  const maxCandidates = Math.max(1, Math.min(500, Math.floor(Number(options.maxCandidates ?? 50) || 50)));
  const groups = new Map<string, { latest: T; occurrences: number; locations: Set<string>; ips: Set<string>; maxQueryCount: number; invalidCount: number }>();

  for (const log of logs || []) {
    const code = String(log.code || '').trim();
    if (!code) continue;
    const location = log.location_verified === true ? cleanToken(log.location) : '';
    const ip = cleanToken(log.ip);
    const current = groups.get(code);
    if (!current) {
      groups.set(code, {
        latest: log,
        occurrences: 1,
        locations: new Set(location ? [location] : []),
        ips: new Set(ip ? [ip] : []),
        maxQueryCount: Math.max(0, Number(log.query_count || 0)),
        invalidCount: Number(log.result) === 0 ? 1 : 0,
      });
      continue;
    }
    current.occurrences += 1;
    if (location) current.locations.add(location);
    if (ip) current.ips.add(ip);
    current.maxQueryCount = Math.max(current.maxQueryCount, Number(log.query_count || 0));
    if (Number(log.result) === 0) current.invalidCount += 1;
    if (timeValue(log.created_at) > timeValue(current.latest.created_at)) current.latest = log;
  }

  const ranked = Array.from(groups.entries()).map(([code, group]) => {
    const reasons: string[] = [];
    let riskScore = 0;
    if (group.locations.size >= 2) { riskScore += 100 + group.locations.size * 8; reasons.push('同码多位置'); }
    if (group.occurrences >= 3) { riskScore += 40 + Math.min(group.occurrences, 20); reasons.push('短时重复扫码'); }
    if (group.maxQueryCount >= 3) { riskScore += 30 + Math.min(group.maxQueryCount, 20); reasons.push('累计查询偏高'); }
    if (group.ips.size >= 2) { riskScore += 12; reasons.push('多出口IP'); }
    if (group.invalidCount > 0) { riskScore += 8; reasons.push('存在无效结果'); }
    riskScore += Math.floor(timeValue(group.latest.created_at) / 86_400_000) % 7;
    return {
      code,
      log: group.latest,
      risk_score: riskScore,
      reasons: reasons.length ? reasons : ['基线抽样'],
      occurrences: group.occurrences,
      location_count: group.locations.size,
      ip_count: group.ips.size,
      max_query_count: group.maxQueryCount,
      tie_breaker: stableHash(code),
    };
  }).sort((a, b) => b.risk_score - a.risk_score || a.tie_breaker - b.tie_breaker);

  const poolSize = ranked.length;
  const desired = poolSize <= 1
    ? poolSize
    : Math.min(maxCandidates, Math.max(1, Math.min(poolSize - 1, Math.ceil(poolSize * sampleRate))));
  const candidates = ranked.slice(0, desired);
  return {
    candidates,
    stats: {
      log_count: (logs || []).length,
      candidate_pool: poolSize,
      sampled: candidates.length,
      skipped_by_sampling: Math.max(poolSize - candidates.length, 0),
      sample_rate: sampleRate,
      max_candidates: maxCandidates,
      strategy: 'risk-ranked-deterministic-sampling',
    },
  };
}
