import { computed, reactive } from 'vue';
import type { RouteRecordRaw } from 'vue-router';

export type Locale = 'zh-CN' | 'en-US';

const LOCALE_KEY = 'trace_admin_locale';

const messages = {
  'zh-CN': {
    common: {
      appName: '防伪溯源后台',
      adminSubTitle: 'Soybean Trace Admin',
      managementConsole: 'Management Console',
      backend: '后台管理',
      overview: 'Overview',
      traceabilityAdmin: 'Traceability Admin',
      actions: '操作',
      search: '查询',
      reset: '重置',
      refresh: '刷新',
      refreshData: '刷新数据',
      refreshCurrent: '刷新当前模块',
      save: '保存',
      saveConfig: '保存配置',
      create: '新增',
      detail: '详情',
      edit: '编辑',
      delete: '删除',
      cancel: '取消',
      confirm: '确定',
      total: '共 {count} 条',
      noData: '暂无数据',
      enabled: '开启',
      disabled: '关闭',
      realtime: '实时',
      all: '合计',
      loadingConfig: '正在加载配置',
      configItems: '{count} 项配置',
      language: '语言',
      theme: '主题',
      color: '配色',
      light: '浅色',
      dark: '深色',
    },
    layout: {
      navTitle: '业务导航',
      scanner: '扫码业务台',
      themeSettings: '主题配置',
      panelColor: '面板配色',
      colorTip: '选择后台面板主色，立即应用并保存到本机。',
      themeToggle: '黑白主题切换',
      languageToggle: 'EN',
      profile: '个人中心',
      logout: '退出登录',
      superAdmin: '超级管理员',
      normalAdmin: '普通管理员',
      admin: '管理员',
      footerTheme: '可定制主题',
      footerDesc: 'Light / Dark / Color',
      expand: '展开侧边栏',
      collapse: '收起侧边栏',
    },
    menu: {
      dashboard: '仪表盘', products: '产品管理', codes: '防伪码管理', query: '防伪查询', scanner: '扫码业务台', trace: '溯源管理', box: '装箱管理', shipments: '发货管理', returns: '退货管理', agents: '代理商管理', certificates: '证书管理', process: '流程管理', system: '系统管理', settings: '面板设置', profile: '个人中心', verify: '防伪码验证', workbench: '工作台', login: '登录', backend: '后台',
    },
    dashboard: {
      title: '仪表盘', desc: '实时查看产品、防伪码、查询、发货和异常数据，快速掌握系统运行状态。',
      trendTitle: '查询趋势', trendSubtitle: '展示最近查询走势，方便快速判断活动效果与异常峰值。', trendSeries: '查询次数',
      distributionTitle: '防伪码分布', distributionSubtitle: '按状态统计码量，中文标签更直观。',
      recentTitle: '最近查询记录', agentRank: '代理商排行', code: '防伪码', result: '结果', time: '时间', agent: '代理商', count: '数量', real: '正品', abnormal: '异常', emptyDistribution: '暂无分布数据',
      stats: { products: '产品总数', codes: '防伪码总数', boxes: '装箱数', queries: '累计查询', agents: '代理商', shipments: '发货单', todayQueries: '今日查询', fakeCount: '异常查询' },
    },
    crud: {
      desc: '支持查询筛选、分页列表、新增编辑、详情查看和删除操作。', lowCode: '低代码助手', lowCodeTips: '低代码操作提示', viewSteps: '查看步骤', tableTemplate: '表单模板：', quickFill: '快捷填充：', confirmDelete: '确认删除该记录？', detailTitle: '详情', recommendedSteps: '推荐操作步骤', oneClickTemplate: '一键模板', useTemplate: '用此模板新增', presetSuccess: '已填入“{label}”模板，可继续微调', saveSuccess: '保存成功', deleteSuccess: '删除成功', createTitle: '新增{title}', editTitle: '编辑{title}', required: '请填写{label}', input: '请输入{label}', select: '请选择{label}', arrayPlaceholder: '每行一个，或用逗号/空格分隔', defaultLowCodeDesc: '通过模板、步骤和快捷填充完成常用操作，减少手动输入。',
    },
    products: {
      title: '产品管理', shortTitle: '产品', keyword: '关键词', keywordPlaceholder: '产品名称/编号', category: '分类', categoryPlaceholder: '请输入分类', brand: '品牌', brandPlaceholder: '请输入品牌', status: '状态', code: '产品编号', name: '产品名称', spec: '规格', unit: '单位', image: '图片', createdAt: '创建时间', description: '产品描述', extraFields: '扩展字段配置', imageField: '产品图片',
      lowTitle: '产品低代码建档助手', lowDesc: '选择行业模板即可自动填充分类、单位、扩展字段和描述，新员工只需要改产品名称、品牌和规格即可完成建档。',
      tips1: '先选择一个产品模板，再补充产品名称、品牌、规格和图片。', tips2: '扩展字段已提供常用字段，可通过可视化配置增删，保持默认也可保存。',
      step1: '选择模板', step1Desc: '食品、化妆品、电子产品等模板会自动带出常用字段。', step2: '补齐关键信息', step2Desc: '只需填写产品编号、产品名称、品牌、规格、图片。', step3: '保存并生成防伪码', step3Desc: '保存产品后进入防伪码管理，使用批量生成模板创建码。',
      food: '食品产品模板', foodDesc: '适合食品、饮料、农产品。', cosmetics: '化妆品模板', cosmeticsDesc: '适合护肤品、洗护、彩妆。', electronics: '电子产品模板', electronicsDesc: '适合设备、配件、耗材。',
      codePlaceholder: '例如：P20240101001', codeHelp: '可使用低代码模板自动生成编号，也可以手动输入。', extraHelp: '低代码模板会自动生成常用扩展字段，例如保质期、产地、执行标准。',
    },
    settings: {
      eyebrow: 'Enterprise Control Center', title: '面板设置', desc: '覆盖系统、企业、权限、防伪、溯源、打印、风控、通知、外观、报表、接口和安全日志等业务落地配置。',
      modules: '设置模块', previewVerify: '预览验证页', highRiskTip: '当前模块包含安全、权限或风控配置，保存前请确认影响范围，敏感修改建议开启二次验证与操作日志。', saved: '配置已保存', jsonTeachingTitle: '可视化配置说明：{label}',
      jsonTips: ['通过字段表或列表维护配置，保存前系统会自动校验结构。', '配置项只用于业务展示和流程控制，请不要填写密码、私钥、Token、Cookie、数据库连接串等敏感信息。', '列表适合维护多条规则，字段表适合维护键值映射；字段名建议使用英文小写、数字和下划线，便于接口和报表复用。', '涉及权限、风控、扫码或接口的配置变更属于高风险操作，建议开启二次验证、操作日志和灰度发布。'],
      groups: {
        basic_system: { title: '基础系统通用设置', desc: '系统名称、Logo、时区、登录策略、首页看板与底部信息' },
        enterprise_brand: { title: '企业 & 品牌信息设置', desc: '企业资料、品牌、厂区仓库、区域和资质配置' },
        account_role_permission: { title: '账号权限 & 角色管理', desc: '管理员、角色、菜单按钮权限、数据权限和登录白名单' },
        anti_fake_code_rules: { title: '防伪码核心规则设置', desc: '码类型、编码规则、加密、码段、一物一码和扫码限制' },
        trace_flow: { title: '溯源流程自定义设置', desc: '溯源节点、表单字段、审批、消费者页和窜货规则' },
        product_archive: { title: '产品档案分类设置', desc: '产品多级分类、规格单位、基础模板、启停和原料关联' },
        print_material: { title: '标签打印 & 物料设置', desc: '标签模板、打印参数、外箱内袋合格证和变量配置' },
        data_risk_control: { title: '风控 & 防窜货设置', desc: '窜货阈值、举报、高频扫码、异常 IP 和经销商授权' },
        notification: { title: '消息 & 通知设置', desc: '站内信、短信、邮件、公众号和小程序消息' },
        query_panel_appearance: { title: '前台查询面板可视化设置', desc: '消费者防伪验证页零代码装修、字段展示、溯源模块、CTA 和广告配置' },
        data_report: { title: '数据 & 报表设置', desc: '备份恢复、定时报表、导出权限和数据清理' },
        integration: { title: '接口与第三方对接设置', desc: '开放 API、ERP、WMS、电商、扫码硬件和小程序 H5' },
        business_workflow: { title: '后台业务流程配置', desc: '扫码枪动作、业务快捷入口、页面字段和流程模板' },
        security_log: { title: '安全 & 日志设置', desc: '操作日志、登录日志、扫码日志、脱敏、二次验证和黑名单' },
      },
      fields: {
        home_cover: '后台 Logo', admin_title: '后台标题', site_name: '系统名称', login_logo: '登录页 Logo', favicon: '浏览器图标', default_language: '默认语言', timezone: '默认时区', date_format: '日期格式', time_format: '时间格式', datetime_format: '日期时间格式', currency: '默认货币', multi_language_pack: '多语言文案包', login_token_ttl_hours: '登录有效期/小时', session_timeout_minutes: '会话超时/分钟', password_expire_days: '密码有效期/天', force_change_password: '强制改密开关', dashboard_widgets: '首页仪表盘看板配置', copyright: '底部版权信息', icp_no: '备案号', customer_service: '客服联系方式', company_name: '企业名称', social_credit_code: '统一社会信用代码', company_address: '企业地址', contact_name: '联系人', contact_phone: '联系电话', brand_list: '品牌管理', site_networks: '生产厂区 / 仓库 / 分厂', region_rules: '区域划分设置', business_license: '营业执照', production_license: '生产许可', quality_report: '质检报告展示配置', primary_color: '主题主色', page_logo: '验证页 Logo', brand_name: '品牌 / 企业名称', hero_title: '首屏主标题', hero_subtitle: '首屏说明文案', scanner_enabled: '启用扫码业务台', scanner_global_listen: '扫码枪全局监听', scanner_min_length: '最短码长', scanner_interval_ms: '扫码字符间隔/ms', enabled_workflows: '允许的扫码动作', field_alias_map: '后台字段别名映射', api_key: '接口密钥', operation_log_enabled: '操作日志记录', login_log_enabled: '登录日志记录', scan_log_enabled: '扫码日志记录', data_masking_enabled: '数据脱敏', sensitive_operation_mfa: '敏感操作二次验证', ip_blacklist: '恶意扫码 IP 黑名单',
      },
    },
    status: { active: '已激活', inactive: '未激活', locked: '已锁定', cancelled: '已注销', queried: '已查询', fake: '异常查询' },
  },
  'en-US': {
    common: {
      appName: 'Trace Admin', adminSubTitle: 'Soybean Trace Admin', managementConsole: 'Management Console', backend: 'Admin', overview: 'Overview', traceabilityAdmin: 'Traceability Admin', actions: 'Actions', search: 'Search', reset: 'Reset', refresh: 'Refresh', refreshData: 'Refresh Data', refreshCurrent: 'Refresh Module', save: 'Save', saveConfig: 'Save Settings', create: 'Create', detail: 'Details', edit: 'Edit', delete: 'Delete', cancel: 'Cancel', confirm: 'OK', total: '{count} items', noData: 'No data', enabled: 'On', disabled: 'Off', realtime: 'Live', all: 'Total', loadingConfig: 'Loading settings', configItems: '{count} settings', language: 'Language', theme: 'Theme', color: 'Color', light: 'Light', dark: 'Dark',
    },
    layout: { navTitle: 'Navigation', scanner: 'Scanner Desk', themeSettings: 'Theme Settings', panelColor: 'Panel Color', colorTip: 'Pick a primary color for the admin panel. It applies immediately and is saved locally.', themeToggle: 'Light / Dark', languageToggle: '中文', profile: 'Profile', logout: 'Log out', superAdmin: 'Super Admin', normalAdmin: 'Admin', admin: 'Admin', footerTheme: 'Custom Theme', footerDesc: 'Light / Dark / Color', expand: 'Expand sidebar', collapse: 'Collapse sidebar' },
    menu: { dashboard: 'Dashboard', products: 'Products', codes: 'Anti-counterfeit Codes', query: 'Verification Query', scanner: 'Scanner Desk', trace: 'Traceability', box: 'Boxing', shipments: 'Shipments', returns: 'Returns', agents: 'Agents', certificates: 'Certificates', process: 'Process', system: 'System', settings: 'Panel Settings', profile: 'Profile', verify: 'Code Verification', workbench: 'Workbench', login: 'Login', backend: 'Admin' },
    dashboard: { title: 'Dashboard', desc: 'Monitor products, codes, queries, shipments and anomalies in real time.', trendTitle: 'Query Trend', trendSubtitle: 'Shows recent query volume to spot campaign performance and abnormal spikes.', trendSeries: 'Queries', distributionTitle: 'Code Distribution', distributionSubtitle: 'Code counts grouped by status.', recentTitle: 'Recent Queries', agentRank: 'Agent Ranking', code: 'Code', result: 'Result', time: 'Time', agent: 'Agent', count: 'Count', real: 'Genuine', abnormal: 'Abnormal', emptyDistribution: 'No distribution data', stats: { products: 'Products', codes: 'Codes', boxes: 'Boxes', queries: 'Total Queries', agents: 'Agents', shipments: 'Shipments', todayQueries: 'Today', fakeCount: 'Anomalies' } },
    crud: { desc: 'Supports filtering, pagination, create/edit, detail view and delete operations.', lowCode: 'Low-code Assistant', lowCodeTips: 'Low-code Tips', viewSteps: 'View Steps', tableTemplate: 'Templates:', quickFill: 'Quick Fill:', confirmDelete: 'Delete this record?', detailTitle: 'Details', recommendedSteps: 'Recommended Steps', oneClickTemplate: 'Templates', useTemplate: 'Use this template', presetSuccess: 'Template “{label}” has been applied. You can keep editing.', saveSuccess: 'Saved', deleteSuccess: 'Deleted', createTitle: 'Create {title}', editTitle: 'Edit {title}', required: 'Please enter {label}', input: 'Enter {label}', select: 'Select {label}', arrayPlaceholder: 'One per line, or separated by comma/space', defaultLowCodeDesc: 'Use templates, steps and quick fill to reduce manual input.' },
    products: { title: 'Products', shortTitle: 'Product', keyword: 'Keyword', keywordPlaceholder: 'Name / Code', category: 'Category', categoryPlaceholder: 'Enter category', brand: 'Brand', brandPlaceholder: 'Enter brand', status: 'Status', code: 'Product Code', name: 'Product Name', spec: 'Specification', unit: 'Unit', image: 'Image', createdAt: 'Created At', description: 'Description', extraFields: 'Extra Field Settings', imageField: 'Product Image', lowTitle: 'Low-code Product Assistant', lowDesc: 'Choose an industry template to auto-fill category, unit, extra fields and description. New staff only need to update name, brand and specification.', tips1: 'Choose a template first, then complete name, brand, specification and image.', tips2: 'Common extra fields are prefilled and can be maintained visually; keeping defaults is also fine.', step1: 'Choose a template', step1Desc: 'Food, cosmetics and electronics templates prefill common fields.', step2: 'Complete key info', step2Desc: 'Only product code, name, brand, specification and image are required.', step3: 'Save and generate codes', step3Desc: 'After saving, go to Code Management and create codes with the batch generator.', food: 'Food Product Template', foodDesc: 'For food, beverages and agricultural products.', cosmetics: 'Cosmetics Template', cosmeticsDesc: 'For skincare, personal care and makeup.', electronics: 'Electronics Template', electronicsDesc: 'For devices, accessories and consumables.', codePlaceholder: 'e.g. P20240101001', codeHelp: 'Use a low-code template to generate a code, or enter one manually.', extraHelp: 'Templates generate common extra fields such as shelf life, origin and standard.' },
    settings: { eyebrow: 'Enterprise Control Center', title: 'Panel Settings', desc: 'Configure system, enterprise, permissions, anti-counterfeit, traceability, printing, risk control, notifications, appearance, reports, integrations and security logs.', modules: 'Modules', previewVerify: 'Preview Verify Page', highRiskTip: 'This module contains security, permission or risk-control settings. Confirm the impact before saving. Sensitive changes should use MFA and operation logs.', saved: 'Settings saved', jsonTeachingTitle: 'Visual configuration guide: {label}', jsonTips: ['Use the visual field table or list editor; the system validates the structure before saving.', 'Use settings only for display and workflows. Do not store passwords, private keys, tokens, cookies or database URLs.', 'Lists are suitable for rules; field tables are suitable for key-value mappings. Prefer lowercase English keys with numbers and underscores.', 'Changes to permissions, risk control, scanner or integrations are high-risk. Use MFA, logs and gradual rollout.'], groups: { basic_system: { title: 'Basic System', desc: 'System name, logo, time zone, login policy, dashboard and footer' }, enterprise_brand: { title: 'Enterprise & Brand', desc: 'Company, brands, sites, regions and certificates' }, account_role_permission: { title: 'Accounts & Permissions', desc: 'Admins, roles, menu/button permissions, data scope and login whitelist' }, anti_fake_code_rules: { title: 'Code Rules', desc: 'Code type, encoding, encryption, segments, one-item-one-code and scan limits' }, trace_flow: { title: 'Trace Flow', desc: 'Trace nodes, form fields, approvals, consumer page and diversion rules' }, product_archive: { title: 'Product Archive', desc: 'Categories, specs, units, templates, status and materials' }, print_material: { title: 'Printing & Materials', desc: 'Label templates, print parameters, carton/bag certificates and variables' }, data_risk_control: { title: 'Risk Control', desc: 'Diversion threshold, reports, high-frequency scans, abnormal IP and dealer authorization' }, notification: { title: 'Messages & Notifications', desc: 'Site messages, SMS, email, official account and mini-program messages' }, query_panel_appearance: { title: 'Public Verify Page', desc: 'No-code consumer page, fields, trace modules, CTA and ads' }, data_report: { title: 'Data & Reports', desc: 'Backup, scheduled reports, export permissions and cleanup' }, integration: { title: 'Integrations', desc: 'Open API, ERP, WMS, e-commerce, scanner hardware and H5' }, business_workflow: { title: 'Business Workflows', desc: 'Scanner actions, quick entries, page fields and workflow templates' }, security_log: { title: 'Security & Logs', desc: 'Operation logs, login logs, scan logs, masking, MFA and blacklist' } }, fields: { home_cover: 'Admin Logo', admin_title: 'Admin Title', site_name: 'System Name', login_logo: 'Login Logo', favicon: 'Favicon', default_language: 'Default Language', timezone: 'Time Zone', date_format: 'Date Format', time_format: 'Time Format', datetime_format: 'Datetime Format', currency: 'Currency', multi_language_pack: 'Language Pack', login_token_ttl_hours: 'Login TTL / Hours', session_timeout_minutes: 'Session Timeout / Minutes', password_expire_days: 'Password Expiry / Days', force_change_password: 'Force Password Change', dashboard_widgets: 'Dashboard Widgets', copyright: 'Footer Copyright', icp_no: 'ICP No.', customer_service: 'Customer Service', company_name: 'Company Name', social_credit_code: 'Unified Social Credit Code', company_address: 'Company Address', contact_name: 'Contact', contact_phone: 'Phone', brand_list: 'Brands', site_networks: 'Sites / Warehouses / Branches', region_rules: 'Region Rules', business_license: 'Business License', production_license: 'Production License', quality_report: 'Quality Report', primary_color: 'Primary Color', page_logo: 'Verify Page Logo', brand_name: 'Brand / Company Name', hero_title: 'Hero Title', hero_subtitle: 'Hero Subtitle', scanner_enabled: 'Enable Scanner Desk', scanner_global_listen: 'Global Scanner Listener', scanner_min_length: 'Minimum Code Length', scanner_interval_ms: 'Scanner Interval / ms', enabled_workflows: 'Enabled Workflows', field_alias_map: 'Backend Field Aliases', api_key: 'API Key', operation_log_enabled: 'Operation Logs', login_log_enabled: 'Login Logs', scan_log_enabled: 'Scan Logs', data_masking_enabled: 'Data Masking', sensitive_operation_mfa: 'Sensitive Operation MFA', ip_blacklist: 'Malicious Scan IP Blacklist' } },
    status: { active: 'Active', inactive: 'Inactive', locked: 'Locked', cancelled: 'Cancelled', queried: 'Queried', fake: 'Abnormal' },
  },
} as const;

const state = reactive({ locale: 'zh-CN' as Locale });

function resolve(path: string, locale: Locale = state.locale): any {
  return path.split('.').reduce((obj: any, key) => (obj && typeof obj === 'object' ? obj[key] : undefined), messages[locale] as any);
}

function format(template: string, params?: Record<string, any>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`));
}

export function initI18n() {
  const saved = localStorage.getItem(LOCALE_KEY) as Locale | null;
  state.locale = saved === 'en-US' || saved === 'zh-CN' ? saved : 'zh-CN';
  document.documentElement.lang = state.locale;
}

export function setLocale(locale: Locale) {
  state.locale = locale;
  localStorage.setItem(LOCALE_KEY, locale);
  document.documentElement.lang = locale;
  window.dispatchEvent(new Event('i18n-updated'));
}

export function toggleLocale() {
  setLocale(state.locale === 'zh-CN' ? 'en-US' : 'zh-CN');
}

export function translate(path: string, fallback?: string, params?: Record<string, any>) {
  const value = resolve(path, state.locale) ?? resolve(path, 'zh-CN') ?? fallback ?? path;
  return format(String(value), params);
}

export function useI18n() {
  const locale = computed(() => state.locale);
  return {
    locale,
    t: translate,
    setLocale,
    toggleLocale,
  };
}

export function routeTitle(route: Pick<RouteRecordRaw, 'meta'> | { meta?: any }, fallback = '') {
  const key = route.meta?.titleKey;
  if (key) return translate(key, String(route.meta?.title || fallback || ''));
  return String(route.meta?.title || fallback || '');
}

export function routeDocumentTitle(meta: any) {
  const title = meta?.titleKey ? translate(meta.titleKey, String(meta.title || '')) : String(meta?.title || translate('menu.backend'));
  return `${title} - ${translate('common.appName')}`;
}
