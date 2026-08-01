import { computed, reactive } from 'vue';

export type ThemeMode = 'light' | 'dark';
export type LayoutMode = 'classic' | 'compact' | 'topTabs' | 'wide' | 'immersive';
export type MenuBehavior = 'auto' | 'expanded' | 'collapsed';

export type UiThemeKey =
  | 'ios27'
  | 'standard'
  | 'enterprise1'
  | 'enterprise2'
  | 'minimalSaas'
  | 'minimal'
  | 'halo'
  | 'typecho'
  | 'wordpress2026'
  | 'emerald'
  | 'violetTech';

type UiThemePreset = {
  key: UiThemeKey;
  label: string;
  desc: string;
  primary: string;
  primaryDeep: string;
  pageBg: string;
  pageBgSoft: string;
  surface: string;
  surfaceSoft: string;
  text1: string;
  text2: string;
  text3: string;
  line: string;
  cardRadius: string;
  baseRadius: string;
  shadow: string;
  shadowSoft: string;
  bodyGradient: string;
  heroGradient: string;
  cardBorderOpacity?: number;
  density: 'comfortable' | 'compact' | 'minimal';
};

const THEME_MODE_KEY = 'trace_admin_theme_mode';
const PRIMARY_COLOR_KEY = 'trace_admin_primary_color';
const UI_THEME_KEY = 'trace_admin_ui_theme';
const LAYOUT_MODE_KEY = 'trace_admin_layout_mode';
const MENU_BEHAVIOR_KEY = 'trace_admin_menu_behavior';
const CONTENT_WIDTH_KEY = 'trace_admin_content_width';
const SHOW_ROUTE_TABS_KEY = 'trace_admin_show_route_tabs';

const defaultPrimary = '#0a84ff';

export const uiThemePresets: UiThemePreset[] = [
  {
    key: 'ios27',
    label: 'iOS 27 · Liquid Glass',
    desc: '通透玻璃、流体彩光、圆角胶囊与低噪后台，适合高端 SaaS 管理系统。',
    primary: '#0a84ff',
    primaryDeep: '#0066d6',
    pageBg: '#eef6ff',
    pageBgSoft: '#f8fbff',
    surface: '#ffffff',
    surfaceSoft: '#f5f9ff',
    text1: '#0b1220',
    text2: '#26364d',
    text3: '#74839a',
    line: 'rgba(142, 170, 210, .26)',
    cardRadius: '28px',
    baseRadius: '16px',
    shadow: '0 24px 80px rgba(31, 89, 165, .14)',
    shadowSoft: '0 14px 42px rgba(31, 89, 165, .10)',
    bodyGradient: 'radial-gradient(circle at 10% -6%, rgba(10, 132, 255, .20), transparent 30%), radial-gradient(circle at 88% 4%, rgba(94, 92, 230, .16), transparent 28%), radial-gradient(circle at 70% 90%, rgba(48, 209, 88, .10), transparent 30%), linear-gradient(180deg, #fbfdff 0%, #eef6ff 100%)',
    heroGradient: 'radial-gradient(circle at 88% 10%, rgba(10, 132, 255, .18), transparent 34%), radial-gradient(circle at 8% 8%, rgba(94, 92, 230, .12), transparent 30%), linear-gradient(135deg, rgba(255, 255, 255, .82), rgba(245, 250, 255, .66))',
    density: 'comfortable',
  },
  {
    key: 'standard',
    label: '标准 · iOS 27',
    desc: '兼容原标准主题的 iOS 27 Liquid Glass 视觉。',
    primary: '#0a84ff',
    primaryDeep: '#0066d6',
    pageBg: '#eef6ff',
    pageBgSoft: '#f8fbff',
    surface: '#ffffff',
    surfaceSoft: '#f5f9ff',
    text1: '#0b1220',
    text2: '#26364d',
    text3: '#74839a',
    line: 'rgba(142, 170, 210, .26)',
    cardRadius: '28px',
    baseRadius: '16px',
    shadow: '0 24px 80px rgba(31, 89, 165, .14)',
    shadowSoft: '0 14px 42px rgba(31, 89, 165, .10)',
    bodyGradient: 'radial-gradient(circle at 10% -6%, rgba(10, 132, 255, .20), transparent 30%), radial-gradient(circle at 88% 4%, rgba(94, 92, 230, .16), transparent 28%), radial-gradient(circle at 70% 90%, rgba(48, 209, 88, .10), transparent 30%), linear-gradient(180deg, #fbfdff 0%, #eef6ff 100%)',
    heroGradient: 'radial-gradient(circle at 88% 10%, rgba(10, 132, 255, .18), transparent 34%), radial-gradient(circle at 8% 8%, rgba(94, 92, 230, .12), transparent 30%), linear-gradient(135deg, rgba(255, 255, 255, .82), rgba(245, 250, 255, .66))',
    density: 'comfortable',
  },
  {
    key: 'enterprise1',
    label: '企业1 · 商务蓝黑',
    desc: '商业交付感更强，适合企业客户演示。',
    primary: '#1e40af',
    primaryDeep: '#172554',
    pageBg: '#eef2f7',
    pageBgSoft: '#f8fafc',
    surface: '#ffffff',
    surfaceSoft: '#f5f7fb',
    text1: '#0f172a',
    text2: '#334155',
    text3: '#64748b',
    line: '#dbe4f0',
    cardRadius: '16px',
    baseRadius: '8px',
    shadow: '0 18px 48px rgba(15, 23, 42, .12)',
    shadowSoft: '0 10px 28px rgba(15, 23, 42, .09)',
    bodyGradient: 'linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
    heroGradient: 'linear-gradient(135deg, rgba(239, 246, 255, .98), rgba(255, 255, 255, .96))',
    density: 'comfortable',
  },
  {
    key: 'enterprise2',
    label: '企业2 · 简洁商用',
    desc: '弱化装饰、强调表格和表单效率。',
    primary: '#0f766e',
    primaryDeep: '#115e59',
    pageBg: '#f3f6f6',
    pageBgSoft: '#fbfdfd',
    surface: '#ffffff',
    surfaceSoft: '#f7fbfa',
    text1: '#10201f',
    text2: '#334c49',
    text3: '#78908c',
    line: '#dcebea',
    cardRadius: '14px',
    baseRadius: '7px',
    shadow: '0 14px 34px rgba(15, 118, 110, .10)',
    shadowSoft: '0 8px 20px rgba(15, 118, 110, .07)',
    bodyGradient: 'linear-gradient(180deg, #fbfdfd 0%, #f3f6f6 100%)',
    heroGradient: 'linear-gradient(135deg, rgba(240, 253, 250, .98), rgba(255, 255, 255, .96))',
    density: 'compact',
  },
  {
    key: 'minimalSaas',
    label: '极简 SaaS',
    desc: '现代 SaaS 卡片风，适合数据看板。',
    primary: '#4f46e5',
    primaryDeep: '#3730a3',
    pageBg: '#f6f7fb',
    pageBgSoft: '#ffffff',
    surface: '#ffffff',
    surfaceSoft: '#fafaff',
    text1: '#111827',
    text2: '#374151',
    text3: '#6b7280',
    line: '#e5e7eb',
    cardRadius: '22px',
    baseRadius: '12px',
    shadow: '0 20px 60px rgba(79, 70, 229, .10)',
    shadowSoft: '0 12px 32px rgba(17, 24, 39, .08)',
    bodyGradient: 'radial-gradient(circle at 16% -10%, rgba(79, 70, 229, .12), transparent 28%), linear-gradient(180deg, #ffffff 0%, #f6f7fb 100%)',
    heroGradient: 'linear-gradient(135deg, rgba(245, 243, 255, .98), rgba(255, 255, 255, .96))',
    density: 'comfortable',
  },
  {
    key: 'minimal',
    label: '极简风格',
    desc: '近白底、低阴影、低饱和，适合长期办公。',
    primary: '#111827',
    primaryDeep: '#000000',
    pageBg: '#f7f7f8',
    pageBgSoft: '#ffffff',
    surface: '#ffffff',
    surfaceSoft: '#fafafa',
    text1: '#111111',
    text2: '#3f3f46',
    text3: '#71717a',
    line: '#e4e4e7',
    cardRadius: '12px',
    baseRadius: '8px',
    shadow: '0 12px 30px rgba(17, 17, 17, .06)',
    shadowSoft: '0 6px 18px rgba(17, 17, 17, .045)',
    bodyGradient: 'linear-gradient(180deg, #ffffff 0%, #f7f7f8 100%)',
    heroGradient: 'linear-gradient(135deg, rgba(250, 250, 250, .98), rgba(255, 255, 255, .96))',
    density: 'minimal',
  },
  {
    key: 'halo',
    label: 'Halo 风',
    desc: '轻博客后台感，柔和、清爽、偏内容管理。',
    primary: '#6366f1',
    primaryDeep: '#4338ca',
    pageBg: '#f4f7ff',
    pageBgSoft: '#fbfcff',
    surface: '#ffffff',
    surfaceSoft: '#f8faff',
    text1: '#1f2a44',
    text2: '#42526e',
    text3: '#7c8aa5',
    line: '#e2e8ff',
    cardRadius: '20px',
    baseRadius: '12px',
    shadow: '0 18px 48px rgba(99, 102, 241, .12)',
    shadowSoft: '0 10px 26px rgba(99, 102, 241, .08)',
    bodyGradient: 'radial-gradient(circle at 14% 4%, rgba(99, 102, 241, .12), transparent 28%), linear-gradient(180deg, #fbfcff 0%, #f4f7ff 100%)',
    heroGradient: 'linear-gradient(135deg, rgba(238, 242, 255, .98), rgba(255, 255, 255, .96))',
    density: 'comfortable',
  },
  {
    key: 'typecho',
    label: 'Typecho 风',
    desc: '轻量博客后台，朴素、清晰、低负担。',
    primary: '#334155',
    primaryDeep: '#0f172a',
    pageBg: '#f5f5f4',
    pageBgSoft: '#ffffff',
    surface: '#ffffff',
    surfaceSoft: '#fafaf9',
    text1: '#1c1917',
    text2: '#44403c',
    text3: '#78716c',
    line: '#e7e5e4',
    cardRadius: '10px',
    baseRadius: '6px',
    shadow: '0 10px 24px rgba(28, 25, 23, .06)',
    shadowSoft: '0 5px 14px rgba(28, 25, 23, .045)',
    bodyGradient: 'linear-gradient(180deg, #ffffff 0%, #f5f5f4 100%)',
    heroGradient: 'linear-gradient(135deg, rgba(250, 250, 249, .98), rgba(255, 255, 255, .96))',
    density: 'compact',
  },
  {
    key: 'wordpress2026',
    label: 'WordPress 2026',
    desc: '内容发布与站点管理风，明亮、现代、易识别。',
    primary: '#3858e9',
    primaryDeep: '#1e1eaa',
    pageBg: '#f6f7f7',
    pageBgSoft: '#ffffff',
    surface: '#ffffff',
    surfaceSoft: '#f9fafb',
    text1: '#1e1e1e',
    text2: '#3c434a',
    text3: '#757575',
    line: '#dcdcde',
    cardRadius: '8px',
    baseRadius: '4px',
    shadow: '0 12px 28px rgba(30, 30, 30, .075)',
    shadowSoft: '0 6px 16px rgba(30, 30, 30, .05)',
    bodyGradient: 'linear-gradient(180deg, #ffffff 0%, #f6f7f7 100%)',
    heroGradient: 'linear-gradient(135deg, rgba(240, 246, 252, .98), rgba(255, 255, 255, .96))',
    density: 'compact',
  },
  {
    key: 'emerald',
    label: '翡翠运营',
    desc: '绿色运营后台，适合品牌溯源、农产品和供应链。',
    primary: '#059669',
    primaryDeep: '#047857',
    pageBg: '#effaf5',
    pageBgSoft: '#f8fffc',
    surface: '#ffffff',
    surfaceSoft: '#f4fbf8',
    text1: '#10231c',
    text2: '#345348',
    text3: '#789689',
    line: '#d8efe5',
    cardRadius: '18px',
    baseRadius: '10px',
    shadow: '0 16px 42px rgba(5, 150, 105, .10)',
    shadowSoft: '0 10px 24px rgba(5, 150, 105, .07)',
    bodyGradient: 'radial-gradient(circle at 18% 0%, rgba(5, 150, 105, .12), transparent 30%), linear-gradient(180deg, #f8fffc 0%, #effaf5 100%)',
    heroGradient: 'linear-gradient(135deg, rgba(236, 253, 245, .98), rgba(255, 255, 255, .96))',
    density: 'comfortable',
  },
  {
    key: 'violetTech',
    label: '紫色科技',
    desc: '偏科技和数据大屏，强调品牌记忆点。',
    primary: '#7c3aed',
    primaryDeep: '#5b21b6',
    pageBg: '#f7f2ff',
    pageBgSoft: '#fcfaff',
    surface: '#ffffff',
    surfaceSoft: '#fbf8ff',
    text1: '#24113f',
    text2: '#4c3b63',
    text3: '#8873a3',
    line: '#eadcff',
    cardRadius: '20px',
    baseRadius: '12px',
    shadow: '0 18px 48px rgba(124, 58, 237, .12)',
    shadowSoft: '0 10px 28px rgba(124, 58, 237, .08)',
    bodyGradient: 'radial-gradient(circle at 18% -4%, rgba(124, 58, 237, .16), transparent 30%), linear-gradient(180deg, #fcfaff 0%, #f7f2ff 100%)',
    heroGradient: 'linear-gradient(135deg, rgba(245, 243, 255, .98), rgba(255, 255, 255, .96))',
    density: 'comfortable',
  },
];

const palette = uiThemePresets.map((item) => item.primary);

const state = reactive({
  mode: 'light' as ThemeMode,
  primaryColor: defaultPrimary,
  uiTheme: 'ios27' as UiThemeKey,
  layoutMode: 'classic' as LayoutMode,
  menuBehavior: 'auto' as MenuBehavior,
  contentWidth: 'fluid',
  showRouteTabs: true,
});

function normalizeHex(value?: string) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  return defaultPrimary;
}

function normalizeUiTheme(value?: string): UiThemeKey {
  return uiThemePresets.some((item) => item.key === value) ? value as UiThemeKey : 'ios27';
}

function normalizeLayoutMode(value?: string): LayoutMode {
  return ['classic', 'compact', 'topTabs', 'wide', 'immersive'].includes(String(value)) ? value as LayoutMode : 'classic';
}

function normalizeMenuBehavior(value?: string): MenuBehavior {
  return ['auto', 'expanded', 'collapsed'].includes(String(value)) ? value as MenuBehavior : 'auto';
}

function normalizeContentWidth(value?: string) {
  const raw = String(value || 'fluid').trim();
  if (raw === 'fluid') return 'fluid';
  if (/^(960|1080|1200|1320|1440|1600)$/.test(raw)) return raw;
  return 'fluid';
}

function getPreset(key: UiThemeKey) {
  return uiThemePresets.find((item) => item.key === key) || uiThemePresets[0];
}

function hexToRgb(hex: string) {
  const value = normalizeHex(hex).slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number) {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mix(hex: string, target: '#ffffff' | '#000000', amount: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex(
    a.r + (b.r - a.r) * amount,
    a.g + (b.g - a.g) * amount,
    a.b + (b.b - a.b) * amount,
  );
}

function persist() {
  localStorage.setItem(THEME_MODE_KEY, state.mode);
  localStorage.setItem(PRIMARY_COLOR_KEY, state.primaryColor);
  localStorage.setItem(UI_THEME_KEY, state.uiTheme);
  localStorage.setItem(LAYOUT_MODE_KEY, state.layoutMode);
  localStorage.setItem(MENU_BEHAVIOR_KEY, state.menuBehavior);
  localStorage.setItem(CONTENT_WIDTH_KEY, state.contentWidth);
  localStorage.setItem(SHOW_ROUTE_TABS_KEY, state.showRouteTabs ? '1' : '0');
}

export function applyAppearance() {
  const root = document.documentElement;
  state.uiTheme = normalizeUiTheme(state.uiTheme);
  const preset = getPreset(state.uiTheme);
  const primary = normalizeHex(state.primaryColor || preset.primary);
  state.primaryColor = primary;
  const rgb = hexToRgb(primary);
  const rgbText = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  const isDark = state.mode === 'dark';

  root.dataset.theme = state.mode;
  root.dataset.uiTheme = preset.key;
  root.dataset.uiDensity = preset.density;
  root.dataset.layoutMode = state.layoutMode;
  root.dataset.menuBehavior = state.menuBehavior;
  root.classList.toggle('dark', isDark); // Element Plus dark css-vars.css uses this class.
  root.style.colorScheme = state.mode;

  const text1 = isDark ? '#e5edf7' : preset.text1;
  const text2 = isDark ? '#cbd5e1' : preset.text2;
  const text3 = isDark ? '#94a3b8' : preset.text3;
  const line = isDark ? 'rgba(148, 163, 184, .22)' : preset.line;

  root.style.setProperty('--ui-theme-name', `'${preset.label}'`);
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-deep', isDark ? mix(primary, '#ffffff', 0.12) : preset.primaryDeep || mix(primary, '#000000', 0.18));
  root.style.setProperty('--primary-soft', isDark ? `rgba(${rgbText}, .16)` : mix(primary, '#ffffff', 0.9));
  root.style.setProperty('--primary-border', isDark ? `rgba(${rgbText}, .38)` : mix(primary, '#ffffff', 0.68));
  root.style.setProperty('--primary-rgb', rgbText);
  root.style.setProperty('--page-bg', isDark ? '#06111f' : preset.pageBg);
  root.style.setProperty('--page-bg-soft', isDark ? '#0b1a2e' : preset.pageBgSoft);
  root.style.setProperty('--surface', isDark ? 'rgba(16, 32, 55, .94)' : preset.surface);
  root.style.setProperty('--surface-soft', isDark ? '#0b1a2e' : preset.surfaceSoft);
  root.style.setProperty('--text-1', text1);
  root.style.setProperty('--text-2', text2);
  root.style.setProperty('--text-3', text3);
  root.style.setProperty('--line', line);
  root.style.setProperty('--card-radius', preset.cardRadius);
  root.style.setProperty('--shadow', isDark ? '0 18px 50px rgba(0, 0, 0, .35)' : preset.shadow);
  root.style.setProperty('--shadow-soft', isDark ? '0 10px 28px rgba(0, 0, 0, .25)' : preset.shadowSoft);
  root.style.setProperty('--body-gradient', isDark ? 'radial-gradient(circle at 18% 0%, rgba(10, 132, 255, .18), transparent 32%), radial-gradient(circle at 88% 4%, rgba(94, 92, 230, .14), transparent 30%), linear-gradient(180deg, #081426 0%, #06111f 100%)' : preset.bodyGradient);
  root.style.setProperty('--hero-gradient', isDark ? 'radial-gradient(circle at 86% 18%, rgba(96, 165, 250, .20), transparent 34%), linear-gradient(135deg, rgba(15, 33, 58, .96), rgba(8, 20, 36, .94))' : preset.heroGradient);
  const layout = normalizeLayoutMode(state.layoutMode);
  const sidebarWidth = layout === 'compact' ? '224px' : layout === 'wide' ? '288px' : layout === 'immersive' ? '260px' : '248px';
  const collapsedWidth = layout === 'compact' ? '72px' : '80px';
  const headerHeight = layout === 'compact' ? '58px' : layout === 'immersive' ? '72px' : '64px';
  const tabsHeight = state.showRouteTabs && layout !== 'immersive' ? (layout === 'compact' ? '36px' : '40px') : '0px';
  root.style.setProperty('--layout-sidebar-width', sidebarWidth);
  root.style.setProperty('--layout-sidebar-collapsed-width', collapsedWidth);
  root.style.setProperty('--layout-header-height', headerHeight);
  root.style.setProperty('--layout-tabs-height', tabsHeight);
  root.style.setProperty('--layout-content-max-width', state.contentWidth === 'fluid' ? 'none' : `${state.contentWidth}px`);
  root.style.setProperty('--layout-page-padding', layout === 'compact' ? '18px' : layout === 'wide' ? '30px' : '24px');

  root.style.setProperty('--el-border-radius-base', preset.baseRadius);
  root.style.setProperty('--el-border-radius-small', preset.key === 'wordpress2026' ? '3px' : '12px');
  root.style.setProperty('--el-text-color-primary', text1);
  root.style.setProperty('--el-text-color-regular', text2);
  root.style.setProperty('--el-text-color-secondary', text3);
  root.style.setProperty('--el-border-color', line);
  root.style.setProperty('--el-border-color-light', line);
  root.style.setProperty('--el-border-color-lighter', line);
  root.style.setProperty('--el-fill-color-light', isDark ? '#10203a' : preset.surfaceSoft);
  root.style.setProperty('--el-fill-color-lighter', isDark ? '#0b1a2e' : preset.pageBgSoft);
  root.style.setProperty('--el-bg-color', isDark ? '#0f1d33' : preset.surface);

  root.style.setProperty('--el-color-primary', primary);
  root.style.setProperty('--el-color-primary-dark-2', isDark ? mix(primary, '#ffffff', 0.10) : mix(primary, '#000000', 0.18));
  root.style.setProperty('--el-color-primary-light-3', isDark ? mix(primary, '#ffffff', 0.16) : mix(primary, '#ffffff', 0.3));
  root.style.setProperty('--el-color-primary-light-5', isDark ? `rgba(${rgbText}, .46)` : mix(primary, '#ffffff', 0.5));
  root.style.setProperty('--el-color-primary-light-7', isDark ? `rgba(${rgbText}, .32)` : mix(primary, '#ffffff', 0.7));
  root.style.setProperty('--el-color-primary-light-8', isDark ? `rgba(${rgbText}, .24)` : mix(primary, '#ffffff', 0.8));
  root.style.setProperty('--el-color-primary-light-9', isDark ? `rgba(${rgbText}, .16)` : mix(primary, '#ffffff', 0.9));

  window.dispatchEvent(new Event('appearance-updated'));
}

export function initAppearance() {
  const savedMode = localStorage.getItem(THEME_MODE_KEY) as ThemeMode | null;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  state.mode = savedMode === 'dark' || savedMode === 'light' ? savedMode : (prefersDark ? 'dark' : 'light');
  state.uiTheme = normalizeUiTheme(localStorage.getItem(UI_THEME_KEY) || 'ios27');
  const savedPrimary = localStorage.getItem(PRIMARY_COLOR_KEY);
  state.primaryColor = normalizeHex(savedPrimary || getPreset(state.uiTheme).primary);
  state.layoutMode = normalizeLayoutMode(localStorage.getItem(LAYOUT_MODE_KEY) || 'classic');
  state.menuBehavior = normalizeMenuBehavior(localStorage.getItem(MENU_BEHAVIOR_KEY) || 'auto');
  state.contentWidth = normalizeContentWidth(localStorage.getItem(CONTENT_WIDTH_KEY) || 'fluid');
  const savedTabs = localStorage.getItem(SHOW_ROUTE_TABS_KEY);
  state.showRouteTabs = savedTabs === null ? true : savedTabs === '1';
  applyAppearance();
}

export function useAppearance() {
  const isDark = computed(() => state.mode === 'dark');
  const themeMode = computed(() => state.mode);
  const uiTheme = computed(() => state.uiTheme);
  const activeUiTheme = computed(() => getPreset(state.uiTheme));
  const layoutMode = computed(() => state.layoutMode);
  const menuBehavior = computed(() => state.menuBehavior);
  const contentWidth = computed(() => state.contentWidth);
  const showRouteTabs = computed(() => state.showRouteTabs);
  const primaryColor = computed({
    get: () => state.primaryColor,
    set: (value: string) => setPrimaryColor(value),
  });
  return {
    palette,
    uiThemePresets,
    state,
    isDark,
    themeMode,
    uiTheme,
    activeUiTheme,
    primaryColor,
    layoutMode,
    menuBehavior,
    contentWidth,
    showRouteTabs,
    setThemeMode,
    toggleThemeMode,
    setPrimaryColor,
    setUiTheme,
    setLayoutConfig,
    applyThemeConfig,
    applyAppearance,
  };
}

export function setThemeMode(mode: ThemeMode) {
  state.mode = mode;
  applyAppearance();
  persist();
}

export function toggleThemeMode() {
  setThemeMode(state.mode === 'dark' ? 'light' : 'dark');
}

export function setPrimaryColor(color: string) {
  state.primaryColor = normalizeHex(color);
  applyAppearance();
  persist();
}

export function setUiTheme(key: UiThemeKey, usePresetColor = true) {
  state.uiTheme = normalizeUiTheme(key);
  if (usePresetColor) state.primaryColor = getPreset(state.uiTheme).primary;
  applyAppearance();
  persist();
}

export function setLayoutConfig(config: { layout_mode?: string; menu_behavior?: string; content_width?: string; show_route_tabs?: boolean | string | number }, persistConfig = true) {
  state.layoutMode = normalizeLayoutMode(config.layout_mode || state.layoutMode);
  state.menuBehavior = normalizeMenuBehavior(config.menu_behavior || state.menuBehavior);
  state.contentWidth = normalizeContentWidth(config.content_width || state.contentWidth);
  if (typeof config.show_route_tabs !== 'undefined') state.showRouteTabs = config.show_route_tabs === true || config.show_route_tabs === 'true' || config.show_route_tabs === '1' || config.show_route_tabs === 1;
  applyAppearance();
  if (persistConfig) persist();
}

export function applyThemeConfig(config: { ui_theme?: string; theme_mode?: string; primary_color?: string; layout_mode?: string; menu_behavior?: string; content_width?: string; show_route_tabs?: boolean | string | number }, persistConfig = true) {
  state.uiTheme = normalizeUiTheme(config.ui_theme || state.uiTheme);
  state.mode = config.theme_mode === 'dark' ? 'dark' : 'light';
  state.primaryColor = normalizeHex(config.primary_color || getPreset(state.uiTheme).primary);
  state.layoutMode = normalizeLayoutMode(config.layout_mode || state.layoutMode);
  state.menuBehavior = normalizeMenuBehavior(config.menu_behavior || state.menuBehavior);
  state.contentWidth = normalizeContentWidth(config.content_width || state.contentWidth);
  if (typeof config.show_route_tabs !== 'undefined') state.showRouteTabs = config.show_route_tabs === true || config.show_route_tabs === 'true' || config.show_route_tabs === '1' || config.show_route_tabs === 1;
  applyAppearance();
  if (persistConfig) persist();
}
