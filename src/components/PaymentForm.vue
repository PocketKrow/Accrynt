<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { localRepository } from '../data/repository'
import { monthlyInterest } from '../domain/debt'
import { formatMoney, obligationPayment, parseMoney } from '../domain/finance'
import { localDate, newId, type Debt, type Obligation } from '../domain/models'
import { paymentSplit } from '../domain/payment'
import { useFinanceStore } from '../stores/finance'

const props = defineProps<{ modelValue: boolean; debt?: Debt | null; obligation?: Obligation | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const store = useFinanceStore(), dialog = ref<HTMLDialogElement | null>(null)
const busy = ref(false), error = ref(''), requestId = ref('')
const debtSnapshot = ref<Debt | null>(null), billSnapshot = ref<Obligation | null>(null)
const form = reactive({ debtId: '', obligationId: '', date: '', name: '', amount: '', interest: '', account: '' })
const choices = computed(() => store.obligations.filter(o => o.debtId === (form.debtId || null)))
function capture() {
  debtSnapshot.value = store.debts.find(d => d.id === form.debtId) ?? null
  billSnapshot.value = store.obligations.find(o => o.id === form.obligationId) ?? null
  const debt = debtSnapshot.value, bill = billSnapshot.value
  const interest = debt?.aprBasisPoints == null ? null : monthlyInterest(debt.balanceCents, debt.aprBasisPoints)
  const planned = bill ? obligationPayment(bill, store.transactions).remainingCents : debt ? debt.monthlyPaymentCents ?? debt.minimumCents : 0
  const amount = debt ? Math.min(planned, debt.balanceCents + (interest ?? 0)) : planned
  form.amount = (amount / 100).toFixed(2)
  form.interest = debt ? interest === null ? '' : (interest / 100).toFixed(2) : '0.00'
  form.name = `Payment · ${bill?.name ?? debt?.name ?? ''}`.slice(0, 100)
}
watch(() => form.debtId, () => {
  if (!choices.value.some(o => o.id === form.obligationId)) form.obligationId = ''
  capture()
})
watch(() => form.obligationId, capture)
watch(() => props.modelValue, async open => {
  if (open) {
    requestId.value = newId(); error.value = ''
    form.debtId = props.obligation?.debtId ?? props.debt?.id ?? ''
    form.obligationId = props.obligation?.id ?? ''
    form.date = store.month < localDate().slice(0, 7) ? `${store.month}-01` : localDate()
    form.account = ''; capture()
  }
  await nextTick()
  if (open && !dialog.value?.open) dialog.value?.showModal()
  if (!open && dialog.value?.open) dialog.value.close()
}, { immediate: true })
const preview = computed(() => {
  const amount = parseMoney(form.amount), interest = debtSnapshot.value ? parseMoney(form.interest) : 0
  if (amount === null || amount <= 0 || interest === null) return { error: 'Enter a payment and the interest paid (0 when appropriate).', split: null }
  try { return { error: '', split: debtSnapshot.value ? paymentSplit(debtSnapshot.value.balanceCents, amount, interest) : null } }
  catch (reason) { return { error: reason instanceof Error ? reason.message : 'Check the split.', split: null } }
})
async function submit() {
  if (busy.value) return
  if (form.name.trim().length < 2) { error.value = 'Enter a description with at least two characters.'; return }
  if (preview.value.error) { error.value = preview.value.error; return }
  busy.value = true; error.value = ''
  try {
    await localRepository.recordPayment({ id: requestId.value, date: form.date, name: form.name.trim(),
      amountCents: parseMoney(form.amount)!, interestCents: debtSnapshot.value ? parseMoney(form.interest)! : 0,
      account: form.account.trim(), debtId: form.debtId || null, obligationId: form.obligationId || null,
      expectedDebtUpdatedAt: debtSnapshot.value?.updatedAt, expectedObligationUpdatedAt: billSnapshot.value?.updatedAt })
    emit('update:modelValue', false); store.notify('Payment recorded. Ledger, debt principal, and linked bill status updated.')
  } catch (reason) { error.value = reason instanceof Error ? reason.message : 'Unable to record payment.' }
  finally { busy.value = false }
}
</script>
<template>
  <dialog ref="dialog" class="modal-panel native-dialog" aria-label="Record payment" @cancel="busy && $event.preventDefault()" @close="emit('update:modelValue', false)">
    <div class="modal-heading"><h2>Record payment</h2><button class="icon-button" aria-label="Close" :disabled="busy" @click="emit('update:modelValue', false)">✕</button></div>
    <form @submit.prevent="submit">
      <label>Debt<select v-model="form.debtId"><option value="">Bill only · no debt balance change</option><option v-for="item in store.debts" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
      <label>Related obligation<select v-model="form.obligationId"><option value="">No obligation</option><option v-for="item in choices" :key="item.id" :value="item.id">{{ item.name }} · {{ item.month }}</option></select></label>
      <label>Payment date<input v-model="form.date" required type="date" :max="localDate()" /></label>
      <label>Description<input v-model="form.name" required minlength="2" maxlength="100" /></label>
      <label>Payment amount (USD)<input v-model="form.amount" inputmode="decimal" required /></label>
      <template v-if="debtSnapshot">
        <label>Interest included in payment (USD)<input v-model="form.interest" inputmode="decimal" required aria-describedby="payment-interest-hint" /></label>
        <p id="payment-interest-hint" class="form-hint">Prefilled from the monthly estimate when a rate is available. Check your statement and adjust. Enter 0 if your saved balance already includes the interest being paid; unpaid interest and fees are not added automatically.</p>
      </template>
      <label>Account label (optional)<input v-model="form.account" maxlength="80" placeholder="Checking, cash…" /></label>
      <section v-if="preview.split && debtSnapshot" class="payment-review" aria-label="Payment review">
        <span class="eyebrow">REVIEW BEFORE RECORDING</span>
        <dl class="debt-facts"><div><dt>Interest paid</dt><dd>{{ formatMoney(preview.split.interestCents) }}</dd></div><div><dt>Principal reduction</dt><dd>{{ formatMoney(preview.split.principalCents) }}</dd></div><div><dt>Saved balance</dt><dd>{{ formatMoney(debtSnapshot.balanceCents) }} → {{ formatMoney(preview.split.balanceAfterCents) }}</dd></div></dl>
      </section>
      <p v-if="preview.error" class="form-hint">{{ preview.error }}</p>
      <p class="form-hint">Records one Ledger entry. Linked bill status uses all recorded payments, including partial payments. Expected income and future bills do not move money.</p>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <div class="modal-actions"><button type="button" class="button" :disabled="busy" @click="emit('update:modelValue', false)">Cancel</button><button class="button primary" :disabled="busy">{{ busy ? 'Recording…' : 'Confirm payment' }}</button></div>
    </form>
  </dialog>
</template>
