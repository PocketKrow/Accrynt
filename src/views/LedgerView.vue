<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import TransactionForm from '../components/TransactionForm.vue'
import { useFinanceStore } from '../stores/finance'
import { formatMoney } from '../domain/finance'
import { localRepository } from '../data/repository'
import type { Transaction } from '../domain/models'
const store = useFinanceStore()
const editor = ref(false), editing = ref<Transaction | null>(null), query = ref('')
const rows = computed(() => store.monthTransactions.filter(t =>
  `${t.name} ${t.account} ${t.category}`.toLowerCase().includes(query.value.toLowerCase())))
function open(record: Transaction | null = null) { editing.value = record; editor.value = true }
async function remove(record: Transaction) {
  if (!confirm(`Delete transaction "${record.name}"? This cannot be undone except by restoring a backup.`)) return
  try { await localRepository.deleteTransaction(record.id); store.notify('Transaction deleted.') }
  catch (e) { store.notify(e instanceof Error ? e.message : 'Unable to delete transaction.') }
}
</script>
<template>
  <PageHeader label="03 / REAL ACTIVITY" title="Ledger" subtitle="Actual money movements you have manually recorded." month-navigation><template #actions><button class="button primary" @click="open()">+ Record transaction</button></template></PageHeader>
  <div class="metrics-grid three">
    <MetricCard label="Recorded income" :value="formatMoney(store.summary.actualIncomeCents)" detail="Actual income transactions" />
    <MetricCard label="Recorded outflow" :value="formatMoney(store.summary.actualOutflowCents)" detail="Expense + debt-payment transactions" />
    <MetricCard label="Actual net" :value="formatMoney(store.summary.actualNetCents)" detail="Income less outflow recorded" emphasis :negative="store.summary.actualNetCents < 0" />
  </div>
  <section class="panel"><div class="panel-heading"><div><span class="eyebrow">ENTRIES</span><h2>Transactions</h2></div><span class="muted small-text">{{ rows.length }} recorded</span></div>
    <div class="table-controls"><input v-model="query" aria-label="Search transactions" placeholder="Search transactions…"/></div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Account</th><th class="number">Amount</th><th>Actions</th></tr></thead><tbody>
      <tr v-for="record in rows" :key="record.id"><td class="mono">{{ record.date }}</td><td><strong>{{ record.name }}</strong><small class="cell-sub">{{ record.category }}</small></td><td>{{ record.kind }}</td><td>{{ record.account || '—' }}</td><td class="number mono" :class="record.kind === 'income' ? 'good-text' : ''">{{ record.kind === 'income' ? '+' : '−' }}{{ formatMoney(record.amountCents) }}</td><td><div class="row-actions"><button class="text-link" @click="open(record)">Edit</button><button class="text-link danger-link" @click="remove(record)">Delete</button></div></td></tr>
      <tr v-if="!rows.length"><td colspan="6" class="empty-cell">No recorded activity this month. Start with a transaction when money actually moves.</td></tr>
    </tbody></table></div>
    <p class="fine-print">No bank syncing, account reconciliation, or automatic balance calculation is claimed in v0.1.</p>
  </section>
  <TransactionForm v-model="editor" :record="editing" />
</template>
