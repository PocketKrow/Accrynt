<script setup lang="ts">
import { reviewDrafts } from '../composables/editorDraft'
import { computed } from 'vue'
import { useFinanceStore } from '../stores/finance'
import { longMonth, shiftMonth } from '../domain/finance'
const props = defineProps<{ label: string; title: string; subtitle?: string; monthNavigation?: boolean }>()
const store = useFinanceStore()
const monthLabel = computed(() => longMonth(store.month))
const headingId = computed(() => props.title.toLowerCase().replace(/\W+/g, '-'))
async function changeMonth(offset: number) { if (await reviewDrafts()) store.month = shiftMonth(store.month, offset) }
</script>
<template>
  <header class="page-header">
    <div class="page-heading">
      <p class="eyebrow">{{ label }}</p>
      <h1 :id="headingId">{{ title }}</h1>
      <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="monthNavigation || $slots.actions" class="page-tools">
      <div v-if="monthNavigation" class="month-nav" role="group" aria-label="Select month">
        <button type="button" aria-label="Previous month" :disabled="store.month === '0001-01'" @click="changeMonth(-1)">‹</button>
        <span>{{ monthLabel }}</span>
        <button type="button" aria-label="Next month" :disabled="store.month === '9999-12'" @click="changeMonth(1)">›</button>
      </div>
      <div v-if="$slots.actions" class="page-actions"><slot name="actions" /></div>
    </div>
  </header>
</template>
