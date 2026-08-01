<template>
  <el-tag :type="tagType" effect="light">{{ item.text }}</el-tag>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { getStatus } from '@/constants/status';
const props = defineProps<{ module: string; value: any }>();
const item = computed(() => getStatus(props.module, props.value));
const tagType = computed(() => {
  const color = item.value.color;
  if (color === 'green') return 'success';
  if (color === 'red') return 'danger';
  if (color === 'orange') return 'warning';
  if (color === 'blue' || color === 'purple') return 'primary';
  return 'info';
});
</script>
