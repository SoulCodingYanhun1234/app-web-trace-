export type ChannelingAlertLike = {
  id?: number | string;
  alert_no?: string | null;
  actual_location?: string | null;
  actual_province?: string | null;
  actual_city?: string | null;
  ip?: string | null;
  severity?: number | null;
  last_seen_at?: string | Date | null;
  created_at?: string | Date | null;
  [key: string]: unknown;
};

function clean(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[，,、|｜/\\>→—-]+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}
function canonicalLocationToken(value: unknown) {
  return clean(value)
    .replace(/\//g, '')
    .replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|省|市|区|县/g, '');
}


export function channelingAlertLocationKey(alert: ChannelingAlertLike) {
  const locationParts = [alert.actual_province, alert.actual_city].map(canonicalLocationToken).filter(Boolean);
  const structured = Array.from(new Set(locationParts)).join('');
  const freeText = canonicalLocationToken(alert.actual_location);
  if (structured || freeText) return `location:${structured || freeText}`;
  const ip = clean(alert.ip);
  if (ip) return `ip:${ip}`;
  return `alert:${clean(alert.alert_no || alert.id || 'unknown')}`;
}

export function uniqueChannelingAlertsByLocation<T extends ChannelingAlertLike>(alerts: T[], limit = 3) {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const alert of alerts || []) {
    const key = channelingAlertLocationKey(alert);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(alert);
    if (result.length >= Math.max(1, limit)) break;
  }
  return result;
}


export function selectNewChannelingLocationAlerts<T extends ChannelingAlertLike>(
  alerts: T[],
  activeLocationKeys: Iterable<string>,
  limit = 3,
) {
  const unique = uniqueChannelingAlertsByLocation(alerts, limit);
  const active = new Set(Array.from(activeLocationKeys || []));
  return {
    alerts: unique.filter((alert) => !active.has(channelingAlertLocationKey(alert))),
    active_location_keys: unique.map((alert) => channelingAlertLocationKey(alert)),
  };
}
