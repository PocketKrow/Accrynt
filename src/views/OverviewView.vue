<script setup lang="ts">
import { errorMessage } from '../domain/errors'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useFinanceStore } from '../stores/finance'
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import ObligationForm from '../components/ObligationForm.vue'
import PaymentForm from '../components/PaymentForm.vue'
import { formatMoney, longMonth, obligationPayment, parseSignedMoney, dueDate } from '../domain/finance'
import { type Obligation } from '../domain/models'
import { localRepository } from '../data/repository'
const store = useFinanceStore()
const showForm = ref(false), paymentOpen = ref(false), paying = ref<Obligation | null>(null)
const openingEditor = ref(false), openingDraft = ref(''), busy = ref(false)
const income = computed(() => store.expectedIncomeCents)
const outflowPercent = computed(() => income.value ? store.summary.plannedCents / income.value * 100 : 0)
const categories = computed(() => Object.entries(store.monthObligations.reduce((acc, item) => {
  acc[item.category] = (acc[item.category] ?? 0) + item.plannedCents
  return acc
}, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]))
const due = computed(() => store.monthObligations.filter(x => !obligationPayment(x, store.transactions, store.today).paid).slice(0, 6))
const amount = (value: number | null) => value === null ? '—' : formatMoney(value)
watch(() => store.month, () => { openingEditor.value = false; openingDraft.value = '' })
function editOpening() { openingDraft.value = store.monthData?.openingCents == null ? '' : (store.monthData.openingCents / 100).toFixed(2); openingEditor.value = true }
async function saveOpening(clear = false) {
  if (busy.value) return
  const cents = clear ? null : parseSignedMoney(openingDraft.value), target = store.month
  if (!clear && cents === null) { store.notify('Enter a valid opening balance; negative balances are supported.'); return }
  busy.value = true
  try { await localRepository.saveOpeningBalance(target, cents); openingEditor.value = false; store.notify(clear ? 'Opening balance cleared.' : 'Opening balance saved.') }
  catch (reason) { store.notify(errorMessage(reason, 'Unable to save opening balance.')) }
  finally { busy.value = false }
}
function pay(item: Obligation) { paying.value = item; paymentOpen.value = true }
function dueLabel(item: Obligation) {
  if (!item.dueDay) return 'No due date'
  const date = dueDate(item.month, item.dueDay)
  return `${date < store.today ? 'Overdue · ' : 'Due '}${date}`
}
</script>
<template>
  <PageHeader label="01 / WORKSPACE" :title="`${longMonth(store.month).split(' ')[0]} at a glance`" subtitle="Your recorded money, outstanding bills, and next actions." month-navigation>
    <template #actions><button class="button primary" @click="showForm = true">+ Add obligation</button></template>
  </PageHeader>
  <p v-if="!store.hasAnyData" class="body-copy">Set your opening balance, then add bills in <RouterLink class="text-link" to="/plan">Monthly Plan</RouterLink>. Record income when it arrives. Your workspace stays on this device.</p>
  <div class="metrics-grid">
    <MetricCard label="Tracked available" :value="amount(store.cashflow.trackedCents)" detail="Opening balance + recorded net to date" />
    <MetricCard label="After outstanding bills" :value="amount(store.cashflow.afterBillsCents)" detail="Available less unpaid commitments" emphasis :negative="(store.cashflow.afterBillsCents ?? 0) < 0" />
    <MetricCard label="Income received" :value="formatMoney(store.cashflow.receivedCents)" detail="Recorded deposits dated through today" />
    <MetricCard label="Still committed" :value="formatMoney(store.cashflow.outstandingCents)" detail="Remaining bill amounts this month" />
  </div>
  <div class="cashflow-context"><p class="fine-print">{{ store.month }} · Expected income {{ formatMoney(income) }} · Recorded outflow to date {{ formatMoney(store.cashflow.spentCents) }}. Tracked estimates depend on your entries; Accrynt does not connect to a bank.</p><button class="text-link" @click="editOpening">{{ store.monthData?.openingCents == null ? 'Set opening balance' : 'Edit opening balance' }}</button></div>
  <section v-if="openingEditor" class="panel inline-editor"><h2>Opening balance · {{ store.month }}-01</h2><p class="body-copy">Money on hand at the start of this month across the accounts you track. Record this month’s deposits separately in the Ledger. This amount is never carried into another month automatically.</p><form class="inline-form" @submit.prevent="saveOpening()"><label>Opening balance (USD)<input v-model="openingDraft" inputmode="decimal" required /></label><button class="button primary" :disabled="busy">Save opening balance</button><button type="button" class="button" :disabled="busy" @click="saveOpening(true)">Clear balance</button><button type="button" class="button" :disabled="busy" @click="openingEditor = false">Cancel</button></form></section>
  <p v-if="store.monthData?.openingCents == null" class="body-copy">Set an opening balance to calculate tracked available money. Expected income is kept separate until received.</p>
  <div class="dashboard-grid focus-dashboard">
    <section class="panel">
      <div class="panel-heading"><div><span class="eyebrow">NEXT ACTIONS</span><h2>Still to pay</h2></div><RouterLink class="text-link" to="/plan">All obligations ↗</RouterLink></div>
      <div class="rows"><div v-for="item in due" :key="item.id" class="bill-row"><span class="bill-name"><strong>{{ item.name }}</strong><small>{{ dueLabel(item) }} · {{ obligationPayment(item, store.transactions, store.today).status }}</small></span><span class="mono bill-amount">{{ formatMoney(obligationPayment(item, store.transactions, store.today).remainingCents) }}</span><button class="button small" @click="pay(item)">Record payment</button></div><p v-if="!due.length" class="empty-copy">{{ store.monthObligations.length ? 'No outstanding obligations in this month.' : 'Your monthly plan is empty.' }}</p></div>
    </section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">ACTUAL ACTIVITY</span><h2>Recent transactions</h2></div><RouterLink class="text-link" to="/ledger">Open ledger ↗</RouterLink></div><div class="rows"><div v-for="item in store.monthTransactions.slice(0, 5)" :key="item.id" class="activity-row"><span><strong>{{ item.name }}</strong><small>{{ item.date }} · {{ item.category }}</small></span><span class="mono" :class="item.kind === 'income' ? 'good-text' : ''">{{ item.kind === 'income' ? '+' : '−' }}{{ formatMoney(item.amountCents) }}</span></div><p v-if="!store.monthTransactions.length" class="empty-copy">No money movements recorded this month.</p></div></section>
  </div>
  <details class="panel budget-details"><summary>Budget breakdown · {{ formatMoney(store.summary.remainingCents) }} unallocated</summary><div class="recurring-content"><p class="body-copy">Expected income minus all planned obligations. This is your budget remainder, separate from available money.</p><div class="segmented-meter" role="progressbar" :aria-valuenow="Math.round(outflowPercent)" aria-valuemin="0" :aria-valuemax="Math.max(100, Math.round(outflowPercent))" aria-label="Budget allocated"><span :style="{ width: `${Math.min(outflowPercent, 100)}%` }" /></div><div class="allocation-legend"><span>{{ outflowPercent.toFixed(1) }}% planned</span><span>{{ formatMoney(store.summary.plannedCents) }} of {{ formatMoney(income) }} expected</span></div><div class="category-breakdown"><div v-for="[category, total] in categories" :key="category" class="breakdown-row"><span>{{ category }}</span><div class="small-meter"><span :style="{ width: `${store.summary.plannedCents ? total / store.summary.plannedCents * 100 : 0}%` }" /></div><strong class="mono">{{ formatMoney(total) }}</strong></div><p v-if="!categories.length" class="empty-copy">No planned obligations yet.</p></div></div></details>
  <p class="fine-print">Bills marked paid manually stop reserving money but do not create outflow. Record missing transactions to keep available totals accurate. Future-dated entries are excluded from available money until their date.</p>
  <ObligationForm v-model="showForm" /><PaymentForm v-model="paymentOpen" :obligation="paying" />
</template>
