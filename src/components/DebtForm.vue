<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { localRepository } from '../data/repository'
import { parseMoney } from '../domain/finance'
import type { Debt } from '../domain/models'
import { useFinanceStore } from '../stores/finance'
const dialogElement = ref<HTMLDialogElement | null>(null)
const props = defineProps<{ modelValue: boolean; record?: Debt | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const store = useFinanceStore()
const busy = ref(false), error = ref('')
const form = reactive({ name: '', balance: '', starting: '', minimum: '', apr: '' })
watch(() => [props.modelValue, props.record] as const, () => {
  if (!props.modelValue) return
  form.name = props.record?.name ?? ''
  form.balance = props.record ? (props.record.balanceCents / 100).toFixed(2) : ''
  form.starting = props.record?.startingBalanceCents == null ? '' : (props.record.startingBalanceCents / 100).toFixed(2)
  form.minimum = props.record ? (props.record.minimumCents / 100).toFixed(2) : '0.00'
  form.apr = props.record?.aprBasisPoints == null ? '' : (props.record.aprBasisPoints / 100).toFixed(2)
  error.value = ''
}, { immediate: true })
watch(() => props.modelValue, async open => {
  await nextTick()
  if (open && !dialogElement.value?.open) dialogElement.value?.showModal()
  if (!open && dialogElement.value?.open) dialogElement.value.close()
}, { immediate: true })
async function submit() {
  if (busy.value) return
  const balanceCents = parseMoney(form.balance)
  const startingBalanceCents = form.starting ? parseMoney(form.starting) : null
  const minimumCents = parseMoney(form.minimum)
  const apr = form.apr.trim() === '' ? null : Number(form.apr)
  if (form.name.trim().length < 2 || balanceCents === null || minimumCents === null || (form.starting && startingBalanceCents === null) ||
    (apr !== null && (!/^\d{1,4}(?:\.\d{1,2})?$/.test(form.apr.trim()) || !Number.isFinite(apr) || apr < 0 || apr > 1000))) {
    error.value = 'Check the balance, minimum payment, and optional APR.'; return
  }
  busy.value = true
  try {
    await localRepository.saveDebt({ name: form.name.trim(), balanceCents, startingBalanceCents, minimumCents,
      aprBasisPoints: apr === null ? null : Math.round(apr * 100) }, props.record?.id, props.record?.updatedAt)
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
        <label>APR % (optional)<input v-model="form.apr" inputmode="decimal" placeholder="17.00" /></label>
        <p class="form-hint">Balances are manually maintained; no automatic interest calculation or balance reduction occurs.</p>
        <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        <div class="modal-actions"><button type="button" class="button" :disabled="busy" @click="emit('update:modelValue', false)">Cancel</button><button class="button primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save debt' }}</button></div>
      </form>
  </dialog>
</template>
