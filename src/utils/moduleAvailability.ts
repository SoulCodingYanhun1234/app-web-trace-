import type { Component } from 'vue';
import { menuRoutes } from '@/router';

/**
 * 模块可用性检查工具
 * 用于检查某个路由路径对应的页面组件是否真正可加载
 */

const moduleLoadCache = new Map<string, Promise<boolean>>();
const moduleLoadResults = new Map<string, boolean>();

/**
 * 检查路由对应的页面组件是否可加载
 * @param path 路由路径
 */
export async function isPageAvailable(path: string): Promise<boolean> {
  if (moduleLoadResults.has(path)) {
    return moduleLoadResults.get(path)!;
  }

  if (moduleLoadCache.has(path)) {
    return moduleLoadCache.get(path)!;
  }

  const route = menuRoutes.find(r => r.path === path);
  if (!route) {
    moduleLoadResults.set(path, false);
    return false;
  }

  const loadPromise = (async (): Promise<boolean> => {
    try {
      if (typeof route.component === 'function') {
        const component = await route.component();
        moduleLoadResults.set(path, true);
        return true;
      }
      moduleLoadResults.set(path, true);
      return true;
    } catch (error) {
      console.warn(`页面 ${path} 加载失败:`, error);
      moduleLoadResults.set(path, false);
      return false;
    }
  })();

  moduleLoadCache.set(path, loadPromise);
  return loadPromise;
}

/**
 * 同步检查路由是否在配置中存在（不实际加载）
 * @param path 路由路径
 */
export function isRouteConfigured(path: string): boolean {
  return menuRoutes.some(r => r.path === path);
}

/**
 * 获取所有可用的路由
 */
export function getAvailableRoutes(): typeof menuRoutes {
  return menuRoutes;
}

/**
 * 根据路由路径过滤菜单项
 * 只返回配置存在且没有设置 hidden 的路由
 */
export function filterAvailableMenus(routes: typeof menuRoutes): typeof menuRoutes {
  return routes.filter(route => {
    const meta = route.meta as any;
    if (meta?.hidden) return false;
    return true;
  });
}

/**
 * 清除模块加载缓存
 */
export function clearModuleCache(): void {
  moduleLoadCache.clear();
  moduleLoadResults.clear();
}

