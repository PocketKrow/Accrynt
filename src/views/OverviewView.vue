<script setup lang="ts">
import { useEditorDraft } from '../composables/editorDraft'
import { errorMessage } from '../domain/errors'
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useFinanceStore } from '../stores/finance'
import PageHeader from '../components/PageHeader.vue'
import CashBreakdown from '../components/CashBreakdown.vue'
import MetricCard from '../components/MetricCard.vue'
import ObligationForm from '../components/ObligationForm.vue'
import TransactionForm from '../components/TransactionForm.vue'
import PaymentForm from '../components/PaymentForm.vue'
import { openingSuggestion } from '../domain/opening'
import { monthlyInterest } from '../domain/debt'
import { formatMoney, longMonth, parseSignedMoney, dueDate } from '../domain/finance'
import { type MonthPlan, type Obligation } from '../domain/models'
import { localRepository } from '../data/repository'
const store = useFinanceStore()
let monthBaseline: MonthPlan | null = null
const suggestion = ref<ReturnType<typeof openingSuggestion>>(null)
const breakdown = ref<'tracked' | 'after' | 'committed' | null>(null)
const transactionOpen = ref(false)
const showForm = ref(false), paymentOpen = ref(false), paying = ref<Obligation | null>(null)
const openingEditor = ref(false), openingDraft = ref(''), busy = ref(false)
const income = computed(() => store.expectedIncomeCents)
const outflowPercent = computed(() => income.value ? store.summary.plannedCents / income.value * 100 : 0)
const categories = computed(() => Object.entries(store.monthObligations.reduce((acc, item) => {
  acc[item.category] = (acc[item.category] ?? 0) + item.plannedCents
  return acc
}, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]))
const allDue = computed(() => store.monthObligations.filter(x => !store.obligationState(x).paid))
const due = computed(() => allDue.value.slice(0, 6))
const allDebts = computed(() => store.debts.filter(d => d.balanceCents > 0).slice().sort((a,b) => b.balanceCents-a.balanceCents || a.id.localeCompare(b.id)))
const debtSnapshot = computed(() => allDebts.value.slice(0, 5))
const allUpcoming = computed(() => store.obligations.filter(o => o.month !== store.month && o.dueDay && dueDate(o.month, o.dueDay) > store.today && !store.obligationState(o).paid).sort((a,b) => dueDate(a.month, a.dueDay!).localeCompare(dueDate(b.month, b.dueDay!)) || a.id.localeCompare(b.id)))
const upcoming = computed(() => allUpcoming.value.slice(0, 4))
const amount = (value: number | null) => value === null ? '—' : formatMoney(value)
watch(() => store.month, () => { openingEditor.value = false; openingDraft.value = '' })
function editOpening() {
  suggestion.value = openingSuggestion(store.month, store.today, store.months, store.transactions)
  monthBaseline = store.monthData ? { ...store.monthData } : null
  openingDraft.value = store.monthData?.openingCents == null ? '' : (store.monthData.openingCents / 100).toFixed(2)
  openingEditor.value = true
}
async function saveOpening(clear = false) {
  if (busy.value) return
  const cents = clear ? null : parseSignedMoney(openingDraft.value), target = store.month
  if (!clear && cents === null) { store.notify('Enter a valid opening balance; negative balances are supported.'); return }
  busy.value = true
  try { await localRepository.saveOpeningBalance(target, cents, monthBaseline); openingEditor.value = false; store.notify(clear ? 'Opening balance cleared.' : 'Opening balance saved.') }
  catch (reason) { store.fail(errorMessage(reason, 'Unable to save opening balance.')) }
  finally { busy.value = false }
}
function pay(item: Obligation) { paying.value = item; paymentOpen.value = true }
function dueLabel(item: Obligation) {
  if (!item.dueDay) return 'No due date'
  const date = dueDate(item.month, item.dueDay)
  return `${date < store.today ? 'Overdue · ' : 'Due '}${date}`
}
const draftGuard = useEditorDraft({
  label: 'opening balance', open: () => openingEditor.value, draft: () => openingDraft.value, busy,
  save: () => saveOpening(), close: () => { openingEditor.value = false }
})
</script>
<template>
  <PageHeader label="01 / WORKSPACE" :title="`${longMonth(store.month).split(' ')[0]} at a glance`" subtitle="Your recorded money, outstanding bills, and next actions." month-navigation>
    <template #actions><button class="button" @click="transactionOpen = true">+ Record transaction</button><button class="button primary" @click="showForm = true">+ Add obligation</button></template>
  </PageHeader>
  <section v-if="!store.hasAnyData" class="panel first-run" aria-label="Get started"><h2>Set up your first month</h2><p class="body-copy">Start with money on hand, expected income, and a bill. Record deposits when they arrive. Your workspace stays on this device.</p><div class="page-actions"><button class="button" @click="!openingEditor && editOpening()">Set opening cash</button><RouterLink class="button" to="/plan?setup=income">Set expected income</RouterLink><RouterLink class="button" to="/plan?setup=bill">Add first bill</RouterLink></div></section>
  <div class="metrics-grid">
    <MetricCard label="Tracked available" :value="amount(store.cashflow.trackedCents)" detail="Opening balance + recorded net to date"><button class="text-link metric-breakdown" aria-label="View breakdown: Tracked available" @click="breakdown = 'tracked'">View breakdown</button></MetricCard>
    <MetricCard label="After outstanding bills" :value="amount(store.cashflow.afterBillsCents)" detail="Available less unpaid commitments" emphasis :negative="(store.cashflow.afterBillsCents ?? 0) < 0"><button class="text-link metric-breakdown" aria-label="View breakdown: After outstanding bills" @click="breakdown = 'after'">View breakdown</button></MetricCard>
    <MetricCard label="Income received" :value="formatMoney(store.cashflow.receivedCents)" detail="Recorded deposits dated through today" />
    <MetricCard label="Still committed" :value="formatMoney(store.cashflow.outstandingCents)" detail="Remaining bill amounts this month"><button class="text-link metric-breakdown" aria-label="View breakdown: Still committed" @click="breakdown = 'committed'">View breakdown</button></MetricCard>
  </div>
  <div class="cashflow-context"><p class="fine-print">{{ store.month }} · Expected income {{ formatMoney(income) }} · Recorded outflow to date {{ formatMoney(store.cashflow.spentCents) }}. Tracked estimates depend on your entries; Accrynt does not connect to a bank.</p><button class="text-link" @click="!openingEditor && editOpening()" :disabled="openingEditor">{{ store.monthData?.openingCents == null ? 'Set opening balance' : 'Edit opening balance' }}</button></div>
  <section v-if="openingEditor" class="panel inline-editor"><h2>Opening balance · {{ store.month }}-01</h2><p class="body-copy">Money on hand at the start of this month across the accounts you track. Record this month’s deposits separately in the Ledger. This amount is never carried into another month automatically.</p><div v-if="suggestion" class="opening-suggestion"><p class="body-copy">Prior recorded closing · {{ suggestion.source }} · <strong class="mono">{{ formatMoney(suggestion.cents) }}</strong>. Based only on the opening cash and dated Ledger entries saved for that completed month. Records may be incomplete. Later historical edits will not update this opening automatically.</p><button class="button small" type="button" :disabled="busy" @click="openingDraft = (suggestion.cents / 100).toFixed(2)">Use prior recorded closing</button><p class="form-hint">Review the amount, then Save opening balance to accept it.</p></div><form class="inline-form" @submit.prevent="saveOpening()"><fieldset class="editor-fields inline-fields" :disabled="busy"><label>Opening balance (USD)<input v-model="openingDraft" inputmode="decimal" required /></label><button class="button primary" :disabled="busy">Save opening balance</button><button type="button" class="button" :disabled="busy" @click="saveOpening(true)">Clear balance</button><button type="button" class="button" :disabled="busy" @click="draftGuard.close()">Cancel</button></fieldset></form></section>
  <p v-if="store.monthData?.openingCents == null" class="body-copy">Set an opening balance to calculate tracked available money. Expected income is kept separate until received.</p>
  <div class="dashboard-grid focus-dashboard">
    <section class="panel">
      <div class="panel-heading"><div><span class="eyebrow">NEXT ACTIONS</span><h2>Still to pay</h2></div><RouterLink class="text-link" to="/plan">All obligations ↗</RouterLink></div>
      <p class="fine-print">Showing {{ due.length }} of {{ allDue.length }} outstanding · {{ formatMoney(store.cashflow.outstandingCents) }} total remaining</p><div class="rows"><div v-for="item in due" :key="item.id" class="bill-row"><span class="bill-name"><strong>{{ item.name }}</strong><small>{{ dueLabel(item) }} · {{ store.obligationState(item).status }}</small></span><span class="mono bill-amount">{{ formatMoney(store.obligationState(item).remainingCents) }}</span><button class="button small" @click="pay(item)">Record payment</button></div><p v-if="!due.length" class="empty-copy">{{ store.monthObligations.length ? 'No outstanding obligations in this month.' : 'Your monthly plan is empty.' }}</p></div>
    </section>
    <section class="panel"><div class="panel-heading"><div><span class="eyebrow">ACTUAL ACTIVITY</span><h2>Recent transactions</h2></div><RouterLink class="text-link" to="/ledger">Open ledger ↗</RouterLink></div><div class="rows"><div v-for="item in store.monthTransactions.slice(0, 5)" :key="item.id" class="activity-row"><span><strong>{{ item.name }}</strong><small>{{ item.date }} · {{ item.category }}<span v-if="item.date > store.today" class="scheduled-marker"> · Scheduled · excluded from actuals</span></small></span><span class="mono" :class="item.kind === 'income' ? 'good-text' : ''">{{ item.kind === 'income' ? '+' : '−' }}{{ formatMoney(item.amountCents) }}</span></div><p v-if="!store.monthTransactions.length" class="empty-copy">No money movements recorded this month.</p></div></section>
    <section class="panel overview-context"><div class="panel-heading"><div><span class="eyebrow">DEBT & NEXT DUE</span><h2>Commitments</h2></div><RouterLink to="/debts" class="text-link">All debts ↗</RouterLink></div><p class="fine-print">Showing {{ debtSnapshot.length }} of {{ allDebts.length }} outstanding debt accounts</p><div class="rows"><div v-for="debt in debtSnapshot" :key="debt.id" class="activity-row"><span><strong>{{ debt.name }}</strong><small>{{ debt.aprMilliPercent === null ? 'Rate unknown' : `${formatMoney(monthlyInterest(debt.balanceCents, debt.aprMilliPercent))} estimated monthly interest` }}</small></span><span class="mono">{{ formatMoney(debt.balanceCents) }}</span></div><p v-if="!debtSnapshot.length" class="empty-copy">No outstanding debt accounts.</p></div><p v-if="allDebts.length > debtSnapshot.length" class="fine-print">{{ allDebts.length - debtSnapshot.length }} more debt account(s) in Debts</p><template v-if="upcoming.length"><h3>Other months · upcoming saved obligations</h3><p class="fine-print">Showing {{ upcoming.length }} of {{ allUpcoming.length }} upcoming items outside {{ store.month }}</p><div v-for="item in upcoming" :key="item.id" class="activity-row"><span><strong>{{ item.name }}</strong><small>{{ dueDate(item.month, item.dueDay!) }}</small></span><span class="mono">{{ formatMoney(store.obligationState(item).remainingCents) }}</span></div><p class="fine-print">Saved plans only; future months are not generated by this view.</p></template><p v-else class="fine-print">No upcoming obligations saved for other months.</p><p class="fine-print">Interest is a planning estimate, separate from saved balances.</p></section>
  </div>
  <details class="panel budget-details"><summary>Budget breakdown · {{ formatMoney(store.summary.remainingCents) }} unallocated planned income</summary><div class="recurring-content"><p class="body-copy">Expected income minus all planned obligations. This is your budget remainder, separate from available money.</p><div class="segmented-meter" role="progressbar" :aria-valuenow="Math.round(outflowPercent)" aria-valuemin="0" :aria-valuemax="Math.max(100, Math.round(outflowPercent))" aria-label="Budget allocated"><span :style="{ width: `${Math.min(outflowPercent, 100)}%` }" /></div><div class="allocation-legend"><span>{{ outflowPercent.toFixed(1) }}% planned</span><span>{{ formatMoney(store.summary.plannedCents) }} of {{ formatMoney(income) }} expected</span></div><div class="category-breakdown"><div v-for="[category, total] in categories" :key="category" class="breakdown-row"><span>{{ category }}</span><div class="small-meter"><span :style="{ width: `${store.summary.plannedCents ? total / store.summary.plannedCents * 100 : 0}%` }" /></div><strong class="mono">{{ formatMoney(total) }}</strong></div><p v-if="!categories.length" class="empty-copy">No planned obligations yet.</p></div></div></details>
  <p class="fine-print">Bills marked paid manually stop reserving money but do not create outflow. Record missing transactions to keep available totals accurate. Future-dated entries are excluded from available money until their date.</p>
  <CashBreakdown :section="breakdown" @close="breakdown = null" />
  <TransactionForm v-model="transactionOpen" /><ObligationForm v-model="showForm" /><PaymentForm v-model="paymentOpen" :obligation="paying" />
</template>
