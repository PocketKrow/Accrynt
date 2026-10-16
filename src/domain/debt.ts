import { dueDate } from './finance'
import { transactionDateSchema } from './models'
/** Fixed monthly estimates, not lender statement reconciliation. All amounts are cents. */
export interface DebtCalculationInput {
  balanceCents: number
  aprMilliPercent: number | null
  minimumCents: number
  monthlyPaymentCents: number | null
}
export interface PaymentRow {
  month: number
  openingCents: number
  interestCents: number
  paymentCents: number
  principalCents: number
  closingCents: number
}
export type ProjectionStatus = 'paid' | 'missing-rate' | 'no-payment' | 'not-reducing' | 'beyond-horizon' | 'payoff'
export interface DebtProjection {
  status: ProjectionStatus
  plannedPaymentCents: number
  monthlyInterestCents: number | null
  firstPaymentCents: number | null
  firstPrincipalCents: number | null
  nextBalanceCents: number | null
  months: number | null
  totalInterestCents: number | null
  totalPaidCents: number | null
  finalPaymentCents: number | null
  schedule: PaymentRow[]
}
export const MAX_PROJECTION_MONTHS = 1200
const MAX_CENTS = 99_999_999_999

export function parseAnnualRate(value: string): number | null {
  const text = value.trim()
  if (!/^\d{1,4}(?:\.\d{1,3})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const milliPercent = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))
  return milliPercent <= 1_000_000 ? milliPercent : null
}

function assertMoney(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) throw new RangeError('Invalid debt amount.')
}
export function monthlyInterest(balanceCents: number, annualRateMilliPercent: number): number {
  assertMoney(balanceCents)
  if (!Number.isInteger(annualRateMilliPercent) || annualRateMilliPercent < 0 || annualRateMilliPercent > 1_000_000) {
    throw new RangeError('Invalid annual rate.')
  }
  // Annual milli-percent / 100,000 / 12, rounded half up once to a cent.
  return Number((BigInt(balanceCents) * BigInt(annualRateMilliPercent) + 600_000n) / 1_200_000n)
}

export function projectDebt(debt: DebtCalculationInput, includeSchedule = false): DebtProjection {
  assertMoney(debt.balanceCents)
  assertMoney(debt.minimumCents)
  if (debt.monthlyPaymentCents !== null) assertMoney(debt.monthlyPaymentCents)
  if (debt.aprMilliPercent !== null) monthlyInterest(0, debt.aprMilliPercent)
  const payment = debt.monthlyPaymentCents ?? debt.minimumCents
  const result: DebtProjection = {
    status: 'missing-rate', plannedPaymentCents: payment, monthlyInterestCents: null,
    firstPaymentCents: null, firstPrincipalCents: null, nextBalanceCents: null,
    months: null, totalInterestCents: null, totalPaidCents: null, finalPaymentCents: null, schedule: []
  }
  if (debt.balanceCents === 0) return { ...result, status: 'paid', monthlyInterestCents: 0,
    firstPaymentCents: 0, firstPrincipalCents: 0, nextBalanceCents: 0, months: 0,
    totalInterestCents: 0, totalPaidCents: 0, finalPaymentCents: 0 }
  if (debt.aprMilliPercent === null) return result
  const firstInterest = monthlyInterest(debt.balanceCents, debt.aprMilliPercent)
  const firstPayment = Math.min(payment, debt.balanceCents + firstInterest)
  Object.assign(result, { monthlyInterestCents: firstInterest, firstPaymentCents: firstPayment,
    firstPrincipalCents: Math.max(0, firstPayment - firstInterest),
    nextBalanceCents: debt.balanceCents + firstInterest - firstPayment })
  if (payment === 0) return { ...result, status: 'no-payment' }
  if (payment <= firstInterest) return { ...result, status: 'not-reducing' }
  let balance = debt.balanceCents, totalInterest = 0, totalPaid = 0
  for (let month = 1; month <= MAX_PROJECTION_MONTHS; month++) {
    const interest = monthlyInterest(balance, debt.aprMilliPercent)
    const actualPayment = Math.min(payment, balance + interest)
    const closing = balance + interest - actualPayment
    if (includeSchedule) result.schedule.push({ month, openingCents: balance, interestCents: interest,
      paymentCents: actualPayment, principalCents: actualPayment - interest, closingCents: closing })
    totalInterest += interest
    totalPaid += actualPayment
    balance = closing
    if (balance === 0) return { ...result, status: 'payoff', months: month,
      totalInterestCents: totalInterest, totalPaidCents: totalPaid, finalPaymentCents: actualPayment }
  }
  return { ...result, status: 'beyond-horizon' }
}

export function payoffLabel(projection: DebtProjection): string {
  switch (projection.status) {
    case 'paid': return 'Paid off'
    case 'missing-rate': return 'Add an annual rate'
    case 'no-payment': return 'Add a monthly payment'
    case 'not-reducing': return 'Payment does not reduce balance'
    case 'beyond-horizon': return 'More than 100 years'
    case 'payoff': return `${projection.months} monthly payment${projection.months === 1 ? '' : 's'}`
  }
}

export function compareExtraPayment(debt: DebtCalculationInput, extraCents: number) {
  assertMoney(extraCents)
  const base = projectDebt(debt)
  const increased = base.plannedPaymentCents + extraCents
  assertMoney(increased)
  const improved = projectDebt({ ...debt, monthlyPaymentCents: increased })
  const comparable = base.status === 'payoff' && improved.status === 'payoff'
  return { base, improved, paymentCents: increased,
    monthsSaved: comparable ? base.months! - improved.months! : null,
    interestSavedCents: comparable ? base.totalInterestCents! - improved.totalInterestCents! : null }
}

/** Date-aware simple estimates only. Never writes or compounds saved balance. */
export function accruedEstimate(debt: DebtCalculationInput & { balanceAsOf: string | null; interestMethod: 'monthly' | 'daily-365' | 'daily-360' }, through: string) {
  if (debt.aprMilliPercent === null || debt.balanceAsOf === null) return null
  // Reuse the validated public calendar schema without relying on local time zones.
  const from = calendarDay(debt.balanceAsOf), to = calendarDay(through), days = (to - from) / 86400000
  if (days < 0 || days > 36525) throw new RangeError('Choose an estimate date from the saved reference date through the next 100 years.')
  monthlyInterest(debt.balanceCents, debt.aprMilliPercent)
  let cents: number, periods = 0
  if (debt.interestMethod === 'monthly') {
    const [y,m,d] = debt.balanceAsOf.split('-').map(Number), [ty,tm] = through.split('-').map(Number)
    periods = (ty-y)*12+tm-m
    if (through < dueDate(through.slice(0,7),d)) periods--
    cents = monthlyInterest(debt.balanceCents, debt.aprMilliPercent) * Math.max(0, periods)
  } else {
    const denominator = BigInt(debt.interestMethod === 'daily-365' ? 36500000 : 36000000)
    cents = Number((BigInt(debt.balanceCents)*BigInt(debt.aprMilliPercent)*BigInt(days)+denominator/2n)/denominator)
  }
  const estimatedBalanceCents = debt.balanceCents + cents
  if (!Number.isSafeInteger(estimatedBalanceCents)) throw new RangeError('Estimate exceeds the supported amount.')
  return { days, periods: Math.max(0,periods), interestCents:cents, estimatedBalanceCents }
}
function calendarDay(value: string) {
  transactionDateSchema.parse(value)
  return Date.parse(`${value}T00:00:00.000Z`)
}
