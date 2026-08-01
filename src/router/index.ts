import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { routeDocumentTitle } from '@/i18n';
import { AI_FEATURE_ENABLED } from '@/config/features';
import { isCurrentPublicVerifyHostAllowed } from '@/config/publicVerification';
import {
  extractLoginEntryFromQuery,
  hasValidLoginGate,
  isLoginEntryRequiredForCurrentHost,
  openLoginGate,
  safeRedirectPath,
} from '@/utils/security';

const RootLayout = () => import('@/layout/RootLayout.vue');

export const menuRoutes = [
  { path: '/dashboard', name: 'Dashboard', meta: { title: '仪表盘', titleKey: 'menu.dashboard', icon: 'dashboard', permission: 'dashboard:view' }, component: () => import('@/pages/dashboard/DashboardPage.vue') },
  ...(AI_FEATURE_ENABLED ? [{ path: '/ai-risk', name: 'AiRisk', meta: { title: 'AI 溯源研判', icon: 'spark', permission: 'trace:view', module: 'trace' }, component: () => import('@/pages/AiRiskPage.vue') }] : []),
  { path: '/trace-flow', name: 'TraceFlow', meta: { title: '溯源流程向导', icon: 'process', permission: 'trace:view', module: 'trace' }, component: () => import('@/pages/traceFlow/TraceFlowPage.vue') },
  { path: '/companies', name: 'Companies', meta: { title: '公司列表', icon: 'brand', permission: 'manufacturer:view', module: 'manufacturer' }, component: () => import('@/pages/companies/CompanyPage.vue') },
  { path: '/agents', name: 'Agents', meta: { title: '代理商列表', icon: 'brand', permission: 'manufacturer:view', module: 'manufacturer' }, component: () => import('@/pages/agents/AgentPage.vue') },
  { path: '/products', name: 'Products', meta: { title: '产品列表', titleKey: 'menu.products', icon: 'product', permission: 'product:view' }, component: () => import('@/pages/products/ProductPage.vue') },
  { path: '/manufacturers', name: 'Manufacturers', redirect: '/companies', meta: { title: '企业主体管理', icon: 'brand', permission: 'manufacturer:view', module: 'manufacturer', hidden: true } },
  { path: '/product-regions', name: 'ProductRegions', meta: { title: '产品地区管理', icon: 'region', permission: 'product-region:view', module: 'product-region', hidden: true }, component: () => import('@/pages/productRegions/ProductRegionPage.vue') },
  { path: '/codes', name: 'Codes', meta: { title: '防伪码列表', titleKey: 'menu.codes', icon: 'code', permission: 'code:view' }, component: () => import('@/pages/codes/CodePage.vue') },
  { path: '/query', name: 'AntiFakeQuery', meta: { title: '防伪查询', titleKey: 'menu.query', icon: 'query', permission: 'query:view', hidden: true }, component: () => import('@/pages/query/QueryPage.vue') },
  { path: '/anti-channeling', name: 'AntiChanneling', meta: { title: '防窜预警', icon: 'risk', permission: 'anti-channeling:view', module: 'anti-channeling' }, component: () => import('@/pages/AntiChannelingPage.vue') },
  { path: '/scanner', name: 'ScannerWorkbench', meta: { title: '扫码业务台', titleKey: 'menu.scanner', icon: 'keyboard', permission: 'scanner:use' }, component: () => import('@/pages/scanner/ScannerPage.vue') },
  { path: '/scanner-guide', name: 'ScannerGuide', meta: { title: '扫描枪教程', icon: 'message', permission: 'scanner:use', module: 'scanner', hidden: true }, component: () => import('@/pages/scannerGuide/ScannerGuidePage.vue') },
  { path: '/trace', name: 'Trace', meta: { title: '溯源管理', titleKey: 'menu.trace', icon: 'trace', permission: 'trace:view' }, component: () => import('@/pages/trace/TracePage.vue') },
  { path: '/box', name: 'Box', meta: { title: '装箱管理', titleKey: 'menu.box', icon: 'box', permission: 'box:view' }, component: () => import('@/pages/box/BoxPage.vue') },
  { path: '/shipments', name: 'Shipments', meta: { title: '发货管理', titleKey: 'menu.shipments', icon: 'shipment', permission: 'shipment:view' }, component: () => import('@/pages/shipments/ShipmentPage.vue') },
  { path: '/returns', name: 'Returns', meta: { title: '退货管理', titleKey: 'menu.returns', icon: 'return', permission: 'return:view' }, component: () => import('@/pages/returns/ReturnPage.vue') },
  { path: '/certificates', name: 'Certificates', meta: { title: '证书系统', titleKey: 'menu.certificates', icon: 'certificate', permission: 'certificate:view' }, component: () => import('@/pages/certificates/CertificatePage.vue') },
  { path: '/process', name: 'Process', meta: { title: '流程管理', titleKey: 'menu.process', icon: 'process', permission: 'process:view', hidden: true }, component: () => import('@/pages/process/ProcessPage.vue') },
  { path: '/system', name: 'System', meta: { title: '系统设置', titleKey: 'menu.system', icon: 'system', permission: 'admin:manage', superOnly: true, saasOnly: true }, component: () => import('@/pages/system/SystemPage.vue') },
  { path: '/settings', name: 'Settings', meta: { title: '面板设置', titleKey: 'menu.settings', icon: 'setting', permission: 'system:setting', superOnly: true, saasOnly: true }, component: () => import('@/pages/settings/SettingsPage.vue') },
  { path: '/profile', name: 'Profile', meta: { title: '个人中心', titleKey: 'menu.profile', icon: 'profile', hidden: true }, component: () => import('@/pages/profile/ProfilePage.vue') },
];


function canAccessRoute(auth: ReturnType<typeof useAuthStore>, route: any) {
  const meta = route?.meta || {};
  if (meta.hidden) return false;
  return auth.canAccess(meta);
}

function firstAccessiblePath(auth: ReturnType<typeof useAuthStore>) {
  return menuRoutes.find((route) => canAccessRoute(auth, route))?.path || '/profile';
}

const LOGIN_PATH = '/login';
const ERROR_404_PATH = '/error/404';
const LOGIN_ENTRY_QUERY_KEYS = ['entry', 'loginEntry', 'k'];

function stripLoginEntryQuery(query: Record<string, any>) {
  const nextQuery: Record<string, any> = { ...query };
  LOGIN_ENTRY_QUERY_KEYS.forEach((key) => delete nextQuery[key]);
  return nextQuery;
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/setup', name: 'Setup', meta: { title: '部署初始化', public: true }, component: () => import('@/pages/setup/SetupPage.vue') },
    { path: '/login', name: 'Login', meta: { title: '登录', titleKey: 'menu.login', guardedLogin: true }, component: () => import('@/pages/auth/LoginPage.vue') },
    { path: '/verify/:code', name: 'VerifyCode', meta: { title: '防伪码验证', titleKey: 'menu.verify', public: true, verifyHostProtected: true }, component: () => import('@/pages/public/VerifyCodePage.vue') },
    { path: '/v/:code', name: 'VerifyCodeShort', meta: { title: '防伪码验证', titleKey: 'menu.verify', public: true, verifyHostProtected: true }, component: () => import('@/pages/public/VerifyCodePage.vue') },
    { path: '/error/untrusted-verification-host', name: 'VerifyDomainBlocked', meta: { title: '非官方验码入口', public: true }, component: () => import('@/pages/public/VerifyDomainBlockedPage.vue') },
    { path: '/error/:status(400|401|403|404|405|408|413|429|500|501|502|503|504)', name: 'HttpStatus', meta: { title: '服务状态', public: true }, component: () => import('@/pages/public/HttpStatusPage.vue') },
    { path: '/', name: 'Landing', component: RootLayout, meta: { title: 'Signal Analytics' }, children: menuRoutes },
    { path: '/:pathMatch(.*)*', redirect: ERROR_404_PATH },
  ],
});

router.beforeEach((to) => {
  try {
    if (to.meta.verifyHostProtected && !isCurrentPublicVerifyHostAllowed()) {
      return { name: 'VerifyDomainBlocked', replace: true };
    }

    const auth = useAuthStore();
    auth.hydrate();

    if (to.path === LOGIN_PATH) {
      if (auth.isLogin) return firstAccessiblePath(auth);

      const entryRequired = isLoginEntryRequiredForCurrentHost();

      const loginEntry = extractLoginEntryFromQuery(to.query as Record<string, unknown>);
      if (entryRequired && loginEntry) {
        openLoginGate(loginEntry);
        return { path: LOGIN_PATH, query: stripLoginEntryQuery(to.query as Record<string, any>), replace: true };
      }

      if (entryRequired && !hasValidLoginGate()) {
        return { path: ERROR_404_PATH, replace: true };
      }

      document.title = routeDocumentTitle(to.meta);
      return true;
    }

    if (to.path === '/') {
      if (auth.isLogin) return { path: '/dashboard', replace: true };

      const entryRequired = isLoginEntryRequiredForCurrentHost();
      const loginEntry = entryRequired
        ? extractLoginEntryFromQuery(to.query as Record<string, unknown>)
        : '';
      if (loginEntry) {
        openLoginGate(loginEntry);
        return { path: LOGIN_PATH, query: stripLoginEntryQuery(to.query as Record<string, any>), replace: true };
      }
      return !entryRequired || hasValidLoginGate()
        ? { path: LOGIN_PATH, replace: true }
        : { path: ERROR_404_PATH, replace: true };
    }
    
    if (to.meta.public) {
      document.title = routeDocumentTitle(to.meta);
      return true;
    }
    
    if (!auth.isLogin) {
      const entryRequired = isLoginEntryRequiredForCurrentHost();
      const loginEntry = entryRequired
        ? extractLoginEntryFromQuery(to.query as Record<string, unknown>)
        : '';
      if (loginEntry) {
        openLoginGate(loginEntry);
        const cleanedQuery = stripLoginEntryQuery(to.query as Record<string, any>);
        const redirect = router.resolve({ path: to.path, query: cleanedQuery }).fullPath;
        return { path: LOGIN_PATH, query: { redirect }, replace: true };
      }
      if (!entryRequired || hasValidLoginGate()) {
        return { path: LOGIN_PATH, query: { redirect: to.fullPath }, replace: true };
      }
      return { path: ERROR_404_PATH, replace: true };
    }

    if (!auth.canAccess(to.meta as Record<string, any>)) {
      const fallback = firstAccessiblePath(auth);
      return to.path === fallback ? true : fallback;
    }
    
    document.title = routeDocumentTitle(to.meta);
    return true;
  } catch (error) {
    console.error('路由守卫错误:', error);
    const auth = useAuthStore();
    if (auth.isLogin) return safeRedirectPath('/dashboard');
    return !isLoginEntryRequiredForCurrentHost() || hasValidLoginGate() ? LOGIN_PATH : ERROR_404_PATH;
  }
});

export default router;
