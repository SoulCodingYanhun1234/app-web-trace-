import { ref, computed, onMounted } from 'vue';
import { menuRoutes } from '@/router';
import { isPageAvailable, isRouteConfigured, filterAvailableMenus } from '@/utils/moduleAvailability';

/**
 * 模块可用性管理 Composable
 */
export function useModuleAvailability() {
  const loadingModules = ref<Set<string>>(new Set());
  const availableModules = ref<Set<string>>(new Set());
  const unavailableModules = ref<Set<string>>(new Set());

  const isModuleAvailable = (path: string): boolean => {
    if (unavailableModules.value.has(path)) {
      return false;
    }
    if (availableModules.value.has(path)) {
      return true;
    }
    return isRouteConfigured(path);
  };

  const availableMenus = computed(() => {
    return filterAvailableMenus(menuRoutes).filter(route => {
      return isModuleAvailable(route.path);
    });
  });

  const checkModule = async (path: string): Promise<boolean> => {
    if (availableModules.value.has(path)) return true;
    if (unavailableModules.value.has(path)) return false;
    if (loadingModules.value.has(path)) {
      return false;
    }

    loadingModules.value.add(path);
    try {
      const available = await isPageAvailable(path);
      if (available) {
        availableModules.value.add(path);
      } else {
        unavailableModules.value.add(path);
      }
      return available;
    } finally {
      loadingModules.value.delete(path);
    }
  };

  const checkAllModules = async (): Promise<void> => {
    const promises = menuRoutes.map(route => checkModule(route.path));
    await Promise.allSettled(promises);
  };

  const invalidateModule = (path: string): void => {
    availableModules.value.delete(path);
    unavailableModules.value.delete(path);
    loadingModules.value.delete(path);
  };

  const invalidateAll = (): void => {
    availableModules.value.clear();
    unavailableModules.value.clear();
    loadingModules.value.clear();
  };

  return {
    isModuleAvailable,
    availableMenus,
    checkModule,
    checkAllModules,
    invalidateModule,
    invalidateAll,
    loadingModules,
    availableModules,
    unavailableModules,
  };
}

