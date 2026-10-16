import { describe, expect, it } from 'vitest'
import { debtProgress, monthlySummary, parseMoney, shiftMonth } from '../domain/finance'
import type { Obligation, Transaction, Debt } from '../domain/models'

function obligation(input: Partial<Obligation> = {}): Obligation {
  return { id: crypto.randomUUID(), month: '2026-10', name: 'Electricity', category: 'Utilities',
    plannedCents: 7800, dueDay: 15, paidAt: null, debtId: null, updatedAt: new Date().toISOString(), ...input }
}
function transaction(input: Partial<Transaction> = {}): Transaction {
  return { id: crypto.randomUUID(), date: '2026-10-15', name: 'Electricity', category: 'Utilities', kind: 'expense',
    amountCents: 7800, account: '', obligationId: null, updatedAt: new Date().toISOString(), ...input }
}
describe('monetary parsing', () => {
  it('stores integer cents, never rounded floating dollars', () => {
    expect(parseMoney('1,234.56')).toBe(123456)
    expect(parseMoney('7')).toBe(700)
    expect(parseMoney('0.09')).toBe(9)
    expect(parseMoney('1.234')).toBeNull()
    expect(parseMoney('-1')).toBeNull()
    expect(parseMoney('1e8')).toBeNull()
  })
})
describe('monthly financial totals', () => {
  it('keeps planned payments independent from actual ledger outflow', () => {
    const obligations = [obligation({ paidAt: new Date().toISOString() }), obligation({ plannedCents: 3400 })]
    const transactions = [transaction(), transaction({ kind: 'debt-payment', category: 'Debt payments', amountCents: 3400 }),
      transaction({ kind: 'income', category: 'Other', amountCents: 182200 })]
    const result = monthlySummary('2026-10', 182200, obligations, transactions)
    expect(result.plannedCents).toBe(11200)
    expect(result.remainingCents).toBe(171000)
    expect(result.paidCount).toBe(1)
    expect(result.actualOutflowCents).toBe(11200)
    expect(result.actualNetCents).toBe(171000)
  })
  it('ignores prior months', () => {
    expect(monthlySummary('2026-10', 0, [obligation({ month: '2026-09' })], [transaction({ date: '2026-09-30' })]).actualOutflowCents).toBe(0)
  })
})
describe('dates and debt progress', () => {
  it('shifts December into January', () => expect(shiftMonth('2026-12', 1)).toBe('2027-01'))
  it('avoids inventing progress without a starting balance', () => {
    const debt: Debt = { id: crypto.randomUUID(), name: 'Loan', balanceCents: 50000, startingBalanceCents: null, minimumCents: 3000, aprBasisPoints: null, updatedAt: new Date().toISOString() }
    expect(debtProgress(debt)).toBeNull()
    expect(debtProgress({ ...debt, startingBalanceCents: 100000 })).toBe(50)
  })
})
