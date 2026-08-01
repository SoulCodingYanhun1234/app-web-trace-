import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { AntiCounterfeitCodeVault } from '../common/anti-counterfeit-vault.js';
import { RedisService } from '../redis/redis.service.js';
import { pageParams, safeId, safeText, safeJsonArray } from '../common/utils.js';
import { dedupeAlertsByLocation } from './automation-policy.js';

type RuleCode = 'geo_mismatch' | 'location_unverified' | 'same_code_multi_region' | 'ip_high_frequency' | 'device_risk' | 'shipment_region_mismatch' | 'fake_code_scan' | 'agent_cross_boundary' | 'code_trajectory_anomaly';

const TRUSTED_SCAN_GEO_SOURCES = new Set(['amap_ip', 'server_geoip', 'trusted_edge_geo', 'uapi_network_myip']);

type ScanContext = {
  code: string;
  code_type?: string;
  channel?: string;
  location?: string;
  province?: string;
  city?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  adcode?: string;
  rectangle?: string;
  bounds?: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  accuracy?: number;
  location_source?: string;
  location_verified?: boolean;
  webrtc_local_ips?: string[];
  ip?: string;
  userAgent?: string;
  device_id?: string;
  device_integrity?: string;
  jailbroken?: boolean;
  is_real?: boolean;
  query_count?: number;
  anti_fake_code?: any;
  box?: any;
  product?: any;
  query_log_id?: number;
  authorization_decision?: any;
};

type ShipmentContext = {
  shipment: any;
  boxes?: any[];
  action?: string;
  scan_location?: string;
  ip?: string;
  userAgent?: string;
};

const KNOWN_CITY_ALIASES = [
  '广州', '深圳', '清远', '佛山', '东莞', '中山', '珠海', '惠州', '江门', '肇庆', '汕头', '汕尾', '湛江', '茂名', '韶关', '梅州', '河源', '阳江', '潮州', '揭阳', '云浮',
  '北京', '上海', '天津', '重庆', '成都', '杭州', '南京', '苏州', '武汉', '长沙', '郑州', '西安', '青岛', '济南', '厦门', '福州', '南宁', '海口', '昆明', '贵阳', '南昌', '合肥', '石家庄', '太原', '沈阳', '大连', '长春', '哈尔滨', '呼和浩特', '银川', '兰州', '西宁', '乌鲁木齐', '拉萨',
];

const MUNICIPALITY_MAP: Record<string, string> = {
  '北京': '北京市',
  '上海': '上海市',
  '天津': '天津市',
  '重庆': '重庆市',
};

const CITY_PROVINCE_MAP: Record<string, string> = {
  广州: '广东省', 深圳: '广东省', 清远: '广东省', 佛山: '广东省', 东莞: '广东省', 中山: '广东省', 珠海: '广东省', 惠州: '广东省', 江门: '广东省', 肇庆: '广东省', 汕头: '广东省', 汕尾: '广东省', 湛江: '广东省', 茂名: '广东省', 韶关: '广东省', 梅州: '广东省', 河源: '广东省', 阳江: '广东省', 潮州: '广东省', 揭阳: '广东省', 云浮: '广东省',
  成都: '四川省', 杭州: '浙江省', 南京: '江苏省', 苏州: '江苏省', 武汉: '湖北省', 长沙: '湖南省', 郑州: '河南省', 西安: '陕西省', 青岛: '山东省', 济南: '山东省', 厦门: '福建省', 福州: '福建省', 南宁: '广西壮族自治区', 海口: '海南省', 昆明: '云南省', 贵阳: '贵州省', 南昌: '江西省', 合肥: '安徽省', 石家庄: '河北省', 太原: '山西省', 沈阳: '辽宁省', 大连: '辽宁省', 长春: '吉林省', 哈尔滨: '黑龙江省', 呼和浩特: '内蒙古自治区', 银川: '宁夏回族自治区', 兰州: '甘肃省', 西宁: '青海省', 乌鲁木齐: '新疆维吾尔自治区', 拉萨: '西藏自治区',
};


const EXTRA_CITY_PROVINCE_MAP: Record<string, string> = {
  北京: '北京市',
  上海: '上海市',
  天津: '天津市',
  重庆: '重庆市',
  广州: '广东省',
  深圳: '广东省',
  珠海: '广东省',
  佛山: '广东省',
  东莞: '广东省',
  中山: '广东省',
  惠州: '广东省',
  江门: '广东省',
  汕头: '广东省',
  湛江: '广东省',
  韶关: '广东省',
  清远: '广东省',
  茂名: '广东省',
  肇庆: '广东省',
  梅州: '广东省',
  河源: '广东省',
  汕尾: '广东省',
  阳江: '广东省',
  潮州: '广东省',
  揭阳: '广东省',
  云浮: '广东省',
  杭州: '浙江省',
  宁波: '浙江省',
  温州: '浙江省',
  嘉兴: '浙江省',
  湖州: '浙江省',
  绍兴: '浙江省',
  金华: '浙江省',
  衢州: '浙江省',
  舟山: '浙江省',
  台州: '浙江省',
  丽水: '浙江省',
  南京: '江苏省',
  苏州: '江苏省',
  无锡: '江苏省',
  常州: '江苏省',
  徐州: '江苏省',
  南通: '江苏省',
  连云港: '江苏省',
  淮安: '江苏省',
  盐城: '江苏省',
  扬州: '江苏省',
  镇江: '江苏省',
  泰州: '江苏省',
  宿迁: '江苏省',
  济南: '山东省',
  青岛: '山东省',
  淄博: '山东省',
  枣庄: '山东省',
  东营: '山东省',
  烟台: '山东省',
  潍坊: '山东省',
  济宁: '山东省',
  泰安: '山东省',
  威海: '山东省',
  日照: '山东省',
  临沂: '山东省',
  德州: '山东省',
  聊城: '山东省',
  滨州: '山东省',
  菏泽: '山东省',
  长沙: '湖南省',
  株洲: '湖南省',
  湘潭: '湖南省',
  衡阳: '湖南省',
  邵阳: '湖南省',
  岳阳: '湖南省',
  常德: '湖南省',
  张家界: '湖南省',
  益阳: '湖南省',
  郴州: '湖南省',
  永州: '湖南省',
  怀化: '湖南省',
  娄底: '湖南省',
  湘西土家族苗族: '湖南省',
  成都: '四川省',
  绵阳: '四川省',
  德阳: '四川省',
  自贡: '四川省',
  攀枝花: '四川省',
  泸州: '四川省',
  广元: '四川省',
  遂宁: '四川省',
  内江: '四川省',
  乐山: '四川省',
  南充: '四川省',
  眉山: '四川省',
  宜宾: '四川省',
  广安: '四川省',
  达州: '四川省',
  雅安: '四川省',
  巴中: '四川省',
  资阳: '四川省',
  阿坝藏族羌族: '四川省',
  甘孜藏族: '四川省',
  凉山彝族: '四川省',
  武汉: '湖北省',
  黄石: '湖北省',
  十堰: '湖北省',
  宜昌: '湖北省',
  襄阳: '湖北省',
  鄂州: '湖北省',
  荆门: '湖北省',
  孝感: '湖北省',
  荆州: '湖北省',
  黄冈: '湖北省',
  咸宁: '湖北省',
  随州: '湖北省',
  恩施土家族苗族: '湖北省',
  郑州: '河南省',
  开封: '河南省',
  洛阳: '河南省',
  平顶山: '河南省',
  安阳: '河南省',
  鹤壁: '河南省',
  新乡: '河南省',
  焦作: '河南省',
  濮阳: '河南省',
  许昌: '河南省',
  漯河: '河南省',
  三门峡: '河南省',
  南阳: '河南省',
  商丘: '河南省',
  信阳: '河南省',
  周口: '河南省',
  驻马店: '河南省',
  石家庄: '河北省',
  唐山: '河北省',
  秦皇岛: '河北省',
  邯郸: '河北省',
  邢台: '河北省',
  保定: '河北省',
  张家口: '河北省',
  承德: '河北省',
  沧州: '河北省',
  廊坊: '河北省',
  衡水: '河北省',
  太原: '山西省',
  大同: '山西省',
  阳泉: '山西省',
  长治: '山西省',
  晋城: '山西省',
  朔州: '山西省',
  晋中: '山西省',
  运城: '山西省',
  忻州: '山西省',
  临汾: '山西省',
  吕梁: '山西省',
  福州: '福建省',
  厦门: '福建省',
  莆田: '福建省',
  三明: '福建省',
  泉州: '福建省',
  漳州: '福建省',
  南平: '福建省',
  龙岩: '福建省',
  宁德: '福建省',
  合肥: '安徽省',
  芜湖: '安徽省',
  蚌埠: '安徽省',
  淮南: '安徽省',
  马鞍山: '安徽省',
  淮北: '安徽省',
  铜陵: '安徽省',
  安庆: '安徽省',
  黄山: '安徽省',
  滁州: '安徽省',
  阜阳: '安徽省',
  宿州: '安徽省',
  六安: '安徽省',
  亳州: '安徽省',
  池州: '安徽省',
  宣城: '安徽省',
  南昌: '江西省',
  景德镇: '江西省',
  萍乡: '江西省',
  九江: '江西省',
  新余: '江西省',
  鹰潭: '江西省',
  赣州: '江西省',
  吉安: '江西省',
  宜春: '江西省',
  抚州: '江西省',
  上饶: '江西省',
  沈阳: '辽宁省',
  大连: '辽宁省',
  鞍山: '辽宁省',
  抚顺: '辽宁省',
  本溪: '辽宁省',
  丹东: '辽宁省',
  锦州: '辽宁省',
  营口: '辽宁省',
  阜新: '辽宁省',
  辽阳: '辽宁省',
  盘锦: '辽宁省',
  铁岭: '辽宁省',
  朝阳: '辽宁省',
  葫芦岛: '辽宁省',
  长春: '吉林省',
  吉林: '吉林省',
  四平: '吉林省',
  辽源: '吉林省',
  通化: '吉林省',
  白山: '吉林省',
  松原: '吉林省',
  白城: '吉林省',
  延边朝鲜族: '吉林省',
  哈尔滨: '黑龙江省',
  齐齐哈尔: '黑龙江省',
  鸡西: '黑龙江省',
  鹤岗: '黑龙江省',
  双鸭山: '黑龙江省',
  大庆: '黑龙江省',
  伊春: '黑龙江省',
  佳木斯: '黑龙江省',
  七台河: '黑龙江省',
  牡丹江: '黑龙江省',
  黑河: '黑龙江省',
  绥化: '黑龙江省',
  大兴安岭: '黑龙江省',
  南宁: '广西壮族自治区',
  柳州: '广西壮族自治区',
  桂林: '广西壮族自治区',
  梧州: '广西壮族自治区',
  北海: '广西壮族自治区',
  防城港: '广西壮族自治区',
  钦州: '广西壮族自治区',
  贵港: '广西壮族自治区',
  玉林: '广西壮族自治区',
  百色: '广西壮族自治区',
  贺州: '广西壮族自治区',
  河池: '广西壮族自治区',
  来宾: '广西壮族自治区',
  崇左: '广西壮族自治区',
  海口: '海南省',
  三亚: '海南省',
  三沙: '海南省',
  儋州: '海南省',
  昆明: '云南省',
  曲靖: '云南省',
  玉溪: '云南省',
  保山: '云南省',
  昭通: '云南省',
  丽江: '云南省',
  普洱: '云南省',
  临沧: '云南省',
  楚雄彝族: '云南省',
  红河哈尼族彝族: '云南省',
  文山壮族苗族: '云南省',
  西双版纳傣族: '云南省',
  大理白族: '云南省',
  德宏傣族景颇族: '云南省',
  怒江傈僳族: '云南省',
  迪庆藏族: '云南省',
  贵阳: '贵州省',
  六盘水: '贵州省',
  遵义: '贵州省',
  安顺: '贵州省',
  毕节: '贵州省',
  铜仁: '贵州省',
  黔西南布依族苗族: '贵州省',
  黔东南苗族侗族: '贵州省',
  黔南布依族苗族: '贵州省',
  西安: '陕西省',
  铜川: '陕西省',
  宝鸡: '陕西省',
  咸阳: '陕西省',
  渭南: '陕西省',
  延安: '陕西省',
  汉中: '陕西省',
  榆林: '陕西省',
  安康: '陕西省',
  商洛: '陕西省',
  兰州: '甘肃省',
  嘉峪关: '甘肃省',
  金昌: '甘肃省',
  白银: '甘肃省',
  天水: '甘肃省',
  武威: '甘肃省',
  张掖: '甘肃省',
  平凉: '甘肃省',
  酒泉: '甘肃省',
  庆阳: '甘肃省',
  定西: '甘肃省',
  陇南: '甘肃省',
  临夏回族: '甘肃省',
  甘南藏族: '甘肃省',
  西宁: '青海省',
  海东: '青海省',
  海北藏族: '青海省',
  黄南藏族: '青海省',
  海南藏族: '青海省',
  果洛藏族: '青海省',
  玉树藏族: '青海省',
  海西蒙古族藏族: '青海省',
  呼和浩特: '内蒙古自治区',
  包头: '内蒙古自治区',
  乌海: '内蒙古自治区',
  赤峰: '内蒙古自治区',
  通辽: '内蒙古自治区',
  鄂尔多斯: '内蒙古自治区',
  呼伦贝尔: '内蒙古自治区',
  巴彦淖尔: '内蒙古自治区',
  乌兰察布: '内蒙古自治区',
  兴安: '内蒙古自治区',
  锡林郭勒: '内蒙古自治区',
  阿拉善: '内蒙古自治区',
  银川: '宁夏回族自治区',
  石嘴山: '宁夏回族自治区',
  吴忠: '宁夏回族自治区',
  固原: '宁夏回族自治区',
  中卫: '宁夏回族自治区',
  乌鲁木齐: '新疆维吾尔自治区',
  克拉玛依: '新疆维吾尔自治区',
  吐鲁番: '新疆维吾尔自治区',
  哈密: '新疆维吾尔自治区',
  昌吉回族: '新疆维吾尔自治区',
  博尔塔拉蒙古: '新疆维吾尔自治区',
  巴音郭楞蒙古: '新疆维吾尔自治区',
  阿克苏: '新疆维吾尔自治区',
  克孜勒苏柯尔克孜: '新疆维吾尔自治区',
  喀什: '新疆维吾尔自治区',
  和田: '新疆维吾尔自治区',
  伊犁哈萨克: '新疆维吾尔自治区',
  塔城: '新疆维吾尔自治区',
  阿勒泰: '新疆维吾尔自治区',
  拉萨: '西藏自治区',
  日喀则: '西藏自治区',
  昌都: '西藏自治区',
  林芝: '西藏自治区',
  山南: '西藏自治区',
  那曲: '西藏自治区',
  阿里: '西藏自治区',
  澳门: '澳门特别行政区',
  香港: '香港特别行政区',
  台北: '台湾省',
  高雄: '台湾省',
  台中: '台湾省',
  台南: '台湾省',
  桃园: '台湾省',
};

const EXTRA_CITY_DISPLAY_MAP: Record<string, string> = {
  北京: '北京市',
  上海: '上海市',
  天津: '天津市',
  重庆: '重庆市',
  广州: '广州市',
  深圳: '深圳市',
  珠海: '珠海市',
  佛山: '佛山市',
  东莞: '东莞市',
  中山: '中山市',
  惠州: '惠州市',
  江门: '江门市',
  汕头: '汕头市',
  湛江: '湛江市',
  韶关: '韶关市',
  清远: '清远市',
  茂名: '茂名市',
  肇庆: '肇庆市',
  梅州: '梅州市',
  河源: '河源市',
  汕尾: '汕尾市',
  阳江: '阳江市',
  潮州: '潮州市',
  揭阳: '揭阳市',
  云浮: '云浮市',
  杭州: '杭州市',
  宁波: '宁波市',
  温州: '温州市',
  嘉兴: '嘉兴市',
  湖州: '湖州市',
  绍兴: '绍兴市',
  金华: '金华市',
  衢州: '衢州市',
  舟山: '舟山市',
  台州: '台州市',
  丽水: '丽水市',
  南京: '南京市',
  苏州: '苏州市',
  无锡: '无锡市',
  常州: '常州市',
  徐州: '徐州市',
  南通: '南通市',
  连云港: '连云港市',
  淮安: '淮安市',
  盐城: '盐城市',
  扬州: '扬州市',
  镇江: '镇江市',
  泰州: '泰州市',
  宿迁: '宿迁市',
  济南: '济南市',
  青岛: '青岛市',
  淄博: '淄博市',
  枣庄: '枣庄市',
  东营: '东营市',
  烟台: '烟台市',
  潍坊: '潍坊市',
  济宁: '济宁市',
  泰安: '泰安市',
  威海: '威海市',
  日照: '日照市',
  临沂: '临沂市',
  德州: '德州市',
  聊城: '聊城市',
  滨州: '滨州市',
  菏泽: '菏泽市',
  长沙: '长沙市',
  株洲: '株洲市',
  湘潭: '湘潭市',
  衡阳: '衡阳市',
  邵阳: '邵阳市',
  岳阳: '岳阳市',
  常德: '常德市',
  张家界: '张家界市',
  益阳: '益阳市',
  郴州: '郴州市',
  永州: '永州市',
  怀化: '怀化市',
  娄底: '娄底市',
  湘西土家族苗族: '湘西土家族苗族自治州',
  成都: '成都市',
  绵阳: '绵阳市',
  德阳: '德阳市',
  自贡: '自贡市',
  攀枝花: '攀枝花市',
  泸州: '泸州市',
  广元: '广元市',
  遂宁: '遂宁市',
  内江: '内江市',
  乐山: '乐山市',
  南充: '南充市',
  眉山: '眉山市',
  宜宾: '宜宾市',
  广安: '广安市',
  达州: '达州市',
  雅安: '雅安市',
  巴中: '巴中市',
  资阳: '资阳市',
  阿坝藏族羌族: '阿坝藏族羌族自治州',
  甘孜藏族: '甘孜藏族自治州',
  凉山彝族: '凉山彝族自治州',
  武汉: '武汉市',
  黄石: '黄石市',
  十堰: '十堰市',
  宜昌: '宜昌市',
  襄阳: '襄阳市',
  鄂州: '鄂州市',
  荆门: '荆门市',
  孝感: '孝感市',
  荆州: '荆州市',
  黄冈: '黄冈市',
  咸宁: '咸宁市',
  随州: '随州市',
  恩施土家族苗族: '恩施土家族苗族自治州',
  郑州: '郑州市',
  开封: '开封市',
  洛阳: '洛阳市',
  平顶山: '平顶山市',
  安阳: '安阳市',
  鹤壁: '鹤壁市',
  新乡: '新乡市',
  焦作: '焦作市',
  濮阳: '濮阳市',
  许昌: '许昌市',
  漯河: '漯河市',
  三门峡: '三门峡市',
  南阳: '南阳市',
  商丘: '商丘市',
  信阳: '信阳市',
  周口: '周口市',
  驻马店: '驻马店市',
  石家庄: '石家庄市',
  唐山: '唐山市',
  秦皇岛: '秦皇岛市',
  邯郸: '邯郸市',
  邢台: '邢台市',
  保定: '保定市',
  张家口: '张家口市',
  承德: '承德市',
  沧州: '沧州市',
  廊坊: '廊坊市',
  衡水: '衡水市',
  太原: '太原市',
  大同: '大同市',
  阳泉: '阳泉市',
  长治: '长治市',
  晋城: '晋城市',
  朔州: '朔州市',
  晋中: '晋中市',
  运城: '运城市',
  忻州: '忻州市',
  临汾: '临汾市',
  吕梁: '吕梁市',
  福州: '福州市',
  厦门: '厦门市',
  莆田: '莆田市',
  三明: '三明市',
  泉州: '泉州市',
  漳州: '漳州市',
  南平: '南平市',
  龙岩: '龙岩市',
  宁德: '宁德市',
  合肥: '合肥市',
  芜湖: '芜湖市',
  蚌埠: '蚌埠市',
  淮南: '淮南市',
  马鞍山: '马鞍山市',
  淮北: '淮北市',
  铜陵: '铜陵市',
  安庆: '安庆市',
  黄山: '黄山市',
  滁州: '滁州市',
  阜阳: '阜阳市',
  宿州: '宿州市',
  六安: '六安市',
  亳州: '亳州市',
  池州: '池州市',
  宣城: '宣城市',
  南昌: '南昌市',
  景德镇: '景德镇市',
  萍乡: '萍乡市',
  九江: '九江市',
  新余: '新余市',
  鹰潭: '鹰潭市',
  赣州: '赣州市',
  吉安: '吉安市',
  宜春: '宜春市',
  抚州: '抚州市',
  上饶: '上饶市',
  沈阳: '沈阳市',
  大连: '大连市',
  鞍山: '鞍山市',
  抚顺: '抚顺市',
  本溪: '本溪市',
  丹东: '丹东市',
  锦州: '锦州市',
  营口: '营口市',
  阜新: '阜新市',
  辽阳: '辽阳市',
  盘锦: '盘锦市',
  铁岭: '铁岭市',
  朝阳: '朝阳市',
  葫芦岛: '葫芦岛市',
  长春: '长春市',
  吉林: '吉林市',
  四平: '四平市',
  辽源: '辽源市',
  通化: '通化市',
  白山: '白山市',
  松原: '松原市',
  白城: '白城市',
  延边朝鲜族: '延边朝鲜族自治州',
  哈尔滨: '哈尔滨市',
  齐齐哈尔: '齐齐哈尔市',
  鸡西: '鸡西市',
  鹤岗: '鹤岗市',
  双鸭山: '双鸭山市',
  大庆: '大庆市',
  伊春: '伊春市',
  佳木斯: '佳木斯市',
  七台河: '七台河市',
  牡丹江: '牡丹江市',
  黑河: '黑河市',
  绥化: '绥化市',
  大兴安岭: '大兴安岭地区',
  南宁: '南宁市',
  柳州: '柳州市',
  桂林: '桂林市',
  梧州: '梧州市',
  北海: '北海市',
  防城港: '防城港市',
  钦州: '钦州市',
  贵港: '贵港市',
  玉林: '玉林市',
  百色: '百色市',
  贺州: '贺州市',
  河池: '河池市',
  来宾: '来宾市',
  崇左: '崇左市',
  海口: '海口市',
  三亚: '三亚市',
  三沙: '三沙市',
  儋州: '儋州市',
  昆明: '昆明市',
  曲靖: '曲靖市',
  玉溪: '玉溪市',
  保山: '保山市',
  昭通: '昭通市',
  丽江: '丽江市',
  普洱: '普洱市',
  临沧: '临沧市',
  楚雄彝族: '楚雄彝族自治州',
  红河哈尼族彝族: '红河哈尼族彝族自治州',
  文山壮族苗族: '文山壮族苗族自治州',
  西双版纳傣族: '西双版纳傣族自治州',
  大理白族: '大理白族自治州',
  德宏傣族景颇族: '德宏傣族景颇族自治州',
  怒江傈僳族: '怒江傈僳族自治州',
  迪庆藏族: '迪庆藏族自治州',
  贵阳: '贵阳市',
  六盘水: '六盘水市',
  遵义: '遵义市',
  安顺: '安顺市',
  毕节: '毕节市',
  铜仁: '铜仁市',
  黔西南布依族苗族: '黔西南布依族苗族自治州',
  黔东南苗族侗族: '黔东南苗族侗族自治州',
  黔南布依族苗族: '黔南布依族苗族自治州',
  西安: '西安市',
  铜川: '铜川市',
  宝鸡: '宝鸡市',
  咸阳: '咸阳市',
  渭南: '渭南市',
  延安: '延安市',
  汉中: '汉中市',
  榆林: '榆林市',
  安康: '安康市',
  商洛: '商洛市',
  兰州: '兰州市',
  嘉峪关: '嘉峪关市',
  金昌: '金昌市',
  白银: '白银市',
  天水: '天水市',
  武威: '武威市',
  张掖: '张掖市',
  平凉: '平凉市',
  酒泉: '酒泉市',
  庆阳: '庆阳市',
  定西: '定西市',
  陇南: '陇南市',
  临夏回族: '临夏回族自治州',
  甘南藏族: '甘南藏族自治州',
  西宁: '西宁市',
  海东: '海东市',
  海北藏族: '海北藏族自治州',
  黄南藏族: '黄南藏族自治州',
  海南藏族: '海南藏族自治州',
  果洛藏族: '果洛藏族自治州',
  玉树藏族: '玉树藏族自治州',
  海西蒙古族藏族: '海西蒙古族藏族自治州',
  呼和浩特: '呼和浩特市',
  包头: '包头市',
  乌海: '乌海市',
  赤峰: '赤峰市',
  通辽: '通辽市',
  鄂尔多斯: '鄂尔多斯市',
  呼伦贝尔: '呼伦贝尔市',
  巴彦淖尔: '巴彦淖尔市',
  乌兰察布: '乌兰察布市',
  兴安: '兴安盟',
  锡林郭勒: '锡林郭勒盟',
  阿拉善: '阿拉善盟',
  银川: '银川市',
  石嘴山: '石嘴山市',
  吴忠: '吴忠市',
  固原: '固原市',
  中卫: '中卫市',
  乌鲁木齐: '乌鲁木齐市',
  克拉玛依: '克拉玛依市',
  吐鲁番: '吐鲁番市',
  哈密: '哈密市',
  昌吉回族: '昌吉回族自治州',
  博尔塔拉蒙古: '博尔塔拉蒙古自治州',
  巴音郭楞蒙古: '巴音郭楞蒙古自治州',
  阿克苏: '阿克苏地区',
  克孜勒苏柯尔克孜: '克孜勒苏柯尔克孜自治州',
  喀什: '喀什地区',
  和田: '和田地区',
  伊犁哈萨克: '伊犁哈萨克自治州',
  塔城: '塔城地区',
  阿勒泰: '阿勒泰地区',
  拉萨: '拉萨市',
  日喀则: '日喀则市',
  昌都: '昌都市',
  林芝: '林芝市',
  山南: '山南市',
  那曲: '那曲市',
  阿里: '阿里地区',
  澳门: '澳门特别行政区',
  香港: '香港特别行政区',
  台北: '台北市',
  高雄: '高雄市',
  台中: '台中市',
  台南: '台南市',
  桃园: '桃园市',
};

const CITY_PROVINCE_INDEX: Record<string, string> = { ...CITY_PROVINCE_MAP, ...EXTRA_CITY_PROVINCE_MAP };
const CITY_DISPLAY_INDEX: Record<string, string> = { ...Object.fromEntries(Object.keys(CITY_PROVINCE_MAP).map((name) => [name, `${name}市`])), ...EXTRA_CITY_DISPLAY_MAP };
const KNOWN_CITY_INDEX = Array.from(new Set([...KNOWN_CITY_ALIASES, ...Object.keys(CITY_PROVINCE_INDEX)])).sort((a, b) => b.length - a.length);

const PROVINCE_ALIAS_MAP: Record<string, string> = {
  广东: '广东省', 北京: '北京市', 上海: '上海市', 天津: '天津市', 重庆: '重庆市',
  香港: '香港特别行政区', 澳门: '澳门特别行政区', 台湾: '台湾省',
  浙江: '浙江省', 江苏: '江苏省', 四川: '四川省', 湖北: '湖北省', 湖南: '湖南省', 福建: '福建省', 山东: '山东省', 河南: '河南省', 陕西: '陕西省', 河北: '河北省', 山西: '山西省', 辽宁: '辽宁省', 吉林: '吉林省', 黑龙江: '黑龙江省', 安徽: '安徽省', 江西: '江西省', 海南: '海南省', 云南: '云南省', 贵州: '贵州省', 甘肃: '甘肃省', 青海: '青海省',
  广西: '广西壮族自治区', 宁夏: '宁夏回族自治区', 新疆: '新疆维吾尔自治区', 西藏: '西藏自治区', 内蒙古: '内蒙古自治区',
};

const SPECIAL_REGION_MAP: Record<string, { province: string; city: string }> = {
  香港: { province: '香港特别行政区', city: '香港特别行政区' },
  香港特别行政区: { province: '香港特别行政区', city: '香港特别行政区' },
  澳门: { province: '澳门特别行政区', city: '澳门特别行政区' },
  澳门特别行政区: { province: '澳门特别行政区', city: '澳门特别行政区' },
  台湾: { province: '台湾省', city: '' },
  台湾省: { province: '台湾省', city: '' },
};

const RULE_CACHE_PREFIX = 'ac:rule:';
const RULE_CACHE_TTL = 120;

const DEFAULT_RULES: Record<RuleCode, any> = {
  geo_mismatch: {
    rule_code: 'geo_mismatch',
    rule_name: '扫码位置与授权区域不符',
    rule_type: 'geofence',
    enabled: true,
    severity: 3,
    threshold: 1,
    window_seconds: 3600,
    notify_channels: ['system', 'app', 'sms'],
    description: '授权广州销售的单品在深圳等非授权区域被扫码时触发预警。',
  },
  location_unverified: {
    rule_code: 'location_unverified',
    rule_name: '扫码位置未完成可信核验',
    rule_type: 'location_evidence',
    enabled: true,
    severity: 2,
    threshold: 1,
    window_seconds: 3600,
    notify_channels: ['system', 'app'],
    description: '没有可解析的浏览器 GPS 行政区时，不将扫码结果显示为正常授权，避免 URL、手填地址或 IP 定位覆盖真实位置。',
  },
  same_code_multi_region: {
    rule_code: 'same_code_multi_region',
    rule_name: '同一编码短时间异地扫码',
    rule_type: 'cross_region_scan',
    enabled: true,
    severity: 4,
    threshold: 2,
    window_seconds: 3600,
    notify_channels: ['system', 'app', 'sms'],
    description: '同一码在窗口期内出现在两个及以上不同省市时触发。',
  },
  ip_high_frequency: {
    rule_code: 'ip_high_frequency',
    rule_name: '同一 IP 短时高频扫码',
    rule_type: 'behavior',
    enabled: true,
    severity: 2,
    threshold: 30,
    window_seconds: 60,
    notify_channels: ['system', 'app'],
    description: '同一 IP 在短时间内大量访问查询接口时触发。',
  },
  device_risk: {
    rule_code: 'device_risk',
    rule_name: '越狱/Root/自动化设备访问',
    rule_type: 'device',
    enabled: true,
    severity: 3,
    threshold: 1,
    window_seconds: 3600,
    notify_channels: ['system', 'app'],
    description: '识别 UA、设备完整性参数或客户端标记中的越狱、Root、Hook、自动化访问风险。',
  },
  shipment_region_mismatch: {
    rule_code: 'shipment_region_mismatch',
    rule_name: '经销商跨区域调拨/出库位置异常',
    rule_type: 'shipment',
    enabled: true,
    severity: 4,
    threshold: 1,
    window_seconds: 86400,
    notify_channels: ['system', 'app', 'sms'],
    description: '发货/调拨目的地与代理商授权区域或箱内编码授权区域不符时触发。',
  },
  fake_code_scan: {
    rule_code: 'fake_code_scan',
    rule_name: '无效码/假码扫码',
    rule_type: 'anti_fake',
    enabled: true,
    severity: 2,
    threshold: 1,
    window_seconds: 3600,
    notify_channels: ['system'],
    description: '消费者查询到不存在、注销、锁定或过期编码时留存异常证据。',
  },
  agent_cross_boundary: {
    rule_code: 'agent_cross_boundary',
    rule_name: '同一代理商多区域授权码集中异常扫码',
    rule_type: 'agent_cross',
    enabled: true,
    severity: 4,
    threshold: 5,
    window_seconds: 86400,
    notify_channels: ['system', 'app', 'sms'],
    description: '同一代理商在窗口期内有多个不同授权区域的编码在同一非授权位置被扫码时触发，可能是窜货组织行为。',
  },
  code_trajectory_anomaly: {
    rule_code: 'code_trajectory_anomaly',
    rule_name: '编码轨迹异常跳跃',
    rule_type: 'trajectory',
    enabled: true,
    severity: 5,
    threshold: 2,
    window_seconds: 86400,
    notify_channels: ['system', 'app', 'sms'],
    description: '同一编码的扫码轨迹出现跨越多个省份的跳跃式移动（如北京→广州→上海在短时间内），暗示存在多级窜货。',
  },
};

@Injectable()
export class AntiChannelingService {
  private readonly codeVault = new AntiCounterfeitCodeVault();
  private readonly logger = new Logger(AntiChannelingService.name);

  private async hydrateAlertCodeReferences(rows: any[]) {
    const refs = rows.map((row) => String(row?.code || '')).filter((code) => this.codeVault.hashFromReference(code));
    const hashes = refs.map((ref) => this.codeVault.hashFromReference(ref)).filter(Boolean) as string[];
    if (!hashes.length) return rows;
    const storedCodes = await this.prisma.antiFakeCode.findMany({
      where: { code_hash: { in: hashes } },
      select: { code: true, code_hash: true, code_ciphertext: true, code_iv: true, code_tag: true, code_key_id: true },
    }).catch(() => []);
    const byReference = new Map<string, string>();
    for (const stored of storedCodes) {
      const hydrated = this.codeVault.hydrate(stored as any);
      byReference.set(this.codeVault.reference(hydrated.code), hydrated.code);
    }
    return rows.map((row) => ({ ...row, code: byReference.get(String(row?.code || '')) || row?.code }));
  }

  private sanitizeRiskCodePayload(value: unknown, primaryCode = '', key = ''): any {
    const visit = (current: unknown, field: string): any => {
      if (typeof current === 'string') {
        let result = current;
        if (primaryCode) result = result.split(primaryCode).join(this.codeVault.reference(primaryCode));
        const codeBearingField = /(^|_)(anti_fake_code|code|codes)$/i.test(field)
          && !/^(product|agent|province|city|rule|batch)_code$/i.test(field);
        if (codeBearingField && result && !this.codeVault.hashFromReference(result)) return this.codeVault.reference(result);
        return result;
      }
      if (Array.isArray(current)) return current.map((item) => visit(item, field));
      if (current && typeof current === 'object') {
        return Object.fromEntries(Object.entries(current as Record<string, unknown>).map(([childKey, item]) => [childKey, visit(item, childKey)]));
      }
      return current;
    };
    return visit(value, key);
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly redis?: RedisService,
  ) {}

  private delegate(name: string) {
    return (this.prisma as any)[name];
  }

  private compact(value: unknown) {
    const text = String(value ?? '')
      .trim()
      .replace(/\s+/g, '')
      .replace(/[｜|/／>-]+/g, '')
      .replace(/^(中国|中华人民共和国)/, '');
    return text.replace(/(壮族自治区|回族自治区|维吾尔自治区|特别行政区|自治区|自治州|地区|省|市|盟|州|区|县|旗)$/g, '');
  }

  private parseLocation(input?: unknown) {
    const text = String(input ?? '').trim();
    if (!text) return { location: '', province_name: '', city_name: '', district_name: '', region_key: '' };

    const normalizedText = text.replace(/\s+/g, '').replace(/[｜|／>\-]+/g, '/').replace(/^(中国|中华人民共和国)/, '');
    const compactText = normalizedText.replace(/\//g, '').replace(/(.{2,})\1$/u, '$1');
    const specialKey = Object.keys(SPECIAL_REGION_MAP).sort((a, b) => b.length - a.length).find((key) => compactText.includes(key));
    const taiwanHasCity = /(?:台北|高雄|台中|台南|桃园)市?/.test(compactText);
    if (specialKey && !(specialKey.startsWith('台湾') && taiwanHasCity)) {
      const special = SPECIAL_REGION_MAP[specialKey];
      const districtMatch = compactText.match(/([一-龥]{2,12}(?:区|县|市|旗|新区|林区|特区))/);
      const districtName = districtMatch?.[1]
        && ![special.province, special.city].some((item) => this.compact(item) === this.compact(districtMatch[1]))
        ? districtMatch[1]
        : '';
      const regionKey = [this.compact(special.province), this.compact(special.city)].filter(Boolean).join('/');
      return { location: text, province_name: special.province, city_name: special.city, district_name: districtName, region_key: regionKey || this.compact(text) };
    }

    const municipality = compactText.match(/(北京|上海|天津|重庆)市?/);
    const province = compactText.match(/([一-龥]{2,12}?(?:省|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区))/);
    const provinceAlias = Object.keys(PROVINCE_ALIAS_MAP)
      .sort((a, b) => b.length - a.length)
      .find((name) => compactText.includes(name));
    const provinceOnly = Boolean(provinceAlias && compactText === PROVINCE_ALIAS_MAP[provinceAlias]);
    const cityMatches = provinceOnly ? [] : KNOWN_CITY_INDEX.filter((name) => compactText.includes(name));
    const knownCity = cityMatches.find((name) => name !== provinceAlias) || cityMatches[0];
    const cityKey = this.compact(knownCity || '');
    const inferredProvince = cityKey ? CITY_PROVINCE_INDEX[cityKey] : '';
    const explicitProvinceKey = this.compact(province?.[1]);
    const explicitProvince = Object.values(PROVINCE_ALIAS_MAP).find((item) => this.compact(item) === explicitProvinceKey) || '';
    // 城市索引比宽松正则更可靠。旧版前端曾生成“广东广州越秀省”，
    // 若直接相信“……省”正则，会把整段错误字符串当成省份并制造跨省预警。
    const provinceName = municipality
      ? (MUNICIPALITY_MAP[municipality[1]] || `${municipality[1]}市`)
      : inferredProvince || explicitProvince || (provinceAlias ? PROVINCE_ALIAS_MAP[provinceAlias] : '');
    const cityName = municipality
      ? (MUNICIPALITY_MAP[municipality[1]] || `${municipality[1]}市`)
      : knownCity ? (CITY_DISPLAY_INDEX[cityKey] || `${knownCity}市`) : '';

    let districtSource = compactText;
    for (const token of [provinceName, provinceAlias, cityName, knownCity]) {
      const normalizedToken = String(token || '').trim();
      if (normalizedToken) districtSource = districtSource.replace(new RegExp(normalizedToken, 'g'), '');
      const tokenCore = this.compact(normalizedToken);
      if (tokenCore) districtSource = districtSource.replace(new RegExp(tokenCore, 'g'), '');
    }
    districtSource = districtSource.replace(/^(省|市)+|(省|市)+$/g, '');
    const district = districtSource.match(/([一-龥]{2,12}?(?:区|县|市|旗|新区|林区|特区))/);
    const districtName = district?.[1] || '';
    const regionKey = [this.compact(provinceName), this.compact(cityName)].filter(Boolean).join('/');
    return { location: text, province_name: provinceName, city_name: cityName, district_name: districtName, region_key: regionKey || this.compact(text) };
  }

  /**
   * 对消费者端上送的 UAPI 位置再次做服务端归一化。
   * 兼容旧前端留下的“广东广州越秀省 / 广州市”等错误格式，避免不可信字段直入风控。
   */
  normalizeLocationParts(input: any = {}) {
    const rawLocation = safeText(input?.location || input?.ip_location || input?.address, 255) || '';
    const rawProvince = safeText(input?.province || input?.province_name || input?.ip_province, 128) || '';
    const rawCity = safeText(input?.city || input?.city_name || input?.ip_city, 128) || '';
    const rawDistrict = safeText(input?.district || input?.district_name || input?.ip_district, 128) || '';
    const combined = [rawProvince, rawCity, rawDistrict, rawLocation].filter(Boolean).join(' / ');
    const parsed = this.parseLocation(combined || rawLocation);
    const provinceName = parsed.province_name || '';
    const cityName = parsed.city_name || '';
    let districtName = parsed.district_name || '';
    const districtKey = this.compact(rawDistrict);
    const cityKey = this.compact(cityName);
    if (!districtName && rawDistrict && (!cityKey || districtKey !== cityKey)) {
      const cleanDistrict = String(rawDistrict).trim().replace(/(.{2,})\1$/u, '$1');
      districtName = /(区|县|市|旗|新区|林区|特区)$/.test(cleanDistrict) ? cleanDistrict : `${cleanDistrict}区`;
    }
    const location = [provinceName, cityName, districtName].filter(Boolean).join('') || rawLocation || combined;
    const regionKey = [this.compact(provinceName), this.compact(cityName)].filter(Boolean).join('/') || this.compact(location);
    return { location, province_name: provinceName, city_name: cityName, district_name: districtName, region_key: regionKey };
  }

  private isSameRegion(a: { province_name?: string; city_name?: string; location?: string }, b: { province_name?: string; city_name?: string; location?: string }) {
    const parsedA = (!a.province_name && !a.city_name && a.location) ? this.parseLocation(a.location) : a;
    const parsedB = (!b.province_name && !b.city_name && b.location) ? this.parseLocation(b.location) : b;
    const aProvince = this.compact(parsedA.province_name);
    const aCity = this.compact(parsedA.city_name);
    const aText = this.compact(parsedA.location);
    const bProvince = this.compact(parsedB.province_name);
    const bCity = this.compact(parsedB.city_name);
    const bText = this.compact(parsedB.location);

    if (!aProvince && !aCity && !aText) return true;

    if (aProvince) {
      if (!bProvince && !bText.includes(aProvince)) return false;
      if (bProvince && aProvince !== bProvince) return false;
    }

    if (aCity) {
      if (bCity) {
        if (aCity !== bCity) return false;
      } else if (bText) {
        const cityCompact = this.compact(a.city_name);
        if (!bText.includes(cityCompact)) return false;
      }
    }

    return true;
  }

  private hasRegion(region: { province_name?: string; city_name?: string; location?: string }) {
    return Boolean(this.compact(region.province_name) || this.compact(region.city_name) || this.compact(region.location) || this.compact((region as any).region_group));
  }

  private regionMatchLevel(region: any = {}) {
    const raw = String(region?.match_level || region?.matchLevel || region?.authorized_scope || region?.authorization_scope || '').trim().toLowerCase();
    if (['province', 'province_only', 'province-level', 'province_level', '省', '省级', '省级授权'].includes(raw)) return 'province';
    if (['city', 'city_only', 'city-level', 'city_level', '市', '市级', '城市', '城市级'].includes(raw)) return 'city';
    return this.compact(region?.city_name) ? 'city' : this.compact(region?.province_name) ? 'province' : 'none';
  }

  private isSameAuthorizedScanRegion(authorized: any = {}, actual: any = {}) {
    const matchLevel = this.regionMatchLevel(authorized);
    if (matchLevel === 'province') {
      const parsedA = (!authorized.province_name && !authorized.city_name && authorized.location) ? this.parseLocation(authorized.location) : authorized;
      const parsedB = (!actual.province_name && !actual.city_name && actual.location) ? this.parseLocation(actual.location) : actual;
      const aProvince = this.compact(parsedA.province_name);
      const bProvince = this.compact(parsedB.province_name);
      const bText = this.compact(parsedB.location);
      if (!aProvince) return this.isSameRegion(authorized, actual);
      return Boolean((bProvince && aProvince === bProvince) || (!bProvince && bText.includes(aProvince)));
    }
    return this.isSameRegion(authorized, actual);
  }

  private async agentProvinceScopedRegion(region: any = {}, agentId?: unknown) {
    const id = Number(agentId ?? region?.agent_id ?? 0);
    if (!Number.isInteger(id) || id <= 0) return region;
    const agent = await this.prisma.agent.findUnique({
      where: { id },
      select: { province: true, city: true, agent_name: true, agent_code: true },
    }).catch(() => null);
    if (!agent || (!agent.province && !agent.city)) return region;
    const agentRegion = { province_name: agent.province || '', city_name: agent.city || '', location: [agent.province, agent.city].filter(Boolean).join('') };
    if (!this.isSameRegion(agentRegion, region)) return region;
    return {
      ...region,
      agent_name: region.agent_name || agent.agent_name || agent.agent_code || '',
      match_level: 'province',
      authorized_scope: 'agent_province',
      agent_location: [agent.province, agent.city].filter(Boolean).join(' / '),
    };
  }

  private shipmentDecisionRegion(shipment: any = {}, agent: any = null, fallbackLocation?: unknown) {
    const isDestinationSnapshot = shipment?.authorization_source === 'shipment_destination_agent';
    const agentRegion = safeText(Array.from(new Set([agent?.province, agent?.city, agent?.district]
      .map((item) => safeText(item, 64) || '')
      .filter(Boolean)))
      .join(''), 255);
    const destinationText = safeText(
      isDestinationSnapshot
        ? shipment?.authorization_address || shipment?.region_group || agentRegion
        : agentRegion || shipment?.authorization_address || shipment?.receiver_address || fallbackLocation || shipment?.sender_address,
      255,
    );
    const parsedDestination = this.parseLocation(destinationText);
    const provinceName = safeText((isDestinationSnapshot ? shipment?.province_name : '') || agent?.province || parsedDestination.province_name, 64);
    const cityName = safeText((isDestinationSnapshot ? shipment?.city_name : '') || agent?.city || parsedDestination.city_name, 64);
    const districtName = safeText(
      (isDestinationSnapshot ? parsedDestination.district_name : '') || agent?.district || parsedDestination.district_name,
      64,
    );
    const location = safeText([provinceName, cityName].filter(Boolean).join(' / ') || parsedDestination.location || destinationText, 255);
    const regionKey = [this.compact(provinceName), this.compact(cityName)].filter(Boolean).join('/');
    return {
      location,
      province_name: provinceName,
      city_name: cityName,
      district_name: districtName,
      region_key: regionKey || this.compact(location),
      destination_address: destinationText,
      basis: provinceName || cityName ? 'shipment_destination_agent' : 'shipment_destination_agent_unresolved',
    };
  }

  private normalizeRegion(input: any = {}) {
    const parsed = (!input?.province_name && !input?.city_name && (input?.location || input?.actual_location || input?.authorized_region))
      ? this.parseLocation(input.location || input.actual_location || input.authorized_region)
      : null;
    const provinceName = safeText(input?.province_name || input?.province || input?.actual_province || input?.authorized_province || parsed?.province_name, 64);
    const cityName = safeText(input?.city_name || input?.city || input?.actual_city || input?.authorized_city || parsed?.city_name, 64);
    const location = safeText(input?.location || input?.actual_location || input?.authorized_region || parsed?.location || [provinceName, cityName].filter(Boolean).join(' / '), 255);
    const regionKey = [this.compact(provinceName), this.compact(cityName)].filter(Boolean).join('/');
    return { location, province_name: provinceName, city_name: cityName, region_key: regionKey || this.compact(location) };
  }

  private displayRegion(region: { province_name?: string; city_name?: string; district_name?: string; location?: string; region_key?: string }) {
    return [region.province_name, region.city_name, region.district_name].filter(Boolean).join(' / ') || safeText(region.location || region.region_key, 255) || '';
  }

  private authorizedRegion(source: any = {}, fallback: any = {}) {
    const regionGroup = safeText(source?.region_group || fallback?.region_group, 128);
    const parsedGroup = regionGroup ? this.parseLocation(regionGroup) : { province_name: '', city_name: '', location: '' };
    const parsedSource = (!source?.province_name && !source?.city_name && (source?.location || source?.address || source?.receiver_address))
      ? this.parseLocation(source.location || source.address || source.receiver_address)
      : { province_name: '', city_name: '', location: '' };
    const provinceName = safeText(source?.province_name || fallback?.province_name || parsedGroup.province_name || parsedSource.province_name, 64);
    const cityName = safeText(source?.city_name || fallback?.city_name || parsedGroup.city_name || parsedSource.city_name, 64);
    const location = safeText(source?.location || fallback?.location || parsedGroup.location || parsedSource.location || [provinceName, cityName].filter(Boolean).join(''), 128);
    return {
      province_name: provinceName,
      city_name: cityName,
      location,
      region_group: regionGroup || safeText([provinceName, cityName].filter(Boolean).join(' / ') || parsedGroup.location, 128),
      agent_id: source?.agent_id ?? fallback?.agent_id ?? null,
      agent_name: safeText(source?.agent_name ?? fallback?.agent_name, 128),
      company_name: safeText(source?.company_name ?? fallback?.company_name, 128),
      distributor: safeText(source?.distributor ?? fallback?.distributor, 128),
      warehouse: safeText(source?.warehouse ?? fallback?.warehouse, 128),
    };
  }

  private responsibleParty(source: any = {}, authorized: any = {}, extra: Record<string, any> = {}) {
    const agentId = authorized?.agent_id ?? source?.agent_id ?? extra.agent_id ?? null;
    const name = safeText(authorized?.agent_name || source?.agent_name || extra.agent_name || authorized?.distributor || source?.distributor || source?.company_name || source?.manufacturer, 128);
    const distributor = safeText(authorized?.distributor || source?.distributor || extra.distributor, 128);
    const companyName = safeText(source?.company_name || source?.manufacturer || extra.company_name, 128);
    return {
      agent_id: agentId ? Number(agentId) : null,
      name: name || distributor || companyName || '',
      distributor,
      company_name: companyName,
      warehouse: safeText(authorized?.warehouse || source?.warehouse || extra.warehouse, 128),
      product_code: safeText(source?.product_code || extra.product_code, 64),
      product_name: safeText(source?.product_name || extra.product_name, 128),
      source: safeText(authorized?.source || extra.source, 80),
      shipment_id: authorized?.shipment_id ?? extra.shipment_id ?? null,
      shipment_no: safeText(authorized?.shipment_no || extra.shipment_no, 128),
    };
  }

  private async resolveBoxForScan(ctx: ScanContext) {
    if (ctx.box?.id) return ctx.box;
    const boxId = Number(ctx.anti_fake_code?.box_id ?? 0);
    if (Number.isInteger(boxId) && boxId > 0) {
      const byId = await this.prisma.box.findUnique({ where: { id: boxId } }).catch(() => null);
      if (byId) return byId;
    }
    const boxNo = safeText(ctx.anti_fake_code?.box_no || ctx.box?.box_no, 128);
    if (boxNo) return this.prisma.box.findFirst({ where: { box_no: boxNo } }).catch(() => null);
    return null;
  }

  private async latestShipmentForScan(ctx: ScanContext) {
    const box = await this.resolveBoxForScan(ctx);
    const boxId = Number(box?.id ?? ctx.anti_fake_code?.box_id ?? 0);
    if (!Number.isInteger(boxId) || boxId <= 0) return null;
    try {
      const rows = await this.prisma.$queryRaw<any[]>`SELECT * FROM shipments WHERE status >= 1 AND JSON_CONTAINS(box_ids, ${JSON.stringify(boxId)}) ORDER BY updated_at DESC, id DESC LIMIT 1`;
      if (rows?.[0]) return rows[0];
    } catch {
      this.logger.warn('JSON_CONTAINS query failed for shipments, falling back to app-level filter');
    }
    const rows = await this.prisma.shipment.findMany({ orderBy: { id: 'desc' }, take: 500 }).catch(() => []);
    return rows.find((shipment: any) => Number(shipment.status || 0) >= 1
      && safeJsonArray(shipment.box_ids).map((item: any) => Number(item)).includes(boxId)) || null;
  }

  private async productChannelBindingForScan(ctx: ScanContext, box?: any) {
    const source = ctx.anti_fake_code || box || ctx.box || {};
    const candidates: Array<{ source: string; sql: string; params: unknown[] }> = [];
    const code = safeText(source.code || ctx.code, 128);
    const boxNo = safeText(source.box_no || box?.box_no || ctx.box?.box_no, 128);
    const batchNo = safeText(source.batch_no || box?.batch_no, 64);
    const productId = Number(source.product_id || box?.product_id || ctx.product?.id || 0);
    const productCode = safeText(source.product_code || box?.product_code || ctx.product?.product_code, 64);

    if (code) candidates.push({ source: 'product_channel_binding:code', sql: '`code` = ?', params: [code] });
    if (boxNo) candidates.push({ source: 'product_channel_binding:box', sql: '`box_no` = ?', params: [boxNo] });
    if (batchNo) candidates.push({ source: 'product_channel_binding:batch', sql: '`batch_no` = ?', params: [batchNo] });
    if (Number.isInteger(productId) && productId > 0) candidates.push({ source: 'product_channel_binding:product_id', sql: '`product_id` = ?', params: [productId] });
    if (productCode) candidates.push({ source: 'product_channel_binding:product_code', sql: '`product_code` = ?', params: [productCode] });

    for (const item of candidates) {
      const rows = await this.prisma.$queryRawUnsafe(
        `SELECT * FROM product_channel_bindings WHERE status = 1 AND (${item.sql}) ORDER BY updated_at DESC, id DESC LIMIT 1`,
        ...item.params,
      ).catch(() => []) as any[];
      if (rows?.[0]) return { ...rows[0], __source: item.source };
    }
    return null;
  }

  private async channelAuthorizationForAgent(agentId?: number | null) {
    const id = Number(agentId || 0);
    if (!Number.isInteger(id) || id <= 0) return null;
    const rows = await this.prisma.$queryRawUnsafe(
      `SELECT * FROM channel_authorizations
       WHERE status = 1
         AND agent_id = ?
         AND (approval_status IS NULL OR approval_status IN ('active', 'approved', '启用', '已批准'))
         AND (valid_from IS NULL OR valid_from <= CURRENT_DATE())
         AND (valid_to IS NULL OR valid_to >= CURRENT_DATE())
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
      id,
    ).catch(() => []) as any[];
    return rows?.[0] ? { ...rows[0], __source: 'channel_authorization' } : null;
  }

  private isCodeAntiChannelingEnabled(code: any) {
    const value = code?.anti_channeling_enabled;
    if (value === undefined || value === null || value === '') return true;
    if (typeof value === 'boolean') return value;
    return !['0', 'false', 'no', 'off', '关闭', '停用'].includes(String(value).trim().toLowerCase());
  }

  private async authorizedRegionForScan(ctx: ScanContext) {
    if (ctx.authorization_decision?.authorized) return ctx.authorization_decision.authorized;
    const box = await this.resolveBoxForScan(ctx);
    if (!box) {
      return {
        province_name: '',
        city_name: '',
        location: '',
        region_group: '',
        match_level: 'none',
        authorized_scope: 'not_required_before_shipment',
        source: 'not_required_before_shipment',
      };
    }

    const shipment = await this.latestShipmentForScan({ ...ctx, box: box || ctx.box });
    const shipmentAgent = shipment?.agent_id
      ? await this.prisma.agent.findUnique({ where: { id: Number(shipment.agent_id) } }).catch(() => null)
      : null;

    // 只有已出库/已发货的发货单才形成防伪码授权位置；草稿发货单不参与判定。
    if (shipment) {
      const shipmentAuthorization = this.shipmentDecisionRegion(shipment, shipmentAgent);
      const distributorName = safeText(shipment.distributor || shipmentAgent?.agent_name || shipmentAgent?.agent_code || shipment.receiver, 128);
      const hasShipmentRegion = Boolean(shipmentAuthorization.province_name || shipmentAuthorization.city_name);
      return {
        province_name: shipmentAuthorization.province_name,
        city_name: shipmentAuthorization.city_name,
        location: shipmentAuthorization.location,
        region_group: this.displayRegion(shipmentAuthorization),
        agent_id: Number(shipment.agent_id) || null,
        agent_name: distributorName,
        distributor: distributorName,
        shipment_id: shipment.id,
        shipment_no: shipment.shipment_no,
        shipment_receiver_address: shipment.receiver_address,
        shipment_authorization_address: shipmentAuthorization.destination_address || null,
        shipment_authorization_basis: shipmentAuthorization.basis,
        match_level: hasShipmentRegion ? (shipmentAuthorization.city_name ? 'city' : 'province') : 'none',
        authorized_scope: hasShipmentRegion ? 'shipment_destination_agent' : 'shipment_destination_agent_unresolved',
        source: hasShipmentRegion ? 'shipment_destination_agent' : 'shipment_destination_agent_unresolved',
      };
    }

    // 装箱地点只用于业务流转记录，不能在发货前形成防伪码授权位置。
    return {
      province_name: '',
      city_name: '',
      location: '',
      region_group: '',
      box_id: box.id,
      box_no: box.box_no,
      match_level: 'none',
      authorized_scope: 'not_required_before_shipment',
      source: 'not_required_before_shipment',
    };
  }

  async resolveCodeAuthorization(ctx: ScanContext) {
    if (ctx.authorization_decision) return ctx.authorization_decision;
    const code = ctx.anti_fake_code;
    const enabled = Boolean(code && this.isCodeAntiChannelingEnabled(code));

    // 防窜校验关闭：直接授予访问权限，无需验证位置
    if (!enabled) {
      const decision = {
        enabled: false,
        required: false,
        state: code ? 'disabled' : 'not_applicable',
        status: 'not_required',
        content_access_granted: true,
        authorized: null,
      };
      ctx.authorization_decision = decision;
      return decision;
    }

    // 防窜校验开启但尚未发货：直接授予访问权限，不验证位置。
    const box = await this.resolveBoxForScan(ctx);
    if (!box) {
      const decision = {
        enabled: true,
        required: false,
        state: 'unboxed',
        status: 'not_required',
        content_access_granted: true,
        authorized: null,
      };
      ctx.authorization_decision = decision;
      return decision;
    }

    const authorized: any = await this.authorizedRegionForScan({ ...ctx, box });
    if (!authorized.shipment_id) {
      const decision = {
        enabled: true,
        required: false,
        state: 'boxed',
        status: 'not_required',
        content_access_granted: true,
        authorized: null,
      };
      ctx.authorization_decision = decision;
      return decision;
    }

    // 发货后才使用发货单所选收件代理商的位置进行防窜授权校验。
    const authorizationResolved = Boolean(authorized.province_name || authorized.city_name);
    const locationSource = String(ctx.location_source || '').trim().toLowerCase();
    const locationVerified = ctx.location_verified === true
      && TRUSTED_SCAN_GEO_SOURCES.has(locationSource)
      && Boolean(String(ctx.province || '').trim() && String(ctx.city || '').trim());
    const actual = this.normalizeRegion({
      location: ctx.location,
      province_name: ctx.province,
      city_name: ctx.city,
    });
    const matches = authorizationResolved && locationVerified
      ? this.isSameAuthorizedScanRegion(authorized, actual)
      : false;
    const status = !authorizationResolved
      ? 'authorization_unresolved'
      : !locationVerified
        ? 'location_unverified'
        : matches
          ? 'matched'
          : 'mismatch';
    const decision = {
      enabled: true,
      required: true,
      state: 'shipped',
      status,
      content_access_granted: matches,
      authorization_resolved: authorizationResolved,
      location_verified: locationVerified,
      matches,
      authorized,
      actual,
    };
    ctx.authorization_decision = decision;
    return decision;
  }

  /**
   * 对消费者验证页和后台详情暴露当前编码的授权归属。
   * 有发货单时返回收件代理商所属地区对应的授权地区；制造商字段仅用于产品身份展示。
   */
  async resolveShipmentAuthorization(ctx: ScanContext) {
    const decision = await this.resolveCodeAuthorization(ctx);
    if (!decision.required || !decision.authorized) return null;
    const authorized: any = decision.authorized;
    const region = this.displayRegion(authorized);
    const labelMap: Record<string, string> = {
      shipment_destination_agent: '收货代理商所属地区',
      shipment_destination_agent_unresolved: '收货代理商所属地区未配置',
      shipment_sender_location: '发货位置',
      shipment_sender_location_unresolved: '发货位置未解析',
    };
    const hasAgent = Number(authorized.agent_id || 0) > 0;
    return {
      agent_id: authorized.agent_id ?? null,
      agent_name: hasAgent ? safeText(authorized.agent_name || authorized.distributor, 128) || null : null,
      distributor: safeText(authorized.distributor || authorized.agent_name, 128) || null,
      company_name: safeText(authorized.company_name, 128) || null,
      authorized_region: region || null,
      province_name: authorized.province_name || null,
      city_name: authorized.city_name || null,
      shipment_id: authorized.shipment_id ?? null,
      shipment_no: authorized.shipment_no || null,
      source: authorized.source || 'none',
      source_label: labelMap[authorized.source] || '未形成防窜授权位置',
      authorization_basis: authorized.shipment_authorization_basis || authorized.authorized_scope || null,
      authorization_state: decision.state,
      authorization_status: decision.status,
    };
  }

  private async getRule(ruleCode: RuleCode) {
    const defaults = DEFAULT_RULES[ruleCode];
    if (!defaults) return null;

    const cacheKey = `${RULE_CACHE_PREFIX}${ruleCode}`;
    if (this.redis) {
      try {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object') return { ...defaults, ...parsed };
        }
      } catch {}
    }

    const table = this.delegate('antiChannelingRule');
    if (!table) return defaults;
    try {
      const row = await table.findUnique({ where: { rule_code: ruleCode } });
      const merged = row ? { ...defaults, ...row, notify_channels: safeJsonArray(row.notify_channels).length ? safeJsonArray(row.notify_channels) : defaults.notify_channels } : defaults;
      if (this.redis) {
        this.redis.set(cacheKey, JSON.stringify(merged), 'EX', RULE_CACHE_TTL).catch(() => undefined);
      }
      return merged;
    } catch {
      return defaults;
    }
  }

  private async clearRuleCache(ruleCode: RuleCode) {
    if (this.redis) {
      await this.redis.del(`${RULE_CACHE_PREFIX}${ruleCode}`).catch(() => undefined);
    }
  }

  async listRules() {
    const table = this.delegate('antiChannelingRule');
    if (!table) return { list: Object.values(DEFAULT_RULES) };
    let rows: any[] = [];
    try {
      rows = await table.findMany({ orderBy: [{ id: 'asc' }] });
    } catch {
      rows = [];
    }
    const byCode = new Map(rows.map((item: any) => [item.rule_code, item]));
    const list = (Object.keys(DEFAULT_RULES) as RuleCode[]).map((code) => ({
      ...DEFAULT_RULES[code],
      ...(byCode.get(code) || {}),
    }));
    const extras = rows.filter((item: any) => !DEFAULT_RULES[item.rule_code as RuleCode]);
    return { list: [...list, ...extras] };
  }

  async updateRule(idOrCode: string | number, data: Record<string, any>) {
    const table = this.delegate('antiChannelingRule');
    if (!table) throw new BadRequestException('防窜规则表未初始化，请先执行数据库迁移');
    const where = Number.isFinite(Number(idOrCode)) ? { id: safeId(idOrCode) } : { rule_code: String(idOrCode) };
    const current = await table.findFirst({ where }).catch(() => null);
    if (!current) throw new NotFoundException('防窜规则不存在');
    const payload: Record<string, any> = {};
    if (data.rule_name !== undefined) payload.rule_name = safeText(data.rule_name, 128);
    if (data.enabled !== undefined) payload.enabled = Boolean(data.enabled);
    if (data.severity !== undefined) payload.severity = Math.min(Math.max(Number(data.severity) || 1, 1), 5);
    if (data.threshold !== undefined) payload.threshold = Math.max(Number(data.threshold) || 1, 1);
    if (data.window_seconds !== undefined) payload.window_seconds = Math.max(Number(data.window_seconds) || 60, 10);
    if (data.notify_channels !== undefined) payload.notify_channels = safeJsonArray(data.notify_channels).map((item: any) => String(item));
    if (data.config !== undefined) payload.config = typeof data.config === 'string' ? JSON.parse(data.config || '{}') : data.config;
    if (data.description !== undefined) payload.description = safeText(data.description, 255);
    const updated = await table.update({ where: { id: current.id }, data: payload });
    await this.clearRuleCache(current.rule_code as RuleCode);
    return updated;
  }

  private alertNo() {
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    return `AC${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  private riskTitle(type: RuleCode, data: Record<string, any>) {
    const titles: Record<RuleCode, string> = {
      geo_mismatch: '扫码位置与授权区域不符',
      location_unverified: '扫码位置未完成可信核验',
      same_code_multi_region: '同一编码短时间异地扫码',
      ip_high_frequency: '同一 IP 短时高频扫码',
      device_risk: '越狱/Root/自动化设备访问',
      shipment_region_mismatch: '经销商跨区域调拨/出库位置异常',
      fake_code_scan: '无效码/假码扫码',
      agent_cross_boundary: '同一代理商多区域授权码集中异常扫码',
      code_trajectory_anomaly: '编码轨迹异常跳跃',
    };
    const code = data.code || data.box_no || data.shipment_no;
    return `${titles[type]}${code ? `：${code}` : ''}`;
  }

  private notificationReceivers(alert: any, rule: any) {
    const configured = safeJsonArray(rule?.config?.receivers).map((item: any) => String(item).trim()).filter(Boolean);
    const envReceivers = String(this.config.get('ANTI_CHANNELING_NOTIFY_RECEIVERS') || '')
      .split(/[，,;；\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const defaults = ['enterprise_auditor', 'region_manager'];
    if (alert?.agent_id || alert?.agent_name) defaults.push(`dealer:${alert.agent_id || alert.agent_name}`);
    return Array.from(new Set([...(configured.length ? configured : defaults), ...envReceivers]));
  }

  private async createNotifications(alert: any, rule: any) {
    const table = this.delegate('antiChannelingNotification');
    if (!table || !alert?.id) return [];
    const channels = safeJsonArray(rule?.notify_channels).length ? safeJsonArray(rule.notify_channels) : ['system'];
    const receivers = this.notificationReceivers(alert, rule);
    const rows: any[] = [];
    for (const channel of channels) {
      for (const receiver of receivers) {
        const channelName = String(channel);
        rows.push({
          alert_id: alert.id,
          channel: channelName,
          receiver: String(receiver),
          target: String(receiver),
          status: channelName === 'system' ? 1 : 0,
          payload: {
            alert_no: alert.alert_no,
            title: alert.title,
            alert_type: alert.alert_type,
            severity: alert.severity,
            code: alert.code,
            box_no: alert.box_no,
            shipment_no: alert.shipment_no,
            scan_time: alert.scan_time,
            actual_location: alert.actual_location,
            authorized_region: alert.authorized_region,
            agent_id: alert.agent_id,
            agent_name: alert.agent_name,
          },
          sent_at: channelName === 'system' ? new Date() : null,
        });
      }
    }
    if (!rows.length) return [];

    try {
      await table.createMany({ data: rows });
    } catch {
      this.logger.warn('Batch notification creation failed, falling back to sequential');
      let created = 0;
      for (const row of rows) {
        await table.create({ data: row }).catch(() => undefined);
        created += 1;
      }
      if (created === 0) {
        this.logger.error(`All notification creations failed for alert ${alert.id}`);
      }
    }

    await this.sendWebhookNotifications(alert, rule, rows).catch(() => undefined);
    return rows;
  }

  private async sendWebhookNotifications(alert: any, rule: any, rows: any[]) {
    const webhookUrl = this.config.get('ANTI_CHANNELING_WEBHOOK_URL');
    if (!webhookUrl) return;

    const dingtalkEnabled = Boolean(this.config.get('ANTI_CHANNELING_DINGTALK_ENABLED'));
    const wecomEnabled = Boolean(this.config.get('ANTI_CHANNELING_WECOM_ENABLED'));

    if (!dingtalkEnabled && !wecomEnabled) return;

    const title = alert.title || '防窜预警';
    const text = [
      `## ${title}`,
      `> 预警编号：${alert.alert_no}`,
      `> 严重级别：${['', '低', '中', '高', '严重', '紧急'][alert.severity] || '中'}`,
      `> 类型：${alert.alert_type}`,
      alert.code ? `> 编码：${alert.code}` : '',
      alert.box_no ? `> 箱号：${alert.box_no}` : '',
      alert.shipment_no ? `> 发货单号：${alert.shipment_no}` : '',
      alert.authorized_region ? `> 授权区域：${alert.authorized_region}` : '',
      alert.actual_location ? `> 异常位置：${alert.actual_location}` : '',
      alert.agent_name ? `> 经销商：${alert.agent_name}` : '',
      alert.ip ? `> IP：${alert.ip}` : '',
      `> 时间：${new Date().toLocaleString('zh-CN')}`,
    ].filter(Boolean).join('\n');

    const message = {
      msgtype: dingtalkEnabled ? 'markdown' : 'text',
      markdown: dingtalkEnabled ? { title, text } : undefined,
      text: wecomEnabled ? { content: text.replace(/#/g, '').replace(/>/g, '') } : undefined,
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new Error(`webhook responded ${response.status}`);
      }
      this.logger.log(`Webhook notification sent for alert ${alert.alert_no}`);
    } catch (err: any) {
      this.logger.warn(`Webhook notification failed for alert ${alert.alert_no}: ${err?.message || err}`);
    }
  }

  private async recordRiskEvent(alert: any, action = 'alert_created') {
    const table = this.delegate('riskEvent');
    if (!table || !alert?.id) return null;
    return table.create({
      data: {
        event_type: `anti_channeling_${action}`,
        code: alert.code || alert.box_no || alert.shipment_no || null,
        ip: alert.ip || null,
        device_id: alert.device_id || null,
        reason: alert.title || alert.alert_type,
        payload: {
          alert_id: alert.id,
          alert_no: alert.alert_no,
          alert_type: alert.alert_type,
          severity: alert.severity,
          status: alert.status,
          actual_location: alert.actual_location,
          authorized_region: alert.authorized_region,
          evidence: alert.evidence,
        },
        status: 0,
      },
    }).catch((err: any) => { this.logger.warn(`RiskEvent creation failed: ${err?.message || err}`); return null; });
  }

  private async upsertAlert(type: RuleCode, data: Record<string, any>) {
    const rule = await this.getRule(type);
    if (!rule || rule?.enabled === false || Number(rule?.status ?? 1) === 0) return null;
    const table = this.delegate('antiChannelingAlert');
    if (!table) return null;
    const now = new Date();

    const rawAlertCode = safeText(data.code, 128) || '';
    const normalized: Record<string, any> = {
      alert_type: type,
      severity: Number(data.severity || rule.severity || 2),
      title: data.title || this.riskTitle(type, data),
      code: rawAlertCode ? this.codeVault.reference(rawAlertCode) : null,
      box_no: safeText(data.box_no, 128) || null,
      shipment_no: safeText(data.shipment_no, 128) || null,
      product_id: data.product_id ? Number(data.product_id) : null,
      product_code: safeText(data.product_code, 64) || null,
      product_name: safeText(data.product_name, 128) || null,
      agent_id: data.agent_id ? Number(data.agent_id) : null,
      agent_name: safeText(data.agent_name, 128) || null,
      authorized_region: safeText(data.authorized_region, 255) || null,
      authorized_province: safeText(data.authorized_province, 64) || null,
      authorized_city: safeText(data.authorized_city, 64) || null,
      actual_location: safeText(data.actual_location, 255) || null,
      actual_province: safeText(data.actual_province, 64) || null,
      actual_city: safeText(data.actual_city, 64) || null,
      ip: safeText(data.ip, 64) || null,
      device_id: safeText(data.device_id, 128) || null,
      user_agent: safeText(data.user_agent, 512) || null,
      scan_time: data.scan_time ? new Date(data.scan_time) : now,
      first_seen_at: data.first_seen_at ? new Date(data.first_seen_at) : now,
      last_seen_at: now,
      evidence: this.sanitizeRiskCodePayload(data.evidence || {}, rawAlertCode),
      notification_channels: safeJsonArray(rule.notify_channels).length ? safeJsonArray(rule.notify_channels) : ['system'],
      status: 0,
      remark: safeText(data.remark, 255) || null,
    };

    // Escalation: check how many times this code has been alerted and escalate severity
    const escalationThreshold = Number(rule?.config?.escalation_threshold ?? 3);
    if (normalized.code && escalationThreshold > 0) {
      const existingCount = await table.count({
        where: { code: normalized.code, alert_type: type, status: { lt: 3 } },
      }).catch(() => 0);
      if (existingCount >= escalationThreshold) {
        normalized.severity = Math.min(5, normalized.severity + 1);
        normalized.evidence = { ...(normalized.evidence || {}), escalated: true, escalation_reason: `同一编码已触发 ${existingCount} 次同类预警，严重级别已提升` };
      }
    }

    const recentSince = new Date(now.getTime() - Math.max(Number(rule.window_seconds || 3600), 300) * 1000);
    const duplicateWhere: any = {
      alert_type: type,
      status: { lt: 3 },
      last_seen_at: { gte: recentSince },
      ...(normalized.code ? { code: normalized.code } : normalized.shipment_no ? { shipment_no: normalized.shipment_no } : {}),
    };
    if (!duplicateWhere.code && !duplicateWhere.shipment_no) delete duplicateWhere.last_seen_at;

    const existed = (duplicateWhere.code || duplicateWhere.shipment_no)
      ? await table.findFirst({ where: duplicateWhere, orderBy: { id: 'desc' } }).catch(() => null)
      : null;

    if (existed) {
      const repeatCount = (Number(existed.evidence?.repeat_count ?? 0) + 1);
      const updated = await table.update({
        where: { id: existed.id },
        data: {
          last_seen_at: now,
          title: normalized.title || existed.title,
          severity: repeatCount >= escalationThreshold ? Math.min(5, Math.max(Number(existed.severity || 1), Number(normalized.severity || 1))) : Math.max(Number(existed.severity || 1), Number(normalized.severity || 1)),
          product_id: normalized.product_id || existed.product_id,
          product_code: normalized.product_code || existed.product_code,
          product_name: normalized.product_name || existed.product_name,
          agent_id: normalized.agent_id || existed.agent_id,
          agent_name: normalized.agent_name || existed.agent_name,
          authorized_region: normalized.authorized_region || existed.authorized_region,
          authorized_province: normalized.authorized_province || existed.authorized_province,
          authorized_city: normalized.authorized_city || existed.authorized_city,
          actual_location: normalized.actual_location || existed.actual_location,
          actual_province: normalized.actual_province || existed.actual_province,
          actual_city: normalized.actual_city || existed.actual_city,
          ip: normalized.ip || existed.ip,
          device_id: normalized.device_id || existed.device_id,
          user_agent: normalized.user_agent || existed.user_agent,
          scan_time: normalized.scan_time || existed.scan_time,
          evidence: { ...(existed.evidence || {}), latest: normalized.evidence, repeated_at: now.toISOString(), repeat_count: repeatCount },
        },
      });
      await this.recordRiskEvent(updated, 'alert_repeated').catch(() => undefined);
      return updated;
    }

    const alert = await table.create({ data: { ...normalized, alert_no: this.alertNo() } }).catch((err: any) => {
      this.logger.error(`Failed to create alert: ${err?.message || err}`);
      return null;
    });
    if (!alert) return null;

    await this.createNotifications(alert, rule).catch(() => undefined);
    await this.recordRiskEvent(alert, 'alert_created').catch(() => undefined);
    return alert;
  }

  private async queryRecentLocations(code: string, windowSeconds: number) {
    const since = new Date(Date.now() - Math.max(windowSeconds, 60) * 1000);
    const codeRef = this.codeVault.reference(code);
    const rows = await this.prisma.queryLog.findMany({
      where: { code: { in: [codeRef, code] }, location_verified: true, created_at: { gte: since } },
      orderBy: { created_at: 'desc' },
      take: 60,
    }).catch(() => []);
    const regions = rows
      .map((row: any) => ({ row, parsed: this.parseLocation(row.location) }))
      // 城市级“同码异地”只能使用完整省市证据。旧日志中的省级残片或
      // 错误复合省名不应被当成一个独立城市，否则一次刷新就可能误报。
      .filter((item: any) => item.parsed.province_name && item.parsed.city_name && item.parsed.region_key);
    const map = new Map<string, any>();
    for (const item of regions) {
      const key = item.parsed.region_key;
      if (!map.has(key)) map.set(key, item);
    }
    return Array.from(map.values());
  }

  private async evaluateLocationEvidence(ctx: ScanContext) {
    const source = ctx.anti_fake_code || ctx.box || ctx.product;
    if (!source) return null;

    // 只对开启防窜校验且已发货的防伪码进行位置证据评估。
    const code = ctx.anti_fake_code;
    if (!code) return null;
    const enabled = Boolean(code && this.isCodeAntiChannelingEnabled(code));
    if (!enabled) return null;

    const box = await this.resolveBoxForScan(ctx);
    if (!box) return null;

    const authorized: any = await this.authorizedRegionForScan(ctx);
    const locationSource = String(ctx.location_source || '').trim().toLowerCase();
    if (!authorized.province_name && !authorized.city_name) {
      const unresolvedSources = ['shipment_destination_agent_unresolved', 'shipment_sender_location_unresolved'];
      if (!source || !unresolvedSources.includes(String(authorized.source || ''))) return null;
      const actual = this.parseLocation(ctx.location);
      const actualLocation = safeText(
        ctx.location || [ctx.province, ctx.city].filter(Boolean).join(' / ') || '未取得可信扫码位置',
        255,
      );
      const responsibleParty = this.responsibleParty(source, authorized, { product_code: ctx.product?.product_code, product_name: ctx.product?.product_name });
      return this.upsertAlert('location_unverified', {
        code: ctx.anti_fake_code?.code || ctx.code,
        box_no: ctx.anti_fake_code?.box_no || ctx.box?.box_no,
        product_id: source.product_id ?? null,
        product_code: source.product_code || ctx.product?.product_code || null,
        product_name: source.product_name || ctx.product?.product_name || null,
        agent_id: responsibleParty.agent_id || authorized.agent_id,
        agent_name: responsibleParty.name || authorized.agent_name,
        authorized_region: '授权位置未解析',
        actual_location: actualLocation || null,
        actual_province: ctx.province || actual.province_name || null,
        actual_city: ctx.city || actual.city_name || null,
        ip: ctx.ip,
        device_id: ctx.device_id,
        user_agent: ctx.userAgent,
        evidence: {
          rule: '当前等级授权位置未完成省市解析',
          reason: '已发货防伪码按收货代理商所属地区授权；当前代理商档案缺少可识别省市。',
          shipment_no: authorized.shipment_no || null,
          shipment_sender_address: authorized.shipment_sender_address || null,
          authorized_source: authorized.source,
          location_source: ctx.location_source,
          adcode: ctx.adcode,
          rectangle: ctx.rectangle,
          bounds: ctx.bounds,
        },
      });
    }

    const hasResolvedNetworkRegion = ctx.location_verified === true && TRUSTED_SCAN_GEO_SOURCES.has(locationSource)
      && Boolean(String(ctx.province || '').trim() && String(ctx.city || '').trim());
    const accuracy = Number(ctx.accuracy);
    const hasPoorGpsAccuracy = Number.isFinite(accuracy) && accuracy > 5_000;

    // 公网 IP 省市无需浏览器位置权限，可直接完成产品授权地区核验。
    if (hasResolvedNetworkRegion && !hasPoorGpsAccuracy) return null;

    const actual = this.parseLocation(ctx.location);
    const actualLocation = safeText(
      ctx.location
      || [ctx.province, ctx.city].filter(Boolean).join(' / ')
      || '未取得可信扫码位置',
      255,
    );
    const responsibleParty = this.responsibleParty(source, authorized, { product_code: ctx.product?.product_code, product_name: ctx.product?.product_name });
    const reason = hasPoorGpsAccuracy
      ? `浏览器 GPS 精度过低（约 ${Math.round(accuracy)} 米）`
      : locationSource === 'browser_gps'
        ? '浏览器 GPS 属于客户端自报位置，仅作为辅助信息'
        : locationSource === 'manual_or_url'
        ? '位置来自二维码参数或手动填写，不能作为正常授权依据'
        : locationSource === 'uapi_network_myip'
          ? 'IP 地区由客户端调用第三方接口后上报，未经服务端核验'
          : locationSource === 'browser_gps_unresolved'
            ? '已取得 GPS 坐标，但未能解析到行政区'
            : TRUSTED_SCAN_GEO_SOURCES.has(locationSource)
              ? '可信位置服务未能解析到完整省市'
            : '未取得可解析的网络行政区';

    return this.upsertAlert('location_unverified', {
      code: ctx.anti_fake_code?.code || ctx.code,
      box_no: ctx.anti_fake_code?.box_no || ctx.box?.box_no,
      product_id: source.product_id ?? null,
      product_code: source.product_code || ctx.product?.product_code || null,
      product_name: source.product_name || ctx.product?.product_name || null,
      agent_id: responsibleParty.agent_id || authorized.agent_id,
      agent_name: responsibleParty.name || authorized.agent_name,
      authorized_region: authorized.region_group || [authorized.province_name, authorized.city_name].filter(Boolean).join(' / '),
      authorized_province: authorized.province_name,
      authorized_city: authorized.city_name,
      actual_location: actualLocation || null,
      actual_province: ctx.province || actual.province_name || null,
      actual_city: ctx.city || actual.city_name || null,
      ip: ctx.ip,
      device_id: ctx.device_id,
      user_agent: ctx.userAgent,
      evidence: {
        rule: '扫码位置未完成可信核验',
        reason,
        authorized_source: authorized.source,
        authorized,
        location_source: ctx.location_source,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        adcode: ctx.adcode,
        rectangle: ctx.rectangle,
        bounds: ctx.bounds,
        accuracy: ctx.accuracy,
        webrtc_local_ips: ctx.webrtc_local_ips || [],
      },
    });
  }

  private async evaluateGeoMismatch(ctx: ScanContext) {
    const source = ctx.anti_fake_code || ctx.box || ctx.product;
    if (!source) return null;

    // 只对开启防窜校验且已发货的防伪码进行地理位置不匹配检测。
    const code = ctx.anti_fake_code;
    if (!code) return null;
    const enabled = Boolean(code && this.isCodeAntiChannelingEnabled(code));
    if (!enabled) return null;

    const box = await this.resolveBoxForScan(ctx);
    if (!box) return null;

    const authorized: any = await this.authorizedRegionForScan(ctx);
    if (!authorized.province_name && !authorized.city_name) return null;
    const locationSource = String(ctx.location_source || '').trim().toLowerCase();
    const trustedRegion = ctx.location_verified === true && TRUSTED_SCAN_GEO_SOURCES.has(locationSource);
    // Browser GPS, client-side GeoIP, QR parameters, and manually entered addresses never drive a mismatch.
    if (!trustedRegion || !String(ctx.province || '').trim() || !String(ctx.city || '').trim()) return null;
    const parsedLocation = this.parseLocation(ctx.location);
    const actual = {
      ...parsedLocation,
      province_name: trustedRegion ? (ctx.province || parsedLocation.province_name) : parsedLocation.province_name,
      city_name: trustedRegion ? (ctx.city || parsedLocation.city_name) : parsedLocation.city_name,
    };
    if (!actual.location && !actual.province_name && !actual.city_name) return null;
    if (this.isSameAuthorizedScanRegion(authorized, actual)) return null;

    const actualLocationText = ctx.location && !String(ctx.location).startsWith('GPS(')
      ? ctx.location
      : [actual.province_name, actual.city_name].filter(Boolean).join(' / ') || ctx.location;
    const responsibleParty = this.responsibleParty(source, authorized, { product_code: ctx.product?.product_code, product_name: ctx.product?.product_name });

    return this.upsertAlert('geo_mismatch', {
      code: ctx.anti_fake_code?.code || ctx.code,
      box_no: ctx.anti_fake_code?.box_no || ctx.box?.box_no,
      product_id: source.product_id ?? null,
      product_code: source.product_code || ctx.product?.product_code || null,
      product_name: source.product_name || ctx.product?.product_name || null,
      agent_id: responsibleParty.agent_id || authorized.agent_id,
      agent_name: responsibleParty.name || authorized.agent_name,
      authorized_region: authorized.region_group || [authorized.province_name, authorized.city_name].filter(Boolean).join(' / '),
      authorized_province: authorized.province_name,
      authorized_city: authorized.city_name,
      actual_location: actualLocationText,
      actual_province: actual.province_name,
      actual_city: actual.city_name,
      ip: ctx.ip,
      device_id: ctx.device_id,
      user_agent: ctx.userAgent,
      evidence: {
        rule: '扫码位置与授权区域不符',
        channel: ctx.channel,
        query_count: ctx.query_count,
        source_type: ctx.anti_fake_code ? 'anti_fake_code' : ctx.box ? 'box' : 'product',
        authorized_source: authorized.source,
        shipment_id: authorized.shipment_id,
        shipment_no: authorized.shipment_no,
        shipment_sender_address: authorized.shipment_sender_address || null,
        shipment_receiver_address: authorized.shipment_receiver_address,
        authorized,
        actual,
        responsible_party: responsibleParty,
        location_source: ctx.location_source,
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        adcode: ctx.adcode,
        rectangle: ctx.rectangle,
        bounds: ctx.bounds,
        accuracy: ctx.accuracy,
        webrtc_local_ips: ctx.webrtc_local_ips || [],
      },
    });
  }

  private async evaluateSameCodeMultiRegion(ctx: ScanContext) {
    const code = String(ctx.anti_fake_code?.code || ctx.code || '').trim();
    if (!code || !ctx.location) return null;
    if (ctx.location_verified !== true || !TRUSTED_SCAN_GEO_SOURCES.has(String(ctx.location_source || '').trim().toLowerCase())) return null;
    const rule = await this.getRule('same_code_multi_region');
    if (!rule || rule?.enabled === false) return null;
    let regions = await this.queryRecentLocations(code, Number(rule.window_seconds || 3600));
    const source = ctx.anti_fake_code || ctx.box || {};
    const authorized = await this.authorizedRegionForScan(ctx).catch(() => this.authorizedRegion(source, ctx.box || {}));
    if (this.regionMatchLevel(authorized) === 'province') {
      const provinceMap = new Map<string, any>();
      for (const item of regions) {
        const key = this.compact(item.parsed.province_name) || item.parsed.region_key;
        if (key && !provinceMap.has(key)) provinceMap.set(key, item);
      }
      regions = Array.from(provinceMap.values());
    }
    if (regions.length < Number(rule.threshold || 2)) return null;
    const first = regions[0]?.parsed || {};
    const responsibleParty = this.responsibleParty(source, authorized, { product_code: ctx.product?.product_code, product_name: ctx.product?.product_name });

    return this.upsertAlert('same_code_multi_region', {
      code,
      box_no: ctx.anti_fake_code?.box_no || ctx.box?.box_no,
      product_id: source.product_id ?? null,
      product_code: source.product_code || ctx.product?.product_code || null,
      product_name: source.product_name || ctx.product?.product_name || null,
      agent_id: responsibleParty.agent_id || authorized?.agent_id || source.agent_id || null,
      agent_name: responsibleParty.name || authorized?.agent_name || source.agent_name || null,
      authorized_region: authorized?.region_group || this.displayRegion(authorized || this.authorizedRegion(source, ctx.box || {})) || null,
      authorized_province: authorized?.province_name || source.province_name || null,
      authorized_city: authorized?.city_name || source.city_name || null,
      actual_location: first.location || this.displayRegion(first) || ctx.location,
      actual_province: first.province_name,
      actual_city: first.city_name,
      ip: ctx.ip,
      device_id: ctx.device_id,
      user_agent: ctx.userAgent,
      evidence: {
        rule: '同一编码短时间内多地扫码',
        window_seconds: Number(rule.window_seconds || 3600),
        threshold: Number(rule.threshold || 2),
        normalized_region_count: regions.length,
        regions: regions.map((item: any) => ({ location: item.parsed.location, province_name: item.parsed.province_name, city_name: item.parsed.city_name, region_key: item.parsed.region_key, ip: item.row.ip, created_at: item.row.created_at })),
      },
    });
  }

  private async evaluateIpFrequency(ctx: ScanContext) {
    if (!ctx.ip) return null;
    const rule = await this.getRule('ip_high_frequency');
    if (!rule || rule?.enabled === false) return null;
    const threshold = Number(rule.threshold || this.config.get('ANTI_CHANNELING_IP_THRESHOLD') || 30);
    const windowSeconds = Number(rule.window_seconds || this.config.get('ANTI_CHANNELING_IP_WINDOW_SECONDS') || 60);
    const since = new Date(Date.now() - windowSeconds * 1000);
    const count = await this.prisma.queryLog.count({ where: { ip: ctx.ip, created_at: { gte: since } } }).catch(() => 0);
    if (count < threshold) return null;
    return this.upsertAlert('ip_high_frequency', {
      code: ctx.anti_fake_code?.code || ctx.code,
      box_no: ctx.anti_fake_code?.box_no || ctx.box?.box_no,
      product_id: ctx.anti_fake_code?.product_id ?? null,
      product_code: ctx.anti_fake_code?.product_code || ctx.product?.product_code || null,
      product_name: ctx.anti_fake_code?.product_name || ctx.product?.product_name || null,
      agent_id: ctx.anti_fake_code?.agent_id ?? null,
      agent_name: ctx.anti_fake_code?.agent_name ?? null,
      actual_location: ctx.location || null,
      ip: ctx.ip,
      device_id: ctx.device_id,
      user_agent: ctx.userAgent,
      evidence: { rule: '同一 IP 短时高频扫码', count, threshold, window_seconds: windowSeconds, channel: ctx.channel },
    });
  }

  private deviceRiskReason(ctx: ScanContext) {
    const ua = String(ctx.userAgent || '').toLowerCase();
    const integrity = String(ctx.device_integrity || '').toLowerCase();
    const patterns = ['jailbreak', 'jailbroken', 'rooted', 'magisk', 'xposed', 'frida', 'substrate', 'hook', 'emulator', 'headless', 'phantomjs', 'selenium', 'playwright', 'puppeteer'];
    const matched = patterns.find((item) => ua.includes(item) || integrity.includes(item));
    if (ctx.jailbroken === true) return '客户端上报越狱/Root 设备';
    if (matched) return `识别到异常设备特征：${matched}`;
    return '';
  }

  private async evaluateDeviceRisk(ctx: ScanContext) {
    const reason = this.deviceRiskReason(ctx);
    if (!reason) return null;
    return this.upsertAlert('device_risk', {
      code: ctx.anti_fake_code?.code || ctx.code,
      box_no: ctx.anti_fake_code?.box_no || ctx.box?.box_no,
      product_id: ctx.anti_fake_code?.product_id ?? null,
      product_code: ctx.anti_fake_code?.product_code || ctx.product?.product_code || null,
      product_name: ctx.anti_fake_code?.product_name || ctx.product?.product_name || null,
      agent_id: ctx.anti_fake_code?.agent_id ?? null,
      agent_name: ctx.anti_fake_code?.agent_name ?? null,
      actual_location: ctx.location || null,
      ip: ctx.ip,
      device_id: ctx.device_id,
      user_agent: ctx.userAgent,
      evidence: { rule: '设备访问异常', reason, device_integrity: ctx.device_integrity, channel: ctx.channel },
    });
  }

  private async evaluateFakeCode(ctx: ScanContext) {
    if (ctx.is_real !== false) return null;
    return this.upsertAlert('fake_code_scan', {
      code: ctx.anti_fake_code?.code || ctx.code,
      box_no: ctx.anti_fake_code?.box_no || ctx.box?.box_no,
      product_id: ctx.anti_fake_code?.product_id ?? null,
      product_code: ctx.anti_fake_code?.product_code || ctx.product?.product_code || null,
      product_name: ctx.anti_fake_code?.product_name || ctx.product?.product_name || null,
      agent_id: ctx.anti_fake_code?.agent_id ?? null,
      agent_name: ctx.anti_fake_code?.agent_name ?? null,
      actual_location: ctx.location || null,
      ip: ctx.ip,
      device_id: ctx.device_id,
      user_agent: ctx.userAgent,
      evidence: { rule: '无效码/假码扫码', channel: ctx.channel, query_count: ctx.query_count },
    });
  }

  private async evaluateCodeTrajectoryAnomaly(ctx: ScanContext) {
    const code = String(ctx.anti_fake_code?.code || ctx.code || '').trim();
    if (!code) return null;
    const rule = await this.getRule('code_trajectory_anomaly');
    if (!rule || rule?.enabled === false) return null;

    const windowDays = Math.max(1, Math.ceil(Number(rule.window_seconds || 86400) / 86400));
    const since = new Date(Date.now() - windowDays * 86400 * 1000);
    const codeRef = this.codeVault.reference(code);
    const rows = await this.prisma.antiChannelingAlert.findMany({
      where: { code: { in: [codeRef, code] }, alert_type: { in: ['geo_mismatch', 'same_code_multi_region'] }, status: { lt: 3 }, created_at: { gte: since } },
      select: { actual_location: true, actual_province: true, actual_city: true, created_at: true },
      orderBy: { created_at: 'asc' },
      take: 30,
    }).catch(() => []);

    const queryRows = await this.prisma.queryLog.findMany({
      where: { code: { in: [codeRef, code] }, location_verified: true, created_at: { gte: since } },
      select: { location: true, ip: true, created_at: true },
      orderBy: { created_at: 'asc' },
      take: 120,
    }).catch(() => []);

    const timeline: Array<{ key: string; province_key: string; region: any; time: any; source: string; ip?: string }> = [];
    for (const row of queryRows) {
      const region = this.normalizeRegion({ location: row.location });
      if (region.region_key) timeline.push({ key: region.region_key, province_key: this.compact(region.province_name) || region.region_key, region, time: row.created_at, source: 'query_log', ip: row.ip });
    }
    for (const row of rows) {
      const region = this.normalizeRegion({ location: row.actual_location, province_name: row.actual_province, city_name: row.actual_city });
      if (region.region_key) timeline.push({ key: region.region_key, province_key: this.compact(region.province_name) || region.region_key, region, time: row.created_at, source: 'alert' });
    }
    timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const byProvince = new Map<string, typeof timeline[number]>();
    for (const item of timeline) {
      const key = item.province_key;
      if (key && !byProvince.has(key)) byProvince.set(key, item);
    }
    const provinceTrajectory = Array.from(byProvince.values());
    const threshold = Math.max(Number(rule.threshold || 2), 2);
    if (provinceTrajectory.length < threshold) return null;

    const current = provinceTrajectory[provinceTrajectory.length - 1]?.region || {};
    const source = ctx.anti_fake_code || ctx.box || {};
    return this.upsertAlert('code_trajectory_anomaly', {
      code,
      box_no: ctx.anti_fake_code?.box_no || ctx.box?.box_no,
      product_id: source.product_id ?? null,
      product_code: source.product_code || ctx.product?.product_code || null,
      product_name: source.product_name || ctx.product?.product_name || null,
      agent_id: source.agent_id ?? null,
      agent_name: source.agent_name ?? null,
      actual_location: provinceTrajectory.map((item) => this.displayRegion(item.region)).filter(Boolean).join(' → '),
      actual_province: current.province_name || null,
      actual_city: current.city_name || null,
      ip: ctx.ip,
      device_id: ctx.device_id,
      user_agent: ctx.userAgent,
      evidence: {
        rule: '编码轨迹异常跳跃',
        description: '仅按规范化后的省级/特别行政区跨度计数，避免把“广州、广东/广州、广东/东莞”误判成 3 个异常区域。',
        trajectory: provinceTrajectory.map((item) => ({ location: item.region.location, province_name: item.region.province_name, city_name: item.region.city_name, region_key: item.key, source: item.source, ip: item.ip, created_at: item.time })),
        region_count: provinceTrajectory.length,
        threshold,
        window_days: windowDays,
      },
    });
  }

  private scanCodeType(ctx: ScanContext) {
    const explicit = (safeText(ctx.code_type, 64) ?? '').toLowerCase().replace(/[\s-]+/g, '_');
    const aliases: Record<string, string> = {
      antifake: 'anti_fake_code',
      anti_fake: 'anti_fake_code',
      anti_fake_code: 'anti_fake_code',
      code: 'anti_fake_code',
      box_code: 'box',
      carton: 'box',
      carton_code: 'box',
      product_code: 'product',
      trace_code: 'trace',
      shipment_code: 'shipment',
      return: 'return_order',
      return_code: 'return_order',
    };
    if (explicit) return aliases[explicit] || explicit;
    if (ctx.anti_fake_code) return 'anti_fake_code';
    if (ctx.box) return 'box';
    if (ctx.product) return 'product';
    // 未识别的消费者验真输入仍按“疑似防伪码”处理，以保留假码识别。
    return 'anti_fake_code';
  }

  async evaluateScan(ctx: ScanContext) {
    const codeType = this.scanCodeType(ctx);
    if (codeType !== 'anti_fake_code') {
      return {
        alert_count: 0,
        alerts: [],
        skipped: true,
        skip_reason: 'only_anti_fake_code_triggers_anti_channeling',
        code_type: codeType,
      };
    }

    if (ctx.anti_fake_code) {
      const authorization = await this.resolveCodeAuthorization(ctx);
      if (!authorization.required) {
        if (ctx.is_real === false) {
          const fakeCodeAlert = await this.evaluateFakeCode(ctx).catch((err: any) => {
            this.logger.error(`fake_code scan eval failed: ${err?.message || err}`);
            return null;
          });
          return {
            alert_count: fakeCodeAlert ? 1 : 0,
            alerts: fakeCodeAlert ? [fakeCodeAlert] : [],
            skipped: true,
            skip_reason: authorization.state === 'disabled'
              ? 'code_anti_channeling_disabled'
              : 'anti_channeling_not_required_before_shipment',
            code_type: codeType,
          };
        }
        return {
          alert_count: 0,
          alerts: [],
          skipped: true,
          skip_reason: authorization.state === 'disabled'
            ? 'code_anti_channeling_disabled'
            : 'anti_channeling_not_required_before_shipment',
          code_type: codeType,
        };
      }
    }

    const results = await Promise.all([
      this.evaluateLocationEvidence(ctx).catch((err: any) => { this.logger.error(`location_unverified eval failed: ${err?.message || err}`); return null; }),
      this.evaluateGeoMismatch(ctx).catch((err: any) => { this.logger.error(`geo_mismatch eval failed: ${err?.message || err}`); return null; }),
      this.evaluateSameCodeMultiRegion(ctx).catch((err: any) => { this.logger.error(`same_code_multi_region eval failed: ${err?.message || err}`); return null; }),
      this.evaluateIpFrequency(ctx).catch((err: any) => { this.logger.error(`ip_high_frequency eval failed: ${err?.message || err}`); return null; }),
      this.evaluateDeviceRisk(ctx).catch((err: any) => { this.logger.error(`device_risk eval failed: ${err?.message || err}`); return null; }),
      this.evaluateFakeCode(ctx).catch((err: any) => { this.logger.error(`fake_code scan eval failed: ${err?.message || err}`); return null; }),
      this.evaluateCodeTrajectoryAnomaly(ctx).catch((err: any) => { this.logger.error(`trajectory eval failed: ${err?.message || err}`); return null; }),
    ]);
    const list = results.filter(Boolean);
    return { alert_count: list.length, alerts: list };
  }

  async evaluateBatchCodeScans(codes: ScanContext[]) {
    const allAlerts: any[] = [];
    for (const ctx of codes) {
      const result = await this.evaluateScan(ctx).catch((err: any) => {
        this.logger.error(`Batch scan eval failed for code ${ctx.code}: ${err?.message || err}`);
        return { alert_count: 0, alerts: [] };
      });
      allAlerts.push(...(result.alerts || []));
    }

    // Agent cross-boundary detection after batch evaluation
    const agentMap = new Map<number, { codes: string[]; locations: string[]; authorized: string[] }>();
    for (const alert of allAlerts) {
      if (!alert.agent_id) continue;
      if (!agentMap.has(alert.agent_id)) {
        agentMap.set(alert.agent_id, { codes: [], locations: [], authorized: [] });
      }
      const entry = agentMap.get(alert.agent_id)!;
      if (alert.code) entry.codes.push(alert.code);
      if (alert.actual_location) entry.locations.push(alert.actual_location);
      if (alert.authorized_region) entry.authorized.push(alert.authorized_region);
    }

    for (const [agentId, entry] of agentMap.entries()) {
      const rule = await this.getRule('agent_cross_boundary');
      if (!rule || rule?.enabled === false) continue;
      const uniqueAuth = Array.from(new Set(entry.authorized));
      const uniqueLocations = Array.from(new Set(entry.locations));
      if (uniqueAuth.length >= 2 && uniqueLocations.length >= 2) {
        await this.upsertAlert('agent_cross_boundary', {
          code: entry.codes[0] || null,
          product_id: null,
          product_code: null,
          product_name: null,
          agent_id: agentId,
          agent_name: null,
          authorized_region: uniqueAuth.join(' | '),
          actual_location: uniqueLocations.join(' | '),
          actual_province: null,
          actual_city: null,
          evidence: {
            rule: '同一代理商多区域授权码集中异常扫码',
            agent_id: agentId,
            unique_authorized_regions: uniqueAuth,
            unique_locations: uniqueLocations,
            codes: entry.codes.slice(0, 20),
            code_count: entry.codes.length,
          },
        }).catch(() => undefined);
      }
    }

    return { alert_count: allAlerts.length, alerts: allAlerts };
  }

  async evaluateShipment(ctx: ShipmentContext) {
    return {
      alert_count: 0,
      alerts: [],
      skipped: true,
      skip_reason: 'box_and_shipment_codes_do_not_trigger_anti_channeling',
      shipment_no: ctx.shipment?.shipment_no || null,
    };
  }

  private alertWhere(query: Record<string, any> = {}) {
    const where: Record<string, any> = {};
    const keyword = safeText(query.keyword || query.code || query.alert_no, 128);
    if (keyword) {
      const codeReference = this.codeVault.reference(keyword);
      where.OR = [
        { alert_no: { contains: keyword } },
        { title: { contains: keyword } },
        { code: { contains: keyword } },
        { code: codeReference },
        { box_no: { contains: keyword } },
        { shipment_no: { contains: keyword } },
        { agent_name: { contains: keyword } },
        { actual_location: { contains: keyword } },
      ];
    }
    if (query.status !== undefined && query.status !== '') where.status = Number(query.status);
    if (query.severity !== undefined && query.severity !== '') where.severity = Number(query.severity);
    if (query.alert_type) where.alert_type = String(query.alert_type);
    if (query.agent_id) where.agent_id = Number(query.agent_id);
    if (query.created_from || query.created_to) {
      where.created_at = {};
      if (query.created_from) where.created_at.gte = new Date(query.created_from);
      if (query.created_to) where.created_at.lte = new Date(query.created_to);
    }
    return where;
  }

  async listAlerts(query: Record<string, any> = {}) {
    const table = this.delegate('antiChannelingAlert');
    if (!table) return { list: [], pagination: { page: 1, pageSize: 20, total: 0 } };
    const { page, pageSize, skip } = pageParams(query);
    const where = this.alertWhere(query);
    const [total, list] = await Promise.all([
      table.count({ where }).catch(() => 0),
      table.findMany({ where, orderBy: [{ status: 'asc' }, { severity: 'desc' }, { last_seen_at: 'desc' }], skip, take: pageSize }).catch(() => []),
    ]);
    const hydratedList = await this.hydrateAlertCodeReferences(list);
    const productIds = Array.from(new Set(hydratedList.map((row: any) => Number(row.product_id)).filter((id: number) => Number.isInteger(id) && id > 0)));
    const productCodes = Array.from(new Set(hydratedList.map((row: any) => safeText(row.product_code, 64)).filter(Boolean)));
    const products = (productIds.length || productCodes.length)
      ? await this.prisma.product.findMany({
        where: { OR: [productIds.length ? { id: { in: productIds } } : undefined, productCodes.length ? { product_code: { in: productCodes } } : undefined].filter(Boolean) as any },
        select: { id: true, product_code: true, product_name: true },
      }).catch(() => [])
      : [];
    const productById = new Map(products.map((item: any) => [Number(item.id), item]));
    const productByCode = new Map(products.map((item: any) => [String(item.product_code || ''), item]));
    const enriched = hydratedList.map((row: any) => {
      const product = (productById.get(Number(row.product_id)) || productByCode.get(String(row.product_code || ''))) as any;
      return row.product_name ? row : { ...row, product_name: product?.product_name || row.product_code || null };
    });
    return { list: enriched, pagination: { page, pageSize, total } };
  }

  async clearAlerts(body: Record<string, any> = {}, admin?: any) {
    const table = this.delegate('antiChannelingAlert');
    if (!table) throw new NotFoundException('防窜预警表未初始化');

    const rawIds = Array.isArray(body.ids) ? body.ids : safeJsonArray(body.ids);
    const ids = Array.from(new Set(rawIds.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)));
    const filters = body.filters && typeof body.filters === 'object' ? body.filters : body;
    const where = ids.length ? { id: { in: ids } } : this.alertWhere(filters);
    const hasFilter = Object.keys(where).length > 0;

    if (!ids.length && !hasFilter && body.confirm_all !== true) {
      throw new BadRequestException('未指定预警记录或筛选条件；如需清空全部记录请提交 confirm_all=true');
    }

    const result = await table.deleteMany({ where }).catch((error: any) => {
      this.logger.error(`Failed to clear anti-channeling alerts: ${error?.message || error}`);
      throw new BadRequestException('清空防窜预警失败，请稍后重试');
    });

    const riskEvent = this.delegate('riskEvent');
    if (riskEvent) {
      await riskEvent.create({
        data: {
          event_type: 'anti_channeling_alerts_cleared',
          reason: `清空防窜预警 ${Number(result?.count || 0)} 条`,
          payload: {
            deleted_count: Number(result?.count || 0),
            ids: ids.slice(0, 500),
            filters: ids.length ? undefined : filters,
            operator: admin?.username || admin?.real_name || admin?.id || 'system',
            cleared_at: new Date().toISOString(),
          },
          status: 0,
        },
      }).catch(() => undefined);
    }

    return { deleted: Number(result?.count || 0), scope: ids.length ? 'selected' : (hasFilter ? 'filtered' : 'all') };
  }

  async alertDetail(id: string | number) {
    const table = this.delegate('antiChannelingAlert');
    if (!table) throw new NotFoundException('防窜预警表未初始化');
    const row = await table.findUnique({ where: { id: safeId(id) } }).catch(() => null);
    if (!row) throw new NotFoundException('防窜预警不存在');
    const notifications = await this.delegate('antiChannelingNotification')?.findMany({ where: { alert_id: row.id }, orderBy: { id: 'desc' } }).catch(() => []);
    const [hydrated] = await this.hydrateAlertCodeReferences([row]);
    return { ...hydrated, notifications };
  }

  private async getMysqlTableColumns(tableName: string) {
    try {
      const rows = (await this.prisma.$queryRawUnsafe(
        'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
        tableName,
      )) as any[];
      return new Set(rows.map((row: any) => String(row.COLUMN_NAME || row.column_name || row.Field || '')).filter(Boolean));
    } catch (error: any) {
      this.logger.warn(`读取数据表字段失败，跳过可选字段兼容更新：${error?.message || error}`);
      return new Set<string>();
    }
  }

  private normalizeAlertStatus(status: number) {
    const value = Number(status);
    if (!Number.isFinite(value)) return 1;
    return [0, 1, 2, 3, 4].includes(value) ? value : 3;
  }

  private cleanUpdateData(data: Record<string, any>) {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  }

  private async updateAlertHandleColumns(alertId: number, fields: { status?: number; handle_result?: string; remark?: string; handled_by?: number | null; handled_at?: Date }) {
    if (!String(process.env.DATABASE_URL || '').startsWith('mysql://')) return;
    const columns = await this.getMysqlTableColumns('anti_channeling_alerts');
    const setters: string[] = [];
    const values: any[] = [];
    const push = (column: string, value: any) => {
      if (!columns.has(column)) return;
      setters.push(`\`${column}\` = ?`);
      values.push(value);
    };
    if (fields.status !== undefined) push('status', fields.status);
    if (fields.handle_result !== undefined) push('handle_result', fields.handle_result);
    if (fields.remark !== undefined) push('remark', fields.remark);
    if (fields.handled_by !== undefined) push('handled_by', fields.handled_by);
    if (fields.handled_at !== undefined) push('handled_at', fields.handled_at);
    if (!setters.length) return;
    try {
      await this.prisma.$executeRawUnsafe(`UPDATE \`anti_channeling_alerts\` SET ${setters.join(', ')} WHERE \`id\` = ?`, ...values, alertId);
    } catch (error: any) {
      this.logger.warn(`防窜预警处理记录写入失败：${error?.message || error}`);
    }
  }

  async updateAlertStatus(id: string | number, status: number, body: Record<string, any> = {}, admin?: any) {
    const table = this.delegate('antiChannelingAlert');
    if (!table) throw new NotFoundException('防窜预警表未初始化');
    const existed = await table.findUnique({ where: { id: safeId(id) } }).catch(() => null);
    if (!existed) throw new NotFoundException('防窜预警不存在');

    const nextStatus = this.normalizeAlertStatus(status);
    const handleResult = safeText(body.handle_result || body.result, 255) || (nextStatus === 1 ? '已确认收到，进入稽查处理' : nextStatus === 3 ? '已关闭' : nextStatus === 4 ? '经稽查核实为误报' : null);
    const remark = safeText(body.remark, 255) || existed.remark || undefined;
    const handledBy = admin?.id ? Number(admin.id) : null;
    const handledAt = new Date();
    const fullUpdateData = this.cleanUpdateData({
      status: nextStatus,
      remark,
      handle_result: handleResult || undefined,
      handled_by: handledBy,
      handled_at: handledAt,
    });

    let updated: any;
    try {
      updated = await table.update({ where: { id: existed.id }, data: fullUpdateData });
    } catch (error: any) {
      this.logger.warn(`防窜预警完整状态更新失败，尝试兼容旧 Prisma Client：${error?.message || error}`);
      try {
        updated = await table.update({
          where: { id: existed.id },
          data: this.cleanUpdateData({ status: nextStatus, remark }),
        });
      } catch (fallbackError: any) {
        this.logger.warn(`防窜预警兼容状态更新失败，尝试 SQL 兜底：${fallbackError?.message || fallbackError}`);
        await this.updateAlertHandleColumns(existed.id, { status: nextStatus, remark });
        updated = await table.findUnique({ where: { id: existed.id } }).catch(() => ({ ...existed, status: nextStatus, remark }));
      }
    }

    await this.updateAlertHandleColumns(existed.id, {
      status: nextStatus,
      handle_result: handleResult || undefined,
      remark,
      handled_by: handledBy,
      handled_at: handledAt,
    });

    const fresh = await table.findUnique({ where: { id: existed.id } }).catch(() => null);
    return {
      ...(fresh || updated),
      status: nextStatus,
      handle_result: fresh?.handle_result ?? updated?.handle_result ?? handleResult,
      remark: fresh?.remark ?? updated?.remark ?? remark,
      handled_by: fresh?.handled_by ?? updated?.handled_by ?? handledBy,
      handled_at: fresh?.handled_at ?? updated?.handled_at ?? handledAt,
    };
  }

  async overview() {
    const table = this.delegate('antiChannelingAlert');
    if (!table) return { total: 0, pending: 0, severe: 0, today: 0, recent: [], area_rank: [], dealer_rank: [], type_rank: [] };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [total, pending, severe, todayCount, recent, latest] = await Promise.all([
      table.count({}).catch(() => 0),
      table.count({ where: { status: { in: [0, 1, 2] } } }).catch(() => 0),
      table.count({ where: { severity: { gte: 4 }, status: { lt: 3 } } }).catch(() => 0),
      table.count({ where: { created_at: { gte: today } } }).catch(() => 0),
      table.findMany({ orderBy: [{ severity: 'desc' }, { last_seen_at: 'desc' }], take: 8 }).catch(() => []),
      table.findMany({ where: { created_at: { gte: new Date(Date.now() - 30 * 86400 * 1000) } }, select: { alert_type: true, actual_province: true, actual_city: true, agent_name: true, agent_id: true, severity: true, status: true, evidence: true }, take: 2000 }).catch(() => []),
    ]);
    const rank = (keyFn: (item: any) => string) => {
      const map = new Map<string, number>();
      latest.forEach((item: any) => {
        const key = keyFn(item) || '未识别';
        map.set(key, (map.get(key) || 0) + 1);
      });
      return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
    };
    return {
      total,
      pending,
      severe,
      today: todayCount,
      recent,
      area_rank: rank((item) => [item.actual_province, item.actual_city].filter(Boolean).join(' / ')),
      dealer_rank: rank((item) => item.agent_name || item.evidence?.responsible_party?.name || item.evidence?.latest?.responsible_party?.name || item.evidence?.responsible_party?.distributor || item.evidence?.responsible_party?.company_name || (item.agent_id ? `代理商#${item.agent_id}` : '')),
      type_rank: rank((item) => item.alert_type),
      closed: latest.filter((item: any) => Number(item.status) >= 3).length,
    };
  }

  async agentRiskScores(limit = 20) {
    const table = this.delegate('antiChannelingAlert');
    if (!table) return { list: [] };
    const rows = await table.findMany({
      where: { status: { lt: 3 }, created_at: { gte: new Date(Date.now() - 90 * 86400 * 1000) } },
      select: { agent_id: true, agent_name: true, severity: true, alert_type: true, status: true, created_at: true, evidence: true },
      take: 3000,
    }).catch(() => []);

    const agentMap = new Map<string, { agentId: number | null; name: string; alerts: number; severe: number; types: Set<string>; geoMismatch: number; lastAlert: Date }>();
    for (const row of rows) {
      const responsible = row.evidence?.responsible_party || row.evidence?.latest?.responsible_party || {};
      const agentId = row.agent_id ? Number(row.agent_id) : (responsible.agent_id ? Number(responsible.agent_id) : null);
      const name = safeText(row.agent_name || responsible.name || responsible.distributor || responsible.company_name, 128) || '';
      const key = agentId ? `id:${agentId}` : name ? `name:${name}` : '';
      if (!key) continue;
      if (!agentMap.has(key)) {
        agentMap.set(key, { agentId, name, alerts: 0, severe: 0, types: new Set(), geoMismatch: 0, lastAlert: new Date(0) });
      }
      const entry = agentMap.get(key)!;
      entry.alerts += 1;
      if (Number(row.severity) >= 4) entry.severe += 1;
      if (row.alert_type) entry.types.add(row.alert_type);
      if (row.alert_type === 'geo_mismatch') entry.geoMismatch += 1;
      if (row.created_at && new Date(row.created_at) > entry.lastAlert) entry.lastAlert = new Date(row.created_at);
    }

    const now = Date.now();
    const list = Array.from(agentMap.entries()).map(([key, entry]) => {
      const daysSinceLast = Math.max(1, Math.round((now - entry.lastAlert.getTime()) / 86400000));
      const score = Math.round((entry.severe * 10 + entry.alerts * 2 + entry.geoMismatch * 3) / daysSinceLast * 10);
      return {
        responsible_key: key,
        agent_id: entry.agentId,
        agent_name: entry.name || (entry.agentId ? `代理商#${entry.agentId}` : '未识别责任方'),
        total_alerts: entry.alerts,
        severe_alerts: entry.severe,
        geo_mismatch_count: entry.geoMismatch,
        alert_types: Array.from(entry.types),
        last_alert_at: entry.lastAlert.toISOString(),
        days_since_last: daysSinceLast,
        risk_score: Math.min(100, score),
        risk_level: score >= 70 ? 'danger' : score >= 40 ? 'warning' : score >= 20 ? 'attention' : 'normal',
      };
    }).sort((a, b) => b.risk_score - a.risk_score).slice(0, limit);

    return { list };
  }

  async codeTrajectory(code: string, days = 30) {
    if (!code) throw new BadRequestException('请提供防伪码');
    const codeSafe = safeText(code, 128);
    const codeRef = this.codeVault.reference(codeSafe || '');
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 90) * 86400 * 1000);

    const [alerts, queryLogs] = await Promise.all([
      this.delegate('antiChannelingAlert')?.findMany({ where: { code: { in: [codeRef, codeSafe] }, created_at: { gte: since } }, orderBy: { created_at: 'asc' }, take: 100 }).catch(() => []) || [],
      this.prisma.queryLog.findMany({ where: { code: { in: [codeRef, codeSafe] }, created_at: { gte: since } }, orderBy: { created_at: 'asc' }, take: 200 }).catch(() => []),
    ]);

    const timeline: any[] = [];
    for (const log of queryLogs) {
      const parsed = this.parseLocation(log.location);
      timeline.push({
        type: 'query',
        time: log.created_at,
        location: log.location,
        province: parsed.province_name,
        city: parsed.city_name,
        ip: log.ip,
        result: log.result,
        channel: log.channel,
      });
    }
    for (const alert of alerts) {
      timeline.push({
        type: 'alert',
        time: alert.created_at,
        alert_type: alert.alert_type,
        title: alert.title,
        severity: alert.severity,
        status: alert.status,
        authorized_region: alert.authorized_region,
        actual_location: alert.actual_location,
        alert_no: alert.alert_no,
      });
    }
    timeline.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    const uniqueRegionMap = new Map<string, string>();
    for (const item of timeline) {
      const region = this.normalizeRegion({ location: item.actual_location || item.location, province_name: item.province, city_name: item.city });
      const key = region.region_key;
      if (key && !uniqueRegionMap.has(key)) uniqueRegionMap.set(key, this.displayRegion(region));
    }
    const uniqueRegions = Array.from(uniqueRegionMap.values());
    return {
      code: codeSafe,
      query_count: queryLogs.length,
      alert_count: alerts.length,
      unique_regions: uniqueRegions,
      region_count: uniqueRegions.length,
      timeline: timeline.slice(0, 200),
    };
  }

  async unread(limit = 5) {
    const table = this.delegate('antiChannelingAlert');
    if (!table) return { total: 0, list: [] };
    const where = { status: 0 };
    const safeLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);
    const [rawTotal, rows] = await Promise.all([
      table.count({ where }).catch(() => 0),
      table.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { last_seen_at: 'desc' }],
        take: Math.min(Math.max(safeLimit * 20, 100), 1000),
      }).catch(() => []),
    ]);
    const hydratedRows = await this.hydrateAlertCodeReferences(rows);
    const allUnique = dedupeAlertsByLocation(hydratedRows, hydratedRows.length || safeLimit);
    return {
      total: allUnique.length,
      raw_total: rawTotal,
      list: allUnique.slice(0, safeLimit),
      grouping: 'actual_location',
      popup_duration_ms: 10_000,
    };
  }

  private rankRows(rows: any[], keyFn: (item: any) => string, limit = 10) {
    const map = new Map<string, number>();
    rows.forEach((item: any) => {
      const key = keyFn(item) || '未识别';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
  }

  async analytics(query: Record<string, any> = {}) {
    const table = this.delegate('antiChannelingAlert');
    if (!table) return { trend: [], area_rank: [], dealer_rank: [], type_rank: [], code_rank: [], severity_distribution: [], handle_stats: {} };
    const days = Math.min(Math.max(Number(query.days || 30), 1), 180);
    const since = new Date(Date.now() - days * 86400 * 1000);
    const rows = await table.findMany({
      where: { created_at: { gte: since } },
      orderBy: { created_at: 'asc' },
      take: 5000,
    }).catch(() => []);

    const trendMap = new Map<string, number>();
    for (let i = days - 1; i >= 0; i -= 1) {
      const date = new Date(Date.now() - i * 86400 * 1000).toISOString().slice(0, 10);
      trendMap.set(date, 0);
    }
    rows.forEach((item: any) => {
      const date = new Date(item.created_at || item.last_seen_at || Date.now()).toISOString().slice(0, 10);
      trendMap.set(date, (trendMap.get(date) || 0) + 1);
    });

    const pending = rows.filter((item: any) => Number(item.status) < 3).length;
    const closed = rows.filter((item: any) => Number(item.status) >= 3).length;
    const severe = rows.filter((item: any) => Number(item.severity) >= 4).length;
    const falsePositive = rows.filter((item: any) => Number(item.status) === 4).length;
    const estimatedPrecision = rows.length ? Math.round(((closed - falsePositive) / Math.max(closed, 1)) * 100) : 0;

    return {
      days,
      total: rows.length,
      pending,
      closed,
      severe,
      estimated_precision: Math.max(0, Math.min(100, estimatedPrecision)),
      trend: Array.from(trendMap.entries()).map(([date, count]) => ({ date, count })),
      area_rank: this.rankRows(rows, (item) => [item.actual_province, item.actual_city].filter(Boolean).join(' / ')),
      dealer_rank: this.rankRows(rows, (item) => item.agent_name || (item.agent_id ? `代理商#${item.agent_id}` : '')),
      type_rank: this.rankRows(rows, (item) => item.alert_type),
      code_rank: this.rankRows(rows, (item) => item.code || item.box_no || item.shipment_no),
      severity_distribution: this.rankRows(rows, (item) => `L${item.severity || 2}`, 5),
      handle_stats: {
        new_alert: rows.filter((item: any) => Number(item.status) === 0).length,
        acknowledged: rows.filter((item: any) => Number(item.status) === 1).length,
        processing: rows.filter((item: any) => Number(item.status) === 2).length,
        closed,
        false_positive: falsePositive,
      },
    };
  }

  private evidenceObject(value: any): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private numberValue(value: any): number | undefined {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private rectangleValue(value: any, boundsValue?: any): string | undefined {
    const match = String(value || '').trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*;\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    const values = match
      ? match.slice(1).map((item) => this.numberValue(item))
      : [boundsValue?.minLng, boundsValue?.minLat, boundsValue?.maxLng, boundsValue?.maxLat].map((item) => this.numberValue(item));
    if (values.some((item) => item === undefined)) return undefined;
    const [firstLng, firstLat, secondLng, secondLat] = values as number[];
    if (Math.abs(firstLng) > 180 || Math.abs(secondLng) > 180 || Math.abs(firstLat) > 90 || Math.abs(secondLat) > 90) return undefined;
    return `${Math.min(firstLng, secondLng)},${Math.min(firstLat, secondLat)};${Math.max(firstLng, secondLng)},${Math.max(firstLat, secondLat)}`;
  }

  private alertMapRegion(row: any, type: 'actual' | 'authorized') {
    const evidence = this.evidenceObject(row?.evidence);
    const latest = this.evidenceObject(evidence.latest);
    const evRegion = this.evidenceObject(type === 'actual'
      ? (evidence.actual || latest.actual)
      : (evidence.authorized || latest.authorized));
    const rawLocation = type === 'actual'
      ? (row.actual_location || evRegion.location || evRegion.region_group || evRegion.address)
      : (row.authorized_region || evRegion.region_group || evRegion.location || evRegion.address);
    const parsed = this.parseLocation(rawLocation);
    const provinceName = safeText(type === 'actual'
      ? (row.actual_province || evRegion.province_name || evRegion.province || parsed.province_name)
      : (row.authorized_province || evRegion.province_name || evRegion.province || parsed.province_name), 64) || '';
    const cityName = safeText(type === 'actual'
      ? (row.actual_city || evRegion.city_name || evRegion.city || parsed.city_name)
      : (row.authorized_city || evRegion.city_name || evRegion.city || parsed.city_name), 64) || '';
    const location = safeText(rawLocation || [provinceName, cityName].filter(Boolean).join(' / '), 255) || '';
    const key = [this.compact(provinceName), this.compact(cityName)].filter(Boolean).join('/') || this.compact(location);
    const label = [provinceName, cityName].filter(Boolean).join(' / ') || location || '未识别地区';
    const lng = type === 'actual'
      ? this.numberValue(evidence.longitude ?? evidence.lng ?? evidence.latest?.longitude ?? evidence.latest?.lng ?? evRegion.longitude ?? evRegion.lng)
      : this.numberValue(evRegion.longitude ?? evRegion.lng);
    const lat = type === 'actual'
      ? this.numberValue(evidence.latitude ?? evidence.lat ?? evidence.latest?.latitude ?? evidence.latest?.lat ?? evRegion.latitude ?? evRegion.lat)
      : this.numberValue(evRegion.latitude ?? evRegion.lat);
    const rectangle = type === 'actual'
      ? this.rectangleValue(evidence.rectangle ?? latest.rectangle ?? evRegion.rectangle, evidence.bounds ?? latest.bounds ?? evRegion.bounds)
      : this.rectangleValue(evRegion.rectangle, evRegion.bounds);
    return { key, label, province_name: provinceName, city_name: cityName, location, lng, lat, rectangle };
  }

  private isDifferentMapRegion(from: any, to: any) {
    if (!from.key || !to.key) return false;
    const fromProvince = this.compact(from.province_name);
    const fromCity = this.compact(from.city_name);
    const toProvince = this.compact(to.province_name);
    const toCity = this.compact(to.city_name);

    // 授权到市：只有同省同市才算正常，跨市也要画出市级流向。
    if (fromCity) return fromProvince !== toProvince || fromCity !== toCity;
    // 授权到省：省内任一城市均视为授权，跨省才画流向。
    if (fromProvince) return fromProvince !== toProvince;
    return from.key !== to.key;
  }

  async mapData(query: Record<string, any> = {}) {
    const table = this.delegate('antiChannelingAlert');
    if (!table) return { hotspots: [], flows: [] };
    const days = Math.min(Math.max(Number(query.days || 30), 1), 365);
    const limit = Math.min(Math.max(Number(query.limit || 3000), 100), 5000);
    const where = this.alertWhere(query);
    if (!where.created_at) where.created_at = { gte: new Date(Date.now() - days * 86400 * 1000) };
    const rows = await table.findMany({
      where,
      orderBy: [{ last_seen_at: 'desc' }, { created_at: 'desc' }],
      take: limit,
      select: {
        id: true,
        alert_type: true,
        severity: true,
        status: true,
        authorized_region: true,
        authorized_province: true,
        authorized_city: true,
        actual_location: true,
        actual_province: true,
        actual_city: true,
        evidence: true,
      },
    }).catch(() => []);

    const hotspotMap = new Map<string, any>();
    const flowMap = new Map<string, any>();
    const addHotspot = (region: any, isActual: boolean) => {
      if (!region.key || region.label === '未识别地区') return;
      const key = `${isActual ? 'actual' : 'auth'}|${region.key}`;
      const existing = hotspotMap.get(key);
      if (existing) {
        existing.count += 1;
        if (existing.lng === undefined && region.lng !== undefined) existing.lng = region.lng;
        if (existing.lat === undefined && region.lat !== undefined) existing.lat = region.lat;
        if (!existing.rectangle && region.rectangle) existing.rectangle = region.rectangle;
      } else {
        hotspotMap.set(key, {
          label: region.label,
          province: region.province_name,
          city: region.city_name,
          location: region.location,
          lng: region.lng,
          lat: region.lat,
          rectangle: region.rectangle,
          count: 1,
          isActual,
          level: region.city_name ? 'city' : 'province',
        });
      }
    };

    for (const row of rows) {
      const actual = this.alertMapRegion(row, 'actual');
      const auth = this.alertMapRegion(row, 'authorized');
      addHotspot(actual, true);
      addHotspot(auth, false);
      if (!this.isDifferentMapRegion(auth, actual)) continue;
      const key = `${auth.key}→${actual.key}`;
      const existing = flowMap.get(key);
      if (existing) {
        existing.count += 1;
        if (existing.toLng === undefined && actual.lng !== undefined) existing.toLng = actual.lng;
        if (existing.toLat === undefined && actual.lat !== undefined) existing.toLat = actual.lat;
        if (!existing.toRectangle && actual.rectangle) existing.toRectangle = actual.rectangle;
      } else {
        flowMap.set(key, {
          from: auth.label,
          fromProvince: auth.province_name,
          fromCity: auth.city_name,
          fromLocation: auth.location,
          fromRectangle: auth.rectangle,
          to: actual.label,
          toProvince: actual.province_name,
          toCity: actual.city_name,
          toLocation: actual.location,
          toLng: actual.lng,
          toLat: actual.lat,
          toRectangle: actual.rectangle,
          count: 1,
          fromLevel: auth.city_name ? 'city' : 'province',
          toLevel: actual.city_name ? 'city' : 'province',
        });
      }
    }

    return {
      days,
      total: rows.length,
      hotspots: Array.from(hotspotMap.values()).sort((a: any, b: any) => Number(b.isActual) - Number(a.isActual) || b.count - a.count).slice(0, 80),
      flows: Array.from(flowMap.values()).sort((a: any, b: any) => b.count - a.count).slice(0, 50),
    };
  }

  async listNotifications(query: Record<string, any> = {}) {
    const table = this.delegate('antiChannelingNotification');
    if (!table) return { list: [], pagination: { page: 1, pageSize: 20, total: 0 } };
    const { page, pageSize, skip } = pageParams(query);
    const where: Record<string, any> = {};
    if (query.alert_id) where.alert_id = safeId(query.alert_id, 'alert_id');
    if (query.channel) where.channel = safeText(query.channel, 32);
    if (query.status !== undefined && query.status !== '') where.status = Number(query.status);
    const [total, list] = await Promise.all([
      table.count({ where }).catch(() => 0),
      table.findMany({ where, orderBy: [{ status: 'asc' }, { id: 'desc' }], skip, take: pageSize }).catch(() => []),
    ]);
    return { list, pagination: { page, pageSize, total } };
  }

  async retryNotification(id: string | number) {
    const table = this.delegate('antiChannelingNotification');
    if (!table) throw new NotFoundException('防窜通知表未初始化');
    const row = await table.findUnique({ where: { id: safeId(id) } }).catch(() => null);
    if (!row) throw new NotFoundException('通知记录不存在');
    return table.update({
      where: { id: row.id },
      data: {
        status: 1,
        error: null,
        sent_at: new Date(),
        payload: { ...(row.payload || {}), retried_at: new Date().toISOString(), retry_note: '已重新加入推送队列/本地通知记录已刷新' },
      },
    });
  }

  async createManualAlert(body: Record<string, any>, admin?: any) {
    const alertType = (String(body.alert_type || 'shipment_region_mismatch') as RuleCode);
    if (!DEFAULT_RULES[alertType]) throw new BadRequestException('不支持的防窜预警类型');
    const actual = this.parseLocation(body.actual_location || body.location);
    const authorized = this.parseLocation(body.authorized_region || body.authorized_location);
    const alert = await this.upsertAlert(alertType, {
      code: body.code,
      box_no: body.box_no,
      shipment_no: body.shipment_no,
      product_id: body.product_id,
      product_code: body.product_code,
      product_name: body.product_name,
      agent_id: body.agent_id,
      agent_name: body.agent_name,
      authorized_region: body.authorized_region,
      authorized_province: body.authorized_province || authorized.province_name,
      authorized_city: body.authorized_city || authorized.city_name,
      actual_location: body.actual_location || body.location,
      actual_province: body.actual_province || actual.province_name,
      actual_city: body.actual_city || actual.city_name,
      ip: body.ip,
      device_id: body.device_id,
      user_agent: body.user_agent,
      severity: body.severity,
      remark: body.remark,
      evidence: {
        rule: '人工稽查登记',
        operator: admin?.username || admin?.real_name || admin?.id || 'system',
        source: 'manual_inspection',
        payload: body,
      },
    });
    return alert;
  }

  async evaluateShipmentByInput(body: Record<string, any>) {
    const where: Record<string, any> = {};
    if (body.shipment_id) where.id = safeId(body.shipment_id, 'shipment_id');
    else if (body.shipment_no) where.shipment_no = safeText(body.shipment_no, 128);
    else throw new BadRequestException('请提供 shipment_id 或 shipment_no');
    const shipment = await this.prisma.shipment.findFirst({ where }).catch(() => null);
    if (!shipment) throw new NotFoundException('发货单不存在');
    const boxIds = safeJsonArray(shipment.box_ids).map((item: any) => Number(item)).filter((item: number) => Number.isFinite(item));
    const boxes = boxIds.length ? await this.prisma.box.findMany({ where: { id: { in: boxIds } } }).catch(() => []) : [];
    return this.evaluateShipment({
      shipment,
      boxes,
      action: body.action || '防窜规则手动评估',
      scan_location: body.scan_location || body.location,
      ip: body.ip,
      userAgent: body.user_agent,
    });
  }

  async evaluateShipmentPreCheck(body: Record<string, any>) {
    const shipmentAgent = body.agent_id
      ? await this.prisma.agent.findUnique({ where: { id: Number(body.agent_id) } }).catch(() => null)
      : null;
    const shipmentRegion = this.shipmentDecisionRegion({
      authorization_address: body.authorization_address,
      sender_address: body.sender_address,
      receiver_address: body.receiver_address,
      authorization_source: body.authorization_source,
      province_name: body.province_name,
      city_name: body.city_name,
    }, shipmentAgent);
    if (!shipmentRegion.province_name && !shipmentRegion.city_name) {
      throw new BadRequestException('请选择已配置所属地区的收件代理商；出库后防伪码授权位置以该代理商所属地区为准');
    }

    return {
      safe: true,
      risk_level: 'none',
      decision_region: shipmentRegion,
      warnings: [],
      skipped: true,
      skip_reason: 'box_and_shipment_codes_do_not_trigger_anti_channeling',
      suggestion: '箱码、发货码及其他业务码不参与防窜预警；出库后仅防伪码扫码进入防窜判定。',
    };
  }

}
