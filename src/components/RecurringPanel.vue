<script setup lang="ts">
import { errorMessage } from '../domain/errors'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { localRepository } from '../data/repository'
import { formatMoney, parseMoney, dueDate, incomeReceipt } from '../domain/finance'
import { categorySchema, monthKeySchema, type Category, type Obligation, type RecurringOccurrence, type RecurringRule } from '../domain/models'
import { useFinanceStore } from '../stores/finance'
import TransactionForm from './TransactionForm.vue'

const store = useFinanceStore(), dialog = ref<HTMLDialogElement | null>(null)
const open = ref(false), busy = ref(false), error = ref('')
const editing = ref<RecurringRule | null>(null), occurrence = ref<RecurringOccurrence | null>(null)
const sourceBill = ref<Obligation | null>(null)
const receiptOpen = ref(false), receiptSeed = ref<{ name: string; amountCents: number; kind: 'income'; incomeOccurrenceId: string } | null>(null)
const receipt = (entry: RecurringOccurrence) => incomeReceipt(entry, store.transactions, store.today)
const activeCount = computed(() => store.recurringRules.filter(r => r.enabled).length)
const form = reactive({ name: '', kind: 'bill' as 'bill' | 'income', amount: '', category: 'Utilities' as Category,
  day: '', debtId: '', start: '', end: '', enabled: true })
function edit(rule: RecurringRule | null = null, entry: RecurringOccurrence | null = null) {
  editing.value = rule; occurrence.value = entry; error.value = ''
  sourceBill.value = null
  Object.assign(form, { name: entry?.name ?? rule?.name ?? '', kind: entry?.kind ?? rule?.kind ?? 'bill',
    amount: rule || entry ? ((entry?.amountCents ?? rule!.amountCents) / 100).toFixed(2) : '', category: rule?.category ?? 'Utilities',
    day: (entry?.dueDay ?? rule?.dueDay)?.toString() ?? '', debtId: rule?.debtId ?? '',
    start: rule?.startMonth ?? store.month, end: rule?.endMonth ?? '', enabled: rule?.enabled ?? true })
  open.value = true
}
function repeatBill(bill: Obligation) {
  edit()
  sourceBill.value = bill
  Object.assign(form, { name: bill.name, kind: 'bill', amount: (bill.plannedCents / 100).toFixed(2),
    category: bill.category, day: bill.dueDay?.toString() ?? '', debtId: bill.debtId ?? '', start: bill.month })
}
defineExpose({ repeatBill })
watch(open, async value => { await nextTick(); if (value && !dialog.value?.open) dialog.value?.showModal(); if (!value && dialog.value?.open) dialog.value.close() })
async function submit() {
  if (busy.value) return
  const amount = parseMoney(form.amount), day = form.day === '' ? null : Number(form.day)
  if (amount === null) { error.value = 'Enter a valid amount.'; return }
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) { error.value = 'Choose a day from 1 to 31, or leave it blank.'; return }
  if (!occurrence.value && (form.name.trim().length < 2 || !monthKeySchema.safeParse(form.start).success ||
    (form.end !== '' && (!monthKeySchema.safeParse(form.end).success || form.end < form.start)))) {
    error.value = 'Enter a name and valid start month. The optional end month must be on or after the start.'; return
  }
  busy.value = true; error.value = ''
  try {
    if (occurrence.value) await localRepository.saveExpectedOccurrence(occurrence.value.id, amount, day, occurrence.value.cancelled, occurrence.value.updatedAt)
    else await localRepository.saveRecurringRule({ name: form.name.trim(), kind: form.kind, amountCents: amount,
      category: form.kind === 'income' ? 'Other' : form.category, dueDay: day, debtId: form.kind === 'income' ? null : form.debtId || null,
      startMonth: form.start, endMonth: form.end || null, enabled: form.enabled }, editing.value?.id, editing.value?.updatedAt,
      sourceBill.value ? { id: sourceBill.value.id, expectedUpdatedAt: sourceBill.value.updatedAt } : undefined)
    open.value = false; store.notify(occurrence.value ? 'Expected income updated for this month.' : 'Recurring item saved. Existing monthly entries stay unchanged.')
  } catch (reason) { error.value = errorMessage(reason, 'Unable to save recurring item.') }
  finally { busy.value = false }
}
async function toggleRule(rule: RecurringRule) {
  try { await localRepository.saveRecurringRule({ ...rule, enabled: !rule.enabled }, rule.id, rule.updatedAt) }
  catch (reason) { store.notify(errorMessage(reason, 'Unable to change recurring item.')) }
}
async function skip(entry: RecurringOccurrence) {
  try { await localRepository.saveExpectedOccurrence(entry.id, entry.amountCents, entry.dueDay, !entry.cancelled, entry.updatedAt) }
  catch (reason) { store.notify(errorMessage(reason, 'Unable to update expected income.')) }
}
function receive(entry: RecurringOccurrence) { receiptSeed.value = { name: entry.name, amountCents: receipt(entry).remainingCents || entry.amountCents, kind: 'income', incomeOccurrenceId: entry.id }; receiptOpen.value = true }
</script>
<template>
  <section v-if="store.expectedOccurrences.length" class="panel expected-income-panel">
    <div class="panel-heading"><div><span class="eyebrow">SCHEDULED INCOME · PLAN & RECEIPTS</span><h2>Scheduled income · {{ store.month }}</h2></div></div>
    <div v-for="entry in store.expectedOccurrences" :key="entry.id" class="scheduled-row">
      <div><strong>{{ entry.name }}</strong><small>{{ entry.cancelled ? 'Skipped this month' : entry.dueDay ? `Expected ${dueDate(store.month, entry.dueDay)}` : 'Date not set' }}</small></div>
      <div><strong class="mono">{{ formatMoney(entry.amountCents) }} planned</strong><small>{{ receipt(entry).status }} · {{ formatMoney(receipt(entry).receivedCents) }} received · {{ formatMoney(receipt(entry).remainingCents) }} remaining<span v-if="receipt(entry).scheduledCents"> · {{ formatMoney(receipt(entry).scheduledCents) }} scheduled</span></small></div>
      <div class="row-actions"><button v-if="!entry.cancelled" class="text-link" @click="receive(entry)">{{ receipt(entry).remainingCents ? 'Record receipt' : 'Record extra receipt' }}</button><button class="text-link" @click="edit(null, entry)">Edit this month</button><button class="text-link" @click="skip(entry)">{{ entry.cancelled ? 'Restore this month' : 'Skip this month' }}</button></div>
    </div>
    <p class="fine-print">Plan amounts stay unchanged when receipts arrive. Status uses explicitly linked deposits dated through today. Existing unlinked income stays in actual totals; link it using Edit in Ledger. Skipping changes the plan only and retains receipts.</p>
  </section>
  <details class="panel recurring-panel">
    <summary>Recurring bills &amp; income · {{ activeCount }} active</summary>
    <div class="recurring-content">
      <p class="body-copy">Set up a monthly item once. For an existing bill, use its Repeat monthly action to keep the current entry. Accrynt creates future plan entries when you open an eligible month, including while offline. It never records income or pays bills automatically.</p>
      <button class="button primary" @click="edit()">+ Add recurring item</button>
      <div v-for="rule in store.recurringRules" :key="rule.id" class="scheduled-row">
        <div><strong>{{ rule.name }}</strong><small>{{ rule.kind }} · {{ rule.enabled ? 'Active' : 'Paused' }} · {{ rule.startMonth }}{{ rule.endMonth ? ` to ${rule.endMonth}` : ' onward' }}</small></div>
        <strong class="mono">{{ formatMoney(rule.amountCents) }}</strong><div class="row-actions"><button class="text-link" @click="edit(rule)">Edit recurring item</button><button class="text-link" @click="toggleRule(rule)">{{ rule.enabled ? 'Pause' : 'Resume' }}</button></div>
      </div>
      <p v-if="!store.recurringRules.length" class="empty-copy">No recurring items yet.</p>
      <p class="fine-print">Changes and pauses affect months not generated yet. Edit an existing bill directly in its month, or use Edit this month for scheduled income. Deleting a generated bill skips it for that month; it will not reappear on reload.</p>
    </div>
  </details>
  <dialog ref="dialog" class="modal-panel native-dialog" :aria-label="occurrence ? 'Edit expected income' : 'Recurring item'" @cancel="busy && $event.preventDefault()" @close="open = false">
    <div class="modal-heading"><h2>{{ occurrence ? 'Edit this month’s income' : editing ? 'Edit recurring item' : 'Add recurring item' }}</h2><button class="icon-button" aria-label="Close" :disabled="busy" @click="open = false">✕</button></div>
    <form @submit.prevent="submit">
      <template v-if="!occurrence"><label>Name<input v-model="form.name" required minlength="2" maxlength="100" /></label><label>Recurring type<select v-model="form.kind" :disabled="!!editing || !!sourceBill"><option value="bill">Monthly bill</option><option value="income">Monthly income</option></select></label></template>
      <p v-if="sourceBill" class="form-hint">Keeps {{ sourceBill.name }} as this month’s entry, including its payments. These settings apply to newly generated future months.</p>
      <p v-if="!occurrence && form.kind === 'income' && form.start === store.month && (store.monthData?.incomeCents ?? 0) > 0" class="form-hint">This month already includes {{ formatMoney(store.monthData!.incomeCents) }} of additional expected income. If it represents this same income, adjust Edit additional income after adding the schedule to avoid counting it twice.</p>
      <label>Recurring amount (USD)<input v-model="form.amount" inputmode="decimal" required /></label>
      <label>{{ form.kind === 'income' ? 'Expected day (optional)' : 'Due day (optional)' }}<input v-model="form.day" type="number" min="1" max="31" /></label>
      <p class="form-hint">Days beyond a month’s length use its last day.</p>
      <template v-if="!occurrence">
        <template v-if="form.kind === 'bill'"><label>Category<select v-model="form.category"><option v-for="category in categorySchema.options" :key="category">{{ category }}</option></select></label><label>Linked debt<select v-model="form.debtId"><option value="">None</option><option v-for="debt in store.debts" :key="debt.id" :value="debt.id">{{ debt.name }}</option></select></label></template>
        <label>Start month<input v-model="form.start" :readonly="!!sourceBill" required type="month" min="0001-01" max="9999-12" /></label><label>End month (optional)<input v-model="form.end" type="month" min="0001-01" max="9999-12" /></label>
        <label class="checkbox-inline"><input v-model="form.enabled" type="checkbox" /> Enabled</label>
      </template>
      <p v-else class="form-hint">Changes only {{ occurrence.month }}. The recurring definition and other months stay unchanged.</p>
      <p v-if="error" role="alert" class="error-message">{{ error }}</p>
      <div class="modal-actions"><button type="button" class="button" :disabled="busy" @click="open = false">Cancel</button><button class="button primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save recurring item' }}</button></div>
    </form>
  </dialog>
  <TransactionForm v-model="receiptOpen" :seed="receiptSeed" />
</template>
