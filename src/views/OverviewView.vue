<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useFinanceStore } from '../stores/finance'
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import ObligationForm from '../components/ObligationForm.vue'
import { formatMoney, longMonth } from '../domain/finance'
import { localRepository } from '../data/repository'
const store = useFinanceStore()
const showForm = ref(false)
const income = computed(() => store.monthData?.incomeCents ?? 0)
const outflowPercent = computed(() => income.value ? store.summary.plannedCents / income.value * 100 : 0)
const categories = computed(() => Object.entries(store.monthObligations.reduce((acc, item) => {
  acc[item.category] = (acc[item.category] ?? 0) + item.plannedCents
  return acc
}, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]))
const due = computed(() => store.monthObligations.filter(x => !x.paidAt).slice(0, 6))
async function togglePaid(id: string, paid: boolean) {
  try { await localRepository.setObligationPaid(id, paid) } catch (e) { store.notify(e instanceof Error ? e.message : 'Unable to update status.') }
}
</script>
<template>
  <PageHeader label="01 / WORKSPACE" :title="`${longMonth(store.month).split(' ')[0]} at a glance`" subtitle="Know what is planned, what is paid, and what actually happened." month-navigation>
    <template #actions><button class="button primary" @click="showForm = true">+ Add obligation</button></template>
  </PageHeader>
  <div class="metrics-grid">
    <MetricCard label="Expected income" :value="formatMoney(income)" detail="Monthly plan, not a deposit" />
    <MetricCard label="Planned outflow" :value="formatMoney(store.summary.plannedCents)" detail="Bills and debt commitments" />
    <MetricCard label="Unallocated" :value="formatMoney(store.summary.remainingCents)" detail="Budget remainder · not bank cash" emphasis :negative="store.summary.remainingCents < 0" />
    <MetricCard label="Completed" :value="`${store.summary.paidCount} / ${store.summary.obligationCount}`" detail="Obligations marked paid" />
  </div>
  <div class="dashboard-grid">
    <section class="feature-panel">
      <div class="panel-heading"><div><span class="eyebrow">MONTHLY DISTRIBUTION</span><h2>Budget allocation</h2></div><RouterLink class="text-link" to="/plan">Monthly plan ↗</RouterLink></div>
      <div class="feature-numbers"><strong class="mono">{{ formatMoney(store.summary.plannedCents) }}</strong><span class="muted">of {{ formatMoney(income) }} expected</span></div>
      <div class="segmented-meter" role="progressbar" :aria-valuenow="Math.round(outflowPercent)" aria-valuemin="0" :aria-valuemax="Math.max(100, Math.round(outflowPercent))" aria-label="Budget allocated"><span :style="{ width: `${Math.min(outflowPercent, 100)}%` }" /></div>
      <div class="allocation-legend"><span>{{ outflowPercent.toFixed(1) }}% planned</span><span>{{ formatMoney(store.summary.remainingCents) }} remaining</span></div>
      <div class="category-breakdown">
        <div v-for="[category, total] in categories" :key="category" class="breakdown-row"><span>{{ category }}</span><div class="small-meter"><span :style="{ width: `${store.summary.plannedCents ? total / store.summary.plannedCents * 100 : 0}%` }" /></div><strong class="mono">{{ formatMoney(total) }}</strong></div>
        <div v-if="!categories.length" class="empty-copy">No obligations yet. Set your expected income and add the bills you want to track.</div>
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><span class="eyebrow">ATTENTION</span><h2>Still to pay</h2></div><RouterLink class="text-link" to="/plan">All obligations ↗</RouterLink></div>
      <div class="rows">
        <label v-for="item in due" :key="item.id" class="bill-row"><input type="checkbox" :checked="!!item.paidAt" :aria-label="`Mark ${item.name} paid`" @change="togglePaid(item.id, !item.paidAt)"/><span class="bill-name"><strong>{{ item.name }}</strong><small>{{ item.dueDay ? `Due day ${item.dueDay}` : item.category }}</small></span><span class="mono bill-amount">{{ formatMoney(item.plannedCents) }}</span></label>
        <p v-if="!due.length" class="empty-copy">{{ store.monthObligations.length ? 'No unpaid obligations. Nice and tidy.' : 'Your monthly plan is empty.' }}</p>
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><span class="eyebrow">ACTUAL ACTIVITY</span><h2>Recent transactions</h2></div><RouterLink class="text-link" to="/ledger">Open ledger ↗</RouterLink></div>
      <div class="rows">
        <div v-for="item in store.monthTransactions.slice(0, 6)" :key="item.id" class="activity-row"><span><strong>{{ item.name }}</strong><small>{{ item.date }} · {{ item.category }}</small></span><span class="mono" :class="item.kind === 'income' ? 'good-text' : ''">{{ item.kind === 'income' ? '+' : '−' }}{{ formatMoney(item.amountCents) }}</span></div>
        <p v-if="!store.monthTransactions.length" class="empty-copy">No actual transactions recorded. Planned payments are not counted here.</p>
      </div>
    </section>
    <section class="panel summary-panel">
      <div class="panel-heading"><div><span class="eyebrow">RECORDED, NOT ESTIMATED</span><h2>Ledger snapshot</h2></div><RouterLink class="text-link" to="/reports">Reports ↗</RouterLink></div>
      <div class="snapshot-main mono">{{ formatMoney(store.summary.actualNetCents) }}</div>
      <div class="snapshot-caption">Actual net movement recorded in this month's ledger</div>
      <div class="ledger-facts"><div><span>Actual income</span><strong class="mono good-text">{{ formatMoney(store.summary.actualIncomeCents) }}</strong></div><div><span>Actual outflow</span><strong class="mono">{{ formatMoney(store.summary.actualOutflowCents) }}</strong></div></div>
      <p class="fine-print">Actual totals depend on the transactions you enter. Accrynt does not connect to a bank.</p>
    </section>
  </div>
  <ObligationForm v-model="showForm" />
</template>
