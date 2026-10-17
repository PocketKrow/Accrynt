<script setup lang="ts">
import { useEditorDraft } from '../composables/editorDraft'
import { errorMessage } from '../domain/errors'
import { useRoute } from 'vue-router'
import { computed, onMounted, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import ObligationForm from '../components/ObligationForm.vue'
import PaymentForm from '../components/PaymentForm.vue'
import RecurringPanel from '../components/RecurringPanel.vue'
import CopyMonthForm from '../components/CopyMonthForm.vue'
import { useFinanceStore } from '../stores/finance'
import { localRepository } from '../data/repository'
import { formatMoney, parseMoney, dueDate } from '../domain/finance'
import type { MonthPlan, Obligation } from '../domain/models'
const route = useRoute()
const store = useFinanceStore()
let monthBaseline: MonthPlan | null = null
const editorOpen = ref(false)
const editing = ref<Obligation | null>(null)
const paymentOpen = ref(false), paying = ref<Obligation | null>(null)
const recurringPanel = ref<InstanceType<typeof RecurringPanel> | null>(null)
const copyOpen = ref(false), copyTarget = ref(store.month)
const recurringBillIds = computed(() => new Set(store.recurringOccurrences.map(r => r.obligationId)))
const isRecurring = (row: Obligation) => recurringBillIds.value.has(row.id)
const state = (row: Obligation) => store.obligationState(row)
const canCopy = computed(() => store.month !== '0001-01' && store.monthObligations.every(isRecurring))
const linkedDates = computed(() => {
  const result = new Map<string, Set<string>>()
  for (const transaction of store.transactions) {
    if (!transaction.obligationId || transaction.kind === 'income' || transaction.date > store.today) continue
    const dates = result.get(transaction.obligationId)
    if (dates) dates.add(transaction.date)
    else result.set(transaction.obligationId, new Set([transaction.date]))
  }
  return result
})
const crossMonthDates = (row: Obligation) => [...(linkedDates.value.get(row.id) ?? [])].filter(date => !date.startsWith(row.month)).sort().join(', ')
function pay(row: Obligation) { paying.value = row; paymentOpen.value = true }
const query = ref('')
const filter = ref<'all' | 'paid' | 'unpaid'>('all')
const incomeDraft = ref('')
const editingIncome = ref(false)
const busy = ref(false)
watch(() => store.month, () => { editingIncome.value = false; incomeDraft.value = '' })
const rows = computed(() => store.monthObligations.filter(r => r.name.toLowerCase().includes(query.value.toLowerCase()) &&
  (filter.value === 'all' || (filter.value === 'paid' ? state(r).paid : !state(r).paid))))
function openForm(record: Obligation | null = null) { editing.value = record; editorOpen.value = true }
function startIncome() { monthBaseline = store.monthData ? { ...store.monthData } : null; incomeDraft.value = ((store.monthData?.incomeCents ?? 0) / 100).toFixed(2); editingIncome.value = true }
async function saveIncome() {
  if (busy.value) return
  const targetMonth = store.month
  const cents = parseMoney(incomeDraft.value)
  if (cents === null) { store.notify('Enter a valid income amount.'); return }
  busy.value = true
  try { await localRepository.saveIncome(targetMonth, cents, monthBaseline); editingIncome.value = false; store.notify('Expected income saved.') }
  catch (e) { store.fail(errorMessage(e, 'Unable to save income.')) }
  finally { busy.value = false }
}
async function toggle(record: Obligation) {
  try { await localRepository.setObligationPaid(record.id, !record.paidAt) }
  catch (e) { store.fail(errorMessage(e, 'Unable to update status.')) }
}
async function remove(record: Obligation) {
  if (!confirm(`Delete ${record.name} from ${store.month}? Linked ledger entries will stay, but their plan links will be removed.`)) return
  try { await localRepository.deleteObligation(record.id); store.notify('Obligation deleted.') }
  catch (e) { store.fail(errorMessage(e, 'Unable to delete.')) }
}
function copyPrevious() { copyTarget.value = store.month; copyOpen.value = true }
onMounted(() => { if (route.query.setup === 'income') startIncome(); else if (route.query.setup === 'bill') openForm() })
const draftGuard = useEditorDraft({
  label: 'additional expected income', open: () => editingIncome.value, draft: () => incomeDraft.value, busy,
  save: () => saveIncome(), close: () => { editingIncome.value = false }
})
</script>
<template>
  <PageHeader label="02 / MONTHLY PLAN" title="Monthly plan" subtitle="Expected income, recurring obligations, and completion status." month-navigation>
    <template #actions><button class="button primary" @click="openForm()">+ Add obligation</button></template>
  </PageHeader>
  <div class="metrics-grid three">
    <article class="metric-card"><div class="metric-label">Expected income</div><div class="metric-value mono">{{ formatMoney(store.expectedIncomeCents) }}</div><p class="metric-detail">{{ formatMoney(store.expectedIncomeCents - (store.monthData?.incomeCents ?? 0)) }} recurring + {{ formatMoney(store.monthData?.incomeCents ?? 0) }} additional</p><div class="metric-actions"><button class="text-link" @click="!editingIncome && startIncome()" :disabled="editingIncome">Edit additional income ↗</button><button v-if="store.expectedOccurrences.length" class="text-link" @click="recurringPanel?.focusIncome()">Review scheduled income ({{ store.expectedOccurrences.length }}) ↓</button></div></article>
    <article class="metric-card"><div class="metric-label">Planned outflow</div><div class="metric-value mono">{{ formatMoney(store.summary.plannedCents) }}</div><p class="metric-detail">{{ store.summary.obligationCount }} obligations</p></article>
    <article class="metric-card metric-emphasis"><div class="metric-label">Unallocated</div><div class="metric-value mono" :class="{ 'negative-text': store.summary.remainingCents < 0 }">{{ formatMoney(store.summary.remainingCents) }}</div><p class="metric-detail">Not a verified bank balance</p></article>
  </div>
  <section v-if="editingIncome" class="panel inline-editor"><h2>Additional expected income for {{ store.month }}</h2><p class="body-copy">Scheduled recurring income is added separately. Enter only additional income here to avoid counting it twice.</p><form class="inline-form" @submit.prevent="saveIncome"><fieldset class="editor-fields inline-fields" :disabled="busy"><label>USD <input v-model="incomeDraft" inputmode="decimal" required /></label><button class="button primary" :disabled="busy">Save</button><button class="button" type="button" :disabled="busy" @click="draftGuard.close()">Cancel</button></fieldset></form></section>
  <section class="panel">
    <div class="panel-heading"><div><span class="eyebrow">OBLIGATION REGISTER</span><h2>Planned payments</h2></div><button v-if="canCopy" class="button small" @click="copyPrevious">Copy previous month</button></div>
    <div class="table-controls"><input v-model="query" aria-label="Search obligations" placeholder="Search obligations…" /><select v-model="filter" aria-label="Filter payment status"><option value="all">All statuses</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></div>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Planned payments table"><table class="data-table plan-table"><caption class="sr-only">Planned payments for {{ store.month }}</caption><thead><tr><th>Status</th><th>Obligation</th><th>Category</th><th>Due</th><th class="number">Amount</th><th>Actions</th></tr></thead><tbody>
      <tr v-for="record in rows" :key="record.id"><td><label class="checkbox-label"><input type="checkbox" :checked="state(record).paid" :disabled="state(record).paid && !record.paidAt" :aria-label="`Mark ${record.name} paid`" @change="toggle(record)"/><span><span>{{ state(record).status }}</span></span></label></td><td class="description-cell"><strong>{{ record.name }}</strong><button v-if="!isRecurring(record)" class="text-link repeat-action" @click="recurringPanel?.repeatBill(record)">Repeat monthly</button><small v-if="record.paidAt" class="cell-sub">Marked paid manually · no transaction added</small><small v-if="state(record).recordedCents" class="cell-sub">{{ formatMoney(state(record).recordedCents) }} recorded · {{ formatMoney(state(record).remainingCents) }} remaining</small><small v-if="crossMonthDates(record)" class="cell-sub">Includes payments dated {{ crossMonthDates(record) }} · cash belongs to those months</small></td><td>{{ record.category }}</td><td>{{ record.dueDay ? dueDate(record.month, record.dueDay) : '—' }}</td><td class="number mono">{{ formatMoney(record.plannedCents) }}</td><td class="action-cell"><div class="row-actions plan-actions"><span class="payment-slot"><button v-if="!state(record).paid" class="button small" :aria-label="`Record payment ${record.name}`" @click="pay(record)">Record payment</button></span><button class="text-link" :aria-label="`Edit ${record.name}`" @click="openForm(record)">Edit</button><button class="text-link danger-link" :aria-label="`Delete ${record.name}`" @click="remove(record)">Delete</button></div></td></tr>
      <tr v-if="!rows.length"><td colspan="6" class="empty-cell">No matching obligations. Add one to start your monthly plan.</td></tr>
    </tbody></table></div>
    <p class="fine-print">Record payment adds actual outflow once and updates payment status. The checkbox is a manual confirmation for entries tracked elsewhere; it does not record outflow. Payments recorded in the Ledger cannot be unchecked here.</p>
  </section>
  <ObligationForm v-model="editorOpen" :record="editing" />
  <CopyMonthForm v-model="copyOpen" :month="copyTarget" />
  <RecurringPanel ref="recurringPanel" /><PaymentForm v-model="paymentOpen" :obligation="paying" />
</template>
