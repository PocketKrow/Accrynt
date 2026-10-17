<script setup lang="ts">
import { useEditorDraft } from '../composables/editorDraft'
import PaymentForm from './PaymentForm.vue'
import { errorMessage } from '../domain/errors'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { localRepository } from '../data/repository'
import { parseMoney } from '../domain/finance'
import { categorySchema, type Transaction, type TransactionKind, type Category, transactionMonth, localDate, newId } from '../domain/models'
import { useFinanceStore } from '../stores/finance'
const dialogElement = ref<HTMLDialogElement | null>(null)
const props = defineProps<{ modelValue: boolean; record?: Transaction | null; seed?: { name: string; amountCents: number; kind: TransactionKind; incomeOccurrenceId?: string } | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const store = useFinanceStore()
const busy = ref(false), error = ref(''), requestId = ref('')
const connectedOpen = ref(false), connectedSeed = ref<{ date: string; name: string; amount: string; account: string } | null>(null)
const form = reactive({ date: '', name: '', kind: 'expense' as TransactionKind, category: 'Other' as Category, amount: '', account: '', obligationId: '', incomeOccurrenceId: '' })
const relatedObligations = computed(() => store.obligations.filter(item =>
  item.month === transactionMonth(form.date) || item.id === form.obligationId))
watch(() => form.kind, kind => { if (kind === 'income') form.obligationId = ''; else form.incomeOccurrenceId = '' })
const incomeChoices = computed(() => store.recurringOccurrences.filter(o => o.kind === 'income').slice().sort((a,b) => b.month.localeCompare(a.month) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)))
watch(() => [props.modelValue, props.record] as const, () => {
  if (!props.modelValue) return
  requestId.value = newId()
  form.date = props.record?.date ?? (props.seed ? localDate() : (() => { const today = localDate(); return today.startsWith(store.month) ? today : `${store.month}-01` })())
  form.name = props.record?.name ?? props.seed?.name ?? ''
  form.kind = props.record?.kind ?? props.seed?.kind ?? 'expense'
  form.category = props.record?.category ?? 'Other'
  form.amount = props.record || props.seed ? ((props.record?.amountCents ?? props.seed!.amountCents) / 100).toFixed(2) : ''
  form.account = props.record?.account ?? ''
  form.obligationId = props.record?.obligationId ?? ''
  form.incomeOccurrenceId = props.record?.incomeOccurrenceId ?? props.seed?.incomeOccurrenceId ?? ''
  error.value = ''
}, { immediate: true })
watch(() => props.modelValue, async open => {
  await nextTick()
  if (open && !dialogElement.value?.open) dialogElement.value?.showModal()
  if (!open && dialogElement.value?.open) dialogElement.value.close()
}, { immediate: true })
async function chooseType(event: Event) {
  const kind = (event.target as HTMLSelectElement).value
  if (kind !== 'connected') { form.kind = kind as TransactionKind; return }
  // Transfer the current draft to the connected editor; no transaction is written here.
  connectedSeed.value = { date: form.date, name: form.name, amount: form.amount, account: form.account }
  draftGuard.reset()
  emit('update:modelValue', false)
  await nextTick()
  connectedOpen.value = true
}
async function submit() {
  if (busy.value) return
  const amountCents = parseMoney(form.amount)
  if (amountCents === null || amountCents <= 0 || form.name.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    error.value = 'Enter a description, valid date, and amount greater than zero.'; return
  }
  busy.value = true
  try {
    await localRepository.saveTransaction({ date: form.date, name: form.name.trim(), kind: form.kind,
      category: form.kind === 'debt-payment' ? 'Debt payments' : form.category,
      amountCents, account: form.account.trim(), incomeOccurrenceId: form.kind === 'income' ? form.incomeOccurrenceId || null : null, obligationId: form.kind === 'income' ? null : form.obligationId || null }, props.record?.id, props.record?.updatedAt, { requestId: requestId.value })
    emit('update:modelValue', false)
    store.notify(props.record ? 'Transaction updated.' : 'Transaction recorded.')
  } catch (e) { error.value = errorMessage(e, 'Unable to save transaction.') }
  finally { busy.value = false }
}
const draftGuard = useEditorDraft({
  label: 'transaction', open: () => props.modelValue, draft: () => (form), busy,
  save: () => submit(), close: () => { emit('update:modelValue', false) }, element: dialogElement
})
</script>
<template>
  <dialog ref="dialogElement" class="modal-panel native-dialog" @cancel.prevent="draftGuard.close()" aria-label="Transaction" @close="emit('update:modelValue', false)">
      <div class="modal-heading"><h2>{{ record ? 'Edit transaction' : 'Record a transaction' }}</h2><button class="icon-button" aria-label="Close" :disabled="busy" @click="draftGuard.close()">✕</button></div>
      <form @submit.prevent="submit"><fieldset class="editor-fields" :disabled="busy">
        <label>Date<input v-model="form.date" type="date" required /></label>
        <label>Description<input v-model="form.name" required maxlength="100" placeholder="Groceries, deposit, credit payment…" /></label>
        <label>Type<select :value="form.kind" @change="chooseType"><option value="expense">Expense</option><option value="income">Income</option><option v-if="!record" value="connected">Debt payment · update balance</option><option value="debt-payment">Debt outflow only · balance unchanged</option></select></label>
        <label v-if="form.kind === 'income'">Scheduled income link (optional)<select v-model="form.incomeOccurrenceId"><option value="">Unlinked deposit</option><option v-for="item in incomeChoices" :key="item.id" :value="item.id">{{ item.month }} · {{ item.name }}{{ item.cancelled ? ' · skipped plan' : '' }}</option></select></label>
        <p v-if="form.kind === 'income'" class="form-hint">Choose the plan entry this deposit belongs to. Link an existing Ledger deposit here instead of recording it twice. Partial, multiple and extra receipts are allowed. The monthly plan amount stays unchanged.</p>
        <label>Amount (USD)<input v-model="form.amount" required inputmode="decimal" placeholder="24.50" /></label>
        <label v-if="form.kind !== 'debt-payment'">Category<select v-model="form.category"><option v-for="category in categorySchema.options" :key="category">{{ category }}</option></select></label>
        <label>Account label (optional)<input v-model="form.account" maxlength="80" placeholder="Checking, cash, etc." /></label>
        <label v-if="form.kind !== 'income' && relatedObligations.length">Related obligation (optional)
          <select v-model="form.obligationId"><option value="">Not linked</option><option v-for="obligation in relatedObligations" :key="obligation.id" :value="obligation.id">{{ obligation.name }} · {{ obligation.month }}</option></select>
        </label>
        <p class="form-hint">Linked outflow reduces the obligation’s remaining amount. To update debt principal too, use Record payment from Debts or Monthly Plan. This form records Ledger activity only.</p>
        <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        <div class="modal-actions"><button type="button" class="button" :disabled="busy" @click="draftGuard.close()">Cancel</button><button class="button primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save transaction' }}</button></div>
      </fieldset></form>
  </dialog>
  <PaymentForm v-model="connectedOpen" :seed="connectedSeed" />
</template>
