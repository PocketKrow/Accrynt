import type { Transaction } from './models'
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
