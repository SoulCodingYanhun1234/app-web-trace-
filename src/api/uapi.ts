import { regionTree } from '../utils/regionOptions';

export interface UapiLocation {
  ip?: string;
  country?: string;
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
  isp?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  raw?: Record<string, any>;
}

export interface UapiWeather {
  province?: string;
  city?: string;
  adcode?: string;
  weather?: string;
  weather_icon?: string;
  temperature?: string | number;
  wind_direction?: string;
  wind_power?: string;
  humidity?: string | number;
  report_time?: string;
  raw?: Record<string, any>;
}

export interface UapiSaying {
  content?: string;
  author?: string;
  from?: string;
  raw?: Record<string, any>;
}

export interface UapiHolidayItem {
  date?: string;
  name?: string;
  type?: string;
  holiday?: boolean;
  raw?: Record<string, any>;
}

export interface UapiPanelContext {
  myip: UapiLocation | null;
  weather: UapiWeather | null;
  holiday: UapiHolidayItem[];
  saying: UapiSaying | null;
  loaded_at: number;
}

type CacheRecord<T> = { expire: number; value?: T; promise?: Promise<T> };

type FetchOptions = {
  ttlMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * true 时只从浏览器直连 UAPI，禁止走后端代理。
   * /network/myip 必须使用访问者浏览器直连，否则 UAPI 看到的是服务器出口 IP。
   */
  directOnly?: boolean;
};

const UAPI_BASE_URL = String(import.meta.env.VITE_UAPI_BASE_URL || 'https://uapis.cn/api/v1').replace(/\/+$/, '');
const UAPI_API_KEY = String(import.meta.env.VITE_UAPI_API_KEY || '').trim();
const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');
const UAPI_MYIP_SOURCE = 'commercial';
const cache = new Map<string, CacheRecord<any>>();

function cleanParams(params: Record<string, any> = {}) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function buildUrl(base: string, path: string, params: Record<string, any> = {}) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`, origin);
  for (const [key, value] of Object.entries(cleanParams(params))) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function parseJsonResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = payload && typeof payload === 'object' ? ((payload as Record<string, any>).message || (payload as Record<string, any>).error) : payload;
    throw new Error(message || `UAPI 请求失败：${response.status}`);
  }
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, any>;
    if (typeof body.code !== 'undefined' && ![0, 1, 200].includes(Number(body.code))) throw new Error(body.message || 'UAPI 请求失败');
    if (typeof body.success !== 'undefined' && body.success === false) throw new Error(body.message || 'UAPI 请求失败');
    return typeof body.data !== 'undefined' ? body.data : body;
  }
  return payload;
}

function timeoutSignal(timeoutMs: number, externalSignal?: AbortSignal) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onAbort);
    },
  };
}

function uapiAuthorization(required = false): Record<string, string> {
  if (!UAPI_API_KEY) {
    if (required) throw new Error('未配置 VITE_UAPI_API_KEY，无法获取公网位置');
    return {};
  }
  return {
    Authorization: /^Bearer\s/i.test(UAPI_API_KEY) ? UAPI_API_KEY : `Bearer ${UAPI_API_KEY}`,
  };
}

async function fetchJson(url: string, timeoutMs: number, signal?: AbortSignal, requireAuthorization = false) {
  const controller = timeoutSignal(timeoutMs, signal);
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...uapiAuthorization(requireAuthorization),
      },
      signal: controller.signal,
    });
    return await parseJsonResponse(response);
  } finally {
    controller.cleanup();
  }
}

async function uapiGet<T = any>(path: string, params: Record<string, any> = {}, options: FetchOptions = {}): Promise<T> {
  const ttlMs = options.ttlMs ?? 300_000;
  const timeoutMs = options.timeoutMs ?? 4_500;
  const isMyIp = path === '/network/myip';
  const cleanedParams = isMyIp
    ? { ...cleanParams(params), source: UAPI_MYIP_SOURCE }
    : cleanParams(params);
  const directOnly = Boolean(options.directOnly || isMyIp);
  const key = `${directOnly ? 'direct' : 'proxy'}:${path}:${JSON.stringify(cleanedParams)}`;
  const now = Date.now();
  const cached = cache.get(key) as CacheRecord<T> | undefined;
  if (cached?.value !== undefined && cached.expire > now) return cached.value;
  if (cached?.promise) return cached.promise;

  const directUrl = buildUrl(UAPI_BASE_URL, path, cleanedParams);
  const proxyUrl = buildUrl(`${API_BASE_URL}/uapi`, path, cleanedParams);

  // 关键修复：/network/myip 代表“当前访问者公网 IP”。
  // 如果经后端代理请求，UAPI 只能看到服务器出口 IP，后台会误显示服务器所在城市。
  // 因此 myip 必须由浏览器直连；失败时也不能回退到后端代理，避免把服务器 IP 当成访问者 IP。
  const promise = (directOnly
    ? fetchJson(directUrl, timeoutMs, options.signal, isMyIp)
    : fetchJson(proxyUrl, timeoutMs, options.signal).catch(() => fetchJson(directUrl, timeoutMs, options.signal)))
    .then((value) => {
      cache.set(key, { value, expire: Date.now() + ttlMs });
      return value as T;
    })
    .finally(() => {
      const latest = cache.get(key);
      if (latest?.promise) cache.delete(key);
    });

  cache.set(key, { promise, expire: now + ttlMs });
  return promise;
}

function asRecord(value: any): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function flattenObject(value: any, maxDepth = 3) {
  const result: Record<string, any> = {};
  const visit = (node: any, depth: number) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > maxDepth) return;
    for (const [key, item] of Object.entries(node)) {
      const lowerKey = key.toLowerCase();
      if (result[lowerKey] === undefined && item !== undefined && item !== null && typeof item !== 'object') result[lowerKey] = item;
      if (item && typeof item === 'object' && !Array.isArray(item)) visit(item, depth + 1);
    }
  };
  visit(value, 0);
  return result;
}

function firstString(source: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = source[key.toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function firstNumber(source: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = Number(source[key.toLowerCase()]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function unwrapPayload(payload: any) {
  const record = asRecord(payload);
  return record.data || record.result || record.info || record;
}

function cleanAdminPart(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[\s,，;；|｜/／>\-]+/g, '')
    .replace(/^(中国|中华人民共和国)/, '');
}

function stripAdminSuffix(value: unknown) {
  return cleanAdminPart(value).replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|自治州|地区|省|市|盟|州|区|县|旗|新区)$/g, '');
}

function exactAdminName(a: unknown, b: unknown) {
  const aa = stripAdminSuffix(a);
  const bb = stripAdminSuffix(b);
  return Boolean(aa && bb && aa === bb);
}

function findProvinceEntry(values: unknown[]) {
  const candidates = values.map(cleanAdminPart).filter(Boolean);
  for (const candidate of candidates) {
    const exact = regionTree.find((item) => exactAdminName(item.name, candidate));
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const contained = regionTree.find((item) => {
      const core = stripAdminSuffix(item.name);
      return Boolean(core && (candidate.startsWith(core) || candidate.includes(`${core}省`) || candidate.includes(`${core}市`) || candidate.includes(item.name)));
    });
    if (contained) return contained;
  }
  return undefined;
}

function findCityEntry(values: unknown[], preferredProvince?: (typeof regionTree)[number]) {
  const candidates = values.map(cleanAdminPart).filter(Boolean);
  const provinces = preferredProvince ? [preferredProvince] : regionTree;
  for (const province of provinces) {
    for (const city of province.cities) {
      if (candidates.some((candidate) => exactAdminName(city.name, candidate))) return { province, city };
    }
  }
  for (const province of provinces) {
    for (const city of province.cities) {
      const core = stripAdminSuffix(city.name);
      if (core && candidates.some((candidate) => candidate.includes(core))) return { province, city };
    }
  }
  return undefined;
}

function normalizeProvinceName(value: unknown) {
  const text = cleanAdminPart(value);
  if (!text) return '';
  const matched = findProvinceEntry([text]);
  if (matched) return matched.name;
  if (/(省|自治区|特别行政区|市)$/.test(text)) return text;
  const special: Record<string, string> = { 内蒙古: '内蒙古自治区', 广西: '广西壮族自治区', 宁夏: '宁夏回族自治区', 新疆: '新疆维吾尔自治区', 西藏: '西藏自治区', 香港: '香港特别行政区', 澳门: '澳门特别行政区', 北京: '北京市', 上海: '上海市', 天津: '天津市', 重庆: '重庆市' };
  // 复合字符串（如“广东广州越秀”）不能直接补“省”，否则会生成
  // “广东广州越秀省”并被后端当成一个不存在的省份。
  return special[text] || (text.length <= 4 ? `${text}省` : text);
}

function normalizeCityName(value: unknown) {
  const text = cleanAdminPart(value);
  if (!text) return '';
  const matched = findCityEntry([text]);
  if (matched) return matched.city.name;
  if (/(市|地区|盟|自治州|州)$/.test(text)) return text;
  const municipalities = new Set(['北京', '上海', '天津', '重庆']);
  return municipalities.has(text) || text.length <= 8 ? `${text}市` : text;
}

function normalizeDistrictName(value: unknown) {
  const text = cleanAdminPart(value).replace(/(.{2,})\1$/u, '$1');
  if (!text) return '';
  if (/(区|县|市|旗|新区|林区|特区)$/.test(text)) return text;
  return text.length <= 10 ? `${text}区` : text;
}

function sameAdminName(a: unknown, b: unknown) {
  const aa = stripAdminSuffix(a);
  const bb = stripAdminSuffix(b);
  return Boolean(aa && bb && (aa === bb || aa.includes(bb) || bb.includes(aa)));
}

function normalizeLocationText(rawLocation: unknown, province: unknown, city: unknown, district: unknown, country?: unknown) {
  const provinceText = normalizeProvinceName(province);
  const cityText = normalizeCityName(city);
  let districtText = normalizeDistrictName(district);
  if (!districtText && provinceText && cityText) {
    const tail = cleanAdminPart(rawLocation)
      .replace(stripAdminSuffix(provinceText), '')
      .replace(stripAdminSuffix(cityText), '')
      .replace(/(.{2,})\1$/u, '$1');
    if (tail && !sameAdminName(tail, provinceText) && !sameAdminName(tail, cityText)) districtText = normalizeDistrictName(tail);
  }
  const structured = [provinceText, cityText, districtText]
    .filter((item, index, arr) => item && arr.findIndex((other) => sameAdminName(other, item)) === index)
    .join('');
  if (structured) return structured;
  return cleanAdminPart(rawLocation || [country, province, city, district].filter(Boolean).join(''));
}

function parseCommercialRegion(value: unknown, districtValue?: unknown) {
  const parts = String(value ?? '')
    .trim()
    .split(/[\s,，;；|｜/／>\-]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const countryIndex = parts.findIndex((item) => /^(中国|中华人民共和国|China)$/i.test(item));
  const regionParts = countryIndex >= 0 ? parts.slice(countryIndex + 1) : parts;
  const district = cleanAdminPart(districtValue || regionParts[2] || '');
  const provinceEntry = findProvinceEntry([regionParts[0]]);
  const cityCandidates = regionParts.slice(1).filter((part) => !exactAdminName(part, district));
  const cityMatch = findCityEntry(cityCandidates, provinceEntry);
  const resolvedProvince = provinceEntry || cityMatch?.province;
  const positionalCity = cleanAdminPart(regionParts[1] || '');

  return {
    country: countryIndex >= 0 ? parts[countryIndex] : '',
    province: resolvedProvince?.name || regionParts[0] || '',
    // commercial 的 region 偶尔只返回“省 区”。区不能占用 city 字段，
    // 否则后端会拿区名与防伪码授权城市比较并产生误报。
    city: cityMatch?.city.name || (positionalCity && !sameAdminName(positionalCity, district) && !exactAdminName(positionalCity, resolvedProvince?.name) ? positionalCity : ''),
    district,
  };
}

export function normalizeUapiLocation(payload: any): UapiLocation {
  const raw = asRecord(unwrapPayload(payload));
  const flat = flattenObject(raw);
  const directDistrict = firstString(flat, ['district', 'county', 'area']);
  const regionText = firstString(flat, ['region']);
  const commercialRegion = parseCommercialRegion(regionText, directDistrict);
  const directProvince = firstString(flat, ['province', 'provinceName', 'regionName', 'pro', 'prov']);
  const directCity = firstString(flat, ['city', 'cityName']);
  const rawLocation = firstString(flat, ['location', 'address', 'addr']);
  const country = firstString(flat, ['country', 'countryName']) || commercialRegion.country;
  const provinceEntry = findProvinceEntry([commercialRegion.province, directProvince, regionText, rawLocation, directCity]);
  const cityMatch = findCityEntry([commercialRegion.city, directCity, regionText, rawLocation], provinceEntry);
  const province = provinceEntry?.name || commercialRegion.province || directProvince;
  const cityCandidate = directCity && !sameAdminName(directCity, directDistrict) ? directCity : commercialRegion.city;
  const city = cityMatch?.city.name || cityCandidate;
  const districtCandidate = directDistrict || commercialRegion.district;
  const district = sameAdminName(districtCandidate, city) || sameAdminName(districtCandidate, province) ? '' : districtCandidate;
  const location = normalizeLocationText(rawLocation, province, city, district, country);
  return {
    ip: firstString(flat, ['ip', 'query', 'public_ip']),
    country,
    province: normalizeProvinceName(province),
    city: normalizeCityName(city),
    district: normalizeDistrictName(district),
    adcode: firstString(flat, ['adcode', 'city_code', 'citycode', 'code']),
    isp: firstString(flat, ['isp', 'operator']),
    location,
    latitude: firstNumber(flat, ['latitude', 'lat']),
    longitude: firstNumber(flat, ['longitude', 'lng', 'lon']),
    source: 'uapi_network_myip',
    raw,
  };
}

function normalizeWeather(payload: any): UapiWeather {
  const raw = asRecord(unwrapPayload(payload));
  const flat = flattenObject(raw);
  return {
    province: firstString(flat, ['province']),
    city: firstString(flat, ['city']),
    adcode: firstString(flat, ['adcode']),
    weather: firstString(flat, ['weather', 'text', 'condition']),
    weather_icon: firstString(flat, ['weather_icon', 'icon']),
    temperature: firstString(flat, ['temperature', 'temp']) || undefined,
    wind_direction: firstString(flat, ['wind_direction', 'winddirection']),
    wind_power: firstString(flat, ['wind_power', 'windpower']),
    humidity: firstString(flat, ['humidity']),
    report_time: firstString(flat, ['report_time', 'reporttime', 'update_time', 'updated_at']),
    raw,
  };
}

function normalizeHolidayList(payload: any): UapiHolidayItem[] {
  const raw = unwrapPayload(payload);
  const candidates = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.list)
      ? raw.list
      : Array.isArray(raw?.items)
        ? raw.items
        : Array.isArray(raw?.days)
          ? raw.days
          : Object.values(asRecord(raw)).filter((item) => item && typeof item === 'object');
  return candidates.map((item: any) => {
    const record = asRecord(item);
    const flat = flattenObject(record, 1);
    return {
      date: firstString(flat, ['date', 'day', 'time']),
      name: firstString(flat, ['name', 'holiday', 'festival', 'title']),
      type: firstString(flat, ['type', 'type_name', 'workday_type']),
      holiday: ['true', '1', 'yes', '休'].includes(String(flat.holiday ?? flat.is_holiday ?? flat.rest ?? '').toLowerCase()),
      raw: record,
    };
  }).filter((item: UapiHolidayItem) => item.date || item.name).slice(0, 12);
}

function normalizeSaying(payload: any): UapiSaying {
  const raw = asRecord(unwrapPayload(payload));
  const flat = flattenObject(raw);
  return {
    content: firstString(flat, ['content', 'saying', 'hitokoto', 'text', 'sentence', 'word']),
    author: firstString(flat, ['author', 'creator', 'from_who']),
    from: firstString(flat, ['from', 'source', 'origin']),
    raw,
  };
}

function monthString(offset = 0) {
  const date = new Date();
  date.setMonth(date.getMonth() + offset, 1);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

export async function getUapiMyIp(options: FetchOptions = {}) {
  return normalizeUapiLocation(await uapiGet('/network/myip', { source: UAPI_MYIP_SOURCE }, { ttlMs: 600_000, directOnly: true, ...options }));
}

export function toUapiLocationMeta(ipInfo: UapiLocation | null | undefined) {
  const ipLocation = ipInfo?.location || [ipInfo?.province, ipInfo?.city, ipInfo?.district].filter(Boolean).join('');
  // 防伪授权按省/市匹配。只有省、市同时存在时才能标记为可信位置；
  // 区县只用于补充位置详情，不能替代城市。
  const hasIpRegion = Boolean(ipInfo?.province && ipInfo?.city);
  return {
    location: ipLocation,
    province: ipInfo?.province || '',
    city: ipInfo?.city || '',
    district: ipInfo?.district || '',
    location_source: hasIpRegion ? 'uapi_network_myip' : 'unknown',
    public_ip: ipInfo?.ip || '',
    ip_location: ipLocation,
    ip_province: ipInfo?.province || '',
    ip_city: ipInfo?.city || '',
    ip_district: ipInfo?.district || '',
    ip_adcode: ipInfo?.adcode || '',
    ip_isp: ipInfo?.isp || '',
    ip_source: ipInfo ? 'uapi_network_myip' : '',
    ip_info: ipInfo ? {
      ip: ipInfo.ip || '',
      province: ipInfo.province || '',
      city: ipInfo.city || '',
      district: ipInfo.district || '',
      adcode: ipInfo.adcode || '',
      isp: ipInfo.isp || '',
      location: ipLocation,
      source: ipInfo.source || 'uapi_network_myip',
    } : undefined,
  };
}

export async function getUapiWeather(location?: Pick<UapiLocation, 'city' | 'adcode'> | null, options: FetchOptions = {}) {
  const params: Record<string, any> = { lang: 'zh' };
  if (location?.adcode) params.adcode = location.adcode;
  else if (location?.city) params.city = location.city;
  if (!params.adcode && !params.city) throw new Error('缺少 commercial myip 返回的城市信息');
  return normalizeWeather(await uapiGet('/misc/weather', params, { ttlMs: 600_000, ...options }));
}

export async function getUapiHolidayCalendar(options: FetchOptions = {}) {
  const months = [monthString(0), monthString(1)];
  const lists = await Promise.all(months.map((month) => uapiGet('/misc/holiday-calendar', { month }, { ttlMs: 3_600_000, ...options }).then(normalizeHolidayList).catch(() => [] as UapiHolidayItem[])));
  const map = new Map<string, UapiHolidayItem>();
  for (const item of lists.flat()) {
    const key = `${item.date || ''}-${item.name || item.type || ''}`;
    if (key !== '-' && !map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

export async function getUapiSaying(options: FetchOptions = {}) {
  return normalizeSaying(await uapiGet('/saying', {}, { ttlMs: 3_600_000, ...options }));
}

export async function loadUapiPanelContext(options: FetchOptions = {}): Promise<UapiPanelContext> {
  // 管理端应明确暴露 APIKey/CORS 配置错误，不能静默换用其他定位来源。
  const myip = await getUapiMyIp(options);
  const [weather, holiday, saying] = await Promise.all([
    // 位置只允许来自 commercial myip；没有 myip 地区时不再让天气接口按 IP 推断位置。
    myip?.adcode || myip?.city ? getUapiWeather(myip, options).catch(() => null) : Promise.resolve(null),
    getUapiHolidayCalendar(options).catch(() => [] as UapiHolidayItem[]),
    getUapiSaying(options).catch(() => null),
  ]);
  return { myip, weather, holiday, saying, loaded_at: Date.now() };
}
