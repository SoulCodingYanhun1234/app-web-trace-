<template>
  <div class="stat-grid ios27-stat-grid" :class="{ 'is-mini': mini }">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ mini?: boolean }>();
</script>
