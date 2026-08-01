<template>
  <el-card v-bind="$attrs" class="glass-card ios27-glass-card" shadow="never">
    <template #header v-if="title || subtitle || $slots.header || $slots.extra">
      <div class="ios27-card-header">
        <div class="ios27-card-heading">
          <slot name="header">
            <div v-if="title" class="ios27-card-title">{{ title }}</div>
            <div v-if="subtitle" class="ios27-card-subtitle">{{ subtitle }}</div>
          </slot>
        </div>
        <div v-if="$slots.extra" class="ios27-card-extra">
          <slot name="extra" />
        </div>
      </div>
    </template>
    <slot />
  </el-card>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false });
defineProps<{
  title?: string;
  subtitle?: string;
}>();
</script>
