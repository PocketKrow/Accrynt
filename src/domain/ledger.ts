import type { Transaction, TransactionKind } from './models'
export const transactionKindLabel: Record<TransactionKind, string> = { income: 'Income', expense: 'Expense', 'debt-payment': 'Debt payment' }
export function formatRecordedAt(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Recording time unavailable'
  return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(date)
}
/** Dates first, then immutable receipt timestamp; UUID is a deterministic fallback. */
export function compareTransactions(a: Transaction, b: Transaction) {
  return b.date.localeCompare(a.date) || (b.payment?.recordedAt ?? '').localeCompare(a.payment?.recordedAt ?? '') || a.id.localeCompare(b.id)
}
function csvText(value: string) {
  // Quoting alone does not neutralize formulas in spreadsheet applications.
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value
  return `"${safe.replace(/"/g, '""')}"`
}
const dollars = (cents: number) => `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
export function ledgerCsv(rows: Transaction[], demo = false) {
  const header = ['Workspace', 'Date', 'Description', 'Kind', 'Category', 'Account', 'Amount USD', 'Principal USD', 'Interest USD']
  const lines = rows.map(t => [demo ? 'DEMO · SYNTHETIC DATA' : 'Personal workspace', t.date, t.name, t.kind, t.category, t.account,
    dollars(t.amountCents), t.payment?.debtId ? dollars(t.payment.principalCents) : '', t.payment?.debtId ? dollars(t.payment.interestCents) : ''])
  return '\uFEFF' + [header, ...lines].map(line => line.map(csvText).join(',')).join('\r\n') + '\r\n'
}

/** Full matching set, independent of pagination; scheduled cash is never actual. */
export function matchingTotals(rows: Transaction[], through: string) {
  const totals = (items: Transaction[]) => {
    const income = items.reduce((n, t) => n + (t.kind === 'income' ? t.amountCents : 0), 0)
    const outflow = items.reduce((n, t) => n + (t.kind !== 'income' ? t.amountCents : 0), 0)
    return { count: items.length, income, outflow, net: income - outflow }
  }
  return { actual: totals(rows.filter(t => t.date <= through)), scheduled: totals(rows.filter(t => t.date > through)) }
}
