<template>
  <div
    class="soy-admin"
    :class="{
      'is-collapsed': sidebarCollapsed,
      'is-mobile': isMobile,
      'mobile-menu-open': mobileMenuOpen,
      'hide-tabs': !showRouteTabs,
    }"
  >
    <a class="skip-link" href="#main-content">跳至主要内容</a>
    <div
      v-if="isMobile && mobileMenuOpen"
      class="mobile-menu-mask"
      aria-hidden="true"
      @click="closeMobileMenu()"
    />

    <aside
      id="admin-mobile-menu"
      class="soy-sider"
      aria-label="后台主导航"
      :aria-hidden="isMobile && !mobileMenuOpen ? 'true' : undefined"
      :inert="isMobile && !mobileMenuOpen"
    >
      <div class="brand-panel" :class="{ collapsed: sidebarCollapsed }">
        <div class="brand-logo">
          <img v-if="settings.home_cover" :src="settings.home_cover" :alt="brandTitle" />
          <span v-else>溯</span>
        </div>
        <div v-if="!sidebarCollapsed" class="brand-copy">
          <strong :title="brandTitle">{{ brandTitle }}</strong>
          <span :title="brandSubtitle">{{ brandSubtitle }}</span>
        </div>
        <button
          v-if="isMobile"
          ref="menuCloseButtonRef"
          class="mobile-sider-close"
          type="button"
          aria-label="关闭菜单"
          @click="closeMobileMenu()"
        >
          <AppIcon name="close" :size="18" />
        </button>
      </div>

      <div class="sider-scroll">
        <div v-if="!sidebarCollapsed" class="nav-section-title">{{ t('layout.navTitle') }}</div>
        <nav class="nav-list" aria-label="后台菜单">
          <template v-for="group in menuGroups" :key="group.key">
            <button
              v-if="!group.children?.length && group.route"
              type="button"
              class="nav-item"
              :class="{ active: isActive(group.route.path), collapsed: sidebarCollapsed }"
              :title="getRouteTitle(group.route)"
              :aria-current="isActive(group.route.path) ? 'page' : undefined"
              @click="handleMenuClick(group.route.path)"
            >
              <span class="nav-icon">
                <AppIcon :name="String(group.route.meta?.icon || 'dot')" :size="19" />
              </span>
              <span v-if="!sidebarCollapsed" class="nav-title">{{ getRouteTitle(group.route) }}</span>
            </button>

            <div
              v-else
              class="nav-group"
              :class="{
                active: groupActive(group),
                collapsed: sidebarCollapsed,
                folded: !isMenuGroupOpen(group),
              }"
            >
              <button
                type="button"
                class="nav-group-title nav-group-toggle"
                :title="group.title"
                :aria-expanded="isMenuGroupOpen(group)"
                @click="toggleMenuGroup(group)"
              >
                <span class="nav-icon"><AppIcon :name="group.icon || 'dot'" :size="18" /></span>
                <span v-if="!sidebarCollapsed" class="nav-title">{{ group.title }}</span>
                <span
                  v-if="!sidebarCollapsed"
                  class="nav-expand"
                  :class="{ open: isMenuGroupOpen(group) }"
                >
                  <AppIcon name="chevronRight" :size="14" />
                </span>
              </button>

              <template v-if="isMenuGroupOpen(group)">
                <template v-for="child in group.children" :key="child.key || child.path">
                  <button
                    v-if="child.route || child.path"
                    type="button"
                    class="nav-item nav-child"
                    :class="{ active: isActive(child.path || child.route?.path), collapsed: sidebarCollapsed }"
                    :title="getMenuNodeTitle(child)"
                    :aria-current="isActive(child.path || child.route?.path) ? 'page' : undefined"
                    @click="handleMenuClick(child.path || child.route?.path)"
                  >
                    <span class="nav-icon"><AppIcon :name="menuNodeIcon(child)" :size="17" /></span>
                    <span v-if="!sidebarCollapsed" class="nav-title">{{ getMenuNodeTitle(child) }}</span>
                  </button>

                  <div
                    v-else
                    class="nav-subgroup"
                    :class="{
                      active: groupActive(child),
                      collapsed: sidebarCollapsed,
                      folded: !isMenuGroupOpen(child),
                    }"
                  >
                    <button
                      type="button"
                      class="nav-subgroup-title nav-group-toggle"
                      :title="child.title"
                      :aria-expanded="isMenuGroupOpen(child)"
                      @click="toggleMenuGroup(child)"
                    >
                      <span class="nav-icon"><AppIcon :name="child.icon || 'dot'" :size="15" /></span>
                      <span v-if="!sidebarCollapsed" class="nav-title">{{ child.title }}</span>
                      <span
                        v-if="!sidebarCollapsed"
                        class="nav-expand"
                        :class="{ open: isMenuGroupOpen(child) }"
                      >
                        <AppIcon name="chevronRight" :size="13" />
                      </span>
                    </button>

                    <template v-if="isMenuGroupOpen(child)">
                      <button
                        v-for="grand in child.children"
                        :key="grand.key || grand.path"
                        type="button"
                        class="nav-item nav-child nav-grandchild"
                        :class="{ active: isActive(grand.path || grand.route?.path), collapsed: sidebarCollapsed }"
                        :title="getMenuNodeTitle(grand)"
                        :aria-current="isActive(grand.path || grand.route?.path) ? 'page' : undefined"
                        @click="handleMenuClick(grand.path || grand.route?.path)"
                      >
                        <span class="nav-icon"><AppIcon :name="menuNodeIcon(grand)" :size="15" /></span>
                        <span v-if="!sidebarCollapsed" class="nav-title">{{ getMenuNodeTitle(grand) }}</span>
                      </button>
                    </template>
                  </div>
                </template>
              </template>
            </div>
          </template>
        </nav>
      </div>

      <div class="sider-footer" :class="{ collapsed: sidebarCollapsed }">
        <div class="footer-dot" />
        <div v-if="!sidebarCollapsed" class="footer-copy">
          <strong>{{ t('layout.footerTheme') }}</strong>
          <span>{{ t('layout.footerDesc') }}</span>
        </div>
      </div>
    </aside>

    <section class="soy-main" :aria-hidden="isMobile && mobileMenuOpen ? 'true' : undefined" :inert="isMobile && mobileMenuOpen">
      <header class="soy-header">
        <div class="header-left">
          <button
            ref="menuButtonRef"
            class="header-icon-btn mobile-menu-btn"
            type="button"
            aria-label="打开菜单"
            aria-controls="admin-mobile-menu"
            :aria-expanded="mobileMenuOpen"
            @click="toggleMobileMenu"
          >
            <AppIcon name="menu" :size="19" />
          </button>
          <button
            v-if="!isMobile"
            class="header-icon-btn desktop-collapse-btn"
            type="button"
            :aria-label="sidebarCollapsed ? t('layout.expand') : t('layout.collapse')"
            @click="toggleMenu"
          >
            <AppIcon :name="sidebarCollapsed ? 'forward' : 'back'" :size="18" />
          </button>
          <div class="breadcrumb-stack">
            <div class="header-kicker">{{ t('common.managementConsole') }}</div>
            <el-breadcrumb>
              <el-breadcrumb-item>{{ t('common.backend') }}</el-breadcrumb-item>
              <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
            </el-breadcrumb>
          </div>
        </div>

        <div class="header-actions">
          <el-badge
            v-if="canOpenAntiChanneling"
            :value="unreadChannelingAlerts"
            :hidden="!unreadChannelingAlerts"
            type="danger"
            class="channeling-alert-badge"
          >
            <button
              class="header-action-icon risk"
              type="button"
              title="防窜预警"
              aria-label="防窜预警"
              @click="handleMenuClick('/anti-channeling')"
            >
              <AppIcon name="risk" />
            </button>
          </el-badge>
          <button
            v-if="canOpenScanner"
            class="header-action-icon"
            type="button"
            :title="t('layout.scanner')"
            :aria-label="t('layout.scanner')"
            @click="handleMenuClick('/scanner')"
          >
            <AppIcon name="keyboard" />
          </button>
          <button
            class="header-action-icon ghost"
            type="button"
            :title="t('layout.themeToggle')"
            :aria-label="t('layout.themeToggle')"
            @click="toggleThemeMode"
          >
            <AppIcon :name="isDark ? 'sun' : 'moon'" />
          </button>
          <el-dropdown trigger="click" @command="handleUserCommand">
            <button class="user-box" type="button" :aria-label="t('layout.profile')">
              <el-avatar :size="32" class="user-avatar">
                <img
                  v-if="auth.admin?.avatar"
                  :src="auth.admin.avatar"
                  :alt="auth.admin.real_name || auth.admin.username"
                />
                <span v-else>
                  {{ auth.admin?.real_name?.slice(0, 1) || auth.admin?.username?.slice(0, 1) || '管' }}
                </span>
              </el-avatar>
              <div class="user-text">
                <strong>{{ auth.admin?.real_name || auth.admin?.username || t('layout.admin') }}</strong>
                <span>{{ auth.isSuperAdmin ? t('layout.superAdmin') : t('layout.normalAdmin') }}</span>
              </div>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <AppIcon name="profile" />
                  {{ t('layout.profile') }}
                </el-dropdown-item>
                <el-dropdown-item command="logout">
                  <AppIcon name="logout" />
                  {{ t('layout.logout') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <div v-if="showRouteTabs" class="route-tabs" aria-label="快捷页签">
        <button
          v-for="tab in quickTabs"
          :key="tab.path"
          type="button"
          class="route-tab"
          :class="{ active: isActive(tab.path) }"
          :aria-current="isActive(tab.path) ? 'page' : undefined"
          @click="handleMenuClick(tab.path)"
        >
          <AppIcon :name="String(tab.meta?.icon || 'dot')" :size="15" />
          <span>{{ getRouteTitle(tab) }}</span>
        </button>
      </div>

      <main id="main-content" class="soy-content" tabindex="-1">
        <router-view />
      </main>
    </section>

    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="custom-context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <button v-if="contextMenu.selectedText" type="button" @click="copySelection">
          <AppIcon name="copy" />复制选中文本
        </button>
        <button v-if="contextMenu.cellText" type="button" @click="copyCellText">
          <AppIcon name="copy" />复制单元格内容
        </button>
        <button type="button" @click="refreshCurrent"><AppIcon name="refresh" />刷新当前页面</button>
        <button v-if="canOpenScanner" type="button" @click="goScanner">
          <AppIcon name="keyboard" />打开扫码业务台
        </button>
        <button type="button" @click="scrollToTop"><AppIcon name="back" />回到页面顶部</button>
        <button type="button" @click="toggleThemeFromMenu">
          <AppIcon :name="isDark ? 'sun' : 'moon'" />
          {{ isDark ? '切换浅色主题' : '切换深色主题' }}
        </button>
        <button type="button" @click="copyCurrentLink"><AppIcon name="api" />复制当前后台路径</button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useEventListener } from '@vueuse/core';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage as Message, ElNotification as Notification } from 'element-plus';
import AppIcon from '@/components/AppIcon.vue';
import { useAuthStore } from '@/stores/auth';
import { antiChannelingApi, settingsApi } from '@/api/resources';
import { routeTitle, useI18n } from '@/i18n';
import { applyThemeConfig, useAppearance } from '@/utils/theme';
import { useModuleAvailability } from '@/composables/useModuleAvailability';
import {
  channelingAlertLocationKey,
  selectNewChannelingLocationAlerts,
  uniqueChannelingAlertsByLocation,
} from '@/utils/antiChannelingAlerts';

type MenuLayoutNode =
  | string
  | {
      title: string;
      icon: string;
      path?: string;
      children?: readonly MenuLayoutNode[];
    };

interface MenuNode {
  key: string;
  title?: string;
  icon?: string;
  path?: string;
  route?: any;
  children?: MenuNode[];
  meta?: Record<string, any>;
}

const MENU_GROUP_STORAGE_KEY = 'trace_admin_folded_menu_groups';
const QUICK_TAB_PATHS = new Set(['/dashboard', '/trace-flow', '/products', '/codes', '/trace', '/box', '/shipments']);
const MENU_LAYOUT: readonly MenuLayoutNode[] = [
  { title: '仪表盘', path: '/dashboard', icon: 'dashboard' },
  {
    title: '溯源业务',
    icon: 'trace',
    children: ['/trace-flow', '/ai-risk', '/products', '/codes', '/trace', '/box', '/shipments'],
  },
  { title: '主体与渠道', icon: 'brand', children: ['/companies', '/agents'] },
  { title: '扫码与防窜', icon: 'keyboard', children: ['/scanner', '/anti-channeling'] },
  { title: '售后与证书', icon: 'certificate', children: ['/returns', '/certificates'] },
  { title: '系统管理', icon: 'system', children: ['/system', '/settings'] },
];

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { t } = useI18n();
const { isDark, toggleThemeMode, state: appearanceState } = useAppearance();
const { isModuleAvailable, availableMenus, checkAllModules } = useModuleAvailability();

const collapsed = ref(false);
const isMobile = ref(false);
const mobileMenuOpen = ref(false);
const menuButtonRef = ref<HTMLButtonElement | null>(null);
const menuCloseButtonRef = ref<HTMLButtonElement | null>(null);
const foldedMenuGroups = ref<string[]>([]);
const unreadChannelingAlerts = ref(0);
const sidebarCollapsed = computed(() => collapsed.value && !isMobile.value);
const showRouteTabs = computed(() => appearanceState.showRouteTabs);

const settings = reactive({
  home_cover: '',
  system_name: '',
  admin_title: '',
  site_name: '',
});

const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  selectedText: '',
  cellText: '',
});

const brandTitle = computed(() => settings.system_name || settings.admin_title || t('common.appName'));
const brandSubtitle = computed(() => {
  if (settings.site_name && settings.site_name !== brandTitle.value) return settings.site_name;
  if (settings.admin_title && settings.admin_title !== brandTitle.value) return settings.admin_title;
  return t('common.adminSubTitle');
});

const menus = computed(() =>
  availableMenus.value.filter((item) => auth.canAccess(item.meta as Record<string, any>)),
);

function resolveMenuNode(node: MenuLayoutNode, routeMap: Map<string, any>): MenuNode | null {
  if (typeof node === 'string') {
    const routeNode = routeMap.get(node);
    return routeNode
      ? { ...routeNode, key: routeNode.path, path: routeNode.path, route: routeNode, children: [] }
      : null;
  }

  if (node.path) {
    const routeNode = routeMap.get(node.path);
    return routeNode
      ? { ...node, ...routeNode, key: node.path, path: node.path, route: routeNode, children: [] }
      : null;
  }

  const children = (node.children || [])
    .map((child) => resolveMenuNode(child, routeMap))
    .filter((child): child is MenuNode => Boolean(child));

  return children.length ? { ...node, key: node.title, children } : null;
}

const menuGroups = computed<MenuNode[]>(() => {
  const routeMap = new Map(menus.value.map((item: any) => [item.path, item]));
  return MENU_LAYOUT
    .map((group) => resolveMenuNode(group, routeMap))
    .filter((group): group is MenuNode => Boolean(group));
});

const canOpenScanner = computed(
  () => auth.canAccess({ permission: 'scanner:use', module: 'scanner' }) && isModuleAvailable('/scanner'),
);
const canOpenAntiChanneling = computed(
  () =>
    auth.canAccess({ permission: 'anti-channeling:view', module: 'anti-channeling' }) &&
    isModuleAvailable('/anti-channeling'),
);
const currentTitle = computed(() => routeTitle({ meta: route.meta }, t('menu.workbench')));
const quickTabs = computed(() => menus.value.filter((item) => QUICK_TAB_PATHS.has(item.path)));

let channelingAlertTimer: number | undefined;
let profileRefreshInFlight: Promise<void> | null = null;
let lastProfileRefreshAt = 0;
const shownChannelingLocations = new Map<string, string>();

function refreshAccountPermissions(force = false) {
  const now = Date.now();
  if (profileRefreshInFlight) return profileRefreshInFlight;
  if (!force && now - lastProfileRefreshAt < 30_000) return Promise.resolve();

  profileRefreshInFlight = auth.loadProfile(true)
    .then(() => { lastProfileRefreshAt = Date.now(); })
    .catch(() => undefined)
    .finally(() => { profileRefreshInFlight = null; });
  return profileRefreshInFlight;
}

function getRouteTitle(item: any) {
  return routeTitle(item, String(item.meta?.title || item.title || ''));
}

function getMenuNodeTitle(item: MenuNode) {
  return item.route ? getRouteTitle(item.route) : getRouteTitle(item);
}

function menuNodeIcon(item: MenuNode) {
  return String(item.icon || item.route?.meta?.icon || item.meta?.icon || 'dot');
}

function isActive(path?: string) {
  if (!path) return false;
  return route.path === path || (path !== '/dashboard' && route.path.startsWith(`${path}/`));
}

function groupActive(group?: MenuNode): boolean {
  if (!group) return false;
  if (group.route || group.path) return isActive(group.path || group.route?.path);
  return (group.children || []).some((item) => groupActive(item));
}

function menuGroupKey(group: MenuNode) {
  return String(group.key || group.title || group.path || 'menu-group');
}

function firstMenuPath(group: MenuNode): string | undefined {
  if (group.path || group.route?.path) return group.path || group.route.path;
  for (const child of group.children || []) {
    const path = firstMenuPath(child);
    if (path) return path;
  }
  return undefined;
}

function isMenuGroupOpen(group: MenuNode) {
  return !sidebarCollapsed.value && !foldedMenuGroups.value.includes(menuGroupKey(group));
}

function saveMenuGroupState() {
  try {
    localStorage.setItem(MENU_GROUP_STORAGE_KEY, JSON.stringify(foldedMenuGroups.value));
  } catch {
    // Storage can be disabled by browser privacy settings.
  }
}

function loadMenuGroupState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MENU_GROUP_STORAGE_KEY) || '[]');
    foldedMenuGroups.value = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    foldedMenuGroups.value = [];
  }
}

function toggleMenuGroup(group: MenuNode) {
  if (sidebarCollapsed.value) {
    handleMenuClick(firstMenuPath(group));
    return;
  }

  const key = menuGroupKey(group);
  foldedMenuGroups.value = foldedMenuGroups.value.includes(key)
    ? foldedMenuGroups.value.filter((item) => item !== key)
    : [...foldedMenuGroups.value, key];
  saveMenuGroupState();
}

function unfoldActiveMenuGroups() {
  const activeKeys = new Set<string>();
  const visit = (group: MenuNode) => {
    if (!group.children?.length || !groupActive(group)) return;
    activeKeys.add(menuGroupKey(group));
    group.children.forEach(visit);
  };
  menuGroups.value.forEach(visit);
  if (activeKeys.size) foldedMenuGroups.value = foldedMenuGroups.value.filter((key) => !activeKeys.has(key));
}

function openMobileMenu() {
  if (!isMobile.value || mobileMenuOpen.value) return;
  unfoldActiveMenuGroups();
  mobileMenuOpen.value = true;
  void nextTick(() => menuCloseButtonRef.value?.focus());
}

function closeMobileMenu(restoreFocus = true) {
  if (!mobileMenuOpen.value) return;
  mobileMenuOpen.value = false;
  if (restoreFocus) void nextTick(() => menuButtonRef.value?.focus());
}

function toggleMobileMenu() {
  if (mobileMenuOpen.value) closeMobileMenu();
  else openMobileMenu();
}

function handleMenuClick(path?: string) {
  if (!path) return;
  if (route.path !== path) void router.push(path);
  closeMobileMenu(false);
}

function updateViewportState() {
  isMobile.value = window.innerWidth <= 760;
  if (!isMobile.value) closeMobileMenu(false);
}

function toggleMenu() {
  if (isMobile.value) {
    openMobileMenu();
    return;
  }
  collapsed.value = !collapsed.value;
}

function applyMenuBehavior() {
  if (appearanceState.menuBehavior === 'expanded') collapsed.value = false;
  if (appearanceState.menuBehavior === 'collapsed') collapsed.value = true;
}

async function doLogout() {
  await auth.logout();
  Message.success(t('layout.logout'));
  await router.replace('/login');
}

function handleUserCommand(command: string) {
  if (command === 'profile') void router.push('/profile');
  if (command === 'logout') void doLogout();
}

async function loadUiThemeConfig() {
  const [themeConfig, layoutConfig] = await Promise.allSettled([
    settingsApi.detail('ui_theme'),
    settingsApi.detail('layout_lowcode'),
  ]);
  const mergedConfig = {
    ...(themeConfig.status === 'fulfilled' && themeConfig.value ? themeConfig.value : {}),
    ...(layoutConfig.status === 'fulfilled' && layoutConfig.value ? layoutConfig.value : {}),
  };
  if (Object.keys(mergedConfig).length) {
    applyThemeConfig(mergedConfig);
    applyMenuBehavior();
  }
}

async function loadBasicSettings() {
  try {
    const response = await settingsApi.branding();
    settings.home_cover = response?.home_cover || '';
    settings.system_name = response?.system_name || '';
    settings.admin_title = response?.admin_title || '';
    settings.site_name = response?.site_name || '';
    document.title = settings.system_name || settings.site_name || settings.admin_title || document.title;
  } catch {
    // The local theme remains usable when branding is unavailable.
  }
}

async function pollAntiChannelingAlerts(showPopup = false) {
  if (!canOpenAntiChanneling.value) {
    unreadChannelingAlerts.value = 0;
    return;
  }

  try {
    const response = await antiChannelingApi.unread(3);
    const list = uniqueChannelingAlertsByLocation(
      Array.isArray(response?.list) ? response.list : [],
      3,
    );
    const popupSelection = selectNewChannelingLocationAlerts(
      list,
      shownChannelingLocations.keys(),
      3,
    );
    const activeLocationKeys = new Set(popupSelection.active_location_keys);
    unreadChannelingAlerts.value = Number(response?.total || 0);

    if (!showPopup) {
      shownChannelingLocations.clear();
      list.forEach((alert: any) =>
        shownChannelingLocations.set(
          channelingAlertLocationKey(alert),
          String(alert.alert_no || alert.id || 'active'),
        ),
      );
      return;
    }

    for (const latest of popupSelection.alerts) {
      const locationKey = channelingAlertLocationKey(latest);
      shownChannelingLocations.set(locationKey, String(latest.alert_no || latest.id || 'active'));
      const severity = Number(latest.severity || 0);
      const notify = severity >= 4 ? Notification.error : Notification.warning;
      const location =
        latest.actual_location ||
        [latest.actual_province, latest.actual_city].filter(Boolean).join(' / ');
      const groupedCount = Number(latest.location_alert_count || 1);
      notify({
        title: severity >= 4 ? '高危防窜预警' : '防窜预警',
        message: `${latest.title || '检测到新的防窜异常，请及时处理'}${location ? ` · ${location}` : ''}${groupedCount > 1 ? `（同位置合并 ${groupedCount} 条）` : ''}`,
        duration: 10000,
        dangerouslyUseHTMLString: false,
        onClick: () => handleMenuClick('/anti-channeling'),
      });
    }

    for (const key of Array.from(shownChannelingLocations.keys())) {
      if (!activeLocationKeys.has(key)) shownChannelingLocations.delete(key);
    }
  } catch {
    // Alert polling is intentionally non-blocking.
  }
}

function hideContextMenu() {
  contextMenu.visible = false;
}

function fitContextPosition(x: number, y: number) {
  const width = 220;
  const height = canOpenScanner.value ? 286 : 248;
  return {
    x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
  };
}

function handleContextMenu(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (!target?.closest('.soy-admin')) return;
  if (target.closest('input, textarea, [contenteditable="true"], .el-input, .el-textarea')) return;

  event.preventDefault();
  const position = fitContextPosition(event.clientX, event.clientY);
  const selectedText = String(window.getSelection?.()?.toString() || '').trim();
  const cellText = String(
    target.closest('.el-table__cell')?.textContent ||
      target.closest('td, th')?.textContent ||
      '',
  )
    .replace(/\s+/g, ' ')
    .trim();

  Object.assign(contextMenu, {
    ...position,
    selectedText: selectedText.slice(0, 500),
    cellText: cellText.slice(0, 500),
    visible: true,
  });
}

async function copyToClipboard(value: string, label = '内容') {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(value);
    Message.success(`${label}已复制`);
  } catch {
    Message.warning('当前浏览器不允许自动复制，请手动复制');
  } finally {
    hideContextMenu();
  }
}

function copySelection() {
  void copyToClipboard(contextMenu.selectedText, '选中文本');
}

function copyCellText() {
  void copyToClipboard(contextMenu.cellText, '单元格内容');
}

function refreshCurrent() {
  hideContextMenu();
  router.go(0);
}

function goScanner() {
  hideContextMenu();
  handleMenuClick('/scanner');
}

function scrollToTop() {
  hideContextMenu();
  document.querySelector('.soy-content')?.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleThemeFromMenu() {
  hideContextMenu();
  toggleThemeMode();
}

function copyCurrentLink() {
  void copyToClipboard(`${window.location.origin}${route.fullPath}`, '当前路径');
}

function handleSettingsUpdated() {
  void loadUiThemeConfig();
  void loadBasicSettings();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') void refreshAccountPermissions();
}

useEventListener(window, 'settings-updated', handleSettingsUpdated);
useEventListener(window, 'resize', updateViewportState);
useEventListener(document, 'visibilitychange', handleVisibilityChange);
useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && mobileMenuOpen.value) closeMobileMenu();
});
useEventListener(window, 'popstate', () => closeMobileMenu(false));
useEventListener(window, 'contextmenu', handleContextMenu);
useEventListener(window, 'click', hideContextMenu);
useEventListener(window, 'keydown', hideContextMenu);
watch(() => route.fullPath, () => closeMobileMenu(false));

onMounted(() => {
  updateViewportState();
  loadMenuGroupState();
  applyMenuBehavior();
  void loadUiThemeConfig();
  void loadBasicSettings();
  void Promise.all([refreshAccountPermissions(true), checkAllModules()])
    .then(() => pollAntiChannelingAlerts(false));
  channelingAlertTimer = window.setInterval(() => {
    void pollAntiChannelingAlerts(true);
  }, 30000);
});

onBeforeUnmount(() => {
  if (channelingAlertTimer) window.clearInterval(channelingAlertTimer);
});
</script>
