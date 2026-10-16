import type { Obligation, Transaction, Debt } from './models'
import { monthKeySchema, transactionMonth } from './models'

export const formatMoney = (cents: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD'
}).format(cents / 100)

export function parseMoney(value: string): number | null {
  const input = value.trim()
  if (!/^(?:\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.\d{1,2})?$/.test(input)) return null
  const cleaned = input.replace(/,/g, '')
  const [dollars, decimals = ''] = cleaned.split('.')
  const cents = Number(dollars) * 100 + Number(decimals.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= 999_999_999_99 ? cents : null
}

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
export function parseSignedMoney(value: string): number | null {
  const input = value.trim(), negative = input.startsWith('-')
  const cents = parseMoney(negative ? input.slice(1) : input)
  return cents === null ? null : negative ? -cents : cents
}
export function obligationPayment(obligation: Obligation, transactions: Transaction[], through = '9999-12-31') {
  const recordedCents = sum(transactions.filter(t => t.obligationId === obligation.id && t.kind !== 'income' && t.date <= through).map(t => t.amountCents))
  const remainingCents = obligation.paidAt ? 0 : Math.max(0, obligation.plannedCents - recordedCents)
  const paid = obligation.paidAt !== null || (recordedCents >= obligation.plannedCents && (recordedCents > 0 || obligation.plannedCents === 0))
  return { recordedCents, remainingCents, paid, status: paid ? 'Paid' : recordedCents > 0 ? 'Partial' : 'Unpaid' }
}
export function dueDate(month: string, day: number): string {
  monthKeySchema.parse(month)
  if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('Invalid day.')
  const [year, number] = month.split('-').map(Number), last = new Date(0)
  last.setUTCFullYear(year, number, 0)
  return `${month}-${String(Math.min(day, last.getUTCDate())).padStart(2, '0')}`
}
export function availableMoney(month: string, openingCents: number | null, obligations: Obligation[], transactions: Transaction[], today: string) {
  const actual = transactions.filter(t => transactionMonth(t.date) === month && t.date <= today)
  const receivedCents = sum(actual.filter(t => t.kind === 'income').map(t => t.amountCents))
  const spentCents = sum(actual.filter(t => t.kind !== 'income').map(t => t.amountCents))
  const outstandingCents = sum(obligations.filter(o => o.month === month).map(o => obligationPayment(o, transactions, today).remainingCents))
  const trackedCents = openingCents === null ? null : openingCents + receivedCents - spentCents
  return { receivedCents, spentCents, outstandingCents, trackedCents,
    afterBillsCents: trackedCents === null ? null : trackedCents - outstandingCents }
}
export function monthlySummary(month: string, incomeCents: number, obligations: Obligation[], transactions: Transaction[]) {
  const planned = obligations.filter(o => o.month === month)
  const actual = transactions.filter(t => transactionMonth(t.date) === month)
  const plannedCents = sum(planned.map(o => o.plannedCents))
  const paidCount = planned.filter(o => obligationPayment(o, transactions).paid).length
  const actualIncomeCents = sum(actual.filter(t => t.kind === 'income').map(t => t.amountCents))
  const actualOutflowCents = sum(actual.filter(t => t.kind !== 'income').map(t => t.amountCents))
  return {
    plannedCents,
    remainingCents: incomeCents - plannedCents,
    paidCount,
    unpaidCount: planned.length - paidCount,
    obligationCount: planned.length,
    actualIncomeCents,
    actualOutflowCents,
    actualNetCents: actualIncomeCents - actualOutflowCents
  }
}
export function debtProgress(debt: Debt) {
  if (!debt.startingBalanceCents || debt.startingBalanceCents <= 0) return null
  return Math.max(0, Math.min(100, Math.round((1 - debt.balanceCents / debt.startingBalanceCents) * 100)))
}
export function shiftMonth(key: string, amount: number) {
  monthKeySchema.parse(key)
  if (!Number.isInteger(amount)) throw new Error('Month offset must be an integer.')
  const [year, month] = key.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1 + amount, 1)
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new Error('Choose a month between January 0001 and December 9999.')
  }
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
export function longMonth(key: string) {
  monthKeySchema.parse(key)
  const [year, month] = key.split('-').map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, 1)
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(date)
}
