<script setup lang="ts">
import { useEditorDraft } from '../composables/editorDraft'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { localRepository } from '../data/repository'
import { monthlyInterest } from '../domain/debt'
import { errorMessage } from '../domain/errors'
import { formatMoney, parseSignedMoney } from '../domain/finance'
import { localDate, newId, type Debt, type BalanceEvent } from '../domain/models'
import { useFinanceStore } from '../stores/finance'
const props = defineProps<{ modelValue: boolean; debt: Debt | null }>()
const emit = defineEmits<{ 'update:modelValue': [value:boolean] }>()
const store = useFinanceStore(), dialog = ref<HTMLDialogElement | null>(null), snapshot = ref<Debt | null>(null)
const busy=ref(false), error=ref(''), requestId=ref('')
const form=reactive({ kind:'statement' as BalanceEvent['kind'], date:'', amount:'', note:'' })
const estimate = computed(() => snapshot.value?.aprMilliPercent == null ? null : monthlyInterest(snapshot.value.balanceCents, snapshot.value.aprMilliPercent))
const amount = computed(() => form.kind === 'interest' ? estimate.value : parseSignedMoney(form.amount))
const resulting = computed(() => snapshot.value && amount.value !== null ? form.kind === 'statement' ? amount.value : snapshot.value.balanceCents+amount.value : null)
watch(() => props.modelValue, async open => {
  if(open) { snapshot.value=props.debt; form.kind='statement'; form.date=localDate(); form.amount=props.debt ? (props.debt.balanceCents/100).toFixed(2):''; form.note=''; error.value=''; requestId.value=newId() }
  await nextTick()
  if(open && !dialog.value?.open) { dialog.value?.showModal(); dialog.value?.querySelector('select')?.focus() }
  if(!open && dialog.value?.open) dialog.value.close()
})
async function submit() {
  if(busy.value || !snapshot.value) return
  if(amount.value === null || resulting.value === null || resulting.value<0 || resulting.value>99999999999) { error.value='Enter an amount that leaves a valid nonnegative balance.'; return }
  busy.value=true; error.value=''
  try {
    await localRepository.adjustDebt({ id: form.kind==='interest' ? `interest:${snapshot.value.id}:${form.date.slice(0,7)}` : requestId.value,
      debtId:snapshot.value.id, expectedUpdatedAt:snapshot.value.updatedAt, kind:form.kind, date:form.date,
      amountCents:amount.value, note:form.note.trim(), period:form.kind==='interest'?form.date.slice(0,7):undefined })
    emit('update:modelValue', false); store.notify('Balance adjustment recorded. No cash Ledger entry was created.')
  } catch(reason) { error.value=errorMessage(reason) } finally { busy.value=false }
}
const draftGuard = useEditorDraft({
  label: 'balance adjustment', open: () => props.modelValue, draft: () => (form), busy,
  save: () => submit(), close: () => { emit('update:modelValue', false) }, element: dialog
})
</script>
<template>
  <dialog ref="dialog" class="modal-panel native-dialog" aria-label="Adjust debt balance" @close="emit('update:modelValue', false)" @cancel.prevent="draftGuard.close()">
    <div class="modal-heading"><h2>Adjust {{ snapshot?.name }}</h2><button class="icon-button" aria-label="Close" :disabled="busy" @click="draftGuard.close()">✕</button></div>
    <form @submit.prevent="submit"><fieldset class="editor-fields" :disabled="busy">
      <label>Adjustment type<select v-model="form.kind"><option value="statement">Match actual statement balance</option><option value="interest" :disabled="snapshot?.interestMethod !== 'monthly'">Post monthly interest estimate</option><option value="fee">Add fee</option><option value="purchase">Add purchase / charge</option><option value="refund">Apply refund / credit</option></select></label>
      <label>Effective date<input v-model="form.date" type="date" required :max="localDate()" :min="snapshot?.balanceAsOf ?? undefined" /></label>
      <label v-if="form.kind!=='interest'">{{ form.kind==='statement' ? 'New statement balance (USD)' : form.kind==='refund' ? 'Refund amount (USD, negative)' : 'Charge amount (USD)' }}<input v-model="form.amount" inputmode="decimal" required /></label>
      <label>Audit note<input v-model="form.note" required minlength="2" maxlength="200" /></label>
      <section class="payment-review" aria-label="Adjustment confirmation"><span class="eyebrow">REVIEW BEFORE POSTING</span><p>Saved balance {{ snapshot ? formatMoney(snapshot.balanceCents) : '—' }} → {{ resulting === null ? '—' : formatMoney(resulting) }}</p>
        <p v-if="form.kind==='interest'" class="body-copy">This posts {{ estimate===null ? 'an unknown amount' : formatMoney(estimate) }} for {{ form.date.slice(0,7) }} using {{ snapshot?.aprMilliPercent == null ? 'unknown APR' : `${(snapshot.aprMilliPercent/1000).toFixed(3)}% ÷ 12` }}, rounded half-up. This planning estimate can differ from your lender's statement. Confirm only if this interest is not already in the saved balance.</p>
        <p class="form-hint">No cash transaction is created. Use Record payment for money paid. Latest balance events can be reversed from history; older events require newer events to be undone first.</p>
      </section>
      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <div class="modal-actions"><button type="button" class="button" :disabled="busy" @click="draftGuard.close()">Cancel</button><button class="button primary" :disabled="busy">Confirm balance adjustment</button></div>
    </fieldset></form>
  </dialog>
</template>
