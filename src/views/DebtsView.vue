<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import DebtForm from '../components/DebtForm.vue'
import { useFinanceStore } from '../stores/finance'
import { formatMoney, sum, debtProgress } from '../domain/finance'
import { localRepository } from '../data/repository'
import type { Debt } from '../domain/models'
const store = useFinanceStore()
const editor = ref(false), editing = ref<Debt | null>(null)
const total = computed(() => sum(store.debts.map(d => d.balanceCents)))
const minimum = computed(() => sum(store.debts.map(d => d.minimumCents)))
function open(record: Debt | null = null) { editing.value = record; editor.value = true }
async function remove(record: Debt) {
  if (!confirm(`Delete ${record.name}? Linked obligations will remain but be unlinked.`)) return
  try { await localRepository.deleteDebt(record.id); store.notify('Debt removed.') }
  catch (e) { store.notify(e instanceof Error ? e.message : 'Unable to delete debt.') }
}
</script>
<template>
  <PageHeader label="04 / COMMITMENTS" title="Debts" subtitle="Balances and minimums you control, without guessed repayment projections."><template #actions><button class="button primary" @click="open()">+ Add debt</button></template></PageHeader>
  <div class="metrics-grid three"><MetricCard label="Tracked debt" :value="formatMoney(total)" detail="Sum of manually entered balances"/><MetricCard label="Monthly minimums" :value="formatMoney(minimum)" detail="Reference only; not added to plan"/><MetricCard label="Debt accounts" :value="String(store.debts.length)" detail="Separately tracked debt records" emphasis/></div>
  <div class="debt-card-grid">
    <article v-for="debt in store.debts" :key="debt.id" class="panel debt-card">
      <div class="panel-heading"><div><span class="eyebrow">LIABILITY</span><h2>{{ debt.name }}</h2></div><button class="text-link" @click="open(debt)">Edit ↗</button></div>
      <div class="debt-balance mono">{{ formatMoney(debt.balanceCents) }}</div><p class="muted small-text">Current balance · manually maintained</p>
      <div v-if="debtProgress(debt) !== null" class="meter-block"><div class="meter-annotation"><span>Paid off from starting balance</span><strong>{{ debtProgress(debt) }}%</strong></div><div class="small-meter"><span :style="{ width: `${debtProgress(debt)}%` }" /></div></div>
      <div class="debt-facts"><div><span>Minimum</span><strong class="mono">{{ formatMoney(debt.minimumCents) }}</strong></div><div><span>APR</span><strong class="mono">{{ debt.aprBasisPoints === null ? '—' : (debt.aprBasisPoints / 100).toFixed(2) + '%' }}</strong></div></div>
      <button class="text-link danger-link" @click="remove(debt)">Delete debt</button>
    </article>
    <article v-if="!store.debts.length" class="panel empty-panel"><strong>No tracked debt accounts</strong><p>Add a credit card or loan balance when you're ready. October's planned debt payments are already tracked separately in the Monthly Plan.</p></article>
  </div>
  <p class="fine-print">Debt records and planned monthly payments are linked only when you select a debt on an obligation. Balances never decrement automatically in v0.1.</p>
  <DebtForm v-model="editor" :record="editing" />
</template>
