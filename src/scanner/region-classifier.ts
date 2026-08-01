export type RegionOption = { code: string; name: string; cities: { code: string; name: string }[] };
export type ScanRegion = {
  raw: string;
  code: string;
  normalized_code: string;
  province_code: string;
  province_name: string;
  city_code: string;
  city_name: string;
  product_code: string;
  batch_no: string;
  serial_no: string;
  source: 'code_rule' | 'fallback' | 'none';
  format: string;
  region_group: string;
};

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

function provinceName(code?: string) {
  return provinceMap.get(String(code || '').toUpperCase())?.name || '';
}

function cityName(provinceCode?: string, cityCode?: string) {
  return cityMap.get(`${String(provinceCode || '').toUpperCase()}-${String(cityCode || '').toUpperCase()}`)?.name || '';
}

function isProvince(code?: string) {
  return provinceMap.has(String(code || '').toUpperCase());
}

function isCity(provinceCode?: string, cityCode?: string) {
  return Boolean(cityName(provinceCode, cityCode));
}

export function classifyRegionFromCode(input: unknown, fallback?: Partial<ScanRegion>): ScanRegion {
  const code = String(input || '').trim();
  const parts = code.split(/[-_/.|]+/).map((item) => item.trim()).filter(Boolean);
  const upperParts = parts.map((item) => item.toUpperCase());
  let province_code = '';
  let city_code = '';
  let product_code = '';
  let batch_no = '';
  let serial_no = '';
  let format = '自由格式';
  let source: ScanRegion['source'] = 'none';

  const start = ['FW', 'AF', 'TRACE', 'CODE'].includes(upperParts[0] || '') ? 1 : 0;
  if (isProvince(upperParts[start]) && isCity(upperParts[start], upperParts[start + 1])) {
    province_code = upperParts[start];
    city_code = upperParts[start + 1];
    product_code = upperParts[start + 2] || '';
    batch_no = upperParts[start + 3] || '';
    serial_no = upperParts[start + 4] || '';
    format = '区域前缀格式';
    source = 'code_rule';
  } else {
    const index = upperParts.findIndex((item) => isProvince(item));
    if (index >= 0 && isCity(upperParts[index], upperParts[index + 1])) {
      province_code = upperParts[index];
      city_code = upperParts[index + 1];
      product_code = upperParts[index + 2] || '';
      batch_no = upperParts[index + 3] || '';
      serial_no = upperParts[index + 4] || '';
      format = '自动识别区域格式';
      source = 'code_rule';
    }
  }

  if ((!province_code || !city_code) && fallback?.province_code && fallback?.city_code) {
    province_code = fallback.province_code;
    city_code = fallback.city_code;
    product_code = product_code || fallback.product_code || '';
    batch_no = batch_no || fallback.batch_no || '';
    source = 'fallback';
    format = '业务数据兜底';
  }

  const province_name = provinceName(province_code) || fallback?.province_name || '';
  const city_name = cityName(province_code, city_code) || fallback?.city_name || '';
  return {
    raw: String(input || ''),
    code,
    normalized_code: code.toUpperCase().replace(/\s+/g, ''),
    province_code,
    province_name,
    city_code,
    city_name,
    product_code,
    batch_no,
    serial_no,
    source,
    format,
    region_group: province_name ? `${province_name}分类部分${city_name ? ` / ${city_name}` : ''}` : '',
  };
}
