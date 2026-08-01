# 🚀 快速开始 - UI 美化系统

## 5分钟上手指南

### 第一步：导入样式文件

在 `src/main.ts` 中添加以下导入：

```typescript
// src/main.ts
import { createApp } from 'vue';
import App from './App.vue';

// 导入 UI 美化样式（按顺序）
import '@/styles/theme-colors.css';      // 主题配色系统
import '@/styles/enhancements.css';      // 全局增强样式
import '@/styles/animations.css';        // 动画库
import '@/styles/table-list.css';        // 表格列表样式

// 其他导入...
const app = createApp(App);
// ...
```

### 第二步：使用美化样式

#### 方式1: 使用工具类

```html
<div class="bg-primary text-white shadow-lg rounded-xl hover-lift animate-fade-in-up">
  <h3>标题</h3>
  <p>内容</p>
</div>
```

#### 方式2: 使用 CSS 变量

```vue
<template>
  <div class="my-card">内容</div>
</template>

<style scoped>
.my-card {
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  padding: var(--space-5);
  transition: var(--transition);
}

.my-card:hover {
  border-color: var(--primary);
  box-shadow: var(--shadow-primary);
  transform: translateY(-4px);
}
</style>
```

#### 方式3: 使用预设组件样式

```html
<!-- 现代化表格 -->
<table class="modern-table">
  <thead>
    <tr>
      <th>列1</th>
      <th>列2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>数据1</td>
      <td>数据2</td>
    </tr>
  </tbody>
</table>

<!-- 网格卡片 -->
<div class="grid-card-list">
  <div class="grid-card">
    <div class="grid-card-header">
      <div class="grid-card-icon">📊</div>
      <div>
        <div class="grid-card-title">卡片标题</div>
        <div class="grid-card-subtitle">副标题</div>
      </div>
    </div>
    <div class="grid-card-body">卡片内容</div>
  </div>
</div>

<!-- 时间线列表 -->
<div class="timeline-list">
  <div class="timeline-item active">
    <div class="timeline-content">
      <div class="timeline-time">刚刚</div>
      <div class="timeline-title">事件标题</div>
      <div class="timeline-desc">事件描述</div>
    </div>
  </div>
</div>
```

### 第三步：生成新组件（可选）

使用组件生成器快速创建带美化样式的组件：

```bash
# 生成页面组件
node scripts/generate-component.mjs page MyPage

# 生成卡片组件
node scripts/generate-component.mjs card MyCard

# 生成表单组件
node scripts/generate-component.mjs form MyForm

# 生成列表组件
node scripts/generate-component.mjs list MyList
```

---

## 🎨 常用样式速查

### 颜色

```html
<!-- 背景色 -->
<div class="bg-primary">主色背景</div>
<div class="bg-success">成功色背景</div>
<div class="bg-warning">警告色背景</div>
<div class="bg-error">错误色背景</div>

<!-- 文本色 -->
<span class="text-primary">主色文本</span>
<span class="text-1">主要文本</span>
<span class="text-2">次要文本</span>
<span class="text-3">辅助文本</span>
```

### 阴影

```html
<div class="shadow-sm">小阴影</div>
<div class="shadow">默认阴影</div>
<div class="shadow-md">中等阴影</div>
<div class="shadow-lg">大阴影</div>
<div class="shadow-xl">超大阴影</div>
<div class="shadow-primary">品牌色阴影</div>
```

### 圆角

```html
<div class="rounded-sm">小圆角 (8px)</div>
<div class="rounded">默认圆角 (12px)</div>
<div class="rounded-md">中圆角 (16px)</div>
<div class="rounded-lg">大圆角 (20px)</div>
<div class="rounded-xl">超大圆角 (24px)</div>
<div class="rounded-full">完全圆角 (9999px)</div>
```

### 动画

```html
<!-- 入场动画 -->
<div class="animate-fade-in-up">上浮渐入</div>
<div class="animate-fade-in-down">下浮渐入</div>
<div class="animate-scale-in">缩放渐入</div>

<!-- 循环动画 -->
<div class="animate-bounce animate-infinite">弹跳</div>
<div class="animate-pulse animate-infinite">脉冲</div>
<div class="animate-float animate-infinite">悬浮</div>

<!-- 悬停触发 -->
<button class="hover-animate-bounce">悬停弹跳</button>
<button class="hover-animate-tada">悬停摇摆</button>

<!-- 延迟和速度 -->
<div class="animate-fade-in-up delay-200 duration-slow">
  延迟200ms，慢速动画
</div>
```

### 交互效果

```html
<div class="hover-lift">悬停上浮</div>
<div class="hover-scale">悬停缩放</div>
<div class="hover-glow">悬停发光</div>
```

---

## 📦 预设组件类名

### 表格

| 类名 | 用途 |
|------|------|
| `modern-table` | 现代化表格 |
| `card-table` | 卡片式表格 |
| `card-table-row` | 卡片行 |
| `table-sort` | 可排序列头 |

### 列表

| 类名 | 用途 |
|------|------|
| `timeline-list` | 时间线列表 |
| `timeline-item` | 时间线项 |
| `grid-card-list` | 网格卡片列表 |
| `grid-card` | 网格卡片 |
| `list-group` | 列表组 |
| `list-group-item` | 列表项 |

### 状态

| 类名 | 用途 |
|------|------|
| `status-active` | 活跃状态 |
| `status-pending` | 待处理状态 |
| `status-inactive` | 非活跃状态 |
| `status-error` | 错误状态 |
| `status-info` | 信息状态 |

### 空状态

| 类名 | 用途 |
|------|------|
| `empty-state` | 空状态容器 |
| `empty-state-icon` | 空状态图标 |
| `empty-state-title` | 空状态标题 |
| `empty-state-desc` | 空状态描述 |

### 骨架屏

| 类名 | 用途 |
|------|------|
| `skeleton` | 骨架屏基础类 |
| `skeleton-text` | 文本骨架 |
| `skeleton-title` | 标题骨架 |
| `skeleton-avatar` | 头像骨架 |
| `skeleton-card` | 卡片骨架 |

---

## 🎯 实战示例

### 示例1: 统计卡片

```vue
<template>
  <div class="stats-grid">
    <div class="stat-card animate-fade-in-up hover-lift">
      <div class="stat-icon gradient-primary">
        <AppIcon name="users" />
      </div>
      <div class="stat-value">1,234</div>
      <div class="stat-label">总用户</div>
    </div>
  </div>
</template>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-5);
}

.stat-card {
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius-xl);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  transition: var(--transition);
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin-bottom: var(--space-4);
}

.stat-value {
  font-size: 32px;
  font-weight: var(--font-bold);
  color: var(--text-1);
  margin-bottom: var(--space-2);
}

.stat-label {
  font-size: 14px;
  color: var(--text-3);
}
</style>
```

### 示例2: 操作按钮组

```vue
<template>
  <div class="action-buttons">
    <button class="btn btn-primary hover-animate-bounce">
      <AppIcon name="save" />
      保存
    </button>
    <button class="btn btn-secondary">
      <AppIcon name="x" />
      取消
    </button>
  </div>
</template>

<style scoped>
.action-buttons {
  display: flex;
  gap: var(--space-3);
}

.btn {
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius);
  font-weight: var(--font-semibold);
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  transition: var(--transition);
  border: 2px solid transparent;
  cursor: pointer;
}

.btn-primary {
  background: var(--gradient-primary);
  color: white;
  box-shadow: var(--shadow-primary);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-primary-lg);
}

.btn-secondary {
  background: var(--surface);
  color: var(--text-1);
  border-color: var(--line);
}

.btn-secondary:hover {
  border-color: var(--primary);
  background: var(--primary-alpha-10);
}
</style>
```

### 示例3: 通知消息

```vue
<template>
  <div class="notification animate-slide-in-right">
    <div class="notification-icon status-success">
      <AppIcon name="check-circle" />
    </div>
    <div class="notification-content">
      <div class="notification-title">操作成功</div>
      <div class="notification-message">{{ message }}</div>
    </div>
    <button class="notification-close" @click="close">
      <AppIcon name="x" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.notification {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  background: var(--surface);
  border: 2px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  min-width: 320px;
}

.notification-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.notification-content {
  flex: 1;
}

.notification-title {
  font-size: 15px;
  font-weight: var(--font-semibold);
  color: var(--text-1);
  margin-bottom: 2px;
}

.notification-message {
  font-size: 13px;
  color: var(--text-3);
}

.notification-close {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: var(--transition);
}

.notification-close:hover {
  background: var(--bg-3);
  color: var(--text-1);
}
</style>
```

---

## 🔥 主题切换

### 切换深浅色模式

```typescript
// 切换主题
const toggleTheme = () => {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
};

// 初始化主题
const initTheme = () => {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
};
```

### 切换主题色调

```typescript
// 切换主题色调
const changeThemeTone = (tone: string) => {
  document.body.className = `theme-${tone}`;
};

// 可用色调: cyan, emerald, violet, pink, amber
```

---

## 📚 完整文档

详细文档请查看：

- 📖 [UI_GUIDE.md](./UI_GUIDE.md) - 完整使用指南
- 📋 [CHANGELOG.md](./pages/settings/CHANGELOG.md) - 变更日志
- 🔍 [UI_COMPARISON.md](./pages/settings/UI_COMPARISON.md) - 前后对比
- 📊 [UI_ENHANCEMENT_SUMMARY.md](./UI_ENHANCEMENT_SUMMARY.md) - 改进总结

---

## 🆘 常见问题

### Q: 样式没有生效？
**A**: 确认已在 `main.ts` 中按正确顺序导入样式文件。

### Q: 动画太快或太慢？
**A**: 使用 `duration-fast/normal/slow/slower` 类调整速度。

### Q: 如何自定义主题色？
**A**: 修改 CSS 变量 `--primary` 及其变体即可。

### Q: 深色模式颜色不对？
**A**: 检查 `html[data-theme="dark"]` 选择器是否正确应用。

### Q: 如何禁用动画？
**A**: 系统会自动检测 `prefers-reduced-motion`，或手动设置 `animation-duration: 0ms`。

---

## 🎉 开始使用

1. ✅ 导入样式文件
2. ✅ 使用工具类或 CSS 变量
3. ✅ 参考示例代码
4. ✅ 查看完整文档

**祝您开发愉快！** 🚀
