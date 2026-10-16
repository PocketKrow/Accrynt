<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { localRepository } from '../data/repository'
import { parseMoney } from '../domain/finance'
import { categorySchema, type Transaction, type TransactionKind, type Category } from '../domain/models'
import { useFinanceStore } from '../stores/finance'
const dialogElement = ref<HTMLDialogElement | null>(null)
const props = defineProps<{ modelValue: boolean; record?: Transaction | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const store = useFinanceStore()
const busy = ref(false), error = ref('')
const form = reactive({ date: '', name: '', kind: 'expense' as TransactionKind, category: 'Other' as Category, amount: '', account: '', obligationId: '' })
watch(() => [props.modelValue, props.record] as const, () => {
  if (!props.modelValue) return
  form.date = props.record?.date ?? (() => { const local = new Date(); const today = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`; return today.startsWith(store.month) ? today : `${store.month}-01` })()
  form.name = props.record?.name ?? ''
  form.kind = props.record?.kind ?? 'expense'
  form.category = props.record?.category ?? 'Other'
  form.amount = props.record ? (props.record.amountCents / 100).toFixed(2) : ''
  form.account = props.record?.account ?? ''
  form.obligationId = props.record?.obligationId ?? ''
  error.value = ''
}, { immediate: true })
watch(() => props.modelValue, async open => {
  await nextTick()
  if (open && !dialogElement.value?.open) dialogElement.value?.showModal()
  if (!open && dialogElement.value?.open) dialogElement.value.close()
}, { immediate: true })
async function submit() {
  const amountCents = parseMoney(form.amount)
  if (amountCents === null || amountCents <= 0 || form.name.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
    error.value = 'Enter a description, valid date, and amount greater than zero.'; return
  }
  busy.value = true
  try {
    await localRepository.saveTransaction({ date: form.date, name: form.name.trim(), kind: form.kind,
      category: form.kind === 'debt-payment' ? 'Debt payments' : form.category,
      amountCents, account: form.account.trim(), obligationId: form.obligationId || null }, props.record?.id)
    emit('update:modelValue', false)
    store.notify(props.record ? 'Transaction updated.' : 'Transaction recorded.')
  } catch (e) { error.value = e instanceof Error ? e.message : 'Unable to save transaction.' }
  finally { busy.value = false }
}
</script>
<template>
  <dialog ref="dialogElement" class="modal-panel native-dialog" aria-label="Transaction" @close="emit('update:modelValue', false)">
      <div class="modal-heading"><h2>{{ record ? 'Edit transaction' : 'Record a transaction' }}</h2><button class="icon-button" aria-label="Close" @click="emit('update:modelValue', false)">✕</button></div>
      <form @submit.prevent="submit">
        <label>Date<input v-model="form.date" type="date" required /></label>
        <label>Description<input v-model="form.name" required maxlength="100" placeholder="Groceries, deposit, credit payment…" /></label>
        <label>Type<select v-model="form.kind"><option value="expense">Expense</option><option value="income">Income</option><option value="debt-payment">Debt payment</option></select></label>
        <label>Amount (USD)<input v-model="form.amount" required inputmode="decimal" placeholder="24.50" /></label>
        <label v-if="form.kind !== 'debt-payment'">Category<select v-model="form.category"><option v-for="category in categorySchema.options" :key="category">{{ category }}</option></select></label>
        <label>Account label (optional)<input v-model="form.account" maxlength="80" placeholder="Checking, cash, etc." /></label>
        <label v-if="form.kind !== 'income' && store.monthObligations.length">Related monthly obligation (optional)
          <select v-model="form.obligationId"><option value="">Not linked</option><option v-for="obligation in store.monthObligations" :key="obligation.id" :value="obligation.id">{{ obligation.name }}</option></select>
        </label>
        <p class="form-hint">A debt payment is recorded as actual outflow once. Debt balances are edited separately until reconciliation is implemented.</p>
        <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        <div class="modal-actions"><button type="button" class="button" @click="emit('update:modelValue', false)">Cancel</button><button class="button primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save transaction' }}</button></div>
      </form>
  </dialog>
</template>
