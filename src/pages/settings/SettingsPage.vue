<template>
  <IosPage class="settings-page">
    <IosPageHero :eyebrow="t('settings.eyebrow')" :title="t('settings.title')" :description="t('settings.desc')">
      <template #actions>
        <el-button @click="loadActiveGroup(true)">
          <template #icon><AppIcon name="refresh" /></template>
          {{ t('common.refreshCurrent') }}
        </el-button>
        <el-button v-if="activeKey === 'query_panel_appearance'" @click="openVerifyPreview">
          <template #icon><AppIcon name="query" /></template>
          {{ t('settings.previewVerify') }}
        </el-button>
        <el-button type="primary" :loading="saving" @click="saveActiveGroup">
          <template #icon><AppIcon name="save" /></template>
          {{ t('common.saveConfig') }}
        </el-button>
      </template>
    </IosPageHero>

    <div class="settings-layout">
      <el-card class="settings-nav glass-card" shadow="never">
        <div class="settings-nav-title">{{ t('settings.modules') }}</div>
        <button
          v-for="group in groups"
          :key="group.key"
          type="button"
          class="settings-nav-item"
          :class="{ active: activeKey === group.key }"
          @click="switchGroup(group.key)"
        >
          <span class="settings-nav-icon"><AppIcon :name="group.icon" /></span>
          <span class="settings-nav-text">
            <strong>{{ displayGroupTitle(group) }}</strong>
            <small>{{ displayGroupDesc(group) }}</small>
          </span>
        </button>
      </el-card>

      <div class="settings-main">
        <el-card class="settings-summary glass-card" shadow="never">
          <div class="summary-left">
            <div class="summary-icon"><AppIcon :name="activeGroup.icon" :size="24" /></div>
            <div>
              <h3>{{ displayGroupTitle(activeGroup) }}</h3>
              <p>{{ displayGroupDesc(activeGroup) }}</p>
            </div>
          </div>
          <el-tag type="primary">{{ t('common.configItems', undefined, { count: activeFields.length }) }}</el-tag>
        </el-card>

        <el-alert v-if="activeGroup.securityLevel === 'high'" type="warning" show-icon :closable="false" class="settings-alert">
          {{ t('settings.highRiskTip') }}
        </el-alert>

        <div v-loading="loading" :element-loading-text="t('common.loadingConfig')">
          <el-card class="settings-form-card glass-card" shadow="never">
            <el-form ref="formRef" :model="form" label-position="top">
              <el-row :gutter="18">
                <el-col v-for="field in activeFields" :key="field.key" :xs="24" :sm="field.span === 24 ? 24 : 12" :lg="field.span || 12">
                  <el-form-item
                    :prop="field.key"
                    :label="displayFieldLabel(field)"
                    :rules="field.required ? [{ required: true, message: t('crud.required', undefined, { label: displayFieldLabel(field) }), trigger: 'blur' }] : []"
                  >
                    <el-input
                      v-if="field.type === 'input' || field.type === 'password'"
                      v-model="form[field.key]"
                      :type="field.type === 'password' ? 'password' : 'text'"
                      :show-password="field.type === 'password'"
                      :placeholder="field.placeholder || t('crud.input', undefined, { label: displayFieldLabel(field) })"
                      clearable
                    />
                    <el-input-number
                      v-else-if="field.type === 'number'"
                      v-model="form[field.key]"
                      :min="field.min"
                      :max="field.max"
                      style="width: 100%"
                      :placeholder="field.placeholder || t('crud.input', undefined, { label: displayFieldLabel(field) })"
                    />
                    <el-input
                      v-else-if="field.type === 'textarea'"
                      v-model="form[field.key]"
                      type="textarea"
                      :autosize="{ minRows: 3, maxRows: 8 }"
                      :placeholder="field.placeholder || t('crud.input', undefined, { label: displayFieldLabel(field) })"
                    />
                    <div v-else-if="field.type === 'theme-select'" class="theme-select-grid">
                      <button
                        v-for="theme in uiThemePresets"
                        :key="theme.key"
                        type="button"
                        class="theme-card-option"
                        :class="{ active: form[field.key] === theme.key }"
                        @click="selectUiTheme(theme.key)"
                      >
                        <span class="theme-preview" :style="themePreviewStyle(theme)">
                          <i></i><b></b><em></em>
                        </span>
                        <span class="theme-option-main">
                          <strong>{{ theme.label }}</strong>
                          <small>{{ theme.desc }}</small>
                        </span>
                      </button>
                    </div>
                    <el-color-picker
                      v-else-if="field.type === 'color'"
                      v-model="form[field.key]"
                      show-alpha
                      :predefine="colorOptions"
                    />
                    <el-switch v-else-if="field.type === 'switch'" v-model="form[field.key]" :active-text="t('common.enabled')" :inactive-text="t('common.disabled')" />
                    <el-select
                      v-else-if="field.type === 'select'"
                      v-model="form[field.key]"
                      :placeholder="field.placeholder || t('crud.select', undefined, { label: displayFieldLabel(field) })"
                      clearable
                      style="width: 100%"
                    >
                      <el-option v-for="opt in field.options || []" :key="String(opt.value)" :value="opt.value" :label="opt.label" />
                    </el-select>
                    <el-select
                      v-else-if="field.type === 'multi-select'"
                      v-model="form[field.key]"
                      multiple
                      filterable
                      allow-create
                      clearable
                      :placeholder="field.placeholder || t('crud.select', undefined, { label: displayFieldLabel(field) })"
                      style="width: 100%"
                    >
                      <el-option v-for="opt in field.options || []" :key="String(opt.value)" :value="opt.value" :label="opt.label" />
                    </el-select>
                    <UploadField v-else-if="field.type === 'upload-image'" v-model="form[field.key]" type="image" />
                    <UploadField v-else-if="field.type === 'upload-cert'" v-model="form[field.key]" type="cert" />
                    <div v-else-if="field.type === 'json'" class="json-config-block">
                      <JsonEditor v-model="form[field.key]" />
                      <el-collapse class="json-teaching" accordion>
                        <el-collapse-item name="teach">
                          <template #title>
                            <span class="json-teaching-title">{{ t('settings.jsonTeachingTitle', undefined, { label: displayFieldLabel(field) }) }}</span>
                          </template>
                          <div class="json-teaching-body">
                            <p v-for="tip in jsonTeaching(field)" :key="tip">{{ tip }}</p>
                          </div>
                        </el-collapse-item>
                      </el-collapse>
                    </div>
                    <el-input v-else v-model="form[field.key]" clearable />
                    <div v-if="field.help" class="form-help">{{ field.help }}</div>
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
          </el-card>
        </div>
      </div>
    </div>
  </IosPage>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage as Message } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import JsonEditor from '@/components/JsonEditor.vue';
import UploadField from '@/components/UploadField.vue';
import { IosPage, IosPageHero } from '@/components/ios27';
import { settingsApi } from '@/api/resources';
import { clearRequestCache } from '@/api/http';
import { cleanObject } from '@/utils/format';
import { useI18n } from '@/i18n';
import { applyThemeConfig, uiThemePresets, type UiThemeKey } from '@/utils/theme';

type Option = { label: string; value: any };
type Field = {
  key: string;
  label: string;
  type: 'input' | 'password' | 'number' | 'textarea' | 'color' | 'switch' | 'select' | 'multi-select' | 'upload-image' | 'upload-cert' | 'json' | 'theme-select';
  defaultValue?: any;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: Option[];
  min?: number;
  max?: number;
  span?: number;
  teaching?: string[];
};
type Group = { key: string; title: string; desc: string; icon: string; securityLevel?: 'normal' | 'high'; fields: Field[] };

const yesNo = [
  { label: '开启', value: true },
  { label: '关闭', value: false },
];
const languageOptions = [
  { label: '简体中文 zh-CN', value: 'zh-CN' },
  { label: '繁體中文 zh-TW', value: 'zh-TW' },
  { label: 'English en-US', value: 'en-US' },
  { label: '日本語 ja-JP', value: 'ja-JP' },
  { label: '한국어 ko-KR', value: 'ko-KR' },
  { label: 'Français fr-FR', value: 'fr-FR' },
  { label: 'Deutsch de-DE', value: 'de-DE' },
  { label: 'Español es-ES', value: 'es-ES' },
  { label: 'Русский ru-RU', value: 'ru-RU' },
  { label: 'العربية ar-SA', value: 'ar-SA' },
];
const timezoneOptions = [
  { label: '中国标准时间 Asia/Shanghai', value: 'Asia/Shanghai' },
  { label: '协调世界时 UTC', value: 'UTC' },
  { label: '东京 Asia/Tokyo', value: 'Asia/Tokyo' },
  { label: '首尔 Asia/Seoul', value: 'Asia/Seoul' },
  { label: '新加坡 Asia/Singapore', value: 'Asia/Singapore' },
  { label: '迪拜 Asia/Dubai', value: 'Asia/Dubai' },
  { label: '伦敦 Europe/London', value: 'Europe/London' },
  { label: '巴黎 Europe/Paris', value: 'Europe/Paris' },
  { label: '纽约 America/New_York', value: 'America/New_York' },
  { label: '洛杉矶 America/Los_Angeles', value: 'America/Los_Angeles' },
];
const dateOptions = [
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
  { label: 'YYYY/MM/DD', value: 'YYYY/MM/DD' },
  { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
  { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
];
const timeOptions = [
  { label: '24小时制 HH:mm:ss', value: 'HH:mm:ss' },
  { label: '24小时制 HH:mm', value: 'HH:mm' },
  { label: '12小时制 hh:mm A', value: 'hh:mm A' },
  { label: '12小时制 hh:mm:ss A', value: 'hh:mm:ss A' },
];
const datetimeOptions = [
  { label: 'YYYY-MM-DD HH:mm:ss', value: 'YYYY-MM-DD HH:mm:ss' },
  { label: 'YYYY/MM/DD HH:mm:ss', value: 'YYYY/MM/DD HH:mm:ss' },
  { label: 'DD/MM/YYYY HH:mm:ss', value: 'DD/MM/YYYY HH:mm:ss' },
  { label: 'MM/DD/YYYY hh:mm A', value: 'MM/DD/YYYY hh:mm A' },
];
const currencyOptions = [
  { label: '人民币 CNY', value: 'CNY' },
  { label: '美元 USD', value: 'USD' },
  { label: '欧元 EUR', value: 'EUR' },
];
const colorOptions = Array.from(new Set(['#2563eb', '#1677ff', '#0ea5e9', '#1d4ed8', '#0f766e', '#0f766e', '#059669', '#4f46e5', '#6366f1', '#7c3aed', '#334155', '#111827', '#dc2626', '#f59e0b']));

const layoutModeOptions = [
  { label: '经典后台：左侧菜单 + 顶部栏', value: 'classic' },
  { label: '紧凑后台：更小间距，适合数据录入', value: 'compact' },
  { label: '顶部页签优先：适合常用页面快速切换', value: 'topTabs' },
  { label: '宽屏看板：侧栏更宽，内容区更舒展', value: 'wide' },
  { label: '沉浸模式：弱化页签和装饰', value: 'immersive' },
];
const menuBehaviorOptions = [
  { label: '自动：刷新后默认展开，手机端抽屉菜单', value: 'auto' },
  { label: '总是展开', value: 'expanded' },
  { label: '总是收起', value: 'collapsed' },
];
const contentWidthOptions = [
  { label: '自适应全宽', value: 'fluid' },
  { label: '960px', value: '960' },
  { label: '1080px', value: '1080' },
  { label: '1200px', value: '1200' },
  { label: '1320px', value: '1320' },
  { label: '1440px', value: '1440' },
  { label: '1600px', value: '1600' },
];

const route = useRoute();
const { t } = useI18n();

const groups: Group[] = [
  {
    key: 'ui_theme',
    title: 'UI风格主题',
    desc: '后台整体视觉主题、深浅色和品牌主色，可按商用、极简、SaaS、博客系统风格切换',
    icon: 'palette',
    fields: [
      { key: 'ui_theme', label: '风格主题', type: 'theme-select', span: 24, defaultValue: 'standard' },
      { key: 'theme_mode', label: '明暗模式', type: 'select', defaultValue: 'light', options: [{ label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }] },
      { key: 'primary_color', label: '品牌主色', type: 'color', defaultValue: '#2563eb', help: '默认会随主题切换，也可以在这里手动改成客户品牌色。' },
      { key: 'theme_note', label: '主题说明', type: 'textarea', span: 24, defaultValue: '标准=当前蓝白主题；企业1=商业交付；企业2=简洁商用；极简SaaS=现代卡片看板；极简风格=低装饰办公；Halo/Typecho/WordPress2026=面向内容管理和站点后台的视觉方案。' },
    ],
  },
  {
    key: 'layout_lowcode',
    title: '低代码布局设置',
    desc: '不改代码调整后台骨架、菜单行为、内容宽度和快捷页签',
    icon: 'process',
    fields: [
      { key: 'layout_mode', label: '布局模式', type: 'select', defaultValue: 'classic', options: layoutModeOptions, help: '用于快速切换经典后台、紧凑录入、宽屏看板、沉浸页面等布局。' },
      { key: 'menu_behavior', label: '菜单默认行为', type: 'select', defaultValue: 'auto', options: menuBehaviorOptions, help: 'auto 模式下不会记住手动收起状态，刷新后默认展开；手机端自动变为抽屉菜单。' },
      { key: 'content_width', label: '内容区最大宽度', type: 'select', defaultValue: 'fluid', options: contentWidthOptions, help: '低代码控制页面主内容宽度，适合大屏、普通笔记本和演示场景。' },
      { key: 'show_route_tabs', label: '显示顶部快捷页签', type: 'switch', defaultValue: true },
      { key: 'layout_json', label: '高级布局 JSON', type: 'json', span: 24, help: '预留给后续低代码扩展：可配置页面密度、卡片列数、表格默认尺寸、移动端断点等。', defaultValue: { pagePadding: 'auto', tableSize: 'default', mobileDrawer: true } },
    ],
  },
  {
    key: 'basic_system', title: '基础系统通用设置', desc: '系统名称、Logo、时区、登录策略、首页看板与底部信息', icon: 'setting', securityLevel: 'high', fields: [
      { key: 'system_name', label: '系统名称', type: 'input', required: true, defaultValue: '防伪溯源管理系统' },
      { key: 'login_logo', label: '登录 Logo', type: 'upload-image' },
      { key: 'home_cover', label: '首页封面', type: 'upload-image' },
      { key: 'admin_title', label: '后台标题', type: 'input', defaultValue: '防伪溯源后台' },
      { key: 'favicon', label: '浏览器图标', type: 'upload-image' },
      { key: 'timezone', label: '系统时区', type: 'select', defaultValue: 'Asia/Shanghai', options: timezoneOptions },
      { key: 'date_format', label: '日期格式', type: 'select', defaultValue: 'YYYY-MM-DD', options: dateOptions },
      { key: 'time_format', label: '时间格式', type: 'select', defaultValue: 'HH:mm:ss', options: timeOptions },
      { key: 'datetime_format', label: '日期时间格式', type: 'select', defaultValue: 'YYYY-MM-DD HH:mm:ss', options: datetimeOptions },
      { key: 'currency', label: '货币单位', type: 'select', defaultValue: 'CNY', options: currencyOptions },
      { key: 'language', label: '默认语言', type: 'select', defaultValue: 'zh-CN', options: languageOptions },
      { key: 'enabled_languages', label: '启用语言', type: 'multi-select', defaultValue: ['zh-CN', 'en-US'], options: languageOptions },
      { key: 'fallback_language', label: '备用语言', type: 'select', defaultValue: 'zh-CN', options: languageOptions },
      { key: 'language_pack', label: '多语言文案包', type: 'json', span: 24, teaching: ['按 locale 维护后台和前台常用文案，未配置的文案会自动回退到 fallback_language。', '建议只放业务文案，不要存放密钥、Cookie、Token 或 HTML 脚本。', '新增语种时，需要同时加入 enabled_languages 并补齐对应 locale 的 title、menu、message 字段。'], defaultValue: {
        "zh-CN": { "systemName": "防伪溯源管理系统", "adminTitle": "防伪溯源后台", "verifyTitle": "官方防伪码验证" },
        "en-US": { "systemName": "Anti-counterfeit Traceability System", "adminTitle": "Trace Admin", "verifyTitle": "Official Verification" },
        "ja-JP": { "systemName": "偽造防止トレーサビリティシステム", "adminTitle": "トレース管理", "verifyTitle": "公式検証" },
        "ko-KR": { "systemName": "위조 방지 추적 시스템", "adminTitle": "Trace Admin", "verifyTitle": "공식 인증" }
      } },
      { key: 'login_token_ttl_hours', label: '登录有效期/小时', type: 'number', defaultValue: 24, min: 1, max: 720 },
      { key: 'session_timeout_minutes', label: '会话超时/分钟', type: 'number', defaultValue: 120, min: 5, max: 1440 },
      { key: 'password_expire_days', label: '密码有效期/天', type: 'number', defaultValue: 90, min: 0, max: 365 },
      { key: 'force_change_password', label: '强制改密开关', type: 'switch', defaultValue: false },
      { key: 'dashboard_widgets', label: '首页仪表盘看板配置', type: 'multi-select', defaultValue: ['summary', 'trend', 'recent', 'rank'], options: [{ label: '数据卡片', value: 'summary' }, { label: '趋势图表', value: 'trend' }, { label: '最近查询', value: 'recent' }, { label: '快捷入口', value: 'quick' }, { label: '代理商排行', value: 'rank' }] },
      { key: 'copyright', label: '底部版权信息', type: 'input', span: 24, defaultValue: 'Copyright © Trace Admin' },
      { key: 'icp_no', label: '备案号', type: 'input' },
      { key: 'customer_service', label: '客服联系方式', type: 'input' },
    ],
  },
  {
    key: 'enterprise_brand', title: '企业 & 品牌信息设置', desc: '企业资料、品牌、厂区仓库、区域和资质配置', icon: 'brand', fields: [
      { key: 'company_name', label: '企业名称', type: 'input', required: true },
      { key: 'social_credit_code', label: '统一社会信用代码', type: 'input' },
      { key: 'company_address', label: '企业地址', type: 'textarea', span: 24 },
      { key: 'contact_name', label: '联系人', type: 'input' },
      { key: 'contact_phone', label: '联系电话', type: 'input' },
      { key: 'brand_list', label: '品牌管理', type: 'json', span: 24, help: '支持多品牌新增、编辑、停用、LOGO 和简介。可视化列表格式。', defaultValue: [] },
      { key: 'site_networks', label: '生产厂区 / 仓库 / 分厂', type: 'json', span: 24, defaultValue: [] },
      { key: 'region_rules', label: '区域划分设置', type: 'json', span: 24, defaultValue: [] },
      { key: 'business_license', label: '营业执照', type: 'upload-cert' },
      { key: 'production_license', label: '生产许可', type: 'upload-cert' },
      { key: 'quality_report', label: '质检报告展示配置', type: 'upload-cert' },
    ],
  },
  {
    key: 'account_role_permission', title: '账号权限 & 角色管理', desc: '管理员、角色、菜单按钮权限、数据权限和登录白名单', icon: 'permission', securityLevel: 'high', fields: [
      { key: 'enable_role_permission', label: '启用角色权限控制', type: 'switch', defaultValue: true },
      { key: 'default_roles', label: '内置角色', type: 'multi-select', defaultValue: ['super_admin', 'operator', 'production', 'finance', 'dealer', 'readonly'], options: [
        { label: '超级管理员', value: 'super_admin' }, { label: '运营', value: 'operator' }, { label: '生产', value: 'production' }, { label: '财务', value: 'finance' }, { label: '经销商', value: 'dealer' }, { label: '只读账号', value: 'readonly' },
      ] },
      { key: 'menu_permissions', label: '菜单权限矩阵', type: 'json', span: 24, defaultValue: {} },
      { key: 'button_permissions', label: '按钮权限矩阵', type: 'json', span: 24, help: '新增 / 编辑 / 删除 / 导出 / 打印精细化授权。', defaultValue: {} },
      { key: 'data_scope_rules', label: '数据权限隔离规则', type: 'json', span: 24, help: '按厂区、产品线、经销商划分数据查看范围。', defaultValue: {} },
      { key: 'operation_whitelist', label: '操作白名单', type: 'textarea', placeholder: '每行一个账号或角色' },
      { key: 'login_ip_whitelist', label: 'IP 登录白名单', type: 'textarea', placeholder: '每行一个 IP / CIDR' },
      { key: 'remote_login_alert', label: '异地登录提醒', type: 'switch', defaultValue: true },
    ],
  },
  {
    key: 'anti_fake_code_rules', title: '防伪码核心规则设置', desc: '码类型、编码规则、加密、码段、一物一码和扫码限制', icon: 'shield', securityLevel: 'high', fields: [
      { key: 'code_types', label: '码类型选择', type: 'multi-select', defaultValue: ['qrcode'], options: [{ label: '一维码', value: 'barcode' }, { label: '二维码', value: 'qrcode' }, { label: '彩色防伪码', value: 'color_code' }, { label: '可变动态码', value: 'dynamic_code' }] },
      { key: 'code_prefix', label: '编码前缀', type: 'input', defaultValue: 'TRACE' },
      { key: 'batch_code_rule', label: '批次码规则', type: 'input', defaultValue: 'YYYYMMDD' },
      { key: 'serial_length', label: '流水号位数', type: 'number', defaultValue: 8, min: 4, max: 20 },
      { key: 'random_encrypt_length', label: '随机加密位数', type: 'number', defaultValue: 6, min: 4, max: 32 },
      { key: 'enable_anti_copy_crypto', label: '防复制防篡改加密', type: 'switch', defaultValue: true },
      { key: 'crypto_algorithm', label: '加密算法', type: 'select', defaultValue: 'HMAC-SHA256', options: [{ label: 'HMAC-SHA256', value: 'HMAC-SHA256' }, { label: 'AES-GCM', value: 'AES-GCM' }] },
      { key: 'code_segment_rules', label: '码段管理规则', type: 'json', span: 24, defaultValue: { recycleExpired: true, cancelInvalid: true } },
      { key: 'binding_rule', label: '绑定规则', type: 'select', defaultValue: 'one_product_one_code', options: [{ label: '一物一码', value: 'one_product_one_code' }, { label: '一箱一码', value: 'one_box_one_code' }, { label: '一托一码', value: 'one_pallet_one_code' }] },
      { key: 'scan_limit', label: '扫码次数限制', type: 'number', defaultValue: 10, min: 1, max: 9999 },
      { key: 'repeat_scan_message', label: '重复扫码提示', type: 'textarea', span: 24, defaultValue: '该防伪码已被查询，请注意核验购买渠道。' },
      { key: 'mark_first_scan', label: '首次扫码标记规则', type: 'switch', defaultValue: true },
    ],
  },
  {
    key: 'trace_flow', title: '溯源流程自定义设置', desc: '溯源节点、表单字段、审批、消费者页和窜货规则', icon: 'trace', securityLevel: 'high', fields: [
      { key: 'trace_nodes', label: '溯源节点配置', type: 'multi-select', defaultValue: ['material', 'production', 'quality', 'outbound', 'dealer', 'sale', 'after_sale'], options: [
        { label: '生产投料', value: 'material' }, { label: '加工', value: 'production' }, { label: '质检', value: 'quality' }, { label: '出库', value: 'outbound' }, { label: '经销商', value: 'dealer' }, { label: '终端销售', value: 'sale' }, { label: '售后', value: 'after_sale' },
      ] },
      { key: 'trace_form_fields', label: '溯源表单自定义字段', type: 'json', span: 24, defaultValue: [{ key: 'batch_no', label: '批次' }, { key: 'production_date', label: '生产日期' }, { key: 'quality_inspector', label: '质检员' }] },
      { key: 'outbound_approval', label: '出库审批', type: 'switch', defaultValue: false },
      { key: 'return_approval', label: '退货审批', type: 'switch', defaultValue: true },
      { key: 'scrap_approval', label: '报废审批', type: 'switch', defaultValue: true },
      { key: 'consumer_trace_template', label: '消费者查询页模板', type: 'json', span: 24, defaultValue: { showText: true, showVideo: false, showCertificates: true } },
      { key: 'cross_region_alert_rules', label: '窜货管控规则', type: 'json', span: 24, defaultValue: { enable: true, threshold: 3 } },
    ],
  },
  {
    key: 'product_archive', title: '产品档案分类设置', desc: '产品多级分类、规格单位、基础模板、启停和原料关联', icon: 'product', fields: [
      { key: 'category_tree', label: '产品分类树', type: 'json', span: 24, defaultValue: [] },
      { key: 'spec_parameters', label: '产品规格参数', type: 'json', span: 24, defaultValue: [] },
      { key: 'unit_options', label: '计量单位', type: 'multi-select', defaultValue: ['盒', '瓶', '箱', '件'], options: [{ label: '盒', value: '盒' }, { label: '瓶', value: '瓶' }, { label: '箱', value: '箱' }, { label: '件', value: '件' }, { label: 'kg', value: 'kg' }] },
      { key: 'package_specs', label: '包装规格', type: 'json', span: 24, defaultValue: [] },
      { key: 'product_base_template', label: '产品基础模板', type: 'json', span: 24, help: '统一产品简介、宣传图、详情文案批量配置。', defaultValue: {} },
      { key: 'disable_code_when_offline', label: '下架产品禁止生成防伪码', type: 'switch', defaultValue: true },
      { key: 'material_archive_link', label: '原料档案关联', type: 'switch', defaultValue: false },
      { key: 'material_fields', label: '原料字段配置', type: 'json', span: 24, defaultValue: [] },
    ],
  },
  {
    key: 'print_material', title: '标签打印 & 物料设置', desc: '标签模板、打印参数、外箱内袋合格证和变量配置', icon: 'print', fields: [
      { key: 'label_template', label: '标签模板自定义', type: 'json', span: 24, defaultValue: { width: 50, height: 30, qrcodePosition: 'right', fontSize: 12 } },
      { key: 'print_copies', label: '默认打印份数', type: 'number', defaultValue: 1, min: 1, max: 999 },
      { key: 'auto_paging', label: '自动分页', type: 'switch', defaultValue: true },
      { key: 'printer_adapter', label: '打印机适配配置', type: 'json', span: 24, defaultValue: {} },
      { key: 'outer_box_template', label: '外箱标签模板', type: 'json', span: 24, defaultValue: {} },
      { key: 'inner_bag_template', label: '内袋标签模板', type: 'json', span: 24, defaultValue: {} },
      { key: 'certificate_template', label: '合格证模板', type: 'json', span: 24, defaultValue: {} },
      { key: 'label_variables', label: '标签内容变量', type: 'multi-select', defaultValue: ['product_name', 'batch_no', 'production_date'], options: [{ label: '产品信息', value: 'product_name' }, { label: '批次', value: 'batch_no' }, { label: '生产日期', value: 'production_date' }, { label: '防伪码', value: 'code' }] },
    ],
  },
  {
    key: 'data_risk_control', title: '风控 & 防窜货设置', desc: '窜货阈值、举报、高频扫码、异常 IP 和经销商授权', icon: 'risk', securityLevel: 'high', fields: [
      { key: 'cross_region_threshold', label: '窜货预警阈值', type: 'number', defaultValue: 3, min: 1, max: 100 },
      { key: 'cross_region_popup', label: '跨区域扫码弹窗提醒', type: 'switch', defaultValue: true },
      { key: 'backend_alarm_push', label: '后台告警推送', type: 'switch', defaultValue: true },
      { key: 'fake_report_enabled', label: '假货举报入口', type: 'switch', defaultValue: true },
      { key: 'report_receivers', label: '举报接收人', type: 'textarea', placeholder: '每行一个手机号或邮箱' },
      { key: 'high_frequency_scan_rule', label: '高频扫码拦截规则', type: 'json', span: 24, defaultValue: { limit: 30, windowMinutes: 5 } },
      { key: 'abnormal_ip_rule', label: '异常 IP 风控规则', type: 'json', span: 24, defaultValue: { enable: true, scoreThreshold: 80 } },
      { key: 'dealer_authorization', label: '经销商区域授权管理', type: 'json', span: 24, defaultValue: [] },
      { key: 'authorization_expire_days', label: '授权有效期/天', type: 'number', defaultValue: 365, min: 1, max: 3650 },
    ],
  },
  {
    key: 'notification', title: '消息 & 通知设置', desc: '站内信、短信、邮件、公众号和小程序消息', icon: 'message', fields: [
      { key: 'site_message_enabled', label: '系统站内信', type: 'switch', defaultValue: true },
      { key: 'backend_notice_enabled', label: '后台消息提醒', type: 'switch', defaultValue: true },
      { key: 'sms_enabled', label: '短信通知', type: 'switch', defaultValue: false },
      { key: 'sms_templates', label: '短信模板配置', type: 'json', span: 24, defaultValue: { scanAlert: '', crossRegionAlert: '', expireReminder: '' } },
      { key: 'email_enabled', label: '邮件通知', type: 'switch', defaultValue: false },
      { key: 'email_templates', label: '邮件模板配置', type: 'json', span: 24, defaultValue: { reportPush: '', anomalyAlert: '' } },
      { key: 'wechat_config', label: '微信公众号 / 小程序消息配置', type: 'json', span: 24, defaultValue: {} },
    ],
  },
  {
    key: 'query_panel_appearance', title: '前台查询面板可视化设置', desc: '消费者防伪验证页零代码装修、字段展示、溯源模块、CTA 和广告配置', icon: 'appearance', fields: [
      { key: 'consumer_page_enabled', label: '启用消费者验证页', type: 'switch', defaultValue: true, help: '公开访问必须携带防伪码：/verify/{code} 或 /v/{code}；直接访问 /verify、/verify/、/v、/v/ 会返回 404。' },
      { key: 'show_hero_section', label: '显示顶部首屏区域', type: 'switch', defaultValue: true, help: '关闭后将隐藏品牌 Logo、标题和标语区域。' },
      { key: 'show_query_form', label: '显示查询表单', type: 'switch', defaultValue: true, help: '关闭后将隐藏防伪码输入表单（适用于纯扫码场景）。' },
      { key: 'auto_query_from_url', label: 'URL 带码自动查询', type: 'switch', defaultValue: true, help: '二维码可直接指向 /verify/{code}，打开页面后自动验证。' },
      { key: 'page_layout', label: '页面布局', type: 'select', defaultValue: 'split', options: [{ label: '左右分栏', value: 'split' }, { label: '上下通栏', value: 'full' }] },
      { key: 'primary_color', label: '主题主色', type: 'color', defaultValue: '#2563eb' },
      { key: 'page_logo', label: '验证页 Logo', type: 'upload-image' },
      { key: 'consumer_page_background', label: '消费者页背景图', type: 'upload-image' },
      { key: 'brand_promo_image', label: '品牌宣传图', type: 'upload-image' },
      { key: 'brand_name', label: '品牌 / 企业名称', type: 'input', defaultValue: '防伪验证中心' },
      { key: 'brand_slogan', label: '品牌副标语', type: 'input', defaultValue: '一物一码 · 正品可查 · 全程可溯' },
      { key: 'hero_title', label: '首屏主标题', type: 'input', span: 24, defaultValue: '官方防伪码验证' },
      { key: 'hero_subtitle', label: '首屏说明文案', type: 'textarea', span: 24, defaultValue: '请输入或扫描产品包装上的防伪码，系统将实时核验真伪并展示产品溯源信息。' },
      { key: 'hero_badges', label: '首屏信任标签', type: 'multi-select', defaultValue: ['官方认证', '正品核验', '全程溯源'], options: [{ label: '官方认证', value: '官方认证' }, { label: '正品核验', value: '正品核验' }, { label: '全程溯源', value: '全程溯源' }, { label: '授权渠道', value: '授权渠道' }, { label: '质量保障', value: '质量保障' }] },
      { key: 'form_title', label: '查询表单标题', type: 'input', defaultValue: '输入防伪码' },
      { key: 'form_subtitle', label: '查询表单副标题', type: 'input', defaultValue: '支持扫码链接自动填充' },
      { key: 'code_label', label: '防伪码字段名', type: 'input', defaultValue: '防伪码' },
      { key: 'code_placeholder', label: '输入框占位提示', type: 'input', defaultValue: '请输入包装上的防伪码' },
      { key: 'query_button_text', label: '查询按钮文案', type: 'input', defaultValue: '立即验证' },
      { key: 'query_tips', label: '查询提示文案', type: 'textarea', span: 24, defaultValue: '请认准产品外包装防伪标签，刮开涂层后输入完整防伪码。' },
      { key: 'show_advanced_form', label: '展示高级表单', type: 'switch', defaultValue: false },
      { key: 'enable_channel_select', label: '允许选择查询渠道', type: 'switch', defaultValue: false },
      { key: 'enable_location_input', label: '允许填写查询位置', type: 'switch', defaultValue: true },
      { key: 'result_title', label: '结果卡片标题', type: 'input', defaultValue: '验证结果' },
      { key: 'result_subtitle', label: '结果卡片副标题', type: 'input', defaultValue: '结果由官方防伪系统实时返回' },
      { key: 'empty_text', label: '空状态文案', type: 'input', defaultValue: '输入防伪码后查看验证结果' },
      { key: 'success_title', label: '正品标题', type: 'input', span: 24, defaultValue: '验证通过，当前产品为官方正品' },
      { key: 'success_message', label: '正品说明', type: 'textarea', span: 24, defaultValue: '该防伪码与官方数据库记录一致。' },
      { key: 'repeat_title', label: '重复查询标题', type: 'input', span: 24, defaultValue: '该防伪码已被查询，请核对购买渠道' },
      { key: 'repeat_message', label: '重复查询说明', type: 'textarea', span: 24, defaultValue: '该防伪码不是首次查询，建议结合购买渠道、产品批次和包装状态进一步核验。' },
      { key: 'error_title', label: '异常标题', type: 'input', span: 24, defaultValue: '验证异常，请谨慎购买或联系官方客服' },
      { key: 'error_message', label: '异常说明', type: 'textarea', span: 24, defaultValue: '未查询到有效防伪记录，或该防伪码状态异常。' },
      { key: 'show_query_count', label: '展示查询次数', type: 'switch', defaultValue: true },
      { key: 'display_modules', label: '结果展示模块', type: 'multi-select', defaultValue: ['product', 'trace', 'certificates', 'brand_story', 'product_intro', 'after_sale'], options: [{ label: '产品信息', value: 'product' }, { label: '溯源链路', value: 'trace' }, { label: '官方证书', value: 'certificates' }, { label: '品牌故事', value: 'brand_story' }, { label: '产品介绍', value: 'product_intro' }, { label: '售后说明', value: 'after_sale' }] },
      { key: 'result_visible_fields', label: '产品信息展示字段', type: 'multi-select', defaultValue: ['product_name', 'brand', 'specification', 'batch_no', 'production_date', 'manufacturer', 'origin_place'], options: [{ label: '防伪码', value: 'code' }, { label: '产品名称', value: 'product_name' }, { label: '品牌', value: 'brand' }, { label: '分类', value: 'category' }, { label: '规格', value: 'specification' }, { label: '批次号', value: 'batch_no' }, { label: '生产日期', value: 'production_date' }, { label: '有效期至', value: 'expiry_date' }, { label: '公司', value: 'manufacturer' }, { label: '产地', value: 'origin_place' }, { label: '授权经销商', value: 'agent_name' }, { label: '查询次数', value: 'query_count' }] },
      { key: 'show_empty_fields', label: '展示空字段', type: 'switch', defaultValue: false },
      { key: 'field_label_map', label: '字段别名映射', type: 'json', span: 24, help: '用于把后端字段名转换为消费者可读文案，可逐项新增字段名和显示文案。', defaultValue: { code: '防伪码', product_name: '产品名称', brand: '品牌', specification: '规格', batch_no: '批次号', production_date: '生产日期', manufacturer: '公司', origin_place: '产地' } },
      { key: 'product_section_title', label: '产品信息模块标题', type: 'input', defaultValue: '产品信息' },
      { key: 'trace_section_title', label: '溯源模块标题', type: 'input', defaultValue: '溯源链路' },
      { key: 'cert_section_title', label: '证书模块标题', type: 'input', defaultValue: '官方证书' },
      { key: 'brand_story_title', label: '品牌故事标题', type: 'input', defaultValue: '品牌故事' },
      { key: 'product_intro_title', label: '产品介绍标题', type: 'input', defaultValue: '产品介绍' },
      { key: 'after_sale_title', label: '售后说明标题', type: 'input', defaultValue: '售后说明' },
      { key: 'brand_story', label: '品牌故事固定文案', type: 'textarea', span: 24 },
      { key: 'product_intro', label: '产品介绍固定文案', type: 'textarea', span: 24 },
      { key: 'after_sale_text', label: '售后说明固定文案', type: 'textarea', span: 24, defaultValue: '如验证结果异常，请保留产品包装、防伪标签和购买凭证，并联系官方客服。' },
      { key: 'custom_sections', label: '零代码自定义内容区块', type: 'json', span: 24, help: '支持 notice/text/banner/image/cards/steps/qa；position 支持 before_form、after_result、footer。无需改代码即可新增内容模块。', defaultValue: [{ type: 'steps', position: 'before_form', title: '三步完成官方验证', items: [{ title: '找到防伪标签', desc: '查看产品包装或合格证上的防伪码。' }, { title: '输入或扫码验证', desc: '扫码进入页面会自动带入防伪码。' }, { title: '核验正品与溯源', desc: '查看产品信息、查询次数和溯源链路。' }] }] },
      { key: 'cta_buttons', label: '引流按钮配置', type: 'json', span: 24, help: '逐项维护按钮文字、跳转地址和展示顺序。', defaultValue: [] },
      { key: 'popup_ad_enabled', label: '弹窗广告开关', type: 'switch', defaultValue: false },
      { key: 'popup_ad_config', label: '弹窗广告配置', type: 'json', span: 24, defaultValue: { title: '官方活动', content: '', image: '', url: '', buttonText: '立即查看' } },
      { key: 'customer_service_title', label: '客服卡片标题', type: 'input', defaultValue: '需要帮助？' },
      { key: 'customer_service_text', label: '客服说明文案', type: 'input', defaultValue: '如验证码异常，请联系官方客服协助核验。' },
      { key: 'customer_service_phone', label: '客服电话', type: 'input' },
      { key: 'customer_service_url', label: '客服链接', type: 'input' },
      { key: 'footer_text', label: '页脚文案', type: 'input', span: 24, defaultValue: '本页面由企业官方防伪溯源系统提供技术支持' },
      { key: 'icp_no', label: '备案号', type: 'input' },
      { key: 'icp_url', label: '备案链接', type: 'input' },
    ],
  },
  {
    key: 'data_report', title: '数据 & 报表设置', desc: '备份恢复、定时报表、导出权限和数据清理', icon: 'chart', securityLevel: 'high', fields: [
      { key: 'auto_backup_cycle', label: '自动备份周期', type: 'select', defaultValue: 'daily', options: [{ label: '每日', value: 'daily' }, { label: '每周', value: 'weekly' }, { label: '每月', value: 'monthly' }] },
      { key: 'manual_backup_enabled', label: '手动备份入口', type: 'switch', defaultValue: true },
      { key: 'data_restore_enabled', label: '数据恢复入口', type: 'switch', defaultValue: false, help: '建议仅对超级管理员开放，并开启二次验证。' },
      { key: 'scheduled_reports', label: '定时报表配置', type: 'multi-select', defaultValue: ['day_scan', 'week_scan', 'month_scan'], options: [{ label: '日扫码数据', value: 'day_scan' }, { label: '周扫码数据', value: 'week_scan' }, { label: '月扫码数据', value: 'month_scan' }, { label: '出库数据', value: 'shipment' }] },
      { key: 'export_roles', label: '数据导出权限角色', type: 'multi-select', defaultValue: ['super_admin'], options: [{ label: '超级管理员', value: 'super_admin' }, { label: '运营', value: 'operator' }, { label: '财务', value: 'finance' }] },
      { key: 'export_formats', label: '允许导出格式', type: 'multi-select', defaultValue: ['xlsx', 'csv'], options: [{ label: 'Excel', value: 'xlsx' }, { label: 'CSV', value: 'csv' }, { label: 'PDF', value: 'pdf' }] },
      { key: 'cleanup_rules', label: '数据清理规则', type: 'json', span: 24, defaultValue: { operationLogDays: 365, invalidCodeDays: 180, queryLogDays: 730 } },
    ],
  },
  {
    key: 'business_workflow', title: '后台业务流程配置', desc: '扫码枪动作、业务快捷入口、页面字段和流程模板', icon: 'process', securityLevel: 'high', fields: [
      { key: 'scanner_enabled', label: '启用扫码业务台', type: 'switch', defaultValue: true },
      { key: 'scanner_global_listen', label: '扫码枪全局监听', type: 'switch', defaultValue: true, help: '开启后，扫码业务台和装箱弹窗可监听 USB 键盘模式扫码枪。' },
      { key: 'scanner_device_type', label: '扫码枪型号', type: 'select', defaultValue: 'newland_hr32', options: [{ label: '新大陆 HR32 / HR3280', value: 'newland_hr32' }, { label: '优解 / Honeywell Youjie', value: 'youjie' }, { label: '通用 USB 键盘扫码枪', value: 'generic_hid' }] },
      { key: 'scanner_submit_key', label: '扫码结束符', type: 'select', defaultValue: 'enter_tab', options: [{ label: 'Enter', value: 'enter' }, { label: 'Tab', value: 'tab' }, { label: 'Enter / Tab', value: 'enter_tab' }], help: '扫码枪后缀建议设置为回车；若硬件发送 Tab，本系统也可识别。' },
      { key: 'scanner_region_mode', label: '地区分类来源', type: 'select', defaultValue: 'mixed', options: [{ label: '码值优先 + 工作站兜底', value: 'mixed' }, { label: '只按码值地区', value: 'code' }, { label: '只按工作站地区', value: 'workstation' }] },
      { key: 'scanner_min_length', label: '最短码长', type: 'number', defaultValue: 3, min: 1, max: 128 },
      { key: 'scanner_interval_ms', label: '扫码字符间隔/ms', type: 'number', defaultValue: 80, min: 20, max: 500, help: '扫码枪输入速度通常明显快于人工键盘，用于区分扫码与手输。' },
      { key: 'enabled_workflows', label: '允许的扫码动作', type: 'multi-select', defaultValue: ['classification_boxing', 'traceability', 'shipment_shipping'], options: [
        { label: '分类装箱', value: 'classification_boxing' },
        { label: '扫码溯源', value: 'traceability' },
        { label: '扫码发货', value: 'shipment_shipping' },
      ] },
      { key: 'packing_strategy', label: '装箱策略配置', type: 'json', span: 24, help: '统一一箱一码/防重复/发货后禁止加码/扫码枪结束符等装箱规则，作为仓库业务稳定基线。', defaultValue: { mode: 'one_box_one_code', allowMixedProduct: false, allowDuplicateCode: false, lockBoxAfterShipment: true, requireSealBeforeShipment: false, scannerSubmitKey: 'enter_tab', overflow: 'reject' } },
      { key: 'page_quick_actions', label: '页面快捷动作配置', type: 'json', span: 24, help: '扫码业务只保留分类装箱、溯源和发货，可逐项维护页面、按钮文案和关联流程。', defaultValue: [
  {
    "page": "dashboard",
    "label": "扫码业务台",
    "icon": "keyboard",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "quick_entry",
    "visible": true,
    "sort": 10,
    "roles": [
      "super_admin",
      "admin",
      "operator",
      "warehouse"
    ],
    "desc": "统一扫码识别、状态处理、装箱、发货和退货入口"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "search",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "toolbar",
    "visible": true,
    "sort": 20,
    "desc": "扫描防伪码ID/码值、箱号、发货单号或退货单号并自动识别"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "check",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "toolbar",
    "visible": true,
    "sort": 30,
    "confirm": true,
    "desc": "扫描后将防伪码置为已激活"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "lock",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "row_more",
    "visible": true,
    "sort": 40,
    "confirm": true,
    "desc": "异常码、投诉码或风险码可扫码锁定"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "unlock",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "row_more",
    "visible": true,
    "sort": 50,
    "confirm": true,
    "desc": "将锁定码恢复为已激活"
  },
  {
    "page": "code",
    "label": "扫码溯源",
    "icon": "delete",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "row_more",
    "visible": true,
    "sort": 60,
    "confirm": true,
    "riskLevel": "high",
    "desc": "作废错误生成、损坏或召回的防伪码"
  },
  {
    "page": "box",
    "label": "分类装箱",
    "icon": "box",
    "route": "/scanner",
    "workflow": "classification_boxing",
    "placement": "toolbar",
    "visible": true,
    "sort": 70,
    "needTarget": true,
    "targetField": "box_id",
    "targetLabel": "箱子ID",
    "desc": "先选择或填写箱子ID，再连续扫描单品防伪码装箱"
  },
  {
    "page": "box",
    "label": "分类装箱",
    "icon": "box",
    "route": "/scanner",
    "workflow": "classification_boxing",
    "placement": "row_action",
    "visible": true,
    "sort": 80,
    "codeType": "box",
    "desc": "扫描箱号或箱子ID后将箱子状态改为已封箱"
  },
  {
    "page": "shipment",
    "label": "扫码发货",
    "icon": "truck",
    "route": "/scanner",
    "workflow": "shipment_shipping",
    "placement": "toolbar",
    "visible": true,
    "sort": 90,
    "needTarget": true,
    "targetField": "shipment_id",
    "targetLabel": "发货单ID",
    "desc": "先填写发货单ID，再连续扫描箱号追加到发货单"
  },
  {
    "page": "shipment",
    "label": "扫码发货",
    "icon": "truck",
    "route": "/scanner",
    "workflow": "shipment_shipping",
    "placement": "row_action",
    "visible": true,
    "sort": 100,
    "codeType": "shipment",
    "confirm": true,
    "desc": "扫描发货单号或发货单ID后确认发货"
  },
  {
    "page": "return",
    "label": "扫码溯源",
    "icon": "return",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "toolbar",
    "visible": true,
    "sort": 110,
    "needTarget": true,
    "targetField": "return_id",
    "targetLabel": "退货单ID",
    "desc": "先填写退货单ID，再连续扫描退货防伪码"
  },
  {
    "page": "trace",
    "label": "溯源扫码查询",
    "icon": "link",
    "route": "/scanner",
    "workflow": "traceability",
    "placement": "toolbar",
    "visible": true,
    "sort": 120,
    "desc": "扫描溯源编号或防伪码快速查看链路"
  }
] },
      { key: 'business_templates', label: '业务模板扩展', type: 'json', span: 24, help: '用于扩展后台业务模板，不改代码即可补充常用流程、话术和默认字段。', defaultValue: {
  "code": [
    {
      "key": "standard_code_query",
      "name": "标准查码",
      "workflow": "traceability",
      "scene": "客服核验/仓库复核/现场稽查",
      "defaultTarget": "",
      "requiredFields": [
        "code"
      ],
      "resultModules": [
        "anti_fake_code",
        "product",
        "box",
        "shipment",
        "return_order",
        "trace"
      ],
      "successMessage": "扫码识别完成，请核对产品、状态、箱号和流转信息。"
    },
    {
      "key": "first_activation",
      "name": "入库扫码激活",
      "workflow": "traceability",
      "scene": "标签贴标后或产品入库前激活",
      "defaultStatus": 1,
      "requiredFields": [
        "code"
      ],
      "successMessage": "防伪码已激活，可进入正常查询和流转环节。"
    },
    {
      "key": "risk_lock",
      "name": "异常码锁定",
      "workflow": "traceability",
      "scene": "投诉、疑似复制、跨区域异常或人工复核",
      "defaultStatus": 2,
      "requiredFields": [
        "code"
      ],
      "confirmText": "确认锁定该防伪码？锁定后消费者查询会显示异常。"
    },
    {
      "key": "risk_unlock",
      "name": "异常码解锁",
      "workflow": "traceability",
      "scene": "风险解除、误锁恢复",
      "defaultStatus": 1,
      "requiredFields": [
        "code"
      ],
      "confirmText": "确认恢复该防伪码为已激活？"
    },
    {
      "key": "code_cancel",
      "name": "防伪码注销",
      "workflow": "traceability",
      "scene": "废码、错码、召回码处理",
      "defaultStatus": 3,
      "requiredFields": [
        "code"
      ],
      "riskLevel": "high",
      "confirmText": "确认注销该防伪码？注销后不建议恢复。"
    }
  ],
  "box": [
    {
      "key": "single_box_add_code",
      "name": "单箱连续装码",
      "workflow": "classification_boxing",
      "scene": "仓库装箱/复核",
      "targetField": "box_id",
      "targetLabel": "箱子ID",
      "requiredFields": [
        "target_id",
        "code"
      ],
      "scanMode": "continuous",
      "duplicatePolicy": "skip",
      "overCapacityPolicy": "block",
      "successMessage": "已加入箱子，重复码会自动跳过。"
    },
    {
      "key": "box_seal",
      "name": "扫码封箱",
      "workflow": "classification_boxing",
      "scene": "装箱完成后封箱",
      "requiredFields": [
        "code"
      ],
      "codeType": "box_no_or_id",
      "confirmText": "确认封箱？封箱后该箱可进入发货环节。"
    }
  ],
  "shipment": [
    {
      "key": "shipment_add_box",
      "name": "发货单连续加箱",
      "workflow": "shipment_shipping",
      "scene": "发货复核/出库扫描",
      "targetField": "shipment_id",
      "targetLabel": "发货单ID",
      "requiredFields": [
        "target_id",
        "code"
      ],
      "scanMode": "continuous",
      "duplicatePolicy": "skip",
      "successMessage": "箱子已加入发货单，并更新为待发货/发货中状态。"
    },
    {
      "key": "shipment_ship",
      "name": "扫码确认发货",
      "workflow": "shipment_shipping",
      "scene": "物流交接/发货完成",
      "requiredFields": [
        "code"
      ],
      "codeType": "shipment_no_or_id",
      "payloadFields": [
        {
          "key": "logistics_company",
          "label": "物流公司",
          "type": "input"
        },
        {
          "key": "tracking_no",
          "label": "物流单号",
          "type": "input"
        },
        {
          "key": "remark",
          "label": "备注",
          "type": "textarea"
        }
      ],
      "confirmText": "确认将该发货单置为已发货？"
    }
  ],
  "returns": [
    {
      "key": "return_add_code",
      "name": "退货单连续加码",
      "workflow": "traceability",
      "scene": "退货入库/售后复核",
      "targetField": "return_id",
      "targetLabel": "退货单ID",
      "requiredFields": [
        "target_id",
        "code"
      ],
      "scanMode": "continuous",
      "duplicatePolicy": "skip",
      "successMessage": "退货码已加入退货单。"
    }
  ],
  "trace": [
    {
      "key": "trace_query",
      "name": "溯源链路扫码查询",
      "workflow": "traceability",
      "scene": "生产、质检、仓储、渠道流转核验",
      "requiredFields": [
        "code"
      ],
      "resultModules": [
        "trace",
        "product",
        "box",
        "shipment"
      ],
      "successMessage": "溯源链路识别完成。"
    }
  ],
  "common": {
    "scanTerminators": [
      "Enter",
      "Tab"
    ],
    "codeSeparators": [
      "\n",
      ",",
      "，",
      ";",
      "；",
      " "
    ],
    "duplicatePolicy": "skip",
    "notFoundPolicy": "warn",
    "successToast": true,
    "errorToast": true,
    "historyLimit": 20
  }
} },
      { key: 'field_alias_map', label: '后台字段别名映射', type: 'json', span: 24, help: '用于按业务习惯改字段显示名，可逐项维护字段名和后台显示文案。', defaultValue: {
  "id": "ID",
  "code": "防伪码",
  "anti_fake_code": "防伪码",
  "product_id": "产品ID",
  "product_name": "产品名称",
  "brand": "品牌",
  "category": "产品分类",
  "specification": "规格型号",
  "batch_no": "生产批次",
  "production_date": "生产日期",
  "expiry_date": "有效期至",
  "manufacturer": "公司",
  "origin_place": "产地",
  "status": "状态",
  "query_count": "查询次数",
  "activated_at": "激活时间",
  "created_at": "创建时间",
  "updated_at": "更新时间",
  "box_id": "箱子ID",
  "box_no": "箱号/外箱码",
  "box_code": "箱码",
  "box_capacity": "箱容量",
  "box_status": "箱状态",
  "shipment_id": "发货单ID",
  "shipment_no": "发货单号",
  "shipment_status": "发货状态",
  "box_ids": "发货箱列表",
  "agent_id": "代理商ID",
  "agent_name": "代理商",
  "dealer_name": "经销商",
  "receiver_name": "收货人",
  "receiver_phone": "收货电话",
  "receiver_address": "收货地址",
  "logistics_company": "物流公司",
  "tracking_no": "物流单号",
  "return_id": "退货单ID",
  "return_no": "退货单号",
  "return_codes": "退货防伪码",
  "return_reason": "退货原因",
  "trace_id": "溯源ID",
  "trace_no": "溯源编号",
  "trace_node": "溯源节点",
  "quality_inspector": "质检员",
  "warehouse": "仓库",
  "operator": "操作员",
  "remark": "备注"
} },
    ],
  },
  {
    key: 'integration', title: '接口与第三方对接设置', desc: '开放 API、ERP、WMS、电商、扫码硬件和小程序 H5', icon: 'api', securityLevel: 'high', fields: [
      { key: 'open_api_enabled', label: '开放 API 接口', type: 'switch', defaultValue: false },
      { key: 'api_key', label: '接口密钥', type: 'password', help: '只在首次生成或重置时展示，请妥善保存。' },
      { key: 'api_ip_whitelist', label: '接口白名单', type: 'textarea', placeholder: '每行一个 IP / CIDR' },
      { key: 'erp_sync_config', label: 'ERP 同步配置', type: 'json', span: 24, defaultValue: {} },
      { key: 'wms_sync_config', label: '仓储 WMS 同步配置', type: 'json', span: 24, defaultValue: {} },
      { key: 'ecommerce_sync_config', label: '电商平台同步配置', type: 'json', span: 24, defaultValue: {} },
      { key: 'scanner_hardware_config', label: '扫码硬件 / PDA / 扫码枪参数', type: 'json', span: 24, defaultValue: {
  "mode": "usb_keyboard",
  "enabled": true,
  "globalListen": true,
  "terminator": "Enter",
  "alternativeTerminators": [
    "Tab"
  ],
  "minLength": 3,
  "maxIntervalMs": 80,
  "autoTrim": true,
  "normalizeUrl": true,
  "urlCodeParams": [
    "code",
    "q",
    "barcode"
  ],
  "urlPathKeys": [
    "verify",
    "v",
    "query"
  ],
  "prefixRules": [
    {
      "prefix": "code:",
      "remove": true
    },
    {
      "prefix": "CODE:",
      "remove": true
    },
    {
      "prefix": "箱号:",
      "remove": true
    }
  ],
  "devices": [
    {
      "name": "通用USB扫码枪",
      "type": "keyboard_hid",
      "terminator": "Enter",
      "remark": "多数有线/无线USB扫码枪可直接使用"
    },
    {
      "name": "PDA浏览器扫码",
      "type": "manual_or_keyboard",
      "terminator": "Enter",
      "remark": "PDA输入框扫码后回车提交"
    }
  ],
  "businessDefaults": {
    "defaultWorkflow": "code_query",
    "historyLimit": 20,
    "continuousScan": true,
    "duplicatePolicy": "skip",
    "notFoundPolicy": "warn"
  },
  "sound": {
    "success": true,
    "error": true
  },
  "vibration": {
    "pda": true
  },
  "security": {
    "ignoreEditableGlobalInput": true,
    "requireConfirmWorkflows": [
      "code_lock",
      "code_unlock",
      "code_cancel",
      "box_seal",
      "shipment_ship"
    ],
    "highRiskWorkflows": [
      "code_cancel"
    ]
  }
} },
      { key: 'mini_program_config', label: '小程序 / 公众号 H5 对接参数', type: 'json', span: 24, defaultValue: {
  "enabled": false,
  "h5VerifyPath": "/verify/{code}",
  "shortVerifyPath": "/v/{code}",
  "autoQueryFromUrl": true,
  "codeParam": "code",
  "shareTitle": "官方防伪码验证",
  "shareDesc": "扫码核验真伪并查看产品溯源信息",
  "wechatOfficialAccount": "",
  "miniProgramAppId": "",
  "fallbackUrl": "/error/404"
} },
      { key: 'h5_domain', label: 'H5 域名配置', type: 'input' },
    ],
  },
  {
    key: 'security_log', title: '安全 & 日志设置', desc: '操作日志、登录日志、扫码日志、脱敏、二次验证和黑名单', icon: 'security', securityLevel: 'high', fields: [
      { key: 'operation_log_enabled', label: '操作日志记录', type: 'switch', defaultValue: true },
      { key: 'login_log_enabled', label: '登录日志记录', type: 'switch', defaultValue: true },
      { key: 'scan_log_enabled', label: '扫码日志记录', type: 'switch', defaultValue: true },
      { key: 'data_masking_enabled', label: '数据脱敏', type: 'switch', defaultValue: true },
      { key: 'sensitive_operation_mfa', label: '敏感操作二次验证', type: 'switch', defaultValue: true, help: '删除、批量作废、恢复备份等操作建议开启。' },
      { key: 'ip_blacklist', label: '恶意扫码 IP 黑名单', type: 'textarea', placeholder: '每行一个 IP' },
      { key: 'account_ban_rules', label: '账号封禁规则', type: 'json', span: 24, defaultValue: { loginFailLimit: 10, banSeconds: 3600 } },
      { key: 'audit_retention_days', label: '审计日志保留天数', type: 'number', defaultValue: 730, min: 30, max: 3650 },
    ],
  },
];

const activeKey = ref('ui_theme');
const formRef = ref();
const loading = ref(false);
const saving = ref(false);
const form = reactive<Record<string, any>>({});

const activeGroup = computed(() => groups.find((g) => g.key === activeKey.value) || groups[0]);
const activeFields = computed(() => activeGroup.value.fields);

function displayGroupTitle(group: Group) { return t(`settings.groups.${group.key}.title`, group.title); }
function displayGroupDesc(group: Group) { return t(`settings.groups.${group.key}.desc`, group.desc); }
function displayFieldLabel(field: Field) { return t(`settings.fields.${field.key}`, field.label); }

function assignDefaultValues() {
  Object.keys(form).forEach((key) => delete form[key]);
  activeFields.value.forEach((field) => {
    const value = typeof field.defaultValue === 'undefined' ? undefined : field.defaultValue;
    form[field.key] = value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
  });
}

async function loadActiveGroup(force = false) {
  loading.value = true;
  try {
    if (force) clearRequestCache();
    assignDefaultValues();
    const settings = await settingsApi.detail(activeKey.value);
    Object.assign(form, settings || {});
    if (activeKey.value === 'ui_theme' || activeKey.value === 'layout_lowcode') syncThemeFromForm();
  } finally {
    loading.value = false;
  }
}

async function switchGroup(key: string) {
  if (key === activeKey.value) return;
  activeKey.value = key;
  await loadActiveGroup();
}

async function saveActiveGroup() {
  try {
    await formRef.value?.validate?.();
  } catch {
    return;
  }
  saving.value = true;
  try {
    await settingsApi.saveGroup(activeKey.value, cleanObject({ ...form }));
    if (activeKey.value === 'ui_theme' || activeKey.value === 'layout_lowcode') syncThemeFromForm();
    Message.success(t('settings.saved'));
    clearRequestCache();
    // Dispatch event to notify layout about settings update
    window.dispatchEvent(new Event('settings-updated'));
  } finally {
    saving.value = false;
  }
}



function selectUiTheme(key: UiThemeKey) {
  form.ui_theme = key;
  const preset = uiThemePresets.find((item) => item.key === key);
  if (preset) form.primary_color = preset.primary;
  syncThemeFromForm();
}

function syncThemeFromForm() {
  if (activeKey.value !== 'ui_theme' && activeKey.value !== 'layout_lowcode') return;
  applyThemeConfig({
    ui_theme: form.ui_theme,
    theme_mode: form.theme_mode,
    primary_color: form.primary_color,
    layout_mode: form.layout_mode,
    menu_behavior: form.menu_behavior,
    content_width: form.content_width,
    show_route_tabs: form.show_route_tabs,
  });
}

function themePreviewStyle(theme: (typeof uiThemePresets)[number]) {
  return {
    '--preview-primary': theme.primary,
    '--preview-bg': theme.pageBg,
    '--preview-surface': theme.surface,
    '--preview-line': theme.line,
  } as Record<string, string>;
}

watch(() => [form.theme_mode, form.primary_color, form.layout_mode, form.menu_behavior, form.content_width, form.show_route_tabs], () => {
  syncThemeFromForm();
});

function jsonTeaching(field: Field) {
  return field.teaching || [0, 1, 2, 3].map((index) => t(`settings.jsonTips.${index}`));
}

function openVerifyPreview() {
  Message.info('验证页必须使用带防伪码的地址访问，例如 /verify/{code}。请在防伪码管理中生成或复制二维码链接后预览。');
}

onMounted(() => {
  const group = String(route.query.group || '');
  if (group && groups.some((item) => item.key === group)) activeKey.value = group;
  loadActiveGroup();
});
</script>

<style scoped>

.theme-select-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}
.theme-card-option {
  border: 2px solid var(--line);
  background: var(--surface);
  border-radius: 18px;
  padding: 16px;
  display: flex;
  gap: 14px;
  align-items: center;
  text-align: left;
  cursor: pointer;
  transition: all .24s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.theme-card-option::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.03), transparent);
  opacity: 0;
  transition: opacity .24s ease;
}
.theme-card-option:hover {
  transform: translateY(-2px) scale(1.01);
  border-color: var(--primary);
  box-shadow: 0 12px 32px -8px rgba(37, 99, 235, 0.2), 0 0 0 1px rgba(37, 99, 235, 0.1);
}
.theme-card-option:hover::before {
  opacity: 1;
}
.theme-card-option.active {
  border-color: var(--primary);
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.08), rgba(96, 165, 250, 0.05));
  box-shadow: 0 8px 24px -4px rgba(37, 99, 235, 0.25), inset 0 0 0 1px rgba(37, 99, 235, 0.15);
  transform: scale(1.02);
}
.theme-card-option.active::after {
  content: '✓';
  position: absolute;
  top: 12px;
  right: 12px;
  width: 24px;
  height: 24px;
  background: var(--primary);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  animation: checkmark .3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}
@keyframes checkmark {
  0% { transform: scale(0) rotate(-45deg); opacity: 0; }
  50% { transform: scale(1.2) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
.theme-preview {
  width: 80px;
  height: 56px;
  flex: 0 0 auto;
  border-radius: 14px;
  padding: 8px;
  background: var(--preview-bg);
  border: 1.5px solid var(--preview-line);
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 7px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transition: transform .24s ease;
}
.theme-card-option:hover .theme-preview {
  transform: scale(1.05);
}
.theme-preview i,
.theme-preview b,
.theme-preview em {
  display: block;
  border-radius: 7px;
  font-style: normal;
  transition: all .24s ease;
}
.theme-preview i {
  grid-row: 1 / span 2;
  background: var(--preview-primary);
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
}
.theme-preview b {
  background: var(--preview-surface);
  border: 1px solid var(--preview-line);
}
.theme-preview em {
  background: linear-gradient(90deg, var(--preview-primary), var(--preview-line));
  opacity: .8;
}
.theme-option-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  z-index: 1;
}
.theme-option-main strong {
  color: var(--text-1);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.theme-option-main small {
  color: var(--text-3);
  line-height: 1.5;
  font-size: 13px;
}

.settings-page { --nav-width: 340px; }
.settings-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
  padding: 28px 32px;
  border-radius: 28px;
  background:
    radial-gradient(circle at 85% 15%, rgba(96, 165, 250, 0.25), transparent 40%),
    radial-gradient(circle at 15% 85%, rgba(147, 197, 253, 0.18), transparent 40%),
    linear-gradient(135deg, rgba(239, 246, 255, 1), rgba(255, 255, 255, 0.95));
  box-shadow: 0 8px 32px -4px rgba(37, 99, 235, 0.12), 0 0 0 1px rgba(207, 224, 255, 0.6);
  border: 1px solid rgba(191, 219, 254, 0.8);
  position: relative;
  overflow: hidden;
}
.settings-hero::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(96, 165, 250, 0.15), transparent 70%);
  border-radius: 50%;
  pointer-events: none;
}
.settings-layout {
  display: grid;
  grid-template-columns: var(--nav-width) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.settings-nav {
  border-radius: 24px;
  box-shadow: 0 4px 24px -2px rgba(37, 99, 235, 0.08), 0 0 0 1px rgba(191, 219, 254, 0.5);
  position: sticky;
  top: 20px;
  max-height: calc(100dvh - 160px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  border: 1px solid rgba(191, 219, 254, 0.6);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 250, 251, 0.95));
  backdrop-filter: blur(12px);
}
.settings-nav::-webkit-scrollbar { width: 7px; }
.settings-nav::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
.settings-nav::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, rgba(148, 163, 184, 0.5), rgba(100, 116, 139, 0.5));
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
.settings-nav::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, rgba(100, 116, 139, 0.7), rgba(71, 85, 105, 0.7));
  background-clip: padding-box;
}
.settings-nav-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-3);
  margin-bottom: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 0 4px;
}
.settings-nav-item {
  width: 100%;
  border: 2px solid transparent;
  background: transparent;
  padding: 14px;
  border-radius: 18px;
  display: flex;
  gap: 14px;
  text-align: left;
  cursor: pointer;
  color: var(--text-2);
  transition: all .24s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.settings-nav-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  background: linear-gradient(180deg, var(--primary), rgba(96, 165, 250, 0.8));
  border-radius: 0 3px 3px 0;
  transition: height .24s cubic-bezier(0.4, 0, 0.2, 1);
}
.settings-nav-item + .settings-nav-item { margin-top: 8px; }
.settings-nav-item:hover {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.06), rgba(96, 165, 250, 0.04));
  transform: translateX(4px);
  color: var(--primary);
  border-color: rgba(37, 99, 235, 0.12);
}
.settings-nav-item:hover::before {
  height: 60%;
}
.settings-nav-item.active {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.12), rgba(96, 165, 250, 0.08));
  color: var(--primary);
  border-color: rgba(37, 99, 235, 0.2);
  box-shadow: 0 4px 16px -2px rgba(37, 99, 235, 0.15), inset 0 0 0 1px rgba(37, 99, 235, 0.1);
  transform: translateX(2px);
}
.settings-nav-item.active::before {
  height: 80%;
}
.settings-nav-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.1), rgba(96, 165, 250, 0.08));
  color: var(--primary);
  transition: all .24s cubic-bezier(0.4, 0, 0.2, 1);
}
.settings-nav-item:hover .settings-nav-icon {
  background: linear-gradient(135deg, var(--primary), rgba(59, 130, 246, 0.9));
  color: white;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
  transform: scale(1.05);
}
.settings-nav-item.active .settings-nav-icon {
  background: linear-gradient(135deg, var(--primary), rgba(59, 130, 246, 0.9));
  color: white;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
}
.settings-nav-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1;
}
.settings-nav-text strong {
  font-size: 14px;
  font-weight: 600;
  color: inherit;
  letter-spacing: -0.01em;
}
.settings-nav-text small {
  color: var(--text-3);
  line-height: 1.45;
  font-size: 12px;
}
.settings-main { min-width: 0; }
.settings-summary {
  border-radius: 24px;
  box-shadow: 0 4px 24px -2px rgba(37, 99, 235, 0.08), 0 0 0 1px rgba(191, 219, 254, 0.5);
  margin-bottom: 16px;
  border: 1px solid rgba(191, 219, 254, 0.6);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 250, 251, 0.95));
  backdrop-filter: blur(12px);
}
.summary-left {
  display: flex;
  align-items: center;
  gap: 16px;
}
.summary-icon {
  width: 52px;
  height: 52px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.15), rgba(96, 165, 250, 0.12));
  color: var(--primary);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2), inset 0 -2px 8px rgba(37, 99, 235, 0.15);
}
.settings-summary :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
}
.settings-summary h3 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-1);
  letter-spacing: -0.02em;
}
.settings-summary p {
  margin: 0;
  color: var(--text-3);
  line-height: 1.5;
  font-size: 14px;
}
.settings-alert {
  margin-bottom: 16px;
  border-radius: 16px;
}
.settings-form-card {
  border-radius: 24px;
  box-shadow: 0 4px 24px -2px rgba(37, 99, 235, 0.08), 0 0 0 1px rgba(191, 219, 254, 0.5);
  border: 1px solid rgba(191, 219, 254, 0.6);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(249, 250, 251, 0.95));
  backdrop-filter: blur(12px);
}
.settings-form-card :deep(.el-card__body) {
  padding: 24px;
}
.settings-form-card :deep(.el-form-item) {
  padding: 18px;
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(249, 250, 251, 0.85));
  border: 2px solid rgba(191, 219, 254, 0.4);
  transition: all .24s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.settings-form-card :deep(.el-form-item::before) {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.02), transparent);
  opacity: 0;
  transition: opacity .24s ease;
}
.settings-form-card :deep(.el-form-item:hover) {
  border-color: rgba(37, 99, 235, 0.3);
  box-shadow: 0 8px 24px -4px rgba(37, 99, 235, 0.12), 0 0 0 1px rgba(37, 99, 235, 0.08);
  transform: translateY(-1px);
}
.settings-form-card :deep(.el-form-item:hover::before) {
  opacity: 1;
}
.settings-form-card :deep(.el-form-item:focus-within) {
  border-color: var(--primary);
  box-shadow: 0 8px 32px -4px rgba(37, 99, 235, 0.2), 0 0 0 1px rgba(37, 99, 235, 0.15);
  transform: translateY(-2px);
}
.settings-form-card :deep(.el-form-item__label) {
  font-weight: 600;
  color: var(--text-1);
  font-size: 14px;
  letter-spacing: -0.01em;
  margin-bottom: 10px;
  position: relative;
  z-index: 1;
}
.settings-form-card :deep(.el-input__wrapper),
.settings-form-card :deep(.el-select__wrapper),
.settings-form-card :deep(.el-textarea__inner) {
  border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(191, 219, 254, 0.6) inset;
  transition: all .24s cubic-bezier(0.4, 0, 0.2, 1);
  background: rgba(255, 255, 255, 0.95);
}
.settings-form-card :deep(.el-input__wrapper:hover),
.settings-form-card :deep(.el-select__wrapper:hover),
.settings-form-card :deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px rgba(37, 99, 235, 0.4) inset;
}
.settings-form-card :deep(.el-input__wrapper.is-focus),
.settings-form-card :deep(.el-select__wrapper.is-focused),
.settings-form-card :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 2px var(--primary) inset, 0 4px 16px -2px rgba(37, 99, 235, 0.2);
}
.form-help {
  margin-top: 8px;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.6;
  padding-left: 4px;
}
.json-config-block { width: 100%; position: relative; z-index: 1; }
.json-teaching {
  margin-top: 12px;
  border: 2px solid rgba(191, 219, 254, 0.6);
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.9), rgba(255, 255, 255, 0.85));
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);
}
.json-teaching :deep(.el-collapse-item__header) {
  padding: 0 16px;
  height: 48px;
  background: linear-gradient(135deg, rgba(219, 234, 254, 0.8), rgba(239, 246, 255, 0.7));
  font-weight: 600;
  color: var(--primary);
  transition: all .24s ease;
  border: none;
}
.json-teaching :deep(.el-collapse-item__header:hover) {
  background: linear-gradient(135deg, rgba(191, 219, 254, 0.9), rgba(219, 234, 254, 0.8));
}
.json-teaching :deep(.el-collapse-item__content) {
  padding: 16px;
  background: rgba(255, 255, 255, 0.6);
}
.json-teaching-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.json-teaching-body p {
  margin: 0 0 10px;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.7;
  padding-left: 12px;
  position: relative;
}
.json-teaching-body p::before {
  content: '•';
  position: absolute;
  left: 0;
  color: var(--primary);
  font-weight: bold;
}
.json-teaching-body p:last-child { margin-bottom: 0; }
:global(html[data-theme="dark"]) .settings-hero {
  background:
    radial-gradient(circle at 85% 15%, rgba(59, 130, 246, 0.15), transparent 40%),
    radial-gradient(circle at 15% 85%, rgba(37, 99, 235, 0.12), transparent 40%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.95));
  border-color: rgba(71, 85, 105, 0.4);
  box-shadow: 0 8px 32px -4px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(71, 85, 105, 0.3);
}
:global(html[data-theme="dark"]) .settings-nav,
:global(html[data-theme="dark"]) .settings-summary,
:global(html[data-theme="dark"]) .settings-form-card {
  background: linear-gradient(180deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.92));
  border-color: rgba(71, 85, 105, 0.3);
  box-shadow: 0 4px 24px -2px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(71, 85, 105, 0.2);
}
:global(html[data-theme="dark"]) .settings-form-card :deep(.el-form-item) {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.6), rgba(15, 23, 42, 0.5));
  border-color: rgba(71, 85, 105, 0.3);
}
:global(html[data-theme="dark"]) .settings-form-card :deep(.el-form-item:hover) {
  border-color: rgba(59, 130, 246, 0.4);
  box-shadow: 0 8px 24px -4px rgba(37, 99, 235, 0.2), 0 0 0 1px rgba(59, 130, 246, 0.2);
}
:global(html[data-theme="dark"]) .json-teaching {
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.7));
  border-color: rgba(71, 85, 105, 0.4);
}
:global(html[data-theme="dark"]) .json-teaching :deep(.el-collapse-item__header) {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8));
}
:global(html[data-theme="dark"]) .json-teaching :deep(.el-collapse-item__content) {
  background: rgba(15, 23, 42, 0.5);
}
@media (max-width: 1100px) {
  .settings-layout { grid-template-columns: 1fr; }
  .settings-nav {
    position: static;
    max-height: none;
    margin-bottom: 20px;
  }
}
@media (max-width: 700px) {
  .settings-hero {
    flex-direction: column;
    align-items: flex-start;
    border-radius: 20px;
    padding: 20px;
  }
  .settings-summary :deep(.el-card__body) {
    align-items: flex-start;
    flex-direction: column;
    padding: 16px 20px;
  }
}

@media (max-width: 900px) {
  .settings-page { --nav-width: 1fr; }
  .settings-layout { grid-template-columns: 1fr; }
  .settings-nav {
    position: relative;
    top: auto;
    max-height: none;
    margin-bottom: 20px;
  }
  .settings-nav :deep(.el-card__body) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .settings-nav-title {
    grid-column: 1 / -1;
    margin-bottom: 6px;
  }
  .settings-nav-item + .settings-nav-item { margin-top: 0; }
}
@media (max-width: 640px) {
  .settings-hero {
    padding: 20px;
    border-radius: 20px;
    align-items: flex-start;
    flex-direction: column;
  }
  .settings-nav :deep(.el-card__body) { grid-template-columns: 1fr; }
  .settings-nav-item { padding: 12px; }
  .theme-select-grid { grid-template-columns: 1fr; }
  .theme-card-option {
    align-items: flex-start;
    padding: 14px;
  }
  .settings-form-card :deep(.el-form-item) {
    padding: 14px;
  }
}
</style>
