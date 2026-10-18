<script setup lang="ts">
import { useRouteMonth } from '../composables/routeContext'
import { errorMessage } from '../domain/errors'
import { computed, ref, watch } from 'vue'
import { compareTransactions, matchingTotals, ledgerCsv, transactionKindLabel, formatRecordedAt } from '../domain/ledger'
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
const route = useRouteMonth()
const editor = ref(false), editing = ref<Transaction | null>(null), query = ref('')
const scope = ref('month'), kind = ref('all'), selectedId = ref<string | null>(null)
const page = ref(0), pageSize = 50
const allTransactions = computed(() => [...store.transactions].sort(compareTransactions))
const inspected = computed(() => store.transactions.find(t => t.id === selectedId.value) ?? null)
const rows = computed(() => (scope.value === 'month' ? store.monthTransactions : allTransactions.value).filter(t => (kind.value === 'all' || (kind.value === 'outflow' ? t.kind !== 'income' : t.kind === kind.value)) &&
  `${t.name} ${t.account} ${t.category}`.toLowerCase().includes(query.value.toLowerCase())))
watch(() => route.query, params => {
  scope.value = params.scope === 'all' ? 'all' : 'month'
  kind.value = ['income', 'expense', 'debt-payment', 'outflow'].includes(String(params.kind)) ? String(params.kind) : 'all'
  query.value = typeof params.q === 'string' ? params.q.slice(0, 100) : ''
}, { immediate: true })
const matching = computed(() => matchingTotals(rows.value, store.today))
const filtered = computed(() => kind.value !== 'all' || !!query.value)
const scopeLabel = computed(() => scope.value === 'all' ? 'All time' : store.month)
const emptyMessage = computed(() => filtered.value ? 'No transactions match these filters.' : scope.value === 'all' ? 'No recorded activity in your history.' : `No recorded activity in ${store.month}.`)
function clearFilters() { kind.value = 'all'; query.value = '' }
const pageCount = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize)))
const visibleRows = computed(() => rows.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
watch([query, scope, kind, () => store.month], () => { page.value = 0 })
watch(pageCount, count => { page.value = Math.min(page.value, count - 1) })
watch(visibleRows, current => { if (!current.some(t => t.id === selectedId.value)) selectedId.value = null })
function exportCsv() { downloadFile(`Accrynt-ledger-${scope.value === 'month' ? store.month : 'all-time'}.csv`, ledgerCsv(rows.value, isDemo), 'text/csv;charset=utf-8') }
function open(record: Transaction | null = null) { editing.value = record; editor.value = true }
async function remove(record: Transaction) {
  if (!confirm(`Delete transaction "${record.name}"? This cannot be undone except by restoring a backup.`)) return
  try { await localRepository.deleteTransaction(record.id); store.notify('Transaction deleted.') }
  catch (e) { store.fail(errorMessage(e, 'Unable to delete transaction.')) }
}
async function undo(record: Transaction) {
  if (!confirm(`Undo payment "${record.name}"? This removes the Ledger entry, recalculates the linked bill status, and restores the prior debt balance if the original debt still exists. Newer debt balance events must be undone first. Any separate manual paid mark is kept.`)) return
  try { await localRepository.undoPayment(record.id, record.updatedAt); store.notify('Payment undone. Linked totals refreshed.') }
  catch (reason) { store.fail(errorMessage(reason, 'Unable to undo payment.')) }
}
</script>
<template>
  <PageHeader label="03 / REAL ACTIVITY" title="Ledger" subtitle="Actual money movements you have manually recorded." month-navigation><template #actions><button class="button primary" @click="open()">+ Record transaction</button></template></PageHeader>
  <p class="fine-print">Monthly actuals · {{ store.month }} · dated through {{ store.today }}. Table filters do not change these totals.</p>
  <div class="metrics-grid three">
    <MetricCard label="Recorded income" :value="formatMoney(store.summary.actualIncomeCents)" detail="Actual income transactions" />
    <MetricCard label="Recorded outflow" :value="formatMoney(store.summary.actualOutflowCents)" detail="Expense + debt-payment transactions" />
    <MetricCard label="Actual net" :value="formatMoney(store.summary.actualNetCents)" detail="Income less outflow recorded" emphasis :negative="store.summary.actualNetCents < 0" />
  </div>
  <div class="ledger-workbench"><section class="panel"><div class="panel-heading"><div><span class="eyebrow">ENTRIES</span><h2>Transactions</h2></div><button class="button small" :disabled="!rows.length" @click="exportCsv">Export CSV</button></div>
    <div class="table-controls"><select v-model="scope" aria-label="Ledger period"><option value="month">Selected month</option><option value="all">All time</option></select><select v-model="kind" aria-label="Transaction type"><option value="all">All types</option><option value="income">Income</option><option value="outflow">All outflow</option><option value="expense">Expense</option><option value="debt-payment">Debt payments</option></select><input v-model="query" aria-label="Search transactions" placeholder="Search transactions…"/></div>
    <div class="matching-summary" role="status"><strong>{{ scopeLabel }} · {{ rows.length }} matching entries</strong><span>Actual through {{ store.today }} · {{ matching.actual.count }} entries · Income {{ formatMoney(matching.actual.income) }} · Outflow {{ formatMoney(matching.actual.outflow) }} · Net {{ formatMoney(matching.actual.net) }}</span><span v-if="matching.scheduled.count">Scheduled · {{ matching.scheduled.count }} entries · Income {{ formatMoney(matching.scheduled.income) }} · Outflow {{ formatMoney(matching.scheduled.outflow) }} · Net {{ formatMoney(matching.scheduled.net) }} · excluded from actuals</span><small>CSV exports all matching rows, including scheduled entries.</small><button v-if="filtered" class="text-link" @click="clearFilters">Clear filters</button></div>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Transactions table"><table class="data-table ledger-table"><caption class="sr-only">Recorded transactions</caption><thead><tr><th>Date</th><th>Description</th><th>Type</th><th>Account</th><th class="number">Amount</th><th>Actions</th></tr></thead><tbody>
      <tr v-for="record in visibleRows" :key="record.id" :class="{ 'selected-row': selectedId === record.id }"><td class="mono">{{ record.date }}<small v-if="record.date > store.today" class="cell-sub scheduled-marker">Scheduled · excluded from actuals</small></td><td class="description-cell"><button class="text-link transaction-select" :aria-label="`Inspect ${record.name}`" :aria-pressed="selectedId === record.id" @click="selectedId = selectedId === record.id ? null : record.id">{{ record.name }}</button><small class="cell-sub">{{ record.category }}</small><details v-if="record.payment?.debtId" class="receipt-details"><summary>Payment split</summary><span>{{ record.payment.debtName }} · Principal {{ formatMoney(record.payment.principalCents) }} · Interest {{ formatMoney(record.payment.interestCents) }}{{ record.payment.interestIncludedInBalance ? ' (already in balance)' : '' }} · Balance {{ formatMoney(record.payment.balanceBeforeCents!) }} → {{ formatMoney(record.payment.balanceAfterCents!) }}</span></details></td><td>{{ transactionKindLabel[record.kind] }}</td><td>{{ record.account || '—' }}</td><td class="number mono" :class="record.kind === 'income' ? 'good-text' : ''">{{ record.kind === 'income' ? '+' : '−' }}{{ formatMoney(record.amountCents) }}</td><td class="action-cell"><div class="row-actions"><button v-if="record.payment" class="text-link danger-link" :aria-label="`Undo payment ${record.name}`" @click="undo(record)">Undo payment</button><template v-else><button class="text-link" :aria-label="`Edit ${record.name}`" @click="open(record)">Edit</button><button class="text-link danger-link" :aria-label="`Delete ${record.name}`" @click="remove(record)">Delete</button></template></div></td></tr>
      <tr v-if="!rows.length"><td colspan="6" class="empty-cell">{{ emptyMessage }}</td></tr>
    </tbody></table></div>
    <nav v-if="rows.length > pageSize" class="table-pagination" aria-label="Transaction pages"><span role="status">{{ page * pageSize + 1 }}–{{ Math.min((page + 1) * pageSize, rows.length) }} of {{ rows.length }} matching entries</span><div class="page-actions"><button class="button small" :disabled="page === 0" @click="page--">Previous entries</button><button class="button small" :disabled="page + 1 >= pageCount" @click="page++">Next entries</button></div><small>CSV exports all matching entries.</small></nav>
    <p class="fine-print">Connected payments retain their confirmed split. Undo a payment before correcting it; if its debt has since changed, reconcile or undo newer payments first. Other Ledger entries can be edited normally.</p>
  </section>
    <aside class="panel ledger-inspector" tabindex="-1" aria-label="Transaction inspector" @keydown.esc="selectedId = null">
      <div class="panel-heading"><div><span class="eyebrow">RECORD DETAILS</span><h2>{{ inspected ? 'Transaction' : 'Inspect activity' }}</h2></div><button v-if="inspected" class="button small" aria-label="Close transaction inspector" @click="selectedId = null">Close</button></div>
      <template v-if="inspected"><h3>{{ inspected.name }}</h3><dl class="debt-facts"><div><dt>Date</dt><dd>{{ inspected.date }}{{ inspected.date > store.today ? ' · scheduled' : '' }}</dd></div><div><dt>Amount</dt><dd class="mono">{{ formatMoney(inspected.amountCents) }}</dd></div><div><dt>Category</dt><dd>{{ inspected.category }}</dd></div><div><dt>Account label</dt><dd>{{ inspected.account || 'Not provided' }}</dd></div><div v-if="inspected.kind === 'income'"><dt>Scheduled income link</dt><dd>{{ store.recurringOccurrences.find(o => o.id === inspected!.incomeOccurrenceId)?.name || 'Unlinked deposit' }}</dd></div><div><dt>Linked bill</dt><dd>{{ store.obligations.find(o => o.id === inspected!.obligationId)?.name || 'None' }}</dd></div></dl>
        <template v-if="inspected.payment?.debtId"><h3>Confirmed payment split</h3><dl class="debt-facts"><div><dt>Debt at payment</dt><dd>{{ inspected.payment.debtName }}</dd></div><div><dt>Principal</dt><dd>{{ formatMoney(inspected.payment.principalCents) }}</dd></div><div><dt>Interest</dt><dd>{{ formatMoney(inspected.payment.interestCents) }}</dd></div><div><dt>Balance before → after</dt><dd>{{ formatMoney(inspected.payment.balanceBeforeCents!) }} → {{ formatMoney(inspected.payment.balanceAfterCents!) }}</dd></div><div><dt>Recorded at</dt><dd><time :datetime="inspected.payment.recordedAt" :title="inspected.payment.recordedAt">{{ formatRecordedAt(inspected.payment.recordedAt) }}</time></dd></div></dl><button class="button danger-button" @click="undo(inspected)">Undo selected payment</button></template>
        <button v-else class="button" @click="open(inspected)">Edit selected transaction</button>
        <p class="fine-print">Saved receipt values are historical. Later changes to a debt or bill do not rewrite this record.</p>
      </template><p v-else class="body-copy">Select a transaction description to inspect its account, linked bill and confirmed payment split.</p>
    </aside></div>
  <TransactionForm v-model="editor" :record="editing" />
</template>
