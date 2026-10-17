<script setup lang="ts">
import { errorMessage } from '../domain/errors'
import { computed, ref } from 'vue'
import BalanceAdjustment from '../components/BalanceAdjustment.vue'
import DebtAccrual from '../components/DebtAccrual.vue'
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import DebtForm from '../components/DebtForm.vue'
import DebtForecast from '../components/DebtForecast.vue'
import PaymentForm from '../components/PaymentForm.vue'
import { monthlyInterest } from '../domain/debt'
import { useFinanceStore } from '../stores/finance'
import { formatMoney, sum, debtProgress } from '../domain/finance'
import { localRepository } from '../data/repository'
import type { Debt } from '../domain/models'
const store = useFinanceStore()
const editor = ref(false), editing = ref<Debt | null>(null)
const paymentOpen = ref(false), paying = ref<Debt | null>(null)
function pay(record: Debt) { paying.value = record; paymentOpen.value = true }
const adjustmentOpen = ref(false), adjusting = ref<Debt | null>(null)
function adjust(debt: Debt) { adjusting.value=debt; adjustmentOpen.value=true }
const events = (debt: Debt) => store.balanceEvents.filter(e => e.debtId===debt.id).slice().sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt))
async function reverse(id:string) {
  if(!confirm('Reverse this latest balance adjustment? Its history is retained.')) return
  try { await localRepository.undoAdjustment(id); store.notify('Balance adjustment reversed.') } catch(reason) { store.fail(errorMessage(reason)) }
}
const total = computed(() => sum(store.debts.map(d => d.balanceCents)))
const planned = computed(() => sum(store.debts.filter(d => d.balanceCents > 0).map(d => d.monthlyPaymentCents ?? d.minimumCents)))
const interest = computed(() => {
  const estimates = store.debts.map(d => d.balanceCents === 0 ? 0 : d.aprMilliPercent === null ? null : monthlyInterest(d.balanceCents, d.aprMilliPercent))
  return { cents: sum(estimates.map(cents => cents ?? 0)), missing: estimates.filter(cents => cents === null).length }
})
function open(record: Debt | null = null) { editing.value = record; editor.value = true }
async function remove(record: Debt) {
  if (!confirm(`Delete ${record.name}? Linked obligations will remain but be unlinked.`)) return
  try { await localRepository.deleteDebt(record.id); store.notify('Debt removed.') }
  catch (e) { store.fail(errorMessage(e, 'Unable to delete debt.')) }
}
</script>
<template>
  <PageHeader label="04 / COMMITMENTS" title="Debts" subtitle="Balances, interest costs, and your repayment plan."><template #actions><button class="button primary" @click="open()">+ Add debt</button></template></PageHeader>
  <div class="metrics-grid three"><MetricCard label="Tracked debt" :value="formatMoney(total)" detail="Sum of saved account balances"/><MetricCard label="Planned monthly payments" :value="formatMoney(planned)" detail="Reference only; not added to plan"/><MetricCard label="Estimated interest / month" :value="interest.missing === store.debts.length && store.debts.length > 0 ? '—' : formatMoney(interest.cents)" :detail="interest.missing ? `Partial estimate · ${interest.missing} account(s) need a rate` : 'First month at your entered rates'" emphasis/></div>
  <p class="fine-print">Saved balances change only through confirmed payments or statement adjustments. Dated estimates use each account’s reference date and selected method; nominal monthly payoff forecasts use APR ÷ 12. Both are planning estimates without lender grace periods, compounding or new fees.</p><div class="debt-card-grid">
    <article v-for="debt in [...store.debts].sort((a,b) => Number(a.balanceCents === 0) - Number(b.balanceCents === 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))" :key="debt.id" class="panel debt-card">
      <div class="panel-heading"><div><span class="eyebrow">LIABILITY</span><h2>{{ debt.name }}</h2></div><button class="text-link" @click="open(debt)">Edit ↗</button></div>
      <div class="debt-balance mono">{{ formatMoney(debt.balanceCents) }}</div><p class="muted small-text">Saved balance · payments + statement updates</p>
      <p v-if="debt.startingBalanceCents !== null && debt.balanceCents > debt.startingBalanceCents" class="small-text negative-text">{{ formatMoney(debt.balanceCents - debt.startingBalanceCents) }} above starting balance</p>
      <div v-if="debtProgress(debt) !== null" class="meter-block"><div class="meter-annotation"><span>Paid off from starting balance</span><strong>{{ debtProgress(debt) }}%</strong></div><div class="small-meter"><span :style="{ width: `${debtProgress(debt)}%` }" /></div></div>
      <div class="debt-facts"><div><span>Minimum</span><strong class="mono">{{ formatMoney(debt.minimumCents) }}</strong></div><div><span>Planned monthly payment{{ debt.monthlyPaymentCents === null ? ' · minimum' : '' }}</span><strong class="mono">{{ formatMoney(debt.monthlyPaymentCents ?? debt.minimumCents) }}</strong></div><div><span>Annual rate</span><strong class="mono">{{ debt.aprMilliPercent === null ? '—' : `${debt.aprMilliPercent / 1000}%` }}</strong></div></div>
      <button v-if="debt.aprMilliPercent === null && debt.balanceCents > 0" class="text-link" @click="open(debt)">Add rate ↗</button><template v-if="debt.balanceCents > 0"><DebtAccrual :debt="debt" :today="store.today" /><DebtForecast :debt="debt" /></template><p v-else class="good-text">Paid off · saved balance is zero</p>
      <button v-if="debt.balanceCents > 0" class="button primary small" @click="pay(debt)">Record payment</button>
      <button class="button small" @click="adjust(debt)">Adjust balance</button>
      <details class="balance-history"><summary>Balance adjustment history · {{ events(debt).length }}</summary><div v-for="event in events(debt)" :key="event.id" class="balance-history-entry"><strong>{{ event.kind }} · {{ event.date }}{{ event.reversedAt ? ' · reversed' : '' }}</strong><p>{{ formatMoney(event.balanceBeforeCents) }} → {{ formatMoney(event.balanceAfterCents) }}</p><p>{{ event.note }}</p><small>{{ event.recordedAt }}</small><button v-if="!event.reversedAt" class="text-link" :aria-label="`Reverse ${event.kind} from ${event.date}`" @click="reverse(event.id)">Reverse adjustment</button></div><p v-if="!events(debt).length" class="form-hint">No balance adjustments recorded. Confirmed payments and their splits are in the Ledger.</p></details>
      <button class="text-link danger-link" @click="remove(debt)">Delete debt</button>
    </article>
    <article v-if="!store.debts.length" class="panel empty-panel"><strong>No tracked debt accounts</strong><p>Add a credit card or loan balance when you're ready. Planned debt payments are tracked separately in the Monthly Plan.</p></article>
  </div>
  <p class="fine-print">Forecasts update from your saved balance and payment plan. Record payment applies the balance reduction you confirm and adds one Ledger entry. Update balances from statements to reconcile charges and adjustments.</p>
  <BalanceAdjustment v-model="adjustmentOpen" :debt="adjusting" />
  <DebtForm v-model="editor" :record="editing" />
  <PaymentForm v-model="paymentOpen" :debt="paying" />
</template>
