<script setup lang="ts">
withDefaults(defineProps<{ label: string; value: string; detail: string; emphasis?: boolean; negative?: boolean }>(), { emphasis: false, negative: false })
</script>
<template>
  <article class="metric-card" :class="{ 'metric-emphasis': emphasis }">
    <div class="metric-label">{{ label }} <span aria-hidden="true">↗</span></div>
    <div class="metric-value mono" :class="{ 'negative-text': negative }">{{ value }}</div>
    <p class="metric-detail">{{ detail }}</p>
  </article>
</template>
