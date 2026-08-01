export type ModuleRelation = {
  module: string;
  name: string;
  owns: string[];
  upstream: string[];
  downstream: string[];
  scanner_role?: string;
  api_prefix: string[];
};

export const moduleRelations: ModuleRelation[] = [
  {
    module: 'product',
    name: '产品管理',
    owns: ['产品编号', '产品名称', '品牌', '分类', '规格', '状态'],
    upstream: [],
    downstream: ['product-region', 'code', 'trace', 'box'],
    scanner_role: '扫码解析产品编号，作为地区分类、装箱校验和溯源建档的主数据。',
    api_prefix: ['/products'],
  },
  {
    module: 'product-region',
    name: '产品地区管理',
    owns: ['产品-省市-仓库-企业主体映射', '码规则', '扫码次数', '最近扫码'],
    upstream: ['product', 'manufacturer'],
    downstream: ['scanner', 'trace', 'box', 'shipment'],
    scanner_role: '扫码枪识别 FW-GD-SZ-A001-* 后，把 A001 归入广东省深圳市分类，并回写最后扫码记录。',
    api_prefix: ['/product-regions'],
  },
  {
    module: 'code',
    name: '防伪码管理',
    owns: ['防伪码', '批次', '状态', '查询次数'],
    upstream: ['product'],
    downstream: ['query', 'scanner', 'trace', 'box'],
    scanner_role: '分类装箱扫描的最小单元；每个码只能属于一个产品和批次。',
    api_prefix: ['/codes'],
  },
  {
    module: 'trace',
    name: '溯源管理',
    owns: ['溯源编号', '防伪码', '批次', '溯源链节点'],
    upstream: ['product', 'code', 'product-region', 'box', 'shipment'],
    downstream: ['query', 'scanner'],
    scanner_role: '装箱、加入发货单、出库、签收、异常都会自动追加溯源节点。',
    api_prefix: ['/trace'],
  },
  {
    module: 'box',
    name: '装箱管理',
    owns: ['箱号', '箱内容码', '箱规', '箱状态'],
    upstream: ['product', 'code', 'product-region'],
    downstream: ['shipment', 'trace'],
    scanner_role: '扫码防伪码装箱；按产品、批次、地区做混装校验和自动建箱。',
    api_prefix: ['/box'],
  },
  {
    module: 'shipment',
    name: '发货管理',
    owns: ['发货单', '箱 ID 列表', '物流单号', '收发货信息', '状态'],
    upstream: ['box', 'manufacturer', 'product-region'],
    downstream: ['trace', 'return'],
    scanner_role: '扫码箱号加入发货单；扫码发货单号确认发货并推进箱状态。',
    api_prefix: ['/shipments'],
  },
  {
    module: 'scanner',
    name: '扫码业务台',
    owns: ['扫码解析', '业务动作', '批量扫码', '链路返回'],
    upstream: ['product', 'product-region', 'code', 'trace', 'box', 'shipment'],
    downstream: ['product-region', 'trace', 'box', 'shipment'],
    scanner_role: '统一入口：扫产品码归地区，扫防伪码装箱/溯源，扫箱号发货，扫发货单确认出库。',
    api_prefix: ['/scanner'],
  },
  {
    module: 'manufacturer',
    name: '企业主体管理',
    owns: ['公司/代理商标签', '主体编号', '省市', '联系人', '等级'],
    upstream: [],
    downstream: ['product-region', 'shipment', 'return'],
    scanner_role: '地区分类和发货收货方的统一渠道主体。',
    api_prefix: ['/manufacturers', '/partners'],
  },
  {
    module: 'query',
    name: '防伪查询',
    owns: ['消费者查码', '查询日志', '风险记录'],
    upstream: ['code', 'trace', 'product-region', 'shipment'],
    downstream: ['dashboard', 'risk'],
    scanner_role: '扫码溯源结果的查询侧展示和日志沉淀。',
    api_prefix: ['/query'],
  },
  {
    module: 'system',
    name: '系统管理',
    owns: ['账号', '角色', '权限', '模块开关', '系统参数', '审计日志'],
    upstream: [],
    downstream: ['all'],
    scanner_role: '控制扫码权限、启停模块、业务配置和审计追踪。',
    api_prefix: ['/system', '/settings'],
  },
];
