<script setup lang="ts">
import { errorMessage } from '../domain/errors'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useFinanceStore } from '../stores/finance'
import { localRepository } from '../data/repository'
import { parseMoney } from '../domain/finance'
import { categorySchema, type Category, type Obligation } from '../domain/models'
const dialogElement = ref<HTMLDialogElement | null>(null)
const props = defineProps<{ modelValue: boolean; record?: Obligation | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const store = useFinanceStore()
const categories = categorySchema.options
const busy = ref(false)
const error = ref('')
const form = reactive({ name: '', amount: '', category: 'Utilities' as Category, dueDay: '', debtId: '' })
const heading = computed(() => props.record ? 'Edit obligation' : 'Add obligation')
watch(() => [props.modelValue, props.record] as const, () => {
  if (!props.modelValue) return
  form.name = props.record?.name ?? ''
  form.amount = props.record ? (props.record.plannedCents / 100).toFixed(2) : ''
  form.category = props.record?.category ?? 'Utilities'
  form.dueDay = props.record?.dueDay?.toString() ?? ''
  form.debtId = props.record?.debtId ?? ''
  error.value = ''
}, { immediate: true })
watch(() => props.modelValue, async open => {
  await nextTick()
  if (open && !dialogElement.value?.open) dialogElement.value?.showModal()
  if (!open && dialogElement.value?.open) dialogElement.value.close()
}, { immediate: true })
async function submit() {
  if (busy.value) return
  const cents = parseMoney(form.amount)
  const dueDay = form.dueDay ? Number(form.dueDay) : null
  if (cents === null || form.name.trim().length < 2 || (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31))) {
    error.value = 'Enter a valid name, amount, and day (1–31).'; return
  }
  busy.value = true
  try {
    await localRepository.saveObligation({
      month: props.record?.month ?? store.month,
      name: form.name.trim(), plannedCents: cents, category: form.category,
      dueDay, debtId: form.debtId || null, paidAt: props.record?.paidAt ?? null
    }, props.record?.id, props.record?.updatedAt)
    emit('update:modelValue', false)
    store.notify(props.record ? 'Obligation updated.' : 'Obligation added.')
  } catch (e) { error.value = errorMessage(e, 'Unable to save obligation.') }
  finally { busy.value = false }
}
</script>
<template>
  <dialog ref="dialogElement" class="modal-panel native-dialog" @cancel="busy && $event.preventDefault()" :aria-label="heading" @close="emit('update:modelValue', false)">
      <div class="modal-heading"><h2>{{ heading }}</h2><button class="icon-button" aria-label="Close" :disabled="busy" @click="emit('update:modelValue', false)">✕</button></div>
      <form @submit.prevent="submit">
        <label>Obligation name<input v-model="form.name" required maxlength="100" autofocus placeholder="Internet, electricity, loan payment…" /></label>
        <label>Planned amount (USD)<input v-model="form.amount" required inputmode="decimal" placeholder="85.00" /></label>
        <label>Category<select v-model="form.category"><option v-for="category in categories" :key="category">{{ category }}</option></select></label>
        <label>Day due (optional)<input v-model="form.dueDay" type="number" min="1" max="31" placeholder="15" /></label>
        <label v-if="store.debts.length">Linked debt (optional)
          <select v-model="form.debtId"><option value="">None</option><option v-for="debt in store.debts" :key="debt.id" :value="debt.id">{{ debt.name }}</option></select>
        </label>
        <p class="form-hint">This edits only this month’s bill. Use Record payment when money moves; the manual paid checkbox remains available for payments tracked elsewhere.</p>
        <p v-if="error" class="error-message" role="alert">{{ error }}</p>
        <div class="modal-actions"><button type="button" class="button" :disabled="busy" @click="emit('update:modelValue', false)">Cancel</button><button class="button primary" :disabled="busy">{{ busy ? 'Saving…' : 'Save obligation' }}</button></div>
      </form>
  </dialog>
</template>
