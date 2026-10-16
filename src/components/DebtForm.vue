<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import DebtForecast from './DebtForecast.vue'
import { parseAnnualRate } from '../domain/debt'
import { localRepository } from '../data/repository'
import { parseMoney } from '../domain/finance'
import type { Debt } from '../domain/models'
import { useFinanceStore } from '../stores/finance'
const dialogElement = ref<HTMLDialogElement | null>(null)
const props = defineProps<{ modelValue: boolean; record?: Debt | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const store = useFinanceStore()
const busy = ref(false), error = ref('')
const form = reactive({ name: '', balance: '', starting: '', minimum: '', apr: '', payment: '' })
const calculation = computed(() => {
  const balanceCents = parseMoney(form.balance), minimumCents = parseMoney(form.minimum)
  const monthlyPaymentCents = form.payment.trim() === '' ? null : parseMoney(form.payment)
  const aprBasisPoints = parseAnnualRate(form.apr)
  if (balanceCents === null || minimumCents === null || (form.payment.trim() !== '' && monthlyPaymentCents === null) ||
    (form.apr.trim() !== '' && aprBasisPoints === null)) return null
  return { balanceCents, minimumCents, monthlyPaymentCents, aprBasisPoints }
})
watch(() => [props.modelValue, props.record] as const, () => {
  if (!props.modelValue) return
  form.name = props.record?.name ?? ''
  form.balance = props.record ? (props.record.balanceCents / 100).toFixed(2) : ''
  form.starting = props.record?.startingBalanceCents == null ? '' : (props.record.startingBalanceCents / 100).toFixed(2)
  form.minimum = props.record ? (props.record.minimumCents / 100).toFixed(2) : '0.00'
  form.apr = props.record?.aprBasisPoints == null ? '' : (props.record.aprBasisPoints / 100).toFixed(2)
  form.payment = props.record?.monthlyPaymentCents == null ? '' : (props.record.monthlyPaymentCents / 100).toFixed(2)
  error.value = ''
}, { immediate: true })
watch(() => props.modelValue, async open => {
  await nextTick()
  if (open && !dialogElement.value?.open) dialogElement.value?.showModal()
  if (!open && dialogElement.value?.open) dialogElement.value.close()
}, { immediate: true })
async function submit() {
  if (busy.value) return
  const startingBalanceCents = form.starting ? parseMoney(form.starting) : null
  if (form.name.trim().length < 2 || calculation.value === null || (form.starting && startingBalanceCents === null)) {
    error.value = 'Check the balance, payments, and annual rate (0–1000%, up to two decimals).'; return
  }
  busy.value = true
  try {
    await localRepository.saveDebt({ name: form.name.trim(), startingBalanceCents, ...calculation.value }, props.record?.id, props.record?.updatedAt)
    emit('update:modelValue', false)
    store.notify(props.record ? 'Debt updated.' : 'Debt added.')
  } catch (e) { error.value = e instanceof Error ? e.message : 'Unable to save debt.' }
  finally { busy.value = false }
}
</script>
<template>
  <dialog ref="dialogElement" class="modal-panel native-dialog" @cancel="busy && $event.preventDefault()" aria-label="Debt" @close="emit('update:modelValue', false)">
      <div class="modal-heading"><h2>{{ record ? 'Edit debt' : 'Add a debt' }}</h2><button class="icon-button" aria-label="Close" :disabled="busy" @click="emit('update:modelValue', false)">✕</button></div>
      <form @submit.prevent="submit">
        <label>Name<input v-model="form.name" required maxlength="100" placeholder="Personal loan, credit card…" /></label>
        <label>Current balance (USD)<input v-model="form.balance" required inputmode="decimal" placeholder="1500.00" /></label>
        <label>Starting balance (optional)<input v-model="form.starting" inputmode="decimal" placeholder="2500.00" /></label>
        <label>Minimum payment (USD)<input v-model="form.minimum" required inputmode="decimal" placeholder="45.00" /></label>
        <label>Annual interest rate % (optional)<input v-model="form.apr" inputmode="decimal" placeholder="17.00" aria-describedby="debt-rate-hint" /></label>
        <p id="debt-rate-hint" class="form-hint">Use APR for credit cards; use the interest rate for loans (loan APR can include fees). Enter 0 for interest-free accounts.</p>
        <label>Planned monthly payment (USD, optional)<input v-model="form.payment" inputmode="decimal" placeholder="Uses minimum payment if blank" /></label>
        <p class="form-hint">Blank uses the saved minimum, held constant for this estimate. A saved 0 means no payment.</p>
        <DebtForecast v-if="calculation" :debt="calculation" compact />
        <p v-else class="form-hint">Enter a valid balance, minimum, and optional payment/rate to preview calculations.</p>
        <p class="form-hint">Forecasts update automatically. Update your saved balance from your statement; estimates do not post payments or interest charges.</p>
        <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        <div class="modal-actions"><button type="button" class="button" :disabled="busy" @click="emit('update:modelValue', false)">Cancel</button><button class="button primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save debt' }}</button></div>
      </form>
  </dialog>
</template>
