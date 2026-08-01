<template>
  <div class="channeling-map-wrap">
    <div class="map-head">
      <div class="map-title">
        <span>CHANNEL MAP</span>
        <strong>防窜异常流向</strong>
        <small>同一区县自动聚合为一个点，点击区县可查看边界、道路与扫码点位。</small>
      </div>
      <div class="map-kpis" aria-label="地图指标">
        <div><span>异常扫码</span><strong>{{ actualTotal }}</strong></div>
        <div><span>授权线索</span><strong>{{ authTotal }}</strong></div>
        <div><span>覆盖地区</span><strong>{{ regionTotal }}</strong></div>
      </div>
    </div>
    <div v-if="!amapKey" class="map-config-tip">
      未配置高德地图 Key：请在 frontend/.env 或生产环境变量中设置 VITE_AMAP_KEY；2021-12-02 后申请的 Key 通常还需要 VITE_AMAP_SECURITY_JS_CODE。
    </div>
    <div v-loading="loading" class="map-shell">
      <div ref="mapRef" class="map-box"></div>
      <div v-if="mapError" class="map-error">
        <strong>高德地图加载失败</strong>
        <span>{{ mapError }}</span>
      </div>
    </div>
    <div class="map-legend">
      <span class="legend-dot hot"></span> 区县级窜货热点
      <span class="legend-area"></span> IP 定位预警范围
      <span class="legend-dot auth"></span> 授权区县/城市
      <span class="legend-line"></span> 区县级窜货流向
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

interface FlowItem {
  from: string;
  fromProvince?: string;
  fromCity?: string;
  fromDistrict?: string;
  fromLocation?: string;
  fromLng?: number;
  fromLat?: number;
  fromRectangle?: string;
  to: string;
  toProvince?: string;
  toCity?: string;
  toDistrict?: string;
  toLocation?: string;
  toLng?: number;
  toLat?: number;
  toRectangle?: string;
  count: number;
}

interface HotspotItem {
  label: string;
  province?: string;
  city?: string;
  district?: string;
  location?: string;
  lng?: number;
  lat?: number;
  rectangle?: string;
  count: number;
  isActual: boolean;
  level?: 'province' | 'city' | 'district';
}

interface VisualPoint {
  key: string;
  label: string;
  province?: string;
  city?: string;
  district?: string;
  location?: string;
  rectangle?: string;
  coord: [number, number];
  actualCount: number;
  authCount: number;
  total: number;
  level: 'province' | 'city' | 'district';
}

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode?: string };
  }
}

const props = defineProps<{
  hotspots: HotspotItem[];
  flows: FlowItem[];
}>();


const actualTotal = computed(() => (props.hotspots || []).filter((item) => item.isActual).reduce((sum, item) => sum + Number(item.count || 0), 0));
const authTotal = computed(() => (props.hotspots || []).filter((item) => !item.isActual).reduce((sum, item) => sum + Number(item.count || 0), 0));
const regionTotal = computed(() => {
  const keys = new Set<string>();
  for (const item of props.hotspots || []) {
    const key = [compactRegion(item.province || ''), compactRegion(item.city || ''), compactRegion(item.district || '')].filter(Boolean).join('/') || compactRegion(item.location || item.label || '');
    if (key) keys.add(key);
  }
  return keys.size;
});

const amapKey = String(import.meta.env.VITE_AMAP_KEY || '').trim();
const amapSecurityJsCode = String(import.meta.env.VITE_AMAP_SECURITY_JS_CODE || '').trim();
const amapVersion = String(import.meta.env.VITE_AMAP_VERSION || '2.0').trim();
const loading = ref(false);
const mapError = ref('');
const mapRef = ref<HTMLDivElement>();
let map: any = null;
let infoWindow: any = null;
let districtBoundaryOverlays: any[] = [];
let boundarySeq = 0;
let amapLoader: Promise<any> | null = null;
let resizeObserver: ResizeObserver | null = null;
let renderSeq = 0;
let renderTimer: number | undefined;

const PROVINCE_COORDS: Record<string, [number, number]> = {
  '北京市': [116.4074, 39.9042], '上海市': [121.4737, 31.2304], '广东省': [113.2665, 23.1322],
  '浙江省': [120.1528, 30.2674], '江苏省': [118.7632, 32.0617], '四川省': [104.0668, 30.5728],
  '湖北省': [114.3054, 30.5931], '山东省': [117.0207, 36.6702], '河南省': [113.7536, 34.7655],
  '河北省': [114.5302, 38.0371], '福建省': [119.2965, 26.0745], '安徽省': [117.2849, 31.8612],
  '湖南省': [112.9823, 28.1941], '江西省': [115.8582, 28.6829], '陕西省': [108.9542, 34.2655],
  '辽宁省': [123.4315, 41.8057], '吉林省': [125.3245, 43.8868], '黑龙江省': [126.6617, 45.7424],
  '山西省': [112.5492, 37.8570], '贵州省': [106.6302, 26.6470], '云南省': [102.8329, 24.8801],
  '甘肃省': [103.8263, 36.0594], '青海省': [101.7802, 36.6209], '海南省': [110.3312, 20.0310],
  '台湾省': [121.5654, 25.0330], '内蒙古自治区': [111.6708, 40.8183], '广西壮族自治区': [108.3669, 22.8170],
  '西藏自治区': [91.1409, 29.6456], '宁夏回族自治区': [106.2587, 38.4712], '新疆维吾尔自治区': [87.6168, 43.8256],
  '天津市': [117.2000, 39.1333], '重庆市': [106.5516, 29.5630], '香港特别行政区': [114.1694, 22.3193],
  '澳门特别行政区': [113.5439, 22.1987],
};

const CITY_COORDS: Record<string, [number, number]> = {
  '北京市': [116.4074, 39.9042], '上海市': [121.4737, 31.2304], '天津市': [117.2000, 39.1333], '重庆市': [106.5516, 29.5630],
  '广州市': [113.2644, 23.1291], '深圳市': [114.0579, 22.5431], '佛山市': [113.1214, 23.0215], '东莞市': [113.7518, 23.0207], '珠海市': [113.5767, 22.2707], '中山市': [113.3926, 22.5159], '惠州市': [114.4168, 23.1115], '清远市': [113.0560, 23.6820],
  '杭州市': [120.1551, 30.2741], '宁波市': [121.5503, 29.8746], '南京市': [118.7969, 32.0603], '苏州市': [120.5853, 31.2989], '无锡市': [120.3119, 31.4912],
  '成都市': [104.0668, 30.5728], '武汉市': [114.3054, 30.5931], '长沙市': [112.9388, 28.2282], '郑州市': [113.6254, 34.7466], '西安市': [108.9402, 34.3416],
  '青岛市': [120.3826, 36.0671], '济南市': [117.1201, 36.6512], '厦门市': [118.0894, 24.4798], '福州市': [119.2965, 26.0745], '南宁市': [108.3669, 22.8170],
  '昆明市': [102.8329, 24.8801], '贵阳市': [106.6302, 26.6470], '南昌市': [115.8582, 28.6829], '合肥市': [117.2272, 31.8206], '石家庄市': [114.5149, 38.0428],
  '太原市': [112.5489, 37.8706], '沈阳市': [123.4315, 41.8057], '大连市': [121.6147, 38.9140], '长春市': [125.3235, 43.8171], '哈尔滨市': [126.6424, 45.7567],
  '呼和浩特市': [111.7492, 40.8426], '银川市': [106.2309, 38.4872], '兰州市': [103.8343, 36.0611], '西宁市': [101.7782, 36.6171], '乌鲁木齐市': [87.6168, 43.8256], '拉萨市': [91.1409, 29.6456], '海口市': [110.3312, 20.0310],
};

function compactRegion(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, '').replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|自治州|地区|省|市|盟|州|区|县|旗)$/g, '');
}

function getCoord(name: string, province?: string): [number, number] | null {
  const n = String(name || '').trim();
  const p = String(province || '').trim();
  if (!n) return null;
  if (CITY_COORDS[n]) return CITY_COORDS[n];
  if (PROVINCE_COORDS[n]) return PROVINCE_COORDS[n];
  const compactName = compactRegion(n);
  for (const [key, val] of Object.entries(CITY_COORDS)) {
    if (compactRegion(key) === compactName || n.includes(key) || key.includes(n)) return val;
  }
  for (const [key, val] of Object.entries(PROVINCE_COORDS)) {
    if (n.includes(key) || key.includes(n) || compactRegion(key) === compactName || (p && (p.includes(key) || key.includes(p)))) return val;
  }
  return null;
}

const geocodeCache = new Map<string, [number, number] | null>();
const geocodePending = new Map<string, Promise<[number, number] | null>>();
const GEOCODE_TIMEOUT_MS = 1800;

function directCoord(lng?: unknown, lat?: unknown): [number, number] | null {
  const x = Number(lng);
  const y = Number(lat);
  if (Number.isFinite(x) && Number.isFinite(y) && x >= -180 && x <= 180 && y >= -90 && y <= 90) return [x, y];
  return null;
}

type RectangleBounds = {
  southwest: [number, number];
  northeast: [number, number];
  center: [number, number];
  key: string;
};

function parseAmapRectangle(value: unknown): RectangleBounds | null {
  const match = String(value || '').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*;\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  const first = directCoord(match[1], match[2]);
  const second = directCoord(match[3], match[4]);
  if (!first || !second) return null;
  const southwest: [number, number] = [Math.min(first[0], second[0]), Math.min(first[1], second[1])];
  const northeast: [number, number] = [Math.max(first[0], second[0]), Math.max(first[1], second[1])];
  return {
    southwest,
    northeast,
    center: [(southwest[0] + northeast[0]) / 2, (southwest[1] + northeast[1]) / 2],
    key: `${southwest[0]},${southwest[1]};${northeast[0]},${northeast[1]}`,
  };
}

function regionAddress(region: { label?: string; province?: string; city?: string; district?: string; location?: string }) {
  const province = String(region.province || '').trim();
  const city = String(region.city || '').trim();
  const district = String(region.district || '').trim();
  const location = String(region.location || '').trim();
  if (district) return `${province}${city}${district}` || district;
  if (city) return `${province}${city}` || city;
  if (province) return province;
  if (location && !/^GPS\(/i.test(location)) return location;
  return String(region.label || '').trim();
}

function parseLngLat(value: any): [number, number] | null {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 2) return directCoord(value[0], value[1]);
  if (typeof value === 'object') return directCoord(value.lng ?? value.longitude, value.lat ?? value.latitude);
  const match = String(value).match(/(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)/);
  return match ? directCoord(match[1], match[2]) : null;
}

async function geocodeWithTimeout(AMap: any, address: string, province?: string): Promise<[number, number] | null> {
  const cacheKey = `${province || '全国'}|${address}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey) || null;
  const pending = geocodePending.get(cacheKey);
  if (pending) return pending;
  const task = new Promise<[number, number] | null>((resolve) => {
    let settled = false;
    let timer: number;
    const done = (coord: [number, number] | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      geocodeCache.set(cacheKey, coord);
      geocodePending.delete(cacheKey);
      resolve(coord);
    };
    timer = window.setTimeout(() => done(null), GEOCODE_TIMEOUT_MS);
    try {
      AMap.plugin(['AMap.Geocoder'], () => {
        try {
          const localGeocoder = new AMap.Geocoder({ city: province || '全国', extensions: 'base' });
          localGeocoder.getLocation(address, (status: string, res: any) => {
            const loc = status === 'complete' ? res?.geocodes?.[0]?.location : null;
            done(loc ? directCoord(loc.lng, loc.lat) : null);
          });
        } catch {
          done(null);
        }
      });
    } catch {
      done(null);
    }
  });
  geocodePending.set(cacheKey, task);
  return task;
}

async function resolveCoord(AMap: any, region: { label?: string; province?: string; city?: string; district?: string; location?: string; lng?: number; lat?: number; rectangle?: string }): Promise<[number, number] | null> {
  const precise = parseAmapRectangle(region.rectangle)?.center || directCoord(region.lng, region.lat) || parseLngLat(region.location);
  if (precise) return precise;

  const provinceCoord = getCoord(region.province || '');
  const cityCoord = region.city ? getCoord(region.city, region.province) : null;
  const address = regionAddress(region);
  if (!address) return cityCoord || provinceCoord;

  // 区县必须优先地理编码，不能直接回退到市中心，否则同市各区会重叠。
  if (region.district) {
    const districtCoord = await geocodeWithTimeout(AMap, address, region.province);
    return districtCoord || cityCoord || provinceCoord || getCoord(address, region.province);
  }
  if (cityCoord) return cityCoord;
  if (!region.city && provinceCoord) return provinceCoord;

  const geocoded = await geocodeWithTimeout(AMap, address, region.province);
  return geocoded || provinceCoord || getCoord(address, region.province);
}

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function isDark() {
  return document.documentElement.dataset.theme === 'dark';
}

function escapeHtml(value: unknown) {
  const htmlMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  return String(value ?? '').replace(/[&<>"]/g, (ch) => htmlMap[ch] || ch);
}

function loadAmap() {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (!amapKey) return Promise.reject(new Error('缺少 VITE_AMAP_KEY'));
  if (amapSecurityJsCode) window._AMapSecurityConfig = { securityJsCode: amapSecurityJsCode };
  amapLoader ||= new Promise((resolve, reject) => {
    const existed = document.querySelector<HTMLScriptElement>('script[data-amap-jsapi="true"]');
    if (existed) {
      existed.addEventListener('load', () => resolve(window.AMap));
      existed.addEventListener('error', () => reject(new Error('高德地图 JSAPI 脚本加载失败')));
      return;
    }
    const script = document.createElement('script');
    script.dataset.amapJsapi = 'true';
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=${encodeURIComponent(amapVersion)}&key=${encodeURIComponent(amapKey)}&plugin=AMap.Scale,AMap.ToolBar,AMap.Geocoder,AMap.DistrictSearch`;
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error('高德地图 JSAPI 未正确初始化'));
    script.onerror = () => reject(new Error('高德地图 JSAPI 脚本加载失败'));
    document.head.appendChild(script);
  });
  return amapLoader;
}


function regionDisplayName(region: { label?: string; province?: string; city?: string; district?: string; location?: string }) {
  const district = String(region.district || '').trim();
  const city = String(region.city || '').trim();
  const province = String(region.province || '').trim();
  const location = String(region.location || '').trim();
  const label = String(region.label || '').trim();
  if (district) return district;
  if (city) return city;
  if (province) return province;
  const parsed = compactRegion(label || location);
  return parsed || label || location || '未识别地区';
}

function visualRegionKey(region: { label?: string; province?: string; city?: string; district?: string; location?: string }) {
  const province = compactRegion(region.province || '');
  const city = compactRegion(region.city || '');
  const district = compactRegion(region.district || '');
  if (district) return `${province || '全国'}/${city || '辖区'}/${district}`;
  if (city) return `${province || '全国'}/${city}`;
  if (province) return province;
  return compactRegion(region.location || region.label || '');
}

function pointLevel(region: HotspotItem): 'province' | 'city' | 'district' {
  if (region.level === 'district' || region.district) return 'district';
  if (region.level === 'city' || region.city) return 'city';
  return 'province';
}

function buildVisualPoints(entries: Array<{ h: HotspotItem; coord: [number, number] | null }>): VisualPoint[] {
  const pointMap = new Map<string, VisualPoint>();
  for (const { h, coord } of entries) {
    if (!coord) continue;
    const key = visualRegionKey(h);
    if (!key) continue;
    const existing = pointMap.get(key);
    const count = Math.max(1, Number(h.count || 0));
    if (existing) {
      existing.actualCount += h.isActual ? count : 0;
      existing.authCount += h.isActual ? 0 : count;
      existing.total += count;
      // 保留后端/浏览器给出的更精确经纬度，避免同区县红蓝点互相覆盖。
      if (h.isActual && directCoord(h.lng, h.lat)) existing.coord = coord;
      if (!existing.district && h.district) existing.district = h.district;
      if (!existing.city && h.city) existing.city = h.city;
      if (!existing.province && h.province) existing.province = h.province;
      if (!existing.location && h.location) existing.location = h.location;
      if (!existing.rectangle && h.rectangle) existing.rectangle = h.rectangle;
    } else {
      pointMap.set(key, {
        key,
        label: regionDisplayName(h),
        province: h.province,
        city: h.city,
        district: h.district,
        location: h.location,
        rectangle: h.rectangle,
        coord,
        actualCount: h.isActual ? count : 0,
        authCount: h.isActual ? 0 : count,
        total: count,
        level: pointLevel(h),
      });
    }
  }
  return Array.from(pointMap.values()).sort((a, b) => b.actualCount - a.actualCount || b.total - a.total || a.label.localeCompare(b.label, 'zh-CN'));
}

function zoomIntoRegion(point: VisualPoint) {
  if (!map) return;
  const currentZoom = Number(map.getZoom?.() || 5);
  const targetZoom = point.level === 'province' ? 8 : point.level === 'city' ? 11.5 : 13.5;
  map.setZoomAndCenter(Math.max(currentZoom, targetZoom), point.coord);
}

function markerHtml(type: 'actual' | 'auth', name: string, count: number, subLabel = '') {
  const size = Math.max(type === 'actual' ? 38 : 32, Math.min(type === 'actual' ? 74 : 58, 30 + Number(count || 0) * 4));
  const stateText = type === 'actual' ? '异常' : '授权';
  return `<div class="channeling-marker ${type}" style="width:${size}px;height:${size}px" role="button" aria-label="${escapeHtml(name)}">
    <span>${escapeHtml(count || 0)}</span>
    <i>${escapeHtml(subLabel || stateText)}</i>
    <em>${escapeHtml(name)}</em>
  </div>`;
}

function infoHtml(title: string, rows: Record<string, unknown>) {
  return `<div class="channeling-info"><strong>${escapeHtml(title)}</strong>${Object.entries(rows).map(([key, value]) => `<p><span>${escapeHtml(key)}</span>${escapeHtml(value)}</p>`).join('')}</div>`;
}

function clearDistrictBoundary() {
  if (!map || !districtBoundaryOverlays.length) return;
  try { map.remove(districtBoundaryOverlays); } catch { /* ignore */ }
  districtBoundaryOverlays = [];
}

async function showRegionBoundary(AMap: any, point: VisualPoint) {
  const seq = ++boundarySeq;
  clearDistrictBoundary();
  const keyword = regionAddress(point);
  if (!keyword || point.level === 'province') return;

  await new Promise<void>((resolve) => {
    try {
      AMap.plugin(['AMap.DistrictSearch'], () => {
        try {
          const search = new AMap.DistrictSearch({
            level: point.level === 'district' ? 'district' : 'city',
            subdistrict: 0,
            extensions: 'all',
          });
          search.search(keyword, (status: string, result: any) => {
            if (seq !== boundarySeq || status !== 'complete') return resolve();
            const boundaries = result?.districtList?.[0]?.boundaries || [];
            const strokeColor = cssVar('--primary', '#2563eb');
            districtBoundaryOverlays = boundaries.map((boundary: any) => new AMap.Polygon({
              path: boundary,
              strokeColor,
              strokeWeight: point.level === 'district' ? 3 : 2,
              strokeOpacity: 0.88,
              fillColor: strokeColor,
              fillOpacity: point.level === 'district' ? 0.1 : 0.06,
              zIndex: 60,
            }));
            if (districtBoundaryOverlays.length) {
              map.add(districtBoundaryOverlays);
              map.setFitView(districtBoundaryOverlays, false, [72, 72, 72, 72], point.level === 'district' ? 15 : 13);
            }
            resolve();
          });
        } catch {
          resolve();
        }
      });
    } catch {
      resolve();
    }
  });
}

function addVisualMarker(AMap: any, point: VisualPoint) {
  const type = point.actualCount > 0 ? 'actual' : 'auth';
  const marker = new AMap.Marker({
    position: point.coord,
    anchor: 'center',
    zIndex: point.actualCount > 0 ? 130 : 100,
    content: markerHtml(type, point.label, point.actualCount || point.authCount || point.total, point.actualCount && point.authCount ? '异常/授权' : ''),
  });
  marker.on('click', () => {
    zoomIntoRegion(point);
    void showRegionBoundary(AMap, point);
    const title = point.level === 'province' ? '省级区域概览' : point.level === 'city' ? '市级区域概览' : '区县级区域概览';
    const operationTip = point.level === 'province'
      ? '已放大到省域，继续点击城市可下钻'
      : point.level === 'city'
        ? '已展示城市边界，可继续查看区县与道路'
        : '已展示区县边界，可查看道路与扫码点位';
    infoWindow ||= new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20), isCustom: false });
    infoWindow.setContent(infoHtml(title, {
      地区: [point.province, point.city, point.district].filter(Boolean).join(' / ') || point.label,
      异常扫码: point.actualCount,
      授权线索: point.authCount,
      汇总次数: point.total,
      操作提示: operationTip,
    }));
    infoWindow.open(map, point.coord);
  });
  map.add(marker);
  return marker;
}

function addWarningRectangle(AMap: any, bounds: RectangleBounds) {
  const rectangle = new AMap.Rectangle({
    bounds: new AMap.Bounds(bounds.southwest, bounds.northeast),
    strokeColor: '#dc2626',
    strokeWeight: 2,
    strokeOpacity: 0.9,
    fillColor: '#ef4444',
    fillOpacity: 0.12,
    zIndex: 45,
    bubble: true,
  });
  map.add(rectangle);
  return rectangle;
}


function addTextMarker(AMap: any, position: [number, number], text: string, color: string) {
  const marker = new AMap.Text({
    text,
    position,
    anchor: 'center',
    offset: new AMap.Pixel(0, -28),
    style: {
      'background-color': 'rgba(255,255,255,.92)',
      border: '1px solid rgba(148,163,184,.35)',
      'border-radius': '999px',
      padding: '2px 8px',
      color,
      'font-size': '12px',
      'box-shadow': '0 4px 12px rgba(15,23,42,.12)',
    },
  });
  map.add(marker);
  return marker;
}

async function render() {
  if (!mapRef.value) return;
  const seq = ++renderSeq;
  mapError.value = '';
  if (!amapKey) {
    mapError.value = '缺少 VITE_AMAP_KEY，地图容器已保留；配置后刷新即可显示高德地图。';
    return;
  }
  loading.value = true;
  try {
    const AMap = await loadAmap();
    if (seq !== renderSeq) return;
    const dark = isDark();
    const warn = '#f59e0b';
    if (!map) {
      map = new AMap.Map(mapRef.value, {
        viewMode: '3D',
        zoom: 5,
        center: [104.1954, 35.8617],
        mapStyle: dark ? 'amap://styles/dark' : 'amap://styles/normal',
        resizeEnable: true,
      });
      try { map.addControl(new AMap.Scale()); } catch { /* ignore */ }
      try { map.addControl(new AMap.ToolBar({ position: 'RB' })); } catch { /* ignore */ }
    } else {
      map.setMapStyle?.(dark ? 'amap://styles/dark' : 'amap://styles/normal');
      boundarySeq += 1;
      map.clearMap();
      districtBoundaryOverlays = [];
      infoWindow?.close?.();
    }

    const hotspots = (props.hotspots || []).slice(0, 80);
    const flows = (props.flows || []).slice(0, 50);
    const hotspotEntries = await Promise.all(hotspots.map(async (h) => ({ h, coord: await resolveCoord(AMap, h) })));
    const flowEntries = await Promise.all(flows.map(async (f) => ({
      f,
      fromCoord: await resolveCoord(AMap, { label: f.from, province: f.fromProvince, city: f.fromCity, district: f.fromDistrict, location: f.fromLocation, lng: f.fromLng, lat: f.fromLat, rectangle: f.fromRectangle }),
      toCoord: await resolveCoord(AMap, { label: f.to, province: f.toProvince, city: f.toCity, district: f.toDistrict, location: f.toLocation, lng: f.toLng, lat: f.toLat, rectangle: f.toRectangle }),
    })));
    if (seq !== renderSeq) return;

    const overlays: any[] = [];
    const visualPoints = buildVisualPoints(hotspotEntries).slice(0, 80);

    const seenRectangles = new Set<string>();
    const rectangles = [
      ...hotspots.filter((item) => item.isActual).map((item) => item.rectangle),
      ...flows.map((item) => item.toRectangle),
    ];
    for (const rectangleValue of rectangles) {
      const bounds = parseAmapRectangle(rectangleValue);
      if (!bounds || seenRectangles.has(bounds.key)) continue;
      seenRectangles.add(bounds.key);
      overlays.push(addWarningRectangle(AMap, bounds));
    }

    for (const point of visualPoints) {
      overlays.push(addVisualMarker(AMap, point));
    }

    const seenFlows = new Set<string>();
    for (const { f, fromCoord, toCoord } of flowEntries) {
      if (!fromCoord || !toCoord) continue;
      const key = `${f.fromProvince || ''}/${f.fromCity || ''}/${f.fromDistrict || f.from}→${f.toProvince || ''}/${f.toCity || ''}/${f.toDistrict || f.to}`;
      if (seenFlows.has(key)) continue;
      seenFlows.add(key);
      const line = new AMap.Polyline({
        path: [fromCoord, toCoord],
        showDir: true,
        strokeColor: warn,
        strokeWeight: Math.max(3, Math.min(8, Number(f.count || 1) + 2)),
        strokeOpacity: 0.72,
        strokeStyle: 'dashed',
        zIndex: 80,
      });
      line.on('click', () => {
        const mid: [number, number] = [(fromCoord[0] + toCoord[0]) / 2, (fromCoord[1] + toCoord[1]) / 2];
        infoWindow ||= new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20), isCustom: false });
        infoWindow.setContent(infoHtml('区县级窜货流向', { 授权区域: f.from || [f.fromProvince, f.fromCity, f.fromDistrict].filter(Boolean).join(' / '), 异常区域: f.to || [f.toProvince, f.toCity, f.toDistrict].filter(Boolean).join(' / '), 异常次数: f.count }));
        infoWindow.open(map, mid);
      });
      map.add(line);
      overlays.push(line);
      overlays.push(addTextMarker(AMap, [(fromCoord[0] + toCoord[0]) / 2, (fromCoord[1] + toCoord[1]) / 2], `${f.count}`, warn));
    }

    if (overlays.length) map.setFitView(overlays, false, [60, 70, 60, 70], 12);
    else map.setZoomAndCenter(5, [104.1954, 35.8617]);

    // 触发一次 resize，解决弹性布局中初次渲染宽高计算不准的问题。
    requestAnimationFrame(() => map?.resize?.());
  } catch (error: any) {
    mapError.value = error?.message || '高德地图初始化失败';
  } finally {
    if (seq === renderSeq) loading.value = false;
  }
}

function scheduleRender() {
  if (renderTimer) window.clearTimeout(renderTimer);
  renderTimer = window.setTimeout(() => { void render(); }, 120);
}

onMounted(() => {
  nextTick(() => {
    scheduleRender();
    if (mapRef.value) {
      resizeObserver = new ResizeObserver(() => map?.resize?.());
      resizeObserver.observe(mapRef.value);
    }
  });
});

watch(() => [props.hotspots, props.flows], scheduleRender, { deep: true });

onBeforeUnmount(() => {
  renderSeq += 1;
  if (renderTimer) window.clearTimeout(renderTimer);
  resizeObserver?.disconnect();
  infoWindow?.close?.();
  boundarySeq += 1;
  clearDistrictBoundary();
  map?.destroy?.();
  map = null;
});
</script>

<style scoped>
.channeling-map-wrap { border-radius: 24px; border: 1px solid rgba(219, 234, 254, .95); background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(248,251,255,.92)); padding: 16px; margin-bottom: 18px; box-shadow: 0 18px 42px rgba(37, 99, 235, .08); }
.map-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 2px 4px 14px; }
.map-title { display: grid; gap: 4px; min-width: 0; }
.map-title span { color: var(--primary); font-size: 11px; font-weight: 900; letter-spacing: .16em; }
.map-title strong { color: var(--text-1); font-size: 20px; line-height: 1.2; font-weight: 900; }
.map-title small { color: var(--text-3); font-size: 12px; }
.map-kpis { display: grid; grid-template-columns: repeat(3, minmax(92px, auto)); gap: 8px; }
.map-kpis div { min-width: 92px; padding: 9px 12px; border-radius: 16px; border: 1px solid rgba(219,234,254,.95); background: rgba(255,255,255,.78); box-shadow: inset 0 1px 0 rgba(255,255,255,.9); }
.map-kpis span { display: block; color: var(--text-3); font-size: 11px; }
.map-kpis strong { display: block; color: var(--text-1); font-size: 18px; line-height: 1.25; font-weight: 900; font-variant-numeric: tabular-nums; }
.map-shell { height: clamp(420px, 46vh, 560px); position: relative; overflow: hidden; border-radius: 18px; background: linear-gradient(135deg, rgba(37,99,235,.08), rgba(14,165,233,.05)); border: 1px solid rgba(219,234,254,.9); }
.map-box { width: 100%; height: 100%; }
.map-config-tip { border: 1px solid rgba(245,158,11,.3); background: rgba(245,158,11,.08); color: #b45309; border-radius: 14px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
.map-error { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: grid; gap: 6px; min-width: min(420px, 88%); padding: 16px 18px; border: 1px solid rgba(239,68,68,.28); border-radius: 16px; background: rgba(255,255,255,.92); box-shadow: 0 12px 30px rgba(15,23,42,.16); color: #991b1b; text-align: center; z-index: 10; }
.map-error span { color: #7f1d1d; font-size: 13px; }
.map-legend { display: flex; align-items: center; gap: 16px; padding: 10px 12px 0; font-size: 12px; color: var(--text-3); flex-wrap: wrap; }
.legend-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; }
.legend-dot.hot { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,.5); }
.legend-dot.auth { background: var(--primary); }
.legend-area { display: inline-block; width: 20px; height: 12px; border: 2px solid #dc2626; background: rgba(239,68,68,.12); margin-right: 4px; vertical-align: middle; }
.legend-line { display: inline-block; width: 24px; height: 2px; background: repeating-linear-gradient(90deg, #f59e0b 0, #f59e0b 4px, transparent 4px, transparent 8px); margin-right: 4px; vertical-align: middle; }
:deep(.channeling-marker) { position: relative; display: grid; place-items: center; border-radius: 999px; color: #fff; font-weight: 800; box-shadow: 0 12px 30px rgba(15,23,42,.24); transform: translateZ(0); animation: channeling-pulse 1.8s ease-in-out infinite; }
:deep(.channeling-marker.actual) { background: radial-gradient(circle at 35% 35%, #fecaca, #ef4444 58%, #991b1b); }
:deep(.channeling-marker.auth) { background: radial-gradient(circle at 35% 35%, #bfdbfe, #2563eb 58%, #1e40af); animation-duration: 2.4s; }
:deep(.channeling-marker span) { font-size: 14px; line-height: 1; font-variant-numeric: tabular-nums; }
:deep(.channeling-marker i) { display: block; margin-top: 2px; font-size: 9px; line-height: 1; font-style: normal; font-weight: 800; opacity: .86; transform: scale(.92); }
:deep(.channeling-marker em) { position: absolute; left: 50%; bottom: -22px; transform: translateX(-50%); max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-style: normal; color: var(--text-2); text-shadow: 0 1px 2px rgba(255,255,255,.96); background: rgba(255,255,255,.88); border: 1px solid rgba(226,232,240,.72); border-radius: 999px; padding: 1px 6px; }
:deep(.channeling-info) { min-width: 180px; color: #102a43; }
:deep(.channeling-info strong) { display: block; margin-bottom: 8px; color: #102a43; }
:deep(.channeling-info p) { display: flex; justify-content: space-between; gap: 18px; margin: 4px 0; font-size: 12px; }
:deep(.channeling-info span) { color: #64748b; }
@media (max-width: 860px) { .map-head { flex-direction: column; } .map-kpis { width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 560px) { .map-kpis { grid-template-columns: 1fr; } }
@keyframes channeling-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.28), 0 12px 30px rgba(15,23,42,.24); } 50% { box-shadow: 0 0 0 12px rgba(239,68,68,0), 0 12px 30px rgba(15,23,42,.24); } }
</style>
