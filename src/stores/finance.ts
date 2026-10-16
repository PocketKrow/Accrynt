import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { compareTransactions } from '../domain/ledger'
import { liveQuery } from 'dexie'
import { db, readWorkspace } from '../data/database'
import { seedDemo } from '../data/demo'
import { isDemo } from '../data/workspace'
import { currentMonth, localDate, type MonthPlan, type Obligation, type Transaction, type Debt, type RecurringRule, type RecurringOccurrence, type BalanceEvent } from '../domain/models'
import { availableMoney, monthlySummary, sum } from '../domain/finance'
import { localRepository } from '../data/repository'

const PREF_THEME = isDemo ? 'accrynt-demo-theme-v1' : 'accrynt-theme-v1'
function loadTheme(): 'light' | 'dark' {
  try { return localStorage.getItem(PREF_THEME) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export const useFinanceStore = defineStore('finance', () => {
  const months = shallowRef<MonthPlan[]>([])
  const obligations = shallowRef<Obligation[]>([])
  const transactions = shallowRef<Transaction[]>([])
  const debts = shallowRef<Debt[]>([])
  const recurringRules = shallowRef<RecurringRule[]>([]), recurringOccurrences = shallowRef<RecurringOccurrence[]>([])
  const balanceEvents = shallowRef<BalanceEvent[]>([])
  const month = ref(currentMonth())
  const today = ref(localDate())
  const theme = ref<'light' | 'dark'>(loadTheme())
  const loaded = ref(false)
  const error = ref('')
  const notice = ref(''), operationError = ref('')
  let subscription: { unsubscribe(): void } | null = null
  let clock: ReturnType<typeof setInterval> | null = null

  const monthData = computed(() => months.value.find(m => m.key === month.value))
  const monthObligations = computed(() => obligations.value.filter(o => o.month === month.value)
    .slice().sort((a, b) => (a.dueDay ?? 32) - (b.dueDay ?? 32) || a.name.localeCompare(b.name)))
  const monthTransactions = computed(() => transactions.value.filter(t => t.date.slice(0, 7) === month.value)
    .slice().sort(compareTransactions))
  const expectedOccurrences = computed(() => recurringOccurrences.value.filter(o => o.month === month.value && o.kind === 'income'))
  const expectedIncomeCents = computed(() => (monthData.value?.incomeCents ?? 0) + sum(expectedOccurrences.value.filter(o => !o.cancelled).map(o => o.amountCents)))
  const summary = computed(() => monthlySummary(month.value, expectedIncomeCents.value, obligations.value, transactions.value, today.value))
  const cashflow = computed(() => availableMoney(month.value, monthData.value?.openingCents ?? null, obligations.value, transactions.value, today.value))
  const hasAnyData = computed(() => months.value.length + obligations.value.length + transactions.value.length + debts.value.length + recurringRules.value.length + balanceEvents.value.length > 0)
  let generating = false, requested = false
  let initialization: Promise<void> | null = null
  async function generateMonth() {
    if (!subscription || !recurringRules.value.length) return
    requested = true
    if (generating) return
    generating = true
    try {
      while (requested && subscription) { requested = false; await localRepository.ensureRecurringMonth(month.value) }
    } catch (reason) {
      error.value = reason instanceof Error ? reason.message : 'Unable to prepare recurring items.'
      stop()
    } finally { generating = false }
  }
  watch(month, () => { void generateMonth() })

  function start() {
    if (subscription) return
    loaded.value = false
    error.value = ''
    today.value = localDate()
    if (clock !== null) clearInterval(clock)
    clock = setInterval(() => { today.value = localDate() }, 60_000)
    // Seed outside liveQuery: its query context deliberately forbids writes.
    initialization ??= isDemo ? db.open().then(() => seedDemo()) : Promise.resolve()
    subscription = liveQuery(async () => {
      await db.open()
      await initialization
      return readWorkspace()
    }).subscribe({
      next(payload) {
        months.value = payload.months
        obligations.value = payload.obligations
        transactions.value = payload.transactions
        debts.value = payload.debts
        balanceEvents.value = payload.balanceEvents
        recurringRules.value = payload.recurringRules
        recurringOccurrences.value = payload.recurringOccurrences
        error.value = ''
        loaded.value = true
        void generateMonth()
      },
      error(reason: unknown) {
        error.value = reason instanceof Error ? reason.message : 'Local database access failed.'
        loaded.value = true
        subscription = null
        initialization = null
      }
    })
  }
  function stop() { subscription?.unsubscribe(); subscription = null; if (clock !== null) clearInterval(clock); clock = null }
  onScopeDispose(stop)
  function setTheme(value: 'light' | 'dark') {
    theme.value = value
    try { localStorage.setItem(PREF_THEME, value) } catch { /* theme fallback remains in memory */ }
  }
  function notify(message: string) { notice.value = message }
  function fail(message:string) { operationError.value=message }
  function dismissError() { operationError.value='' }
  function clearNotice() { notice.value = '' }
  return {
    months, obligations, transactions, debts, balanceEvents, recurringRules, recurringOccurrences, month, today, theme, loaded, error, notice, operationError, fail, dismissError,
    monthData, monthObligations, monthTransactions, expectedOccurrences, expectedIncomeCents, summary, cashflow, hasAnyData,
    start, stop, setTheme, notify, clearNotice
  }
})
