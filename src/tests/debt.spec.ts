import { describe, expect, it } from 'vitest'
import { monthlyInterest, parseAnnualRate, payoffLabel, projectDebt, type DebtCalculationInput } from '../domain/debt'

const debt = (input: Partial<DebtCalculationInput> = {}): DebtCalculationInput => ({
  balanceCents: 100000, minimumCents: 5000, monthlyPaymentCents: 10000, aprMilliPercent: 12000, ...input
})

describe('annual rates and exact interest', () => {
  it.each([['0', 0], ['17', 17000], ['17.29', 17290], [' 0.01 ', 10], ['1000.00', 1000000]])('parses %s into milli-percent', (text, expected) => {
    expect(parseAnnualRate(text)).toBe(expected)
  })
  it.each(['', '-1', '1e2', '12,50', '2.3456', '1000.01', 'Infinity', 'NaN', '.5'])('rejects %s', text => {
    expect(parseAnnualRate(text)).toBeNull()
  })
  it('rounds once, half up, without floating multiplication at the amount limits', () => {
    expect(monthlyInterest(100000, 12000)).toBe(1000)
    expect(monthlyInterest(5, 120000)).toBe(1) // half a cent
    expect(monthlyInterest(4, 120000)).toBe(0)
    expect(monthlyInterest(99_999_999_999, 1000000)).toBe(83_333_333_333)
    expect(() => monthlyInterest(1.5, 12000)).toThrow(RangeError)
    expect(() => monthlyInterest(1000, -1)).toThrow(RangeError)
  })
})

describe('fixed monthly debt projections', () => {
  // Independently calculated with Python Decimal, monthly ROUND_HALF_UP.
  it.each([
    [100000, 1200, 10000, 11, 5898, 105898, 5898],
    [100000, 2400, 5000, 26, 28988, 128988, 3988],
    [150000, 1700, 4500, 46, 54444, 204444, 1944]
  ])('matches amortization fixture %i at %i basis points', (balanceCents, aprMilliPercent, monthlyPaymentCents, months, totalInterestCents, totalPaidCents, finalPaymentCents) => {
    expect(projectDebt(debt({ balanceCents, aprMilliPercent: aprMilliPercent * 10, monthlyPaymentCents }))).toMatchObject({
      status: 'payoff', months, totalInterestCents, totalPaidCents, finalPaymentCents
    })
  })
  it('splits the first payment and conserves every cent throughout the schedule', () => {
    const result = projectDebt(debt(), true)
    expect(result).toMatchObject({ monthlyInterestCents: 1000, firstPaymentCents: 10000,
      firstPrincipalCents: 9000, nextBalanceCents: 91000 })
    let opening = 100000
    for (const row of result.schedule) {
      expect(row.openingCents).toBe(opening)
      expect(row.closingCents).toBe(row.openingCents + row.interestCents - row.paymentCents)
      expect(row.principalCents).toBe(row.paymentCents - row.interestCents)
      expect(row.closingCents).toBeGreaterThanOrEqual(0)
      opening = row.closingCents
    }
    expect(opening).toBe(0)
    expect(result.schedule.reduce((s, r) => s + r.principalCents, 0)).toBe(100000)
    expect(result.schedule.reduce((s, r) => s + r.interestCents, 0)).toBe(result.totalInterestCents)
    expect(result.schedule.reduce((s, r) => s + r.paymentCents, 0)).toBe(result.totalPaidCents)
    expect(projectDebt(debt()).schedule).toEqual([])
  })
  it('uses the minimum when payment is blank, while preserving explicit zero', () => {
    expect(projectDebt(debt({ monthlyPaymentCents: null })).months).toBe(23)
    expect(projectDebt(debt({ monthlyPaymentCents: 0 }))).toMatchObject({ status: 'no-payment',
      monthlyInterestCents: 1000, nextBalanceCents: 101000, totalInterestCents: null })
  })
  it('distinguishes a missing rate from a valid interest-free account', () => {
    expect(projectDebt(debt({ aprMilliPercent: null }))).toMatchObject({ status: 'missing-rate', months: null, monthlyInterestCents: null })
    expect(projectDebt(debt({ aprMilliPercent: 0, monthlyPaymentCents: 30000 }))).toMatchObject({
      status: 'payoff', months: 4, totalInterestCents: 0, totalPaidCents: 100000, finalPaymentCents: 10000
    })
  })
  it.each([1000, 999])('does not invent payoff when payment %i fails to reduce balance', monthlyPaymentCents => {
    expect(projectDebt(debt({ monthlyPaymentCents }), true)).toMatchObject({ status: 'not-reducing',
      firstPrincipalCents: 0, months: null, totalInterestCents: null, schedule: [] })
  })
  it('caps the last payment and handles tiny and already-paid accounts', () => {
    expect(projectDebt(debt({ balanceCents: 1, monthlyPaymentCents: 10000 }))).toMatchObject({
      status: 'payoff', months: 1, finalPaymentCents: 1, nextBalanceCents: 0
    })
    expect(projectDebt(debt({ balanceCents: 0, aprMilliPercent: null }))).toMatchObject({
      status: 'paid', months: 0, monthlyInterestCents: 0, totalInterestCents: 0, totalPaidCents: 0
    })
  })
  it('bounds long projections and does not report incomplete lifetime totals', () => {
    const result = projectDebt(debt({ balanceCents: 1201, aprMilliPercent: 0, monthlyPaymentCents: 1 }), true)
    expect(result).toMatchObject({ status: 'beyond-horizon', months: null, totalInterestCents: null, totalPaidCents: null })
    expect(result.schedule).toHaveLength(1200)
    expect(payoffLabel(result)).toBe('More than 100 years')
    expect(projectDebt(debt({ balanceCents: 1200, aprMilliPercent: 0, monthlyPaymentCents: 1 })).months).toBe(1200)
  })
  it('keeps input balances untouched and rejects corrupt inputs', () => {
    const input = Object.freeze(debt())
    projectDebt(input, true)
    expect(input.balanceCents).toBe(100000)
    expect(() => projectDebt(debt({ monthlyPaymentCents: -1 }))).toThrow(RangeError)
    expect(() => projectDebt(debt({ balanceCents: Number.MAX_SAFE_INTEGER }))).toThrow(RangeError)
  })
})
