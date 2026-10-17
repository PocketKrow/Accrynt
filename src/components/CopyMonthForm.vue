<script setup lang="ts">
import { useEditorDraft } from '../composables/editorDraft'
import { computed, nextTick, ref, watch } from 'vue'
import { localRepository } from '../data/repository'
import { errorMessage } from '../domain/errors'
import { formatMoney, longMonth, shiftMonth } from '../domain/finance'
import type { MonthPlan } from '../domain/models'
import { useFinanceStore } from '../stores/finance'

const props = defineProps<{ modelValue: boolean; month: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const store = useFinanceStore(), dialog = ref<HTMLDialogElement | null>(null)
let incomeBaseline: MonthPlan | null = null
const busy = ref(false), error = ref(''), copyIncome = ref(false)
const previousMonth = computed(() => props.month === '0001-01' ? null : shiftMonth(props.month, -1))
const source = computed(() => store.months.find(row => row.key === previousMonth.value))
const target = computed(() => store.months.find(row => row.key === props.month))
watch(() => props.modelValue, async open => {
  if (open) { incomeBaseline = target.value ? { ...target.value } : null; copyIncome.value = !target.value && !!source.value?.incomeCents; error.value = '' }
  await nextTick()
  if (open && !dialog.value?.open) dialog.value?.showModal()
  if (!open && dialog.value?.open) dialog.value.close()
})
async function submit() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    await localRepository.copyPreviousMonth(props.month, { copyAdditionalIncome: copyIncome.value, incomeBaseline })
    emit('update:modelValue', false)
    store.notify(copyIncome.value ? 'Previous bills and additional income copied. Opening cash preserved.' : 'Previous bills copied. Existing additional income and opening cash preserved.')
  } catch (reason) { error.value = errorMessage(reason, 'Unable to copy the previous month.') }
  finally { busy.value = false }
}
const draftGuard = useEditorDraft({
  label: 'copy previous month', open: () => props.modelValue, draft: () => ({ copyIncome: copyIncome.value }), busy,
  save: () => submit(), close: () => { emit('update:modelValue', false) }, element: dialog
})
</script>
<template>
  <dialog ref="dialog" class="modal-panel native-dialog" aria-label="Copy previous month" @cancel.prevent="draftGuard.close()" @close="emit('update:modelValue', false)">
    <div class="modal-heading"><h2>Copy previous month</h2><button class="icon-button" aria-label="Close" :disabled="busy" @click="draftGuard.close()">✕</button></div>
    <form @submit.prevent="submit"><fieldset class="editor-fields" :disabled="busy">
      <p class="body-copy">Copy {{ previousMonth ? longMonth(previousMonth) : 'the previous month' }}’s non-recurring bills into {{ longMonth(month) }}. Paid statuses reset; recurring entries stay separate. Opening cash is kept.</p>
      <label class="checkbox-inline"><input v-model="copyIncome" type="checkbox" :disabled="!source" /> Copy additional expected income · {{ formatMoney(source?.incomeCents ?? 0) }}</label>
      <p class="form-hint">{{ copyIncome ? 'Replaces this month’s additional expected income.' : `Keeps this month’s additional expected income at ${formatMoney(target?.incomeCents ?? 0)}, including an explicitly entered zero.` }} Scheduled recurring income is not copied or counted twice.</p>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <div class="modal-actions"><button type="button" class="button" :disabled="busy" @click="draftGuard.close()">Cancel</button><button class="button primary" :disabled="busy || !previousMonth">{{ busy ? 'Copying…' : 'Copy plan' }}</button></div>
    </fieldset></form>
  </dialog>
</template>
