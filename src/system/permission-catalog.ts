export type PermissionCatalogItem = {
  permission_code: string;
  permission_name: string;
  module: string;
  description?: string;
};

export const permissionCatalog: PermissionCatalogItem[] = [
  { permission_code: 'dashboard:view', permission_name: '查看仪表盘', module: 'dashboard' },
  { permission_code: 'query:view', permission_name: '防伪查询', module: 'query' },
  { permission_code: 'anti-channeling:view', permission_name: '查看防窜预警', module: 'anti-channeling' },
  { permission_code: 'anti-channeling:manage', permission_name: '处理防窜预警与规则', module: 'anti-channeling' },
  { permission_code: 'scanner:use', permission_name: '使用扫码业务台', module: 'scanner' },
  { permission_code: 'scanner:execute', permission_name: '执行扫码业务动作', module: 'scanner' },
  { permission_code: 'product:view', permission_name: '查看产品', module: 'product' },
  { permission_code: 'product:manage', permission_name: '维护产品', module: 'product' },
  { permission_code: 'manufacturer:view', permission_name: '查看企业主体', module: 'manufacturer' },
  { permission_code: 'manufacturer:manage', permission_name: '维护企业主体', module: 'manufacturer' },
  { permission_code: 'product-region:view', permission_name: '查看产品地区', module: 'product-region' },
  { permission_code: 'product-region:manage', permission_name: '维护产品地区', module: 'product-region' },
  { permission_code: 'code:view', permission_name: '查看防伪码', module: 'code' },
  { permission_code: 'code:generate', permission_name: '生成防伪码', module: 'code' },
  { permission_code: 'code:activate', permission_name: '激活/锁定防伪码', module: 'code' },
  { permission_code: 'code:cancel', permission_name: '注销防伪码', module: 'code' },
  { permission_code: 'code:delete', permission_name: '删除防伪码', module: 'code', description: '物理删除防伪码，并同步移出箱码清单' },
  { permission_code: 'trace:view', permission_name: '查看溯源', module: 'trace' },
  { permission_code: 'trace:manage', permission_name: '维护溯源', module: 'trace' },
  { permission_code: 'box:view', permission_name: '查看装箱', module: 'box' },
  { permission_code: 'box:manage', permission_name: '维护装箱', module: 'box' },
  { permission_code: 'shipment:view', permission_name: '查看发货', module: 'shipment' },
  { permission_code: 'shipment:manage', permission_name: '维护发货', module: 'shipment' },
  { permission_code: 'return:view', permission_name: '查看退货', module: 'return' },
  { permission_code: 'return:manage', permission_name: '维护退货', module: 'return' },
  { permission_code: 'return:complete', permission_name: '完成退货单', module: 'return' },
  { permission_code: 'agent:view', permission_name: '查看代理商档案（兼容旧权限）', module: 'manufacturer' },
  { permission_code: 'agent:manage', permission_name: '维护代理商档案（兼容旧权限）', module: 'manufacturer' },
  { permission_code: 'certificate:view', permission_name: '查看证书', module: 'certificate' },
  { permission_code: 'certificate:manage', permission_name: '维护证书', module: 'certificate' },
  { permission_code: 'process:view', permission_name: '查看流程', module: 'process' },
  { permission_code: 'process:manage', permission_name: '维护流程', module: 'process' },
  { permission_code: 'admin:manage', permission_name: '管理员与权限管理', module: 'system' },
  { permission_code: 'system:setting', permission_name: '系统参数设置', module: 'system' },
  { permission_code: 'log:view', permission_name: '查看系统日志', module: 'system' },
  { permission_code: 'upload:manage', permission_name: '上传文件', module: 'system' },
  { permission_code: 'export:download', permission_name: '导出数据', module: 'system' },
];

export function normalizePermissionCodes(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\s,，;；]+/);
  return Array.from(new Set(raw.map((item: any) => String(item || '').trim()).filter(Boolean)));
}
