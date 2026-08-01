<template>
  <el-card class="stat-card ios27-stat-card" :class="[{ 'is-mini': mini }, tone ? `tone-${tone}` : '']" shadow="never">
    <div v-if="icon" class="stat-icon ios27-stat-icon"><AppIcon :name="icon" :size="mini ? 18 : 22" /></div>
    <template v-if="mini">
      <div class="mini-stat-label">{{ label }}</div>
      <div class="mini-stat-value">{{ value }}</div>
    </template>
    <template v-else>
      <div class="stat-value">{{ value }}</div>
      <div class="stat-label">{{ label }}</div>
    </template>
    <div v-if="description" class="ios27-stat-desc">{{ description }}</div>
  </el-card>
</template>

<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';

defineProps<{
  label: string;
  value: string | number;
  icon?: string;
  description?: string;
  mini?: boolean;
  tone?: 'indigo' | 'cyan' | 'teal' | 'mint' | 'violet' | 'amber' | 'sky' | 'rose';
}>();
</script>
