<script setup lang="ts">
import { errorMessage } from '../domain/errors'
import { computed, ref, watch } from 'vue'
import { compareTransactions, ledgerCsv } from '../domain/ledger'
import { downloadFile } from '../data/backup'
import { isDemo } from '../data/workspace'
import PageHeader from '../components/PageHeader.vue'
import MetricCard from '../components/MetricCard.vue'
import TransactionForm from '../components/TransactionForm.vue'
import { useFinanceStore } from '../stores/finance'
import { formatMoney } from '../domain/finance'
import { localRepository } from '../data/repository'
import type { Transaction } from '../domain/models'
const store = useFinanceStore()
const editor = ref(false), editing = ref<Transaction | null>(null), query = ref('')
const scope = ref('month'), kind = ref('all'), selectedId = ref<string | null>(null)
const inspected = computed(() => store.transactions.find(t => t.id === selectedId.value) ?? null)
const rows = computed(() => (scope.value === 'month' ? store.monthTransactions : [...store.transactions].sort(compareTransactions)).filter(t => (kind.value === 'all' || t.kind === kind.value) &&
  `${t.name} ${t.account} ${t.category}`.toLowerCase().includes(query.value.toLowerCase())))
watch(rows, current => { if (!current.some(t => t.id === selectedId.value)) selectedId.value = null })
function exportCsv() { downloadFile(`Accrynt-ledger-${scope.value === 'month' ? store.month : 'all-time'}.csv`, ledgerCsv(rows.value, isDemo), 'text/csv;charset=utf-8') }
function open(record: Transaction | null = null) { editing.value = record; editor.value = true }
async function remove(record: Transaction) {
  if (!confirm(`Delete transaction "${record.name}"? This cannot be undone except by restoring a backup.`)) return
  try { await localRepository.deleteTransaction(record.id); store.notify('Transaction deleted.') }
  catch (e) { store.notify(errorMessage(e, 'Unable to delete transaction.')) }
}
async function undo(record: Transaction) {
  if (!confirm(`Undo payment "${record.name}"? This removes the Ledger entry, recalculates the linked bill status, and restores the prior debt balance if the original debt still exists. Newer debt balance events must be undone first. Any separate manual paid mark is kept.`)) return
  try { await localRepository.undoPayment(record.id, record.updatedAt); store.notify('Payment undone. Linked totals refreshed.') }
  catch (reason) { store.notify(errorMessage(reason, 'Unable to undo payment.')) }
}
</script>
<template>
  <PageHeader label="03 / REAL ACTIVITY" title="Ledger" subtitle="Actual money movements you have manually recorded." month-navigation><template #actions><button class="button primary" @click="open()">+ Record transaction</button></template></PageHeader>
  <div class="metrics-grid three">
    <MetricCard label="Recorded income" :value="formatMoney(store.summary.actualIncomeCents)" detail="Actual income transactions" />
    <MetricCard label="Recorded outflow" :value="formatMoney(store.summary.actualOutflowCents)" detail="Expense + debt-payment transactions" />
    <MetricCard label="Actual net" :value="formatMoney(store.summary.actualNetCents)" detail="Income less outflow recorded" emphasis :negative="store.summary.actualNetCents < 0" />
  </div>
  <div class="ledger-workbench"><section class="panel"><div class="panel-heading"><div><span class="eyebrow">ENTRIES</span><h2>Transactions</h2></div><button class="button small" :disabled="!rows.length" @click="exportCsv">Export CSV</button></div>
    <div class="table-controls"><select v-model="scope" aria-label="Ledger period"><option value="month">Selected month</option><option value="all">All time</option></select><select v-model="kind" aria-label="Transaction type"><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="debt-payment">Debt payments</option></select><input v-model="query" aria-label="Search transactions" placeholder="Search transactions…"/></div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Account</th><th class="number">Amount</th><th>Actions</th></tr></thead><tbody>
      <tr v-for="record in rows" :key="record.id" :class="{ 'selected-row': selectedId === record.id }"><td class="mono">{{ record.date }}</td><td><button class="text-link transaction-select" :aria-label="`Inspect ${record.name}`" :aria-pressed="selectedId === record.id" @click="selectedId = selectedId === record.id ? null : record.id">{{ record.name }}</button><small class="cell-sub">{{ record.category }}</small><details v-if="record.payment?.debtId" class="receipt-details"><summary>Payment split</summary><span>{{ record.payment.debtName }} · Principal {{ formatMoney(record.payment.principalCents) }} · Interest {{ formatMoney(record.payment.interestCents) }}{{ record.payment.interestIncludedInBalance ? ' (already in balance)' : '' }} · Balance {{ formatMoney(record.payment.balanceBeforeCents!) }} → {{ formatMoney(record.payment.balanceAfterCents!) }}</span></details></td><td>{{ record.kind }}</td><td>{{ record.account || '—' }}</td><td class="number mono" :class="record.kind === 'income' ? 'good-text' : ''">{{ record.kind === 'income' ? '+' : '−' }}{{ formatMoney(record.amountCents) }}</td><td><div class="row-actions"><button v-if="record.payment" class="text-link danger-link" @click="undo(record)">Undo payment</button><template v-else><button class="text-link" @click="open(record)">Edit</button><button class="text-link danger-link" @click="remove(record)">Delete</button></template></div></td></tr>
      <tr v-if="!rows.length"><td colspan="6" class="empty-cell">No recorded activity this month. Start with a transaction when money actually moves.</td></tr>
    </tbody></table></div>
    <p class="fine-print">Connected payments retain their confirmed split. Undo a payment before correcting it; if its debt has since changed, reconcile or undo newer payments first. Other Ledger entries can be edited normally.</p>
  </section>
    <aside class="panel ledger-inspector" tabindex="-1" aria-label="Transaction inspector" @keydown.esc="selectedId = null">
      <div class="panel-heading"><div><span class="eyebrow">RECORD DETAILS</span><h2>{{ inspected ? 'Transaction' : 'Inspect activity' }}</h2></div><button v-if="inspected" class="button small" aria-label="Close transaction inspector" @click="selectedId = null">Close</button></div>
      <template v-if="inspected"><h3>{{ inspected.name }}</h3><dl class="debt-facts"><div><dt>Date</dt><dd>{{ inspected.date }}{{ inspected.date > store.today ? ' · scheduled' : '' }}</dd></div><div><dt>Amount</dt><dd class="mono">{{ formatMoney(inspected.amountCents) }}</dd></div><div><dt>Category</dt><dd>{{ inspected.category }}</dd></div><div><dt>Account label</dt><dd>{{ inspected.account || 'Not provided' }}</dd></div><div><dt>Linked bill</dt><dd>{{ store.obligations.find(o => o.id === inspected!.obligationId)?.name || 'None' }}</dd></div></dl>
        <template v-if="inspected.payment?.debtId"><h3>Confirmed payment split</h3><dl class="debt-facts"><div><dt>Debt at payment</dt><dd>{{ inspected.payment.debtName }}</dd></div><div><dt>Principal</dt><dd>{{ formatMoney(inspected.payment.principalCents) }}</dd></div><div><dt>Interest</dt><dd>{{ formatMoney(inspected.payment.interestCents) }}</dd></div><div><dt>Balance before → after</dt><dd>{{ formatMoney(inspected.payment.balanceBeforeCents!) }} → {{ formatMoney(inspected.payment.balanceAfterCents!) }}</dd></div><div><dt>Recorded at</dt><dd>{{ inspected.payment.recordedAt }}</dd></div></dl><button class="button danger-button" @click="undo(inspected)">Undo selected payment</button></template>
        <button v-else class="button" @click="open(inspected)">Edit selected transaction</button>
        <p class="fine-print">Saved receipt values are historical. Later changes to a debt or bill do not rewrite this record.</p>
      </template><p v-else class="body-copy">Select a transaction description to inspect its account, linked bill and confirmed payment split.</p>
    </aside></div>
  <TransactionForm v-model="editor" :record="editing" />
</template>
