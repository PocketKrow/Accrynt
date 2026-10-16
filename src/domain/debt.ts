/** Fixed monthly estimates, not lender statement reconciliation. All amounts are cents. */
export interface DebtCalculationInput {
  balanceCents: number
  aprBasisPoints: number | null
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
  if (!/^\d{1,4}(?:\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return basisPoints <= 100_000 ? basisPoints : null
}

function assertMoney(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) throw new RangeError('Invalid debt amount.')
}
export function monthlyInterest(balanceCents: number, annualRateBasisPoints: number): number {
  assertMoney(balanceCents)
  if (!Number.isInteger(annualRateBasisPoints) || annualRateBasisPoints < 0 || annualRateBasisPoints > 100_000) {
    throw new RangeError('Invalid annual rate.')
  }
  // Annual basis points / 10,000 / 12, rounded half up once to a cent.
  return Number((BigInt(balanceCents) * BigInt(annualRateBasisPoints) + 60_000n) / 120_000n)
}

export function projectDebt(debt: DebtCalculationInput, includeSchedule = false): DebtProjection {
  assertMoney(debt.balanceCents)
  assertMoney(debt.minimumCents)
  if (debt.monthlyPaymentCents !== null) assertMoney(debt.monthlyPaymentCents)
  if (debt.aprBasisPoints !== null) monthlyInterest(0, debt.aprBasisPoints)
  const payment = debt.monthlyPaymentCents ?? debt.minimumCents
  const result: DebtProjection = {
    status: 'missing-rate', plannedPaymentCents: payment, monthlyInterestCents: null,
    firstPaymentCents: null, firstPrincipalCents: null, nextBalanceCents: null,
    months: null, totalInterestCents: null, totalPaidCents: null, finalPaymentCents: null, schedule: []
  }
  if (debt.balanceCents === 0) return { ...result, status: 'paid', monthlyInterestCents: 0,
    firstPaymentCents: 0, firstPrincipalCents: 0, nextBalanceCents: 0, months: 0,
    totalInterestCents: 0, totalPaidCents: 0, finalPaymentCents: 0 }
  if (debt.aprBasisPoints === null) return result
  const firstInterest = monthlyInterest(debt.balanceCents, debt.aprBasisPoints)
  const firstPayment = Math.min(payment, debt.balanceCents + firstInterest)
  Object.assign(result, { monthlyInterestCents: firstInterest, firstPaymentCents: firstPayment,
    firstPrincipalCents: Math.max(0, firstPayment - firstInterest),
    nextBalanceCents: debt.balanceCents + firstInterest - firstPayment })
  if (payment === 0) return { ...result, status: 'no-payment' }
  if (payment <= firstInterest) return { ...result, status: 'not-reducing' }
  let balance = debt.balanceCents, totalInterest = 0, totalPaid = 0
  for (let month = 1; month <= MAX_PROJECTION_MONTHS; month++) {
    const interest = monthlyInterest(balance, debt.aprBasisPoints)
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
