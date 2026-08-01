export type SettingGroupMeta = { key: string; title: string; desc: string; highRisk?: boolean };

export const settingGroups: SettingGroupMeta[] = [
  { key: 'ui_theme', title: 'UI风格主题', desc: '后台整体视觉主题、深浅色和品牌主色配置' },
  { key: 'layout_lowcode', title: '低代码布局设置', desc: '后台骨架、菜单行为、内容宽度和快捷页签配置' },
  { key: 'basic_system', title: '基础系统通用设置', desc: '系统名称、Logo、时区、登录策略、首页看板与底部信息', highRisk: true },
  { key: 'enterprise_brand', title: '企业 & 品牌信息设置', desc: '企业资料、品牌、厂区仓库、区域和资质配置' },
  { key: 'account_role_permission', title: '账号权限 & 角色管理', desc: '管理员、角色、菜单按钮权限、数据权限和登录白名单', highRisk: true },
  { key: 'anti_fake_code_rules', title: '防伪码核心规则设置', desc: '码类型、编码规则、加密、码段和扫码限制', highRisk: true },
  { key: 'trace_flow', title: '溯源流程自定义设置', desc: '溯源节点、表单字段、审批、消费者页和窜货规则', highRisk: true },
  { key: 'product_archive', title: '产品档案分类设置', desc: '产品多级分类、规格单位、基础模板、启停和原料关联' },
  { key: 'print_material', title: '标签打印 & 物料设置', desc: '标签模板、打印参数、外箱内袋合格证和变量配置' },
  { key: 'data_risk_control', title: '风控 & 防窜货设置', desc: '窜货阈值、举报、高频扫码、异常 IP 和经销商授权', highRisk: true },
  { key: 'notification', title: '消息 & 通知设置', desc: '站内信、短信、邮件、公众号和小程序消息' },
  { key: 'query_panel_appearance', title: '前台查询面板可视化设置', desc: '消费者查询页装修、展示项脱敏、固定文案和引流组件' },
  { key: 'data_report', title: '数据 & 报表设置', desc: '备份恢复、定时报表、导出权限和数据清理', highRisk: true },
  { key: 'integration', title: '接口与第三方对接设置', desc: '开放 API、ERP、WMS、电商、扫码硬件和小程序 H5', highRisk: true },
  { key: 'business_workflow', title: '后台业务流程配置', desc: '扫码枪动作、业务快捷入口、页面字段和流程模板', highRisk: true },
  { key: 'security_log', title: '安全 & 日志设置', desc: '日志记录、脱敏、二次验证和黑名单', highRisk: true },
];

export function assertSettingGroup(group: string) {
  if (!settingGroups.some((item: any) => item.key === group)) throw new Error('设置分组不存在');
}
