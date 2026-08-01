import { permissionCatalog, type PermissionCatalogItem } from './permission-catalog.js';

export type EnterpriseModuleConfig = {
  module_key: string;
  module_name: string;
  route?: string;
  icon?: string;
  description?: string;
  enabled: boolean;
  sort: number;
  category?: string;
  permissions: PermissionCatalogItem[];
};

type ModulePreset = Omit<EnterpriseModuleConfig, 'permissions'>;

const modulePresets: ModulePreset[] = [
  { module_key: 'dashboard', module_name: '仪表盘', route: '/dashboard', icon: 'dashboard', description: '企业经营与防伪溯源核心指标看板', enabled: true, sort: 10, category: 'console' },
  { module_key: 'product', module_name: '产品管理', route: '/products', icon: 'product', description: '产品档案、品牌、规格和状态维护', enabled: true, sort: 20, category: 'master_data' },
  { module_key: 'manufacturer', module_name: '企业主体管理', route: '/manufacturers', icon: 'brand', description: '统一维护公司、代理商、渠道商和联系人地区信息', enabled: true, sort: 25, category: 'master_data' },
  { module_key: 'code', module_name: '防伪码管理', route: '/codes', icon: 'code', description: '防伪码生成、激活、锁定、注销和二维码导出', enabled: true, sort: 30, category: 'anti_fake' },
  { module_key: 'product-region', module_name: '产品地区管理', route: '/product-regions', icon: 'region', description: '产品、区域、仓库和代理商映射，支撑扫码枪地区分类', enabled: true, sort: 35, category: 'master_data' },
  { module_key: 'query', module_name: '防伪查询', route: '/query', icon: 'query', description: '后台查码与消费者查询记录核验', enabled: true, sort: 40, category: 'anti_fake' },
  { module_key: 'anti-channeling', module_name: '防窜预警', route: '/anti-channeling', icon: 'risk', description: '地理围栏、异地扫码、IP 高频和设备异常预警闭环', enabled: true, sort: 45, category: 'anti_fake' },
  { module_key: 'scanner', module_name: '扫码业务台', route: '/scanner', icon: 'keyboard', description: '扫码枪/PDA 统一业务入口', enabled: true, sort: 50, category: 'operation' },
  { module_key: 'trace', module_name: '溯源管理', route: '/trace', icon: 'trace', description: '批次溯源链路、节点和公开展示配置', enabled: true, sort: 60, category: 'trace' },
  { module_key: 'box', module_name: '装箱管理', route: '/box', icon: 'box', description: '单品码装箱、封箱和箱码维护', enabled: true, sort: 70, category: 'warehouse' },
  { module_key: 'shipment', module_name: '发货管理', route: '/shipments', icon: 'shipment', description: '发货单、物流单号、代理商收发货', enabled: true, sort: 80, category: 'warehouse' },
  { module_key: 'return', module_name: '退货管理', route: '/returns', icon: 'return', description: '退货单、退货码和售后闭环处理', enabled: true, sort: 90, category: 'warehouse' },
  { module_key: 'certificate', module_name: '证书管理', route: '/certificates', icon: 'certificate', description: '产品资质、检验证书和附件维护', enabled: true, sort: 110, category: 'master_data' },
  { module_key: 'process', module_name: '流程管理', route: '/process', icon: 'process', description: '生产、质检、仓储等过程记录', enabled: true, sort: 120, category: 'trace' },
  { module_key: 'system', module_name: '系统管理', route: '/system', icon: 'system', description: '管理员、角色、权限、模块、参数和日志', enabled: true, sort: 900, category: 'system' },
];

function normalizeCustomModules(value: unknown): Record<string, Partial<EnterpriseModuleConfig>> {
  const raw = Array.isArray(value) ? value : [];
  const result: Record<string, Partial<EnterpriseModuleConfig>> = {};
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const moduleKey = String((item as any).module_key || (item as any).key || '').trim();
    if (!moduleKey) continue;
    result[moduleKey] = item as Partial<EnterpriseModuleConfig>;
  }
  return result;
}

export function buildEnterpriseModules(customValue?: unknown): EnterpriseModuleConfig[] {
  const permissionGroups = new Map<string, PermissionCatalogItem[]>();
  for (const item of permissionCatalog) {
    const key = item.module || 'other';
    permissionGroups.set(key, [...(permissionGroups.get(key) || []), item]);
  }

  const custom = normalizeCustomModules(customValue);
  const presetMap = new Map(modulePresets.map((item: any) => [item.module_key, item]));
  const keys = Array.from(new Set([...modulePresets.map((item: any) => item.module_key), ...permissionGroups.keys(), ...Object.keys(custom)]));

  return keys.map((key, index) => {
    const preset = presetMap.get(key) || { module_key: key, module_name: key, enabled: true, sort: 500 + index * 10, category: 'custom' };
    const override = custom[key] || {};
    return {
      ...preset,
      ...override,
      module_key: key,
      module_name: String(override.module_name || preset.module_name || key),
      route: override.route ?? preset.route,
      icon: override.icon ?? preset.icon,
      description: override.description ?? preset.description,
      category: override.category ?? preset.category,
      enabled: override.enabled === undefined ? Boolean(preset.enabled) : Boolean(override.enabled),
      sort: Number.isFinite(Number(override.sort ?? preset.sort)) ? Number(override.sort ?? preset.sort) : 999,
      permissions: permissionGroups.get(key) || [],
    } satisfies EnterpriseModuleConfig;
  }).sort((a: any, b: any) => a.sort - b.sort || a.module_key.localeCompare(b.module_key));
}
