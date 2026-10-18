<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useFinanceStore } from '../stores/finance'
import { formatMoney } from '../domain/finance'
const props = defineProps<{ section: 'tracked' | 'after' | 'committed' | null }>()
const emit = defineEmits<{ close: [] }>()
const store = useFinanceStore(), dialog = ref<HTMLDialogElement | null>(null)
const names = { tracked: 'Tracked available', after: 'After outstanding bills', committed: 'Still committed' }
const money = (n: number | null) => n === null ? 'Unknown · set opening cash' : formatMoney(n)
const outstanding = computed(() => store.monthObligations.filter(o => store.obligationState(o).remainingCents > 0))
const manual = computed(() => store.monthObligations.filter(o => store.obligationState(o).manualReleasedCents > 0))
const ledgerLink = (kind?: string) => ({ path: '/ledger', query: { month: store.month, scope: 'month', ...(kind ? { kind } : {}) } })
const planLink = (filter: string) => ({ path: '/plan', query: { month: store.month, filter } })
watch(() => props.section, async value => { await nextTick(); if (value && !dialog.value?.open) dialog.value?.showModal(); if (!value) dialog.value?.close() })
</script>
<template>
  <dialog ref="dialog" class="modal-panel native-dialog cash-breakdown" aria-label="Cash breakdown" @cancel.prevent="emit('close')" @close="emit('close')">
    <div class="modal-heading"><h2>{{ section ? names[section] : 'Cash breakdown' }}</h2><button class="icon-button" autofocus aria-label="Close cash breakdown" @click="emit('close')">✕</button></div>
    <p class="body-copy">{{ store.month }} · cash entries dated through {{ store.today }}. Future entries are excluded. Opening cash stays in its selected month.</p>
    <details :open="section !== 'committed'" class="details-panel"><summary>Cash calculation</summary><dl class="debt-facts">
      <div><dt>Opening cash</dt><dd>{{ money(store.monthData?.openingCents ?? null) }}</dd></div>
      <div><dt><RouterLink :to="ledgerLink('income')">+ Recorded income · selected month</RouterLink></dt><dd>{{ formatMoney(store.cashflow.receivedCents) }}</dd></div>
      <div><dt><RouterLink :to="ledgerLink('outflow')">− Recorded outflow · selected month</RouterLink></dt><dd>{{ formatMoney(store.cashflow.spentCents) }}</dd></div>
      <div><dt>= Tracked available</dt><dd>{{ money(store.cashflow.trackedCents) }}</dd></div>
      <div><dt>− Outstanding bill remainders</dt><dd>{{ formatMoney(store.cashflow.outstandingCents) }}</dd></div>
      <div><dt>= After outstanding bills</dt><dd>{{ money(store.cashflow.afterBillsCents) }}</dd></div>
    </dl><RouterLink :to="ledgerLink()">View all selected-month Ledger entries (includes scheduled)</RouterLink></details>
    <details :open="section !== 'tracked'" class="details-panel"><summary>Outstanding bills · {{ outstanding.length }} · {{ formatMoney(store.cashflow.outstandingCents) }}</summary>
      <p class="fine-print">Linked payments through {{ store.today }} can satisfy these bills from another month. Their cash movement belongs to the payment date.</p>
      <dl class="debt-facts"><div v-for="bill in outstanding.slice(0, 10)" :key="bill.id"><dt>{{ bill.name }}</dt><dd>{{ formatMoney(store.obligationState(bill).remainingCents) }}</dd></div></dl>
      <p class="fine-print">Showing {{ Math.min(10, outstanding.length) }} of {{ outstanding.length }} outstanding bills.</p><RouterLink :to="planLink('unpaid')">View all outstanding bills · {{ store.month }}</RouterLink>
    </details>
    <details v-if="manual.length" class="details-panel"><summary>Manual paid confirmations · {{ manual.length }}</summary><p class="body-copy">Manual confirmation releases the remaining commitment but records no cash movement. Payments may be tracked elsewhere or recorded without a link; this does not prove a transaction is missing.</p><dl class="debt-facts"><div v-for="bill in manual.slice(0, 10)" :key="bill.id"><dt>{{ bill.name }} · released without linked outflow</dt><dd>{{ formatMoney(store.obligationState(bill).manualReleasedCents) }}</dd></div></dl><p class="fine-print">Showing {{ Math.min(10, manual.length) }} of {{ manual.length }} confirmations.</p><RouterLink :to="planLink('paid')">Review paid bills · {{ store.month }}</RouterLink></details>
  </dialog>
</template>
