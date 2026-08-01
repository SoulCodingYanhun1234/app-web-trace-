export type SelectOption = { label: string; value: string; code?: string; province?: string; provinceCode?: string };

export type RegionProvince = {
  code: string;
  name: string;
  cities: Array<{ code: string; name: string }>;
};

export const regionTree: RegionProvince[] = [
  { code: 'BJ', name: '北京市', cities: [{ code: 'BJ', name: '北京市' }] },
  { code: 'SH', name: '上海市', cities: [{ code: 'SH', name: '上海市' }] },
  { code: 'TJ', name: '天津市', cities: [{ code: 'TJ', name: '天津市' }] },
  { code: 'CQ', name: '重庆市', cities: [{ code: 'CQ', name: '重庆市' }] },
  { code: 'GD', name: '广东省', cities: [
    { code: 'GZ', name: '广州市' }, { code: 'SZ', name: '深圳市' }, { code: 'ZH', name: '珠海市' }, { code: 'FS', name: '佛山市' },
    { code: 'DG', name: '东莞市' }, { code: 'ZS', name: '中山市' }, { code: 'HZ', name: '惠州市' }, { code: 'JM', name: '江门市' },
    { code: 'ST', name: '汕头市' }, { code: 'ZJ', name: '湛江市' }, { code: 'SG', name: '韶关市' }, { code: 'QY', name: '清远市' },
    { code: 'MM', name: '茂名市' }, { code: 'ZQ', name: '肇庆市' }, { code: 'MZ', name: '梅州市' }, { code: 'HY', name: '河源市' },
    { code: 'SW', name: '汕尾市' }, { code: 'YJ', name: '阳江市' }, { code: 'CZ', name: '潮州市' }, { code: 'JY', name: '揭阳市' }, { code: 'YF', name: '云浮市' },
  ] },
  { code: 'ZJ', name: '浙江省', cities: [
    { code: 'HZ', name: '杭州市' }, { code: 'NB', name: '宁波市' }, { code: 'WZ', name: '温州市' }, { code: 'JX', name: '嘉兴市' },
    { code: 'HUZ', name: '湖州市' }, { code: 'SX', name: '绍兴市' }, { code: 'JH', name: '金华市' }, { code: 'QZ', name: '衢州市' },
    { code: 'ZS', name: '舟山市' }, { code: 'TZ', name: '台州市' }, { code: 'LS', name: '丽水市' },
  ] },
  { code: 'JS', name: '江苏省', cities: [
    { code: 'NJ', name: '南京市' }, { code: 'SZ', name: '苏州市' }, { code: 'WX', name: '无锡市' }, { code: 'CZ', name: '常州市' },
    { code: 'XZ', name: '徐州市' }, { code: 'NT', name: '南通市' }, { code: 'LYG', name: '连云港市' }, { code: 'HA', name: '淮安市' },
    { code: 'YC', name: '盐城市' }, { code: 'YZ', name: '扬州市' }, { code: 'ZJ', name: '镇江市' }, { code: 'TZ', name: '泰州市' }, { code: 'SQ', name: '宿迁市' },
  ] },
  { code: 'SD', name: '山东省', cities: [
    { code: 'JN', name: '济南市' }, { code: 'QD', name: '青岛市' }, { code: 'ZB', name: '淄博市' }, { code: 'ZZ', name: '枣庄市' },
    { code: 'DY', name: '东营市' }, { code: 'YT', name: '烟台市' }, { code: 'WF', name: '潍坊市' }, { code: 'JN2', name: '济宁市' },
    { code: 'TA', name: '泰安市' }, { code: 'WH', name: '威海市' }, { code: 'RZ', name: '日照市' }, { code: 'LY', name: '临沂市' },
    { code: 'DZ', name: '德州市' }, { code: 'LC', name: '聊城市' }, { code: 'BZ', name: '滨州市' }, { code: 'HZ', name: '菏泽市' },
  ] },
  { code: 'HN', name: '湖南省', cities: [
    { code: 'CS', name: '长沙市' }, { code: 'ZZ', name: '株洲市' }, { code: 'XT', name: '湘潭市' }, { code: 'HY', name: '衡阳市' },
    { code: 'SY', name: '邵阳市' }, { code: 'YY', name: '岳阳市' }, { code: 'CD', name: '常德市' }, { code: 'ZJJ', name: '张家界市' },
    { code: 'YIY', name: '益阳市' }, { code: 'CZ', name: '郴州市' }, { code: 'YZ', name: '永州市' }, { code: 'HH', name: '怀化市' },
    { code: 'LD', name: '娄底市' }, { code: 'XX', name: '湘西土家族苗族自治州' },
  ] },
  { code: 'SC', name: '四川省', cities: [
    { code: 'CD', name: '成都市' }, { code: 'MY', name: '绵阳市' }, { code: 'DY', name: '德阳市' }, { code: 'ZG', name: '自贡市' },
    { code: 'PZH', name: '攀枝花市' }, { code: 'LZ', name: '泸州市' }, { code: 'GY', name: '广元市' }, { code: 'SN', name: '遂宁市' },
    { code: 'NJ', name: '内江市' }, { code: 'LS', name: '乐山市' }, { code: 'NC', name: '南充市' }, { code: 'MS', name: '眉山市' },
    { code: 'YB', name: '宜宾市' }, { code: 'GA', name: '广安市' }, { code: 'DZ', name: '达州市' }, { code: 'YA', name: '雅安市' },
    { code: 'BZ', name: '巴中市' }, { code: 'ZY', name: '资阳市' }, { code: 'AB', name: '阿坝藏族羌族自治州' }, { code: 'GZ', name: '甘孜藏族自治州' }, { code: 'LSZ', name: '凉山彝族自治州' },
  ] },
  { code: 'HB', name: '湖北省', cities: [
    { code: 'WH', name: '武汉市' }, { code: 'HS', name: '黄石市' }, { code: 'SY', name: '十堰市' }, { code: 'YC', name: '宜昌市' },
    { code: 'XF', name: '襄阳市' }, { code: 'EZ', name: '鄂州市' }, { code: 'JM', name: '荆门市' }, { code: 'XG', name: '孝感市' },
    { code: 'JZ', name: '荆州市' }, { code: 'HG', name: '黄冈市' }, { code: 'XN', name: '咸宁市' }, { code: 'SZ', name: '随州市' }, { code: 'ES', name: '恩施土家族苗族自治州' },
  ] },
  { code: 'HA', name: '河南省', cities: [
    { code: 'ZZ', name: '郑州市' }, { code: 'KF', name: '开封市' }, { code: 'LY', name: '洛阳市' }, { code: 'PDS', name: '平顶山市' },
    { code: 'AY', name: '安阳市' }, { code: 'HB', name: '鹤壁市' }, { code: 'XX', name: '新乡市' }, { code: 'JZ', name: '焦作市' },
    { code: 'PY', name: '濮阳市' }, { code: 'XC', name: '许昌市' }, { code: 'LH', name: '漯河市' }, { code: 'SMX', name: '三门峡市' },
    { code: 'NY', name: '南阳市' }, { code: 'SQ', name: '商丘市' }, { code: 'XY', name: '信阳市' }, { code: 'ZK', name: '周口市' }, { code: 'ZMD', name: '驻马店市' },
  ] },
  { code: 'HE', name: '河北省', cities: [
    { code: 'SJZ', name: '石家庄市' }, { code: 'TS', name: '唐山市' }, { code: 'QHD', name: '秦皇岛市' }, { code: 'HD', name: '邯郸市' },
    { code: 'XT', name: '邢台市' }, { code: 'BD', name: '保定市' }, { code: 'ZJK', name: '张家口市' }, { code: 'CD', name: '承德市' },
    { code: 'CZ', name: '沧州市' }, { code: 'LF', name: '廊坊市' }, { code: 'HS', name: '衡水市' },
  ] },
  { code: 'SX', name: '山西省', cities: [
    { code: 'TY', name: '太原市' }, { code: 'DT', name: '大同市' }, { code: 'YQ', name: '阳泉市' }, { code: 'CZ', name: '长治市' },
    { code: 'JC', name: '晋城市' }, { code: 'SZ', name: '朔州市' }, { code: 'JZ', name: '晋中市' }, { code: 'YC', name: '运城市' },
    { code: 'XZ', name: '忻州市' }, { code: 'LF', name: '临汾市' }, { code: 'LL', name: '吕梁市' },
  ] },
  { code: 'FJ', name: '福建省', cities: [
    { code: 'FZ', name: '福州市' }, { code: 'XM', name: '厦门市' }, { code: 'PT', name: '莆田市' }, { code: 'SM', name: '三明市' },
    { code: 'QZ', name: '泉州市' }, { code: 'ZZ', name: '漳州市' }, { code: 'NP', name: '南平市' }, { code: 'LY', name: '龙岩市' }, { code: 'ND', name: '宁德市' },
  ] },
  { code: 'AH', name: '安徽省', cities: [
    { code: 'HF', name: '合肥市' }, { code: 'WH', name: '芜湖市' }, { code: 'BB', name: '蚌埠市' }, { code: 'HN', name: '淮南市' },
    { code: 'MAS', name: '马鞍山市' }, { code: 'HB', name: '淮北市' }, { code: 'TL', name: '铜陵市' }, { code: 'AQ', name: '安庆市' },
    { code: 'HS', name: '黄山市' }, { code: 'CZ', name: '滁州市' }, { code: 'FY', name: '阜阳市' }, { code: 'SZ', name: '宿州市' },
    { code: 'LA', name: '六安市' }, { code: 'BZ', name: '亳州市' }, { code: 'CZ2', name: '池州市' }, { code: 'XC', name: '宣城市' },
  ] },
  { code: 'JX', name: '江西省', cities: [
    { code: 'NC', name: '南昌市' }, { code: 'JDZ', name: '景德镇市' }, { code: 'PX', name: '萍乡市' }, { code: 'JJ', name: '九江市' },
    { code: 'XY', name: '新余市' }, { code: 'YT', name: '鹰潭市' }, { code: 'GZ', name: '赣州市' }, { code: 'JA', name: '吉安市' },
    { code: 'YC', name: '宜春市' }, { code: 'FZ', name: '抚州市' }, { code: 'SR', name: '上饶市' },
  ] },
  { code: 'LN', name: '辽宁省', cities: [
    { code: 'SY', name: '沈阳市' }, { code: 'DL', name: '大连市' }, { code: 'AS', name: '鞍山市' }, { code: 'FS', name: '抚顺市' },
    { code: 'BX', name: '本溪市' }, { code: 'DD', name: '丹东市' }, { code: 'JZ', name: '锦州市' }, { code: 'YK', name: '营口市' },
    { code: 'FX', name: '阜新市' }, { code: 'LY', name: '辽阳市' }, { code: 'PJ', name: '盘锦市' }, { code: 'TL', name: '铁岭市' }, { code: 'CY', name: '朝阳市' }, { code: 'HLD', name: '葫芦岛市' },
  ] },
  { code: 'JL', name: '吉林省', cities: [
    { code: 'CC', name: '长春市' }, { code: 'JL', name: '吉林市' }, { code: 'SP', name: '四平市' }, { code: 'LY', name: '辽源市' },
    { code: 'TH', name: '通化市' }, { code: 'BS', name: '白山市' }, { code: 'SY', name: '松原市' }, { code: 'BC', name: '白城市' }, { code: 'YB', name: '延边朝鲜族自治州' },
  ] },
  { code: 'HLJ', name: '黑龙江省', cities: [
    { code: 'HEB', name: '哈尔滨市' }, { code: 'QQHE', name: '齐齐哈尔市' }, { code: 'JX', name: '鸡西市' }, { code: 'HG', name: '鹤岗市' },
    { code: 'SYS', name: '双鸭山市' }, { code: 'DQ', name: '大庆市' }, { code: 'YC', name: '伊春市' }, { code: 'JMS', name: '佳木斯市' },
    { code: 'QTH', name: '七台河市' }, { code: 'MDJ', name: '牡丹江市' }, { code: 'HH', name: '黑河市' }, { code: 'SH', name: '绥化市' }, { code: 'DXAL', name: '大兴安岭地区' },
  ] },
  { code: 'GX', name: '广西壮族自治区', cities: [
    { code: 'NN', name: '南宁市' }, { code: 'LZ', name: '柳州市' }, { code: 'GL', name: '桂林市' }, { code: 'WZ', name: '梧州市' },
    { code: 'BH', name: '北海市' }, { code: 'FCG', name: '防城港市' }, { code: 'QZ', name: '钦州市' }, { code: 'GG', name: '贵港市' },
    { code: 'YL', name: '玉林市' }, { code: 'BS', name: '百色市' }, { code: 'HZ', name: '贺州市' }, { code: 'HC', name: '河池市' }, { code: 'LB', name: '来宾市' }, { code: 'CZ', name: '崇左市' },
  ] },
  { code: 'HI', name: '海南省', cities: [
    { code: 'HK', name: '海口市' }, { code: 'SY', name: '三亚市' }, { code: 'SS', name: '三沙市' }, { code: 'DZ', name: '儋州市' },
  ] },
  { code: 'YN', name: '云南省', cities: [
    { code: 'KM', name: '昆明市' }, { code: 'QJ', name: '曲靖市' }, { code: 'YX', name: '玉溪市' }, { code: 'BS', name: '保山市' },
    { code: 'ZT', name: '昭通市' }, { code: 'LJ', name: '丽江市' }, { code: 'PE', name: '普洱市' }, { code: 'LC', name: '临沧市' },
    { code: 'CX', name: '楚雄彝族自治州' }, { code: 'HH', name: '红河哈尼族彝族自治州' }, { code: 'WS', name: '文山壮族苗族自治州' }, { code: 'XSBN', name: '西双版纳傣族自治州' },
    { code: 'DL', name: '大理白族自治州' }, { code: 'DH', name: '德宏傣族景颇族自治州' }, { code: 'NJ', name: '怒江傈僳族自治州' }, { code: 'DQ', name: '迪庆藏族自治州' },
  ] },
  { code: 'GZ', name: '贵州省', cities: [
    { code: 'GY', name: '贵阳市' }, { code: 'LPS', name: '六盘水市' }, { code: 'ZY', name: '遵义市' }, { code: 'AS', name: '安顺市' },
    { code: 'BJ', name: '毕节市' }, { code: 'TR', name: '铜仁市' }, { code: 'QXN', name: '黔西南布依族苗族自治州' }, { code: 'QDN', name: '黔东南苗族侗族自治州' }, { code: 'QN', name: '黔南布依族苗族自治州' },
  ] },
  { code: 'SN', name: '陕西省', cities: [
    { code: 'XA', name: '西安市' }, { code: 'TC', name: '铜川市' }, { code: 'BJ', name: '宝鸡市' }, { code: 'XY', name: '咸阳市' },
    { code: 'WN', name: '渭南市' }, { code: 'YA', name: '延安市' }, { code: 'HZ', name: '汉中市' }, { code: 'YL', name: '榆林市' },
    { code: 'AK', name: '安康市' }, { code: 'SL', name: '商洛市' },
  ] },
  { code: 'GS', name: '甘肃省', cities: [
    { code: 'LZ', name: '兰州市' }, { code: 'JC', name: '嘉峪关市' }, { code: 'JCH', name: '金昌市' }, { code: 'BY', name: '白银市' },
    { code: 'TS', name: '天水市' }, { code: 'WW', name: '武威市' }, { code: 'ZY', name: '张掖市' }, { code: 'PL', name: '平凉市' },
    { code: 'JQ', name: '酒泉市' }, { code: 'QY', name: '庆阳市' }, { code: 'DX', name: '定西市' }, { code: 'LN', name: '陇南市' }, { code: 'LX', name: '临夏回族自治州' }, { code: 'GN', name: '甘南藏族自治州' },
  ] },
  { code: 'QH', name: '青海省', cities: [
    { code: 'XN', name: '西宁市' }, { code: 'HD', name: '海东市' }, { code: 'HB', name: '海北藏族自治州' }, { code: 'HN', name: '黄南藏族自治州' },
    { code: 'HN2', name: '海南藏族自治州' }, { code: 'GL', name: '果洛藏族自治州' }, { code: 'YS', name: '玉树藏族自治州' }, { code: 'HX', name: '海西蒙古族藏族自治州' },
  ] },
  { code: 'NM', name: '内蒙古自治区', cities: [
    { code: 'HHHT', name: '呼和浩特市' }, { code: 'BT', name: '包头市' }, { code: 'WH', name: '乌海市' }, { code: 'CF', name: '赤峰市' },
    { code: 'TL', name: '通辽市' }, { code: 'EEDS', name: '鄂尔多斯市' }, { code: 'HLBE', name: '呼伦贝尔市' }, { code: 'BYNE', name: '巴彦淖尔市' },
    { code: 'WLCB', name: '乌兰察布市' }, { code: 'XAM', name: '兴安盟' }, { code: 'XLGL', name: '锡林郭勒盟' }, { code: 'ALSM', name: '阿拉善盟' },
  ] },
  { code: 'NX', name: '宁夏回族自治区', cities: [
    { code: 'YC', name: '银川市' }, { code: 'SZS', name: '石嘴山市' }, { code: 'WZ', name: '吴忠市' }, { code: 'GY', name: '固原市' }, { code: 'ZW', name: '中卫市' },
  ] },
  { code: 'XJ', name: '新疆维吾尔自治区', cities: [
    { code: 'WLMQ', name: '乌鲁木齐市' }, { code: 'KLMY', name: '克拉玛依市' }, { code: 'TLF', name: '吐鲁番市' }, { code: 'HM', name: '哈密市' },
    { code: 'CJ', name: '昌吉回族自治州' }, { code: 'BETL', name: '博尔塔拉蒙古自治州' }, { code: 'BYGL', name: '巴音郭楞蒙古自治州' }, { code: 'AKS', name: '阿克苏地区' },
    { code: 'KZLS', name: '克孜勒苏柯尔克孜自治州' }, { code: 'KASH', name: '喀什地区' }, { code: 'HT', name: '和田地区' }, { code: 'YL', name: '伊犁哈萨克自治州' }, { code: 'TC', name: '塔城地区' }, { code: 'ALT', name: '阿勒泰地区' },
  ] },
  { code: 'XZ', name: '西藏自治区', cities: [
    { code: 'LS', name: '拉萨市' }, { code: 'RKZ', name: '日喀则市' }, { code: 'CD', name: '昌都市' }, { code: 'LZ', name: '林芝市' },
    { code: 'SN', name: '山南市' }, { code: 'NQ', name: '那曲市' }, { code: 'AL', name: '阿里地区' },
  ] },
  { code: 'MO', name: '澳门特别行政区', cities: [{ code: 'MO', name: '澳门特别行政区' }] },
  { code: 'HK', name: '香港特别行政区', cities: [{ code: 'HK', name: '香港特别行政区' }] },
  { code: 'TW', name: '台湾省', cities: [
    { code: 'TB', name: '台北市' }, { code: 'GX', name: '高雄市' }, { code: 'TX', name: '台中市' }, { code: 'TN', name: '台南市' }, { code: 'TY', name: '桃园市' },
  ] },
];

export const provinceOptions: SelectOption[] = regionTree.map((item) => ({ label: `${item.name}（${item.code}）`, value: item.name, code: item.code }));

export const allCityOptions: SelectOption[] = regionTree.flatMap((province) => province.cities.map((city) => ({
  label: `${city.name}（${province.name}/${city.code}）`,
  value: city.name,
  code: city.code,
  province: province.name,
  provinceCode: province.code,
})));

export function getProvinceByName(name?: string) {
  const text = String(name || '').trim();
  return regionTree.find((province) => province.name === text || province.name.replace(/省|市|自治区|壮族自治区|回族自治区|维吾尔自治区|特别行政区/g, '') === text.replace(/省|市|自治区|壮族自治区|回族自治区|维吾尔自治区|特别行政区/g, '') || province.code === text.toUpperCase());
}

export function cityOptions(provinceName?: string): SelectOption[] {
  const province = getProvinceByName(provinceName);
  if (!province) return allCityOptions;
  return province.cities.map((city) => ({ label: `${city.name}（${city.code}）`, value: city.name, code: city.code, province: province.name, provinceCode: province.code }));
}

export function getCityByName(cityName?: string, provinceName?: string) {
  const text = String(cityName || '').trim();
  if (!text) return undefined;
  const candidates = provinceName ? cityOptions(provinceName) : allCityOptions;
  return candidates.find((city) => city.value === text || city.value.replace(/市|地区|自治州/g, '') === text.replace(/市|地区|自治州/g, '') || city.code === text.toUpperCase());
}

export function provinceCode(name?: string) {
  return getProvinceByName(name)?.code || '';
}

export function cityCode(cityName?: string, provinceName?: string) {
  return getCityByName(cityName, provinceName)?.code || '';
}

export function normalizeRegionPatch<T extends Record<string, any>>(target: T, provinceKey = 'province_name', cityKey = 'city_name') {
  const p = String(target[provinceKey] || '').trim();
  const c = String(target[cityKey] || '').trim();
  const mutable = target as Record<string, any>;
  if (p && 'province_code' in mutable) mutable.province_code = provinceCode(p) || mutable.province_code || '';
  if (c && 'city_code' in mutable) mutable.city_code = cityCode(c, p) || mutable.city_code || '';
  return target;
}
