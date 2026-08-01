# 模块可用性检查功能使用文档

## 功能说明

这个功能用于自动检测系统中是否存在对应的页面实现，如果页面不存在，则自动隐藏对应的操作按钮和菜单项，避免用户点击后出现错误或无响应的情况。

## 主要组成

### 1. 工具函数 (`utils/moduleAvailability.ts`)

提供基础的模块可用性检测功能：

- `isPageAvailable(path)`: 异步检查页面是否可加载
- `isRouteConfigured(path)`: 同步检查路由是否在配置中
- `filterAvailableMenus(routes)`: 过滤掉隐藏的菜单项
- `clearModuleCache()`: 清除缓存

### 2. Composable (`composables/useModuleAvailability.ts`)

提供响应式的模块可用性管理：

- `isModuleAvailable(path)`: 检查模块是否可用
- `availableMenus`: 所有可用的菜单项
- `checkModule(path)`: 检查单个模块
- `checkAllModules()`: 检查所有模块

### 3. 在页面中按模块状态显示操作

当前项目直接使用 composable 返回的 `isModuleAvailable`，不再引入额外的按钮包装组件。

## 使用示例

### 在页面中使用 `isModuleAvailable`

```vue
<template>
  <div>
    <!-- 如果 /special-page 不存在，这个按钮不会显示 -->
    <el-button
      v-if="isModuleAvailable('/special-page')"
      type="primary"
      @click="openSpecialPage"
    >
      特殊功能
    </el-button>

    <!-- 普通按钮保持不变 -->
    <el-button type="default">普通功能</el-button>
  </div>
</template>

<script setup lang="ts">
import { useModuleAvailability } from '@/composables/useModuleAvailability';

const { isModuleAvailable } = useModuleAvailability();

function openSpecialPage() {
  // 安全地执行操作
  console.log('打开特殊页面');
}
</script>
```

### 在自定义组件中直接使用 composable

```vue
<template>
  <div>
    <el-button
      v-if="isModuleAvailable('/custom-page')"
      @click="handleCustomAction"
    >
      自定义操作
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { useModuleAvailability } from '@/composables/useModuleAvailability';

const { isModuleAvailable } = useModuleAvailability();

function handleCustomAction() {
  console.log('执行自定义操作');
}
</script>
```

### 路由配置说明

在 `router/index.ts` 中，如果需要隐藏某个菜单项，可以在路由的 meta 中设置 `hidden: true`：

```typescript
{
  path: '/hidden-page',
  name: 'HiddenPage',
  meta: { 
    title: '隐藏页面',
    hidden: true,  // 这会让菜单项不显示
    permission: 'something:view'
  },
  component: () => import('@/pages/hidden/HiddenPage.vue')
}
```

## 工作原理

1. **启动时检测**: 系统在 `AdminLayout` 挂载时自动检查所有模块的可用性
2. **菜单过滤**: 根据检查结果自动过滤掉不可用的菜单项
3. **路由守卫**: 访问路由时检查路径是否有效，无效则重定向到首页
4. **组件保护**: 页面使用 `isModuleAvailable` 决定操作是否渲染

## 注意事项

- 模块可用性检查在首次加载后会被缓存，提高性能
- 如果需要重新检测，可以调用 `invalidateAll()` 清除缓存
- `/dashboard` 和 `/login` 路径不受可用性检查影响
- 该功能主要用于保护开发阶段的系统，生产环境建议确保所有路由都有对应的实现
