<script setup lang="ts">
import { computed, ref } from 'vue'
import { downloadFile } from '../data/backup'
import { isDemo } from '../data/workspace'
import { historyRows, historyCsv } from '../domain/reports'
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import { useFinanceStore } from '../stores/finance'
import { formatMoney, sum, longMonth } from '../domain/finance'
const store = useFinanceStore()
const historyCount = ref(6)
const history = computed(() => historyRows(store.month, Number(historyCount.value), store.months, store.obligations, store.transactions, store.recurringOccurrences, store.today))
const trendMax = computed(() => Math.max(1, ...history.value.flatMap(r => [r.plannedCents ?? 0, r.outflowCents ?? 0])))
const categories = computed(() => {
  const totals = new Map<string, number>()
  for (const entry of store.monthTransactions.filter(t => t.kind !== 'income' && t.date <= store.today)) {
    totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.amountCents)
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1])
})
const outflow = computed(() => sum(categories.value.map(row => row[1])))
</script>
<template>
  <PageHeader label="05 / INSIGHT" title="Reports" subtitle="Plan and reality stay distinct. No invented forecasts." month-navigation />
  <div class="metrics-grid three"><MetricCard label="Planned monthly outflow" :value="formatMoney(store.summary.plannedCents)" detail="From obligations"/><MetricCard label="Actual recorded outflow" :value="formatMoney(store.summary.actualOutflowCents)" detail="From ledger transactions"/><MetricCard label="Unallocated plan" :value="formatMoney(store.summary.remainingCents)" detail="Expected income less planned outflow" :negative="store.summary.remainingCents < 0" emphasis/></div>
  <div class="dashboard-grid reports-grid">
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">MONTHLY CATEGORY MIX</span><h2>Recorded outflow</h2></div></div>
      <div class="category-breakdown tall"><div v-for="[category, cents] in categories" :key="category" class="breakdown-row"><span>{{ category }}</span><div class="small-meter"><span :style="{ width: `${outflow ? cents / outflow * 100 : 0}%` }" /></div><strong class="mono">{{ formatMoney(cents) }}</strong></div><p v-if="!categories.length" class="empty-copy">No actual spending to categorize this month.</p></div>
    </section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">PAYMENT CHECKLIST</span><h2>Plan completion</h2></div></div><div class="snapshot-main mono">{{ store.summary.paidCount }} / {{ store.summary.obligationCount }}</div><p class="snapshot-caption">Obligations covered by payments or manual confirmation</p><div class="ledger-facts"><div><span>Still outstanding</span><strong>{{ store.summary.unpaidCount }}</strong></div><div><span>Actual ledger net</span><strong class="mono">{{ formatMoney(store.summary.actualNetCents) }}</strong></div></div><p class="fine-print">This is not a bank reconciliation report.</p></section>
  </div>
  <section class="panel history-panel"><div class="panel-heading"><div><span class="eyebrow">RECORDED HISTORY</span><h2>Plan versus actual</h2></div><div class="report-controls"><button class="button small" @click="downloadFile(`Accrynt-report-${store.month}.csv`, historyCsv(history, isDemo), 'text/csv;charset=utf-8')">Export report CSV</button><label>History<select v-model="historyCount" aria-label="History"><option :value="3">3 months</option><option :value="6">6 months</option><option :value="12">12 months</option></select></label></div></div>
    <p class="fine-print">Selected period ends in {{ store.month }}. Actuals include entries through {{ store.today }}; months without recorded activity stay unknown. Current-month values may be incomplete.</p>
    <p class="fine-print mono">Shared scale · 0–{{ formatMoney(trendMax) }}</p><div class="trend-chart" role="img" aria-label="Planned versus recorded outflow. Exact values appear in the following table."><div v-for="row in history" :key="row.month" class="trend-month"><div class="trend-bars"><span v-if="row.plannedCents !== null" class="trend-plan" :style="{ height: `${row.plannedCents / trendMax * 100}%` }"/><span v-if="row.outflowCents !== null" class="trend-actual" :style="{ height: `${row.outflowCents / trendMax * 100}%` }"/></div><span class="mono" :title="longMonth(row.month)">{{ longMonth(row.month).split(' ')[0].slice(0,3) }}<br/>{{ row.month.slice(0,4) }}</span></div></div>
    <p class="fine-print">Gray: planned outflow · Cyan: actual outflow · Shared scale above · Blank: no recorded value</p>
    <div class="table-scroll"><table class="data-table"><caption class="sr-only">Monthly planned and recorded totals</caption><thead><tr><th>Month</th><th class="number">Expected income</th><th class="number">Planned outflow</th><th class="number">Received</th><th class="number">Actual outflow</th><th class="number">Actual net</th></tr></thead><tbody><tr v-for="row in history" :key="row.month"><th>{{ row.month }}<small v-if="row.month === store.today.slice(0,7)" class="cell-sub">Partial · through {{ store.today }}</small><small v-else-if="row.month > store.today.slice(0,7)" class="cell-sub">Future plan</small></th><td class="number mono">{{ row.expectedCents === null ? 'Not planned' : formatMoney(row.expectedCents) }}</td><td class="number mono">{{ row.plannedCents === null ? 'Not planned' : formatMoney(row.plannedCents) }}</td><td class="number mono">{{ row.incomeCents === null ? 'No records' : formatMoney(row.incomeCents) }}</td><td class="number mono">{{ row.outflowCents === null ? 'No records' : formatMoney(row.outflowCents) }}</td><td class="number mono">{{ row.netCents === null ? 'No records' : formatMoney(row.netCents) }}</td></tr></tbody></table></div>
  </section>
</template>
