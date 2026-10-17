<script setup lang="ts">
import { errorMessage } from '../domain/errors'
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
const interestIncludedInBalance = ref(false)
const choices = computed(() => store.obligations.filter(o => o.debtId === (form.debtId || null)))
// Refresh version snapshots without overwriting a draft the user is typing.
const edited = reactive({ name: false, amount: false, interest: false, inclusion: false })
let initializing = false
function capture(seed = false, debtChanged = false) {
  debtSnapshot.value = store.debts.find(d => d.id === form.debtId) ?? null
  billSnapshot.value = store.obligations.find(o => o.id === form.obligationId) ?? null
  const debt = debtSnapshot.value, bill = billSnapshot.value
  const period = form.date.slice(0,7)
  const posted = debt ? store.balanceEvents.find(e => e.debtId===debt.id && e.kind==='interest' && e.period===period && !e.reversedAt) : null
  if(seed || debtChanged) interestIncludedInBalance.value = !!posted
  const previousInterest = debt && store.transactions.some(t => t.payment?.debtId===debt.id && t.date.slice(0,7)===period)
  const allocated = posted ? store.transactions.filter(t => t.payment !== null && t.payment.debtId===posted.debtId && t.payment.recordedAt>posted.recordedAt).reduce((total,t)=>total+t.payment!.interestCents,0) : 0
  const interest = posted ? Math.max(0,posted.deltaCents-allocated) : debt?.aprMilliPercent === 0 ? 0 : previousInterest || debt?.aprMilliPercent == null ? null : monthlyInterest(debt.balanceCents, debt.aprMilliPercent)
  const planned = bill ? obligationPayment(bill, store.transactions, store.today).remainingCents : debt ? debt.monthlyPaymentCents ?? debt.minimumCents : 0
  const max = debt ? debt.balanceCents + (interestIncludedInBalance.value ? 0 : interest ?? 0) : planned
  if (seed || !edited.amount) form.amount = (Math.min(planned, max) / 100).toFixed(2)
  if (seed || debtChanged || !edited.interest) form.interest = debt ? interest === null ? '' : (interest / 100).toFixed(2) : '0.00'
  if (seed || !edited.name) form.name = `Payment · ${bill?.name ?? debt?.name ?? ''}`.slice(0, 100)
}
watch(() => form.debtId, (value, previous) => {
  if (initializing || !props.modelValue) return
  if (!choices.value.some(o => o.id === form.obligationId)) form.obligationId = ''
  // A split belongs to one debt. A different debt needs a fresh interest review.
  if (value !== previous) {
    interestIncludedInBalance.value = false; edited.interest = false
    error.value = 'Debt changed. Review the refreshed interest and payment split before confirming.'
  }
  capture(false, value !== previous)
}, { flush: 'sync' })
watch(() => form.obligationId, () => { if (!initializing && props.modelValue) capture() }, { flush: 'sync' })
watch(() => form.date, () => {
  if (!initializing && props.modelValue) {
    if (!edited.inclusion) interestIncludedInBalance.value = store.balanceEvents.some(e => e.debtId===form.debtId && e.kind==='interest' && e.period===form.date.slice(0,7) && !e.reversedAt)
    capture()
  }
})
watch(interestIncludedInBalance, () => { if (!initializing && props.modelValue && !edited.amount) capture() })
watch(() => props.modelValue, async open => {
  if (open) {
    initializing = true
    requestId.value = newId(); error.value = ''
    edited.name = edited.amount = edited.interest = edited.inclusion = false
    interestIncludedInBalance.value = false
    form.debtId = props.obligation?.debtId ?? props.debt?.id ?? ''
    form.obligationId = props.obligation?.id ?? ''
    form.date = store.month < localDate().slice(0, 7) ? `${store.month}-01` : localDate()
    form.account = ''; capture(true)
    initializing = false
  }
  await nextTick()
  if (open && !dialog.value?.open) (dialog.value?.showModal(), dialog.value?.querySelector<HTMLSelectElement>('select')?.focus())
  if (!open && dialog.value?.open) dialog.value.close()
}, { immediate: true })
const preview = computed(() => {
  const amount = parseMoney(form.amount), interest = debtSnapshot.value ? parseMoney(form.interest) : 0
  if (amount === null || amount <= 0 || interest === null) return { error: 'Enter a payment and the interest paid (0 when appropriate).', split: null }
  try { return { error: '', split: debtSnapshot.value ? paymentSplit(debtSnapshot.value.balanceCents, amount, interest, interestIncludedInBalance.value) : null } }
  catch (reason) { return { error: errorMessage(reason, 'Check the split.'), split: null } }
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
      expectedDebtUpdatedAt: debtSnapshot.value?.updatedAt, expectedObligationUpdatedAt: billSnapshot.value?.updatedAt,
      interestIncludedInBalance: interestIncludedInBalance.value })
    emit('update:modelValue', false); store.notify('Payment recorded. Ledger, debt balance, and linked bill status updated.')
  } catch (reason) { error.value = errorMessage(reason, 'Unable to record payment.') }
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
      <label>Description<input v-model="form.name" @input="edited.name = true" required minlength="2" maxlength="100" /></label>
      <label>Payment amount (USD)<input v-model="form.amount" @input="edited.amount = true" inputmode="decimal" required /></label>
      <template v-if="debtSnapshot">
        <label>Interest included in payment (USD)<input v-model="form.interest" @input="edited.interest = true" inputmode="decimal" required aria-describedby="payment-interest-hint" /></label>
        <p id="payment-interest-hint" class="form-hint">Prefilled from the nominal monthly estimate when a rate is available and no payment was already recorded for this debt in this month. Explicitly posted interest uses the unallocated posted amount and suggests the already-in-balance option. Otherwise, enter the actual interest from your statement. Check your statement and adjust the actual interest paid. A second payment in the same cycle does not imply a second full month of interest. Unpaid interest and fees are not added automatically.</p>
        <label class="checkbox-inline"><input v-model="interestIncludedInBalance" @change="edited.inclusion = true" type="checkbox" /> Interest is already included in saved balance</label>
        <p class="form-hint">Check for a statement balance that includes this interest: the full payment reduces that balance. Otherwise, only principal reduces the saved balance. Review the result below.</p>
      </template>
      <label>Account label (optional)<input v-model="form.account" maxlength="80" placeholder="Checking, cash…" /></label>
      <section v-if="preview.split && debtSnapshot" class="payment-review" aria-label="Payment review">
        <span class="eyebrow">REVIEW BEFORE RECORDING</span>
        <dl class="debt-facts"><div><dt>Interest paid</dt><dd>{{ formatMoney(preview.split.interestCents) }}</dd></div><div><dt>Principal paid</dt><dd>{{ formatMoney(preview.split.principalCents) }}</dd></div><div><dt>Balance reduction</dt><dd>{{ formatMoney(preview.split.balanceReductionCents) }}</dd></div><div><dt>Saved balance</dt><dd>{{ formatMoney(debtSnapshot.balanceCents) }} → {{ formatMoney(preview.split.balanceAfterCents) }}</dd></div></dl>
      </section>
      <p v-if="preview.error" class="form-hint">{{ preview.error }}</p>
      <p class="form-hint">Records one Ledger entry. Linked bill status uses all recorded payments, including partial payments. Expected income and future bills do not move money.</p>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <div class="modal-actions"><button type="button" class="button" :disabled="busy" @click="emit('update:modelValue', false)">Cancel</button><button class="button primary" :disabled="busy">{{ busy ? 'Recording…' : 'Confirm payment' }}</button></div>
    </form>
  </dialog>
</template>
