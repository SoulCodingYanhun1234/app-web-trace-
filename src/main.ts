import { createApp } from 'vue';
import AppSelect from './components/AppSelect';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import './styles/global.css';
import './styles/ios27.css';
import './styles/admin-layout.css';
import './styles/responsive-tables.css';
import { installAdminAntiCrawler } from '@/utils/antiCrawler';
import { createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import App from './App.vue';
import router from './router';
import { settingsApi } from './api/resources';
import { installProductionDebugGuard } from './utils/security';
import { installClosableMessage } from './utils/feedback';
import { initAppearance } from './utils/theme';
import { initI18n } from './i18n';


function printConsoleEasterEgg() {
  const banner = String.raw`
   ____ ___  _   _ ____   ___  _     _____
  / ___/ _ \| \ | / ___| / _ \| |   | ____|
 | |  | | | |  \| \___ \| | | | |   |  _|
 | |__| |_| | |\  |___) | |_| | |___| |___
  \____\___/|_| \_|____/ \___/|_____|_____|
                  防伪控制台
`;
  console.log(`%c${banner}`, 'color:#0a84ff;font-weight:900;line-height:1.12;font-family:Consolas,Monaco,monospace;');
  console.log('%c🛡️ Soybean Trace Admin%c  已进入防伪控制台', 'background:#0a84ff;color:#fff;border-radius:6px;padding:3px 8px;font-weight:800;', 'color:#60a5fa;font-weight:700;');
  console.info('彩蛋 1：输入 traceEgg() 会收到一条巡检口令。');
  console.info('彩蛋 2：输入 traceConsole.help() 查看控制台小工具。');
  (window as any).traceEgg = () => console.log('🥚 今日巡检口令：真码可溯，假码无门。');
  (window as any).traceConsole = {
    help: () => console.table([
      { command: 'traceEgg()', desc: '显示一条防伪巡检口令' },
      { command: 'traceConsole.ping()', desc: '测试控制台是否在线' },
      { command: 'traceConsole.version', desc: '查看前端版本标识' },
    ]),
    ping: () => console.log('pong ✅ 防伪控制台在线'),
    version: 'trace-admin-console-20260705',
  };
}

// 全局错误捕获
window.addEventListener('error', (event) => {
  console.error('全局错误:', event.error);
  // 防止错误导致页面卡死
  event.preventDefault();
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('未捕获的Promise拒绝:', event.reason);
  event.preventDefault();
});

try {
  printConsoleEasterEgg();
  installProductionDebugGuard();
  installClosableMessage();
  initAppearance();
  initI18n();

  // Load branding and apply favicon + title
  settingsApi.branding().then((b) => {
    const title = b?.system_name || b?.site_name || b?.admin_title;
    if (title) {
      document.title = title;
    }
    if (b?.favicon) {
      try {
        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
        if (link) {
          link.href = b.favicon;
        } else {
          const newLink = document.createElement('link');
          newLink.rel = 'icon';
          newLink.href = b.favicon;
          document.head.appendChild(newLink);
        }
      } catch (e) {
        console.warn('更新favicon失败:', e);
      }
    }
  }).catch(() => { /* silent fail */ });

  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  const auth = useAuthStore(pinia);
  auth.hydrate();
  auth.startSessionMonitor();
  window.addEventListener('auth:expired', () => {
    const currentPath = router.currentRoute.value.path;
    if (currentPath !== '/login' && !currentPath.startsWith('/verify') && !currentPath.startsWith('/error')) {
      router.replace({ path: '/login', query: { redirect: currentPath } }).catch(() => undefined);
    }
  });
  installAdminAntiCrawler();

app.use(ElementPlus, { zIndex: 4000 });
  app.component('ElSelect', AppSelect);
  
  // Vue错误处理
  app.config.errorHandler = (err, vm, info) => {
    console.error('Vue错误:', err, info);
  };
  
  app.mount('#app');
} catch (error) {
  console.error('应用初始化失败:', error);
  // 尝试显示一个简单的错误提示
  const appDiv = document.getElementById('app');
  if (appDiv) {
    appDiv.innerHTML = '<div style="padding: 20px; text-align: center;"><h2>应用加载失败</h2><p>请刷新页面重试</p></div>';
  }
}
