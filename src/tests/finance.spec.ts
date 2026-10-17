import { describe, expect, it } from 'vitest'
import { availableMoney, buildObligationPayments, debtProgress, formatMoney, monthlySummary, obligationPayment, parseMoney, shiftMonth } from '../domain/finance'
import { monthKeySchema, transactionSchema } from '../domain/models'
import type { Obligation, Transaction, Debt } from '../domain/models'

function obligation(input: Partial<Obligation> = {}): Obligation {
  return { id: crypto.randomUUID(), month: '2026-10', name: 'Electricity', category: 'Utilities',
    plannedCents: 7800, dueDay: 15, paidAt: null, debtId: null, updatedAt: new Date().toISOString(), ...input }
}
function transaction(input: Partial<Transaction> = {}): Transaction {
  return { id: crypto.randomUUID(), date: '2026-10-15', name: 'Electricity', category: 'Utilities', kind: 'expense',
    amountCents: 7800, account: '', obligationId: null, payment: null, updatedAt: new Date().toISOString(), ...input }
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
    const result = monthlySummary('2026-10', 182200, obligations, transactions, '2026-10-16')
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
    const debt: Debt = { id: crypto.randomUUID(), name: 'Loan', balanceCents: 50000, startingBalanceCents: null, minimumCents: 3000, monthlyPaymentCents: null, aprMilliPercent: null, balanceAsOf: null, interestMethod: 'monthly', updatedAt: new Date().toISOString() }
    expect(debtProgress(debt)).toBeNull()
    expect(debtProgress({ ...debt, startingBalanceCents: 100000 })).toBe(50)
  })
})

describe('snapshot payment calculations', () => {
  it('preserves manual, zero, cross-month, future and income-link semantics', () => {
    const rows = [obligation({ id:'partial', plannedCents:10000 }), obligation({ id:'manual',paidAt:'2026-10-01T00:00:00Z' }), obligation({ id:'zero',plannedCents:0 })]
    const entries = [transaction({obligationId:'partial',date:'2026-09-30',amountCents:3000}),transaction({obligationId:'partial',date:'2026-10-16',amountCents:2000}),transaction({obligationId:'partial',date:'2026-10-17',amountCents:5000}),transaction({obligationId:'partial',kind:'income',amountCents:99999})]
    const index = buildObligationPayments(rows,entries,'2026-10-16')
    expect(index.get('partial')).toMatchObject({recordedCents:5000,scheduledCents:5000,remainingCents:5000,paid:false,status:'Partial'})
    expect(index.get('manual')).toMatchObject({recordedCents:0,remainingCents:0,paid:true})
    expect(index.get('zero')).toMatchObject({remainingCents:0,paid:true})
    for (const row of rows) expect(index.get(row.id)).toEqual(obligationPayment(row,entries,'2026-10-16'))
    const later = buildObligationPayments(rows,entries,'2026-10-17')
    expect(later.get('partial')).toMatchObject({recordedCents:10000,scheduledCents:0,remainingCents:0,paid:true})
    expect(index.get('partial')?.paid).toBe(false) // snapshots do not mutate one another
    expect(availableMoney('2026-10',null,rows,entries,'2026-10-16',index).trackedCents).toBeNull()
  })
  it('retains the exact aggregate results on a 2,000-bill / 20,000-entry fixture', () => {
    const rows = Array.from({length:2000},(_,i)=>obligation({id:`bill-${i}`,plannedCents:10000,paidAt:i%17===0?'2026-10-16T16:00:00Z':null}))
    const entries = Array.from({length:20000},(_,i)=>transaction({id:`tx-${i}`,date:i%5===0?'2026-10-25':i%7===0?'2026-09-30':'2026-10-15',kind:i%11===0?'income':'expense',amountCents:1000,obligationId:`bill-${i%2000}`}))
    const index = buildObligationPayments(rows,entries,'2026-10-16')
    expect(monthlySummary('2026-10',30000000,rows,entries,'2026-10-16',index)).toMatchObject({paidCount:254,actualOutflowCents:12467000})
    expect(availableMoney('2026-10',10000,rows,entries,'2026-10-16',index)).toMatchObject({trackedCents:-11210000,outstandingCents:5130000})
    expect(monthlySummary('2026-10',30000000,rows,entries,'2026-10-16')).toEqual(monthlySummary('2026-10',30000000,rows,entries,'2026-10-16',index))
    for (const i of [0,1,5,11,17,29,111,1999]) expect(index.get(rows[i].id)).toEqual(obligationPayment(rows[i],entries,'2026-10-16'))
  })
  it('retains signed cents and grouping when reusing the currency formatter', () => {
    expect([0,1,-1,123456,99999999999].map(formatMoney)).toEqual(['$0.00','$0.01','-$0.01','$1,234.56','$999,999,999.99'])
  })
})


describe('input and calendar boundaries', () => {
  it.each(['1,2', '12,34.56', ',100', '100,', '1,,000', '1000,000', 'NaN', 'Infinity', '9999999999', '0.001'])('rejects malformed money %s', value => {
    expect(parseMoney(value)).toBeNull()
  })
  it('accepts well-formed grouping and the supported maximum', () => {
    expect(parseMoney(' 999,999,999.99 ')).toBe(99999999999)
    expect(parseMoney('0.00')).toBe(0)
  })
  it('validates leap years and low calendar years without the Date.UTC 1900 offset', () => {
    expect(transactionSchema.safeParse(transaction({ date: '2024-02-29' })).success).toBe(true)
    expect(transactionSchema.safeParse(transaction({ date: '2026-02-29' })).success).toBe(false)
    expect(transactionSchema.safeParse(transaction({ date: '0001-01-01' })).success).toBe(true)
    expect(transactionSchema.safeParse(transaction({ date: '0000-01-01' })).success).toBe(false)
    expect(monthKeySchema.safeParse('0000-01').success).toBe(false)
    expect(shiftMonth('0099-12', 1)).toBe('0100-01')
    expect(shiftMonth('2027-01', -1)).toBe('2026-12')
    expect(() => shiftMonth('0001-01', -1)).toThrow()
    expect(() => shiftMonth('9999-12', 1)).toThrow()
  })
})
