<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import { useFinanceStore } from '../stores/finance'
import { formatMoney, sum } from '../domain/finance'
const store = useFinanceStore()
const categories = computed(() => {
  const totals = new Map<string, number>()
  for (const entry of store.monthTransactions.filter(t => t.kind !== 'income')) {
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amountCents)
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])
})
const outflow = computed(() => sum(categories.value.map(row => row[1])))
</script>
<template>
  <PageHeader label="05 / INSIGHT" title="Reports" subtitle="Plan and reality stay distinct. No invented forecasts." month-navigation />
  <div class="metrics-grid three"><MetricCard label="Planned monthly outflow" :value="formatMoney(store.summary.plannedCents)" detail="From obligations"/><MetricCard label="Actual recorded outflow" :value="formatMoney(store.summary.actualOutflowCents)" detail="From ledger transactions"/><MetricCard label="Unallocated plan" :value="formatMoney(store.summary.remainingCents)" detail="Expected income less planned outflow" emphasis/></div>
  <div class="dashboard-grid reports-grid">
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">MONTHLY CATEGORY MIX</span><h2>Recorded outflow</h2></div></div>
      <div class="category-breakdown tall"><div v-for="[category, cents] in categories" :key="category" class="breakdown-row"><span>{{ category }}</span><div class="small-meter"><span :style="{ width: `${outflow ? cents / outflow * 100 : 0}%` }" /></div><strong class="mono">{{ formatMoney(cents) }}</strong></div><p v-if="!categories.length" class="empty-copy">No actual spending to categorize this month.</p></div>
    </section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">PAYMENT CHECKLIST</span><h2>Plan completion</h2></div></div><div class="snapshot-main mono">{{ store.summary.paidCount }} / {{ store.summary.obligationCount }}</div><p class="snapshot-caption">Obligations covered by payments or manual confirmation</p><div class="ledger-facts"><div><span>Still outstanding</span><strong>{{ store.summary.unpaidCount }}</strong></div><div><span>Actual ledger net</span><strong class="mono">{{ formatMoney(store.summary.actualNetCents) }}</strong></div></div><p class="fine-print">This is not a bank reconciliation report.</p></section>
  </div>
</template>
