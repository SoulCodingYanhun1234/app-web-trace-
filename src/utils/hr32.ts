import { normalizeScannedText } from './scanner';

export type RegionOption = { code: string; name: string; cities: { code: string; name: string }[] };
export type Hr32Region = { provinceCode: string; provinceName: string; cityCode: string; cityName: string; warehouse?: string };
export type ScannerDeviceType = 'newland_hr32' | 'youjie' | 'generic_hid';
export type ScannerSubmitKey = 'enter' | 'tab' | 'enter_tab';
export type ScannerDeviceProfile = {
  type: ScannerDeviceType;
  label: string;
  deviceName: string;
  shortName: string;
  connectionMode: 'USB-HID-KBW';
  submitKey: ScannerSubmitKey;
  enterSuffix: boolean;
  minLength: number;
  maxInterval: number;
  guide: string;
  suffixText: string;
};
export type Hr32Settings = {
  deviceType?: ScannerDeviceType;
  deviceName: string;
  connectionMode: 'USB-HID-KBW';
  enterSuffix: boolean;
  minLength: number;
  maxInterval?: number;
  submitKey?: ScannerSubmitKey;
  regionMode: 'code' | 'workstation' | 'mixed';
};
export type Hr32Classification = {
  raw: string; code: string; normalizedCode: string; provinceCode: string; provinceName: string; cityCode: string; cityName: string;
  productCode: string; batchNo: string; serialNo: string; source: 'code-rule' | 'workstation' | 'none'; format: string;
};

export const HR32_REGION_KEY = 'trace_admin_hr32_workstation_region_v1';
export const HR32_SETTINGS_KEY = 'trace_admin_hr32_settings_v1';
export const HR32_LAST_SCAN_KEY = 'trace_admin_hr32_last_scan_v1';

export const scannerDeviceProfiles: ScannerDeviceProfile[] = [
  {
    type: 'newland_hr32',
    label: '新大陆 Newland HR32 / HR3280',
    deviceName: 'Newland HR32 / HR3280',
    shortName: 'HR32',
    connectionMode: 'USB-HID-KBW',
    submitKey: 'enter',
    enterSuffix: true,
    minLength: 3,
    maxInterval: 80,
    suffixText: '0x0D 回车',
    guide: '推荐设置为 USB HID-KBW 键盘模式，结束符设置为 0x0D 回车。',
  },
  {
    type: 'youjie',
    label: '优解 Youjie / Honeywell Youjie 二维扫码枪',
    deviceName: 'Youjie / Honeywell Youjie 2D Scanner',
    shortName: 'Youjie',
    connectionMode: 'USB-HID-KBW',
    submitKey: 'enter_tab',
    enterSuffix: true,
    minLength: 3,
    maxInterval: 120,
    suffixText: '回车或 Tab',
    guide: '推荐设置为 USB 键盘口 / HID-KBW 模式，后缀可用回车；若你的优解扫码枪默认发送 Tab，本系统也会自动识别。',
  },
  {
    type: 'generic_hid',
    label: '通用 USB 键盘扫码枪',
    deviceName: 'Generic USB HID Scanner',
    shortName: '通用扫码枪',
    connectionMode: 'USB-HID-KBW',
    submitKey: 'enter_tab',
    enterSuffix: true,
    minLength: 3,
    maxInterval: 140,
    suffixText: '回车或 Tab',
    guide: '适用于大多数免驱 USB 键盘模式扫码枪，扫码内容像键盘输入一样进入页面。',
  },
];

export const scannerDeviceOptions = scannerDeviceProfiles.map((item) => ({ label: item.label, value: item.type }));

export const regionOptions: RegionOption[] = [
  { code: 'GD', name: '广东省', cities: [{ code: 'SZ', name: '深圳市' }, { code: 'GZ', name: '广州市' }, { code: 'FS', name: '佛山市' }, { code: 'DG', name: '东莞市' }] },
  { code: 'HN', name: '湖南省', cities: [{ code: 'CS', name: '长沙市' }, { code: 'ZZ', name: '株洲市' }, { code: 'XT', name: '湘潭市' }] },
  { code: 'SD', name: '山东省', cities: [{ code: 'QD', name: '青岛市' }, { code: 'JN', name: '济南市' }, { code: 'YT', name: '烟台市' }] },
  { code: 'HA', name: '河南省', cities: [{ code: 'ZZ', name: '郑州市' }, { code: 'LY', name: '洛阳市' }, { code: 'KF', name: '开封市' }] },
  { code: 'JS', name: '江苏省', cities: [{ code: 'NJ', name: '南京市' }, { code: 'SZH', name: '苏州市' }, { code: 'WX', name: '无锡市' }] },
  { code: 'ZJ', name: '浙江省', cities: [{ code: 'HZ', name: '杭州市' }, { code: 'NB', name: '宁波市' }, { code: 'WZ', name: '温州市' }] },
  { code: 'SC', name: '四川省', cities: [{ code: 'CD', name: '成都市' }, { code: 'MY', name: '绵阳市' }] },
  { code: 'BJ', name: '北京市', cities: [{ code: 'BJ', name: '北京市' }] },
  { code: 'SH', name: '上海市', cities: [{ code: 'SH', name: '上海市' }] },
];

const provinceMap = new Map(regionOptions.map((item) => [item.code, item]));
const cityMap = new Map(regionOptions.flatMap((province) => province.cities.map((city) => [`${province.code}-${city.code}`, { ...city, province }] as const)));

export function getScannerDeviceProfile(type?: string) {
  return scannerDeviceProfiles.find((item) => item.type === type) || scannerDeviceProfiles[0];
}

export function defaultHr32Settings(): Hr32Settings {
  const profile = getScannerDeviceProfile('newland_hr32');
  return {
    deviceType: profile.type,
    deviceName: profile.deviceName,
    connectionMode: profile.connectionMode,
    enterSuffix: profile.enterSuffix,
    minLength: profile.minLength,
    maxInterval: profile.maxInterval,
    submitKey: profile.submitKey,
    regionMode: 'mixed',
  };
}
export function defaultHr32Region(): Hr32Region {
  const province = regionOptions[0]; const city = province.cities[0];
  return { provinceCode: province.code, provinceName: province.name, cityCode: city.code, cityName: city.name, warehouse: '默认工作站' };
}
function safeParse<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...JSON.parse(raw) } : fallback; } catch { return fallback; }
}

export function normalizeScannerSettings(settings?: Partial<Hr32Settings>): Hr32Settings {
  const profile = getScannerDeviceProfile(settings?.deviceType);
  const fallback = defaultHr32Settings();
  return {
    ...fallback,
    ...settings,
    deviceType: profile.type,
    deviceName: settings?.deviceName || profile.deviceName,
    connectionMode: 'USB-HID-KBW',
    enterSuffix: settings?.enterSuffix ?? profile.enterSuffix,
    minLength: Number(settings?.minLength || profile.minLength || fallback.minLength),
    maxInterval: Number(settings?.maxInterval || profile.maxInterval || 100),
    submitKey: settings?.submitKey || profile.submitKey,
    regionMode: settings?.regionMode || 'mixed',
  };
}

export function buildScannerSettingsFromPanel(panel: Record<string, any>, current?: Hr32Settings): Hr32Settings {
  const selectedType = (panel.scanner_device_type || panel.deviceType || current?.deviceType || 'newland_hr32') as ScannerDeviceType;
  const profile = getScannerDeviceProfile(selectedType);
  return normalizeScannerSettings({
    ...(current || {}),
    deviceType: selectedType,
    deviceName: panel.scanner_device_name || panel.deviceName || profile.deviceName,
    connectionMode: 'USB-HID-KBW',
    enterSuffix: panel.scanner_enter_suffix ?? panel.enterSuffix ?? profile.enterSuffix,
    minLength: panel.scanner_min_length ?? panel.minLength ?? profile.minLength,
    maxInterval: panel.scanner_interval_ms ?? panel.maxInterval ?? profile.maxInterval,
    submitKey: panel.scanner_submit_key || panel.submitKey || profile.submitKey,
    regionMode: panel.scanner_region_mode || panel.regionMode || current?.regionMode || 'mixed',
  });
}

export function loadHr32Settings() { return normalizeScannerSettings(safeParse<Hr32Settings>(HR32_SETTINGS_KEY, defaultHr32Settings())); }
export function saveHr32Settings(settings: Partial<Hr32Settings>) { try { localStorage.setItem(HR32_SETTINGS_KEY, JSON.stringify(normalizeScannerSettings(settings))); } catch { /* ignore */ } }
export function loadHr32Region() { return safeParse<Hr32Region>(HR32_REGION_KEY, defaultHr32Region()); }
export function saveHr32Region(region: Hr32Region) { try { localStorage.setItem(HR32_REGION_KEY, JSON.stringify(region)); } catch { /* ignore */ } }
export function getProvinceName(code?: string) { return provinceMap.get(String(code || '').toUpperCase())?.name || ''; }
export function getCityName(provinceCode?: string, cityCode?: string) { return cityMap.get(`${String(provinceCode || '').toUpperCase()}-${String(cityCode || '').toUpperCase()}`)?.name || ''; }
export function buildRegion(provinceCode: string, cityCode: string, warehouse?: string): Hr32Region {
  const province = provinceMap.get(String(provinceCode || '').toUpperCase()) || regionOptions[0];
  const city = province.cities.find((item) => item.code === String(cityCode || '').toUpperCase()) || province.cities[0];
  return { provinceCode: province.code, provinceName: province.name, cityCode: city.code, cityName: city.name, warehouse };
}
function isRegionCode(value?: string) { return provinceMap.has(String(value || '').toUpperCase()); }
function isCityCode(provinceCode?: string, cityCode?: string) { return Boolean(getCityName(provinceCode, cityCode)); }
export function classifyHr32Code(input: unknown, workstationRegion?: Hr32Region): Hr32Classification {
  const code = normalizeScannedText(input);
  const parts = code.split(/[-_/.|]+/).map((item) => item.trim()).filter(Boolean);
  const upperParts = parts.map((item) => item.toUpperCase());
  let provinceCode = ''; let cityCode = ''; let productCode = ''; let batchNo = ''; let serialNo = ''; let format = '自由格式';
  let source: Hr32Classification['source'] = 'none';
  const startIndex = ['FW', 'AF', 'TRACE', 'CODE'].includes(upperParts[0] || '') ? 1 : 0;
  if (isRegionCode(upperParts[startIndex]) && isCityCode(upperParts[startIndex], upperParts[startIndex + 1])) {
    provinceCode = upperParts[startIndex]; cityCode = upperParts[startIndex + 1]; productCode = upperParts[startIndex + 2] || ''; batchNo = upperParts[startIndex + 3] || ''; serialNo = upperParts[startIndex + 4] || ''; format = '区域前缀格式'; source = 'code-rule';
  } else {
    const provinceIndex = upperParts.findIndex((item) => isRegionCode(item));
    if (provinceIndex >= 0 && isCityCode(upperParts[provinceIndex], upperParts[provinceIndex + 1])) {
      provinceCode = upperParts[provinceIndex]; cityCode = upperParts[provinceIndex + 1]; productCode = upperParts[provinceIndex + 2] || ''; batchNo = upperParts[provinceIndex + 3] || ''; serialNo = upperParts[provinceIndex + 4] || ''; format = '自动识别区域格式'; source = 'code-rule';
    }
  }
  if ((!provinceCode || !cityCode) && workstationRegion?.provinceCode && workstationRegion?.cityCode) {
    provinceCode = workstationRegion.provinceCode; cityCode = workstationRegion.cityCode; source = 'workstation'; format = '工作站区域兜底';
  }
  return {
    raw: String(input || ''), code, normalizedCode: code.toUpperCase().replace(/\s+/g, ''), provinceCode,
    provinceName: getProvinceName(provinceCode) || workstationRegion?.provinceName || '', cityCode,
    cityName: getCityName(provinceCode, cityCode) || workstationRegion?.cityName || '', productCode, batchNo, serialNo, source, format,
  };
}
export function saveHr32LastScan(result: any) { try { localStorage.setItem(HR32_LAST_SCAN_KEY, JSON.stringify({ ...result, savedAt: new Date().toISOString() })); } catch { /* ignore */ } }
