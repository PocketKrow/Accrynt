<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import ObligationForm from '../components/ObligationForm.vue'
import { useFinanceStore } from '../stores/finance'
import { localRepository } from '../data/repository'
import { formatMoney, parseMoney } from '../domain/finance'
import type { Obligation } from '../domain/models'
const store = useFinanceStore()
const editorOpen = ref(false)
const editing = ref<Obligation | null>(null)
const query = ref('')
const filter = ref<'all' | 'paid' | 'unpaid'>('all')
const incomeDraft = ref('')
const editingIncome = ref(false)
const busy = ref(false)
watch(() => store.month, () => { editingIncome.value = false; incomeDraft.value = '' })
const rows = computed(() => store.monthObligations.filter(r => r.name.toLowerCase().includes(query.value.toLowerCase()) &&
  (filter.value === 'all' || (filter.value === 'paid' ? !!r.paidAt : !r.paidAt))))
function openForm(record: Obligation | null = null) { editing.value = record; editorOpen.value = true }
function startIncome() { incomeDraft.value = ((store.monthData?.incomeCents ?? 0) / 100).toFixed(2); editingIncome.value = true }
async function saveIncome() {
  if (busy.value) return
  const targetMonth = store.month
  const cents = parseMoney(incomeDraft.value)
  if (cents === null) { store.notify('Enter a valid income amount.'); return }
  busy.value = true
  try { await localRepository.saveIncome(targetMonth, cents); editingIncome.value = false; store.notify('Expected income saved.') }
  catch (e) { store.notify(e instanceof Error ? e.message : 'Unable to save income.') }
  finally { busy.value = false }
}
async function toggle(record: Obligation) {
  try { await localRepository.setObligationPaid(record.id, !record.paidAt) }
  catch (e) { store.notify(e instanceof Error ? e.message : 'Unable to update status.') }
}
async function remove(record: Obligation) {
  if (!confirm(`Delete ${record.name} from ${store.month}? Linked ledger entries will stay, but their plan links will be removed.`)) return
  try { await localRepository.deleteObligation(record.id); store.notify('Obligation deleted.') }
  catch (e) { store.notify(e instanceof Error ? e.message : 'Unable to delete.') }
}
async function copyPrevious() {
  if (!confirm('Copy the previous month’s expected income and obligations? Paid statuses will reset.')) return
  try { await localRepository.copyPreviousMonth(store.month); store.notify('Previous plan copied.') }
  catch (e) { store.notify(e instanceof Error ? e.message : 'Cannot copy previous month.') }
}
</script>
<template>
  <PageHeader label="02 / MONTHLY PLAN" title="Monthly plan" subtitle="Expected income, recurring obligations, and completion status." month-navigation>
    <template #actions><button class="button primary" @click="openForm()">+ Add obligation</button></template>
  </PageHeader>
  <div class="metrics-grid three">
    <article class="metric-card"><div class="metric-label">Expected income</div><div class="metric-value mono">{{ formatMoney(store.monthData?.incomeCents ?? 0) }}</div><button class="text-link" @click="startIncome">Edit monthly income ↗</button></article>
    <article class="metric-card"><div class="metric-label">Planned outflow</div><div class="metric-value mono">{{ formatMoney(store.summary.plannedCents) }}</div><p class="metric-detail">{{ store.summary.obligationCount }} obligations</p></article>
    <article class="metric-card metric-emphasis"><div class="metric-label">Unallocated</div><div class="metric-value mono">{{ formatMoney(store.summary.remainingCents) }}</div><p class="metric-detail">Not a verified bank balance</p></article>
  </div>
  <section v-if="editingIncome" class="panel inline-editor"><h2>Expected income for {{ store.month }}</h2><form class="inline-form" @submit.prevent="saveIncome"><label>USD <input v-model="incomeDraft" inputmode="decimal" required /></label><button class="button primary" :disabled="busy">Save</button><button class="button" type="button" @click="editingIncome = false">Cancel</button></form></section>
  <section class="panel">
    <div class="panel-heading"><div><span class="eyebrow">OBLIGATION REGISTER</span><h2>Planned payments</h2></div><button v-if="!store.monthData && !store.monthObligations.length" class="button small" @click="copyPrevious">Copy previous month</button></div>
    <div class="table-controls"><input v-model="query" aria-label="Search obligations" placeholder="Search obligations…" /><select v-model="filter" aria-label="Filter payment status"><option value="all">All statuses</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></select></div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Status</th><th>Obligation</th><th>Category</th><th>Due</th><th class="number">Amount</th><th>Actions</th></tr></thead><tbody>
      <tr v-for="record in rows" :key="record.id"><td><label class="checkbox-label"><input type="checkbox" :checked="!!record.paidAt" :aria-label="`Mark ${record.name} paid`" @change="toggle(record)"/><span>{{ record.paidAt ? 'Paid' : 'Unpaid' }}</span></label></td><td class="weight-medium">{{ record.name }}</td><td>{{ record.category }}</td><td>{{ record.dueDay ?? '—' }}</td><td class="number mono">{{ formatMoney(record.plannedCents) }}</td><td><div class="row-actions"><button class="text-link" @click="openForm(record)">Edit</button><button class="text-link danger-link" @click="remove(record)">Delete</button></div></td></tr>
      <tr v-if="!rows.length"><td colspan="6" class="empty-cell">No matching obligations. Add one to start your monthly plan.</td></tr>
    </tbody></table></div>
    <p class="fine-print">A paid checkbox records your confirmation, not a verified transaction. Actual money movements belong in the Ledger.</p>
  </section>
  <ObligationForm v-model="editorOpen" :record="editing" />
</template>
