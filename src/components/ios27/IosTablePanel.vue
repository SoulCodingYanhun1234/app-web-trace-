<template>
  <IosGlassCard class="table-card ios27-table-panel">
    <IosToolbar v-if="$slots.toolbar || $slots['toolbar-left'] || $slots['toolbar-right'] || typeof total === 'number' || hint" :total="total" :total-label="totalLabel" :hint="hint">
      <template #left v-if="$slots['toolbar-left'] || $slots.toolbar">
        <slot name="toolbar-left" />
        <slot name="toolbar" />
      </template>
      <template #right v-if="$slots['toolbar-right']">
        <slot name="toolbar-right" />
      </template>
    </IosToolbar>
    <slot />
    <div v-if="$slots.pagination" class="pagination-bar ios27-pagination-bar">
      <slot name="pagination" />
    </div>
    <slot name="footer" />
  </IosGlassCard>
</template>

<script setup lang="ts">
import IosGlassCard from './IosGlassCard.vue';
import IosToolbar from './IosToolbar.vue';

defineProps<{
  total?: number;
  totalLabel?: string;
  hint?: string;
}>();
</script>
