<template>
  <div class="toolbar ios27-toolbar">
    <div class="toolbar-left ios27-toolbar-left">
      <slot name="left" />
      <slot />
    </div>
    <div class="toolbar-right ios27-toolbar-right muted">
      <slot name="right">
        <span v-if="hint" class="table-shortcut-hint">{{ hint }}</span>
        <span v-if="typeof total === 'number'">{{ totalLabel || `共 ${total} 条` }}</span>
      </slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  total?: number;
  totalLabel?: string;
  hint?: string;
}>();
</script>
