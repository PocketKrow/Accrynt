import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { liveQuery } from 'dexie'
import { db, readWorkspace } from '../data/database'
import { currentMonth, type MonthPlan, type Obligation, type Transaction, type Debt } from '../domain/models'
import { monthlySummary } from '../domain/finance'

const PREF_THEME = 'accrynt-theme-v1'
function loadTheme(): 'light' | 'dark' {
  try { return localStorage.getItem(PREF_THEME) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export const useFinanceStore = defineStore('finance', () => {
  const months = shallowRef<MonthPlan[]>([])
  const obligations = shallowRef<Obligation[]>([])
  const transactions = shallowRef<Transaction[]>([])
  const debts = shallowRef<Debt[]>([])
  const month = ref(currentMonth())
  const theme = ref<'light' | 'dark'>(loadTheme())
  const loaded = ref(false)
  const error = ref('')
  const notice = ref('')
  let subscription: { unsubscribe(): void } | null = null

  const monthData = computed(() => months.value.find(m => m.key === month.value))
  const monthObligations = computed(() => obligations.value.filter(o => o.month === month.value)
    .slice().sort((a, b) => (a.dueDay ?? 32) - (b.dueDay ?? 32) || a.name.localeCompare(b.name)))
  const monthTransactions = computed(() => transactions.value.filter(t => t.date.slice(0, 7) === month.value)
    .slice().sort((a, b) => b.date.localeCompare(a.date)))
  const summary = computed(() => monthlySummary(month.value, monthData.value?.incomeCents ?? 0, obligations.value, transactions.value))
  const hasAnyData = computed(() => months.value.length + obligations.value.length + transactions.value.length + debts.value.length > 0)

  function start() {
    if (subscription) return
    loaded.value = false
    error.value = ''
    subscription = liveQuery(async () => {
      await db.open()
      return readWorkspace()
    }).subscribe({
      next(payload) {
        months.value = payload.months
        obligations.value = payload.obligations
        transactions.value = payload.transactions
        debts.value = payload.debts
        error.value = ''
        loaded.value = true
      },
      error(reason: unknown) {
        error.value = reason instanceof Error ? reason.message : 'Local database access failed.'
        loaded.value = true
        subscription = null
      }
    })
  }
  function stop() { subscription?.unsubscribe(); subscription = null }
  onScopeDispose(stop)
  function setTheme(value: 'light' | 'dark') {
    theme.value = value
    try { localStorage.setItem(PREF_THEME, value) } catch { /* theme fallback remains in memory */ }
  }
  function notify(message: string) { notice.value = message }
  function clearNotice() { notice.value = '' }
  return {
    months, obligations, transactions, debts, month, theme, loaded, error, notice,
    monthData, monthObligations, monthTransactions, summary, hasAnyData,
    start, stop, setTheme, notify, clearNotice
  }
})
