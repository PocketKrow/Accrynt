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
export function monthlySummary(month: string, incomeCents: number, obligations: Obligation[], transactions: Transaction[]) {
  const planned = obligations.filter(o => o.month === month)
  const actual = transactions.filter(t => transactionMonth(t.date) === month)
  const plannedCents = sum(planned.map(o => o.plannedCents))
  const paidCount = planned.filter(o => o.paidAt !== null).length
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
