<template>
  <section class="page-hero ios27-page-hero" :class="{ 'is-compact': compact }">
    <div class="ios27-hero-main">
      <slot name="eyebrow">
        <div v-if="eyebrow" class="eyebrow">{{ eyebrow }}</div>
      </slot>
      <slot name="title">
        <h2 v-if="title" class="page-title">{{ title }}</h2>
      </slot>
      <slot name="description">
        <p v-if="description" class="page-desc">{{ description }}</p>
      </slot>
      <slot />
    </div>
    <el-space v-if="$slots.actions" wrap class="page-hero-actions ios27-hero-actions">
      <slot name="actions" />
    </el-space>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title?: string;
  description?: string;
  compact?: boolean;
}>();
</script>
