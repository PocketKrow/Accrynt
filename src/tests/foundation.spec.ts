import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AccryntDatabase, db, clearWorkspace, readWorkspace } from '../data/database'
import { localRepository as repo } from '../data/repository'
import { validateBackup, restoreBackup, exportBackup } from '../data/backup'
import { demoFixture, seedDemo } from '../data/demo'
import { availableMoney, debtProgress, monthlySummary, obligationPayment } from '../domain/finance'
import { newId, now, type Obligation, type Transaction } from '../domain/models'
import { projectDebt } from '../domain/debt'
const bill = (month = '2026-10'): Obligation => ({ id: newId(), month, name: 'Synthetic utility', category: 'Utilities', plannedCents: 10000, dueDay: 8, paidAt: null, debtId: null, updatedAt: now() })
beforeEach(async () => { await db.open(); await clearWorkspace() })
afterEach(async () => { await clearWorkspace(); db.close() })

describe('foundation regressions', () => {
  it.each([0, 70000])('copies after opening/income setup, retaining %i existing income, recurring rows and opening', async income => {
    const previous = bill('2026-09'), recurring = bill('2026-10'), ruleId = newId()
    await db.obligations.bulkAdd([previous, recurring])
    await repo.saveIncome('2026-09', 80000)
    await repo.saveOpeningBalance('2026-10', -12345); await repo.saveIncome('2026-10', income)
    await db.recurringOccurrences.add({ id: `${ruleId}:2026-10`, ruleId, month: '2026-10', kind: 'bill', name: recurring.name, amountCents: 10000, dueDay: 8, obligationId: recurring.id, cancelled: false, updatedAt: now() })
    await repo.copyPreviousMonth('2026-10')
    expect(await db.months.get('2026-10')).toMatchObject({ openingCents: -12345, incomeCents: income || 80000 })
    expect(await db.obligations.where('month').equals('2026-10').count()).toBe(2)
    await expect(repo.copyPreviousMonth('2026-10')).rejects.toThrow('manually planned')
  })
  it('distinguishes scheduled, partial and manual paid with cross-month receipts', () => {
    const o = bill(), t: Transaction = { id: newId(), date: '2026-11-02', kind: 'expense', name: 'Scheduled utility', amountCents: 10000, category: 'Utilities', account: '', obligationId: o.id, payment: null, updatedAt: now() }
    expect(obligationPayment(o, [t], '2026-10-16')).toMatchObject({ status: 'Scheduled', paid: false, remainingCents: 10000 })
    expect(monthlySummary(o.month, 0, [o], [t], '2026-10-16').paidCount).toBe(0)
    expect(availableMoney(o.month, 20000, [o], [t], '2026-10-16').afterBillsCents).toBe(10000)
    expect(obligationPayment(o, [t], '2026-11-02').paid).toBe(true)
    expect(obligationPayment({ ...o, paidAt: now() }, [t], '2026-10-16').status).toBe('Paid')
    expect(obligationPayment(o, [t, { ...t, id: newId(), date: '2026-10-01', amountCents: 500 }], '2026-10-16').status).toBe('Partial')
  })
  it('rejects income linked to an obligation before replacing any records', async () => {
    const fixture = demoFixture('2026-10-16'); await restoreBackup(fixture)
    const before = await readWorkspace()
    fixture.transactions.find(t => t.kind === 'income')!.obligationId = fixture.obligations[0].id
    await expect(restoreBackup(fixture)).rejects.toThrow('Income cannot')
    expect(await readWorkspace()).toEqual(before)
  })
  it('retains receipts for relinked obligations and deleted debts', async () => {
    const fixture = demoFixture('2026-10-16'), payment = fixture.transactions.find(t => t.payment)!
    fixture.obligations.find(o => o.id === payment.obligationId)!.debtId = fixture.debts[1].id
    expect(validateBackup(fixture).transactions.find(t => t.payment)?.payment?.debtId).toBe(fixture.debts[0].id)
    const oldId = fixture.debts[0].id
    fixture.obligations.forEach(o => { if (o.debtId === oldId) o.debtId = null })
    fixture.recurringRules.forEach(o => { if (o.debtId === oldId) o.debtId = null })
    fixture.debts = fixture.debts.filter(d => d.id !== oldId)
    await restoreBackup(fixture); expect((await exportBackup()).transactions.find(t => t.payment)?.payment?.debtId).toBe(oldId)
  })
  it('rounds progress half-up without reporting paid off with cents left', () => {
    const d = demoFixture('2026-10-16').debts[0]
    expect(debtProgress({ ...d, startingBalanceCents: 40, balanceCents: 17 })).toBe(58)
    expect(debtProgress({ ...d, startingBalanceCents: 10000, balanceCents: 1 })).toBe(99)
    expect(debtProgress({ ...d, balanceCents: 0 })).toBe(100)
  })
  it.each([
    [100000,1200,10000,11,5898,5898], [100000,2400,5000,26,28988,3988],
    [150000,1700,4500,46,54444,1944], [100000,1200,1001,703,603072,370],
    [10001,1200,5000,3,153,154], [100000,1200,12500,9,4762,4762]
  ])('preserves golden amortization %i/%i/%i', (balanceCents,aprBasisPoints,monthlyPaymentCents,months,totalInterestCents,finalPaymentCents) => {
    expect(projectDebt({ balanceCents, aprBasisPoints, monthlyPaymentCents, minimumCents: 0 })).toMatchObject({ months,totalInterestCents,finalPaymentCents })
  })
})

describe('isolated deterministic demo', () => {
  it('seeds atomically once across concurrent database connections; never changes normal records', async () => {
    const a = new AccryntDatabase('accrynt-demo-v1'), b = new AccryntDatabase('accrynt-demo-v1')
    await a.delete(); await a.open(); await b.open()
    await db.obligations.add(bill()); const before = await readWorkspace()
    try {
      await Promise.all([seedDemo(a, '2026-10-16'), seedDemo(b, '2026-10-16')])
      expect(await a.months.count()).toBe(6)
      expect(await a.debts.count()).toBe(6)
      expect(await a.obligations.count()).toBe(59)
      expect(await readWorkspace()).toEqual(before)
      await expect(seedDemo(db, '2026-10-16')).rejects.toThrow('isolated')
    } finally { b.close(); await a.delete() }
  })
  it.each(['showroom','cash-shortfall','near-payoff','february'] as const)('validates and roundtrips %s fixtures', async scenario => {
    const fixture = demoFixture('2026-10-16', scenario)
    await restoreBackup(fixture)
    expect((await exportBackup()).transactions).toEqual(expect.arrayContaining(fixture.transactions))
    expect(fixture.recurringOccurrences.some(o => o.cancelled)).toBe(true)
  })
})
