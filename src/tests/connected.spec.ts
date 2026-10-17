import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AccryntDatabase, clearWorkspace, db, readWorkspace } from '../data/database'
import { exportBackup, restoreBackup, validateBackup } from '../data/backup'
import { localRepository as repo } from '../data/repository'
import { availableMoney, dueDate, monthlySummary, obligationPayment, parseSignedMoney } from '../domain/finance'
import { compareExtraPayment } from '../domain/debt'
import { paymentSplit } from '../domain/payment'
import { localDate, newId, now, type Debt, type Obligation, type RecurringRule, type Transaction } from '../domain/models'
import { useFinanceStore } from '../stores/finance'

const debt = (): Debt => ({ id: newId(), name: 'Synthetic card', balanceCents: 100000, startingBalanceCents: 100000,
  minimumCents: 10000, monthlyPaymentCents: null, aprMilliPercent: 12000, balanceAsOf: null, interestMethod: 'monthly', updatedAt: now() })
const bill = (debtId: string | null = null): Obligation => ({ id: newId(), name: 'Synthetic bill', month: '2026-01', category: 'Debt payments',
  plannedCents: 15000, paidAt: null, dueDay: 31, debtId, updatedAt: now() })
const rule = (kind: 'bill' | 'income' = 'bill'): RecurringRule => ({ id: newId(), name: `Synthetic ${kind}`, kind, amountCents: 20000,
  category: kind === 'bill' ? 'Utilities' : 'Other', dueDay: 31, debtId: null, startMonth: '2026-01', endMonth: null, enabled: true, updatedAt: now() })
const transaction = (input: Partial<Transaction> = {}): Transaction => ({ id: newId(), date: '2026-01-10', name: 'Synthetic entry', kind: 'expense',
  category: 'Other', amountCents: 1000, account: '', obligationId: null, payment: null, updatedAt: now(), ...input })
async function seed() { const d = debt(), o = bill(d.id); await db.debts.add(d); await db.obligations.add(o); return { d, o } }
const payment = (d: Debt | null, o: Obligation | null, amountCents = 10000, interestCents = 1000) => ({ id: newId(), date: localDate(), name: 'Synthetic payment',
  amountCents, interestCents: d ? interestCents : 0, account: 'Test checking', debtId: d?.id ?? null, obligationId: o?.id ?? null,
  expectedDebtUpdatedAt: d?.updatedAt, expectedObligationUpdatedAt: o?.updatedAt })
beforeEach(async () => { await db.open(); await clearWorkspace() })
afterEach(async () => { vi.restoreAllMocks(); await clearWorkspace(); db.close() })

describe('connected payments', () => {
  it('keeps the split accurate when interest is already included in the saved statement balance', async () => {
    const { d, o } = await seed()
    const row = await repo.recordPayment({ ...payment(d, o), interestIncludedInBalance: true })
    expect(row.payment).toMatchObject({ principalCents: 9000, interestCents: 1000, interestIncludedInBalance: true, balanceAfterCents: 90000 })
    expect((await db.debts.get(d.id))?.balanceCents).toBe(90000)
    expect(validateBackup(await exportBackup()).transactions[0].payment?.interestIncludedInBalance).toBe(true)
    await repo.undoPayment(row.id, row.updatedAt)
    expect((await db.debts.get(d.id))?.balanceCents).toBe(100000)
  })
  it('applies concurrent retries exactly once and leaves a partially paid bill', async () => {
    const { d, o } = await seed(), input = payment(d, o)
    const results = await Promise.all([repo.recordPayment(input), repo.recordPayment(input)])
    expect(results[0]).toEqual(results[1]); expect(await db.transactions.count()).toBe(1)
    expect((await db.debts.get(d.id))?.balanceCents).toBe(91000)
    const state = obligationPayment((await db.obligations.get(o.id))!, await db.transactions.toArray())
    expect(state).toMatchObject({ status: 'Partial', recordedCents: 10000, remainingCents: 5000 })
    await expect(repo.recordPayment({ ...input, amountCents: 10001 })).rejects.toThrow('already used')
  })
  it('completes a bill with two payments and reverses both in order without double-counting', async () => {
    const { d, o } = await seed()
    const first = await repo.recordPayment(payment(d, o))
    const second = await repo.recordPayment(payment((await db.debts.get(d.id))!, (await db.obligations.get(o.id))!, 5000, 500))
    const rows = await db.transactions.toArray()
    expect(obligationPayment(o, rows)).toMatchObject({ paid: true, remainingCents: 0 })
    expect(monthlySummary('2026-01', 0, [o], rows).paidCount).toBe(1)
    expect((await db.debts.get(d.id))?.balanceCents).toBe(86500)
    await expect(repo.undoPayment(first.id, first.updatedAt)).rejects.toThrow('newer payments')
    await repo.undoPayment(second.id, second.updatedAt)
    expect((await db.debts.get(d.id))?.balanceCents).toBe(91000)
    expect(obligationPayment(o, await db.transactions.toArray()).status).toBe('Partial')
    await repo.undoPayment(first.id, first.updatedAt)
    expect((await db.debts.get(d.id))?.balanceCents).toBe(100000)
    expect(await db.transactions.count()).toBe(0)
    expect(obligationPayment(o, []).status).toBe('Unpaid')
  })
  it('rejects stale, mismatched, future, and excessive payments without writes', async () => {
    const { d, o } = await seed(), other = bill()
    await db.obligations.add(other)
    const input = payment(d, o), before = await readWorkspace()
    for (const invalid of [{ ...input, expectedDebtUpdatedAt: '2000-01-01T00:00:00.000Z' },
      { ...input, expectedObligationUpdatedAt: '2000-01-01T00:00:00.000Z' },
      { ...input, obligationId: other.id, expectedObligationUpdatedAt: other.updatedAt },
      { ...input, date: '9999-12-31' }, { ...input, amountCents: 200000 },
      { ...input, interestCents: 10001 }, { ...input, amountCents: 0 }]) await expect(repo.recordPayment(invalid)).rejects.toThrow()
    expect(await readWorkspace()).toEqual(before)
  })
  it('serializes competing bill-only payments and protects connected entries from ordinary edits', async () => {
    const o = bill(); await db.obligations.add(o)
    const outcomes = await Promise.allSettled([repo.recordPayment(payment(null, o)), repo.recordPayment(payment(null, o))])
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const row = (await db.transactions.toArray())[0]
    expect(row.kind).toBe('expense'); expect(row.payment?.principalCents).toBe(0)
    await expect(repo.deleteTransaction(row.id)).rejects.toThrow('Undo payment')
    await expect(repo.saveTransaction(row, row.id, row.updatedAt)).rejects.toThrow('Undo payment')
    await repo.undoPayment(row.id, row.updatedAt)
    expect(await db.transactions.count()).toBe(0)
  })
  it('rolls back principal and bill timestamps when the Ledger write fails', async () => {
    const { d, o } = await seed(), before = await readWorkspace()
    vi.spyOn(db.transactions, 'add').mockRejectedValueOnce(new Error('Simulated disk failure'))
    await expect(repo.recordPayment(payment(d, o))).rejects.toThrow('disk failure')
    expect(await readWorkspace()).toEqual(before)
  })
  it('refuses to overwrite a later statement adjustment during undo', async () => {
    const { d, o } = await seed(), row = await repo.recordPayment(payment(d, o))
    await repo.saveDebt({ ...d, balanceCents: 89000 }, d.id)
    await expect(repo.undoPayment(row.id, row.updatedAt)).rejects.toThrow('debt has changed')
    expect((await db.debts.get(d.id))?.balanceCents).toBe(89000)
    expect(await db.transactions.count()).toBe(1)
  })
  it('keeps receipt order after bill deletion and keeps history after debt deletion', async () => {
    const { d, o } = await seed()
    const first = await repo.recordPayment(payment(d, o))
    const second = await repo.recordPayment(payment((await db.debts.get(d.id))!, (await db.obligations.get(o.id))!, 5000, 500))
    await repo.deleteObligation(o.id)
    const currentSecond = (await db.transactions.get(second.id))!
    await repo.undoPayment(second.id, currentSecond.updatedAt)
    const currentFirst = (await db.transactions.get(first.id))!
    expect(currentFirst.payment?.recordedAt).toBe(first.payment?.recordedAt)
    await repo.deleteDebt(d.id)
    expect(validateBackup(await exportBackup()).transactions[0].payment?.debtName).toBe(d.name)
    await repo.undoPayment(first.id, currentFirst.updatedAt)
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('monthly recurrence', () => {
  it('adopts an existing paid bill without creating a duplicate or changing its history', async () => {
    const o = { ...bill(), name: 'Existing utility', debtId: null, paidAt: now() }; await db.obligations.add(o)
    const r = { ...rule(), name: o.name }
    await expect(repo.saveRecurringRule(r)).rejects.toThrow('Repeat monthly')
    await repo.saveRecurringRule(r, undefined, undefined, { id: o.id, expectedUpdatedAt: o.updatedAt })
    await repo.ensureRecurringMonth('2026-01'); await repo.ensureRecurringMonth('2026-02')
    expect(await db.obligations.where('month').equals('2026-01').count()).toBe(1)
    expect(await db.obligations.get(o.id)).toEqual(o)
    expect(await db.obligations.where('month').equals('2026-02').count()).toBe(1)
    expect(validateBackup(await exportBackup()).recurringOccurrences).toHaveLength(2)
  })
  it('generates once across concurrent callers and never posts actual income', async () => {
    const b = rule(), i = rule('income'); await db.recurringRules.bulkAdd([b, i])
    await Promise.all([repo.ensureRecurringMonth('2026-01'), repo.ensureRecurringMonth('2026-01')])
    expect(await db.obligations.count()).toBe(1); expect(await db.recurringOccurrences.count()).toBe(2)
    expect(await db.transactions.count()).toBe(0)
    await repo.ensureRecurringMonth('2026-02')
    expect(await db.obligations.count()).toBe(2); expect(await db.recurringOccurrences.count()).toBe(4)
  })
  it('preserves monthly edits and skipped bills while future months use the changed rule', async () => {
    const r = rule(); await db.recurringRules.add(r); await repo.ensureRecurringMonth('2026-01')
    const january = (await db.obligations.toArray())[0]
    await repo.saveObligation({ ...january, plannedCents: 12345 }, january.id, january.updatedAt)
    await repo.saveRecurringRule({ ...r, amountCents: 30000 }, r.id, r.updatedAt)
    await repo.ensureRecurringMonth('2026-01'); await repo.ensureRecurringMonth('2026-02')
    expect((await db.obligations.get(january.id))?.plannedCents).toBe(12345)
    expect((await db.obligations.where('month').equals('2026-02').first())?.plannedCents).toBe(30000)
    await repo.deleteObligation(january.id); await repo.ensureRecurringMonth('2026-01')
    expect(await db.obligations.where('month').equals('2026-01').count()).toBe(0)
    expect((await db.recurringOccurrences.get(`${r.id}:2026-01`))?.cancelled).toBe(true)
    expect(validateBackup(await exportBackup()).recurringOccurrences).toHaveLength(2)
  })
  it('supports month-specific income edits, skip/restore, and rule boundaries', async () => {
    const r = { ...rule('income'), startMonth: '2026-02', endMonth: '2026-03' }
    await db.recurringRules.add(r)
    for (const month of ['2026-01', '2026-02', '2026-03', '2026-04']) await repo.ensureRecurringMonth(month)
    expect(await db.recurringOccurrences.count()).toBe(2)
    const entry = (await db.recurringOccurrences.get(`${r.id}:2026-02`))!
    await repo.saveExpectedOccurrence(entry.id, 25000, 28, true, entry.updatedAt)
    const changed = (await db.recurringOccurrences.get(entry.id))!
    await expect(repo.saveExpectedOccurrence(entry.id, 1, null, false, entry.updatedAt)).rejects.toThrow('changed while')
    await repo.saveExpectedOccurrence(entry.id, 25000, 28, false, changed.updatedAt)
    expect((await db.recurringOccurrences.get(`${r.id}:2026-03`))?.amountCents).toBe(20000)
    await repo.saveRecurringRule({ ...r, enabled: false }, r.id, r.updatedAt)
    expect((await db.recurringRules.get(r.id))?.enabled).toBe(false)
  })
  it('automatically prepares a visited month through the live store and disposes cleanly', async () => {
    const r = rule(); await db.recurringRules.add(r)
    setActivePinia(createPinia()); const store = useFinanceStore(); store.month = '2026-01'; store.start()
    try {
      await vi.waitFor(() => expect(store.monthObligations).toHaveLength(1))
      store.month = '2026-02'
      await vi.waitFor(() => expect(store.monthObligations[0]?.month).toBe('2026-02'))
      expect(await db.obligations.count()).toBe(2)
    } finally { store.$dispose() }
  })
  it('copies manual bills alongside generated bills without duplicating recurrence', async () => {
    const r = rule(); await db.recurringRules.add(r)
    await repo.ensureRecurringMonth('2026-01'); await repo.ensureRecurringMonth('2026-02')
    await repo.saveIncome('2026-01', 50000); await repo.saveOpeningBalance('2026-01', 12345)
    await db.obligations.add({ ...bill(), name: 'One-off bill', debtId: null })
    await repo.copyPreviousMonth('2026-02')
    const february = await db.obligations.where('month').equals('2026-02').toArray()
    expect(february).toHaveLength(2)
    expect(february.filter(o => o.name === r.name)).toHaveLength(1)
    expect(await db.months.get('2026-02')).toMatchObject({ incomeCents: 50000, openingCents: null })
    await expect(repo.copyPreviousMonth('2026-02')).rejects.toThrow('already contains')
  })
})

describe('cashflow and comparisons', () => {
  it('reserves only the unpaid remainder after actual outflow, including cross-month links', () => {
    const o = bill(), t = transaction({ date: '2025-12-31', amountCents: 5000, obligationId: o.id })
    const income = transaction({ kind: 'income', amountCents: 30000 }), payment = transaction({ amountCents: 4000, obligationId: o.id })
    const future = transaction({ date: '2026-01-31', kind: 'income', amountCents: 999999 })
    expect(availableMoney('2026-01', 10000, [o], [t, income, payment, future], '2026-01-15')).toEqual({
      receivedCents: 30000, spentCents: 4000, outstandingCents: 6000, trackedCents: 36000, afterBillsCents: 30000
    })
    expect(availableMoney('2026-01', null, [o], [income], '2026-01-15').trackedCents).toBeNull()
    expect(availableMoney('2026-01', -1000, [], [], '2026-01-15').afterBillsCents).toBe(-1000)
  })
  it('keeps opening balances and expected income independent on save', async () => {
    await repo.saveOpeningBalance('2026-01', -1234); await repo.saveIncome('2026-01', 50000)
    expect(await db.months.get('2026-01')).toMatchObject({ openingCents: -1234, incomeCents: 50000 })
    await repo.saveOpeningBalance('2026-01', null)
    expect((await db.months.get('2026-01'))?.incomeCents).toBe(50000)
    expect(parseSignedMoney('-1,234.56')).toBe(-123456)
    expect(parseSignedMoney('--5')).toBeNull()
  })
  it('clamps due days correctly across leap years and century boundaries', () => {
    expect(dueDate('2026-02', 31)).toBe('2026-02-28')
    expect(dueDate('2024-02', 31)).toBe('2024-02-29')
    expect(dueDate('2100-02', 31)).toBe('2100-02-28')
    expect(dueDate('0001-02', 31)).toBe('0001-02-28')
    expect(() => dueDate('2026-01', 0)).toThrow()
  })
  it('compares extra payments without mutating saved inputs or inventing missing savings', () => {
    const input = Object.freeze(debt()), result = compareExtraPayment(input, 2500)
    expect(result.paymentCents).toBe(12500)
    expect(result.improved.months).toBeLessThan(result.base.months!)
    expect(result.interestSavedCents).toBeGreaterThan(0)
    expect(compareExtraPayment({ ...input, aprMilliPercent: null }, 2500).interestSavedCents).toBeNull()
    expect(compareExtraPayment({ ...input, monthlyPaymentCents: 0 }, 2500).monthsSaved).toBeNull()
    expect(() => compareExtraPayment(input, 99_999_999_999)).toThrow()
    expect(input.monthlyPaymentCents).toBeNull()
  })
  it('validates actual splits without adding estimated charges to saved balances', () => {
    expect(paymentSplit(100000, 10000, 1000)).toEqual({ principalCents: 9000, interestCents: 1000, balanceReductionCents: 9000, balanceAfterCents: 91000 })
    expect(paymentSplit(100000, 10000, 1000, true)).toEqual({ principalCents: 9000, interestCents: 1000, balanceReductionCents: 10000, balanceAfterCents: 90000 })
    expect(paymentSplit(100000, 10000, 0).balanceAfterCents).toBe(90000)
    expect(paymentSplit(100000, 1000, 1000).principalCents).toBe(0)
    expect(() => paymentSplit(100000, 1000, 1001)).toThrow()
    expect(() => paymentSplit(100, 1000, 0)).toThrow()
  })
})

describe('v3 data recovery', () => {
  it('restores a strict portable v2 file with neutral defaults for new features', async () => {
    const { payment: _receipt, ...oldTransaction } = transaction()
    const data = { format: 'accrynt-portable', schemaVersion: 2, exportedAt: now(),
      months: [{ key: '2026-01', incomeCents: 12345, updatedAt: now() }],
      obligations: [], transactions: [oldTransaction], debts: [(() => { const { aprMilliPercent, balanceAsOf: _date, interestMethod: _method, ...rest } = debt(); return { ...rest, aprBasisPoints: aprMilliPercent! / 10, monthlyPaymentCents: 12345 } })()] }
    await restoreBackup(data)
    const exported = await exportBackup()
    expect(exported.months[0]).toMatchObject({ incomeCents: 12345, openingCents: null })
    expect(exported.transactions[0].payment).toBeNull()
    expect(exported.debts[0].monthlyPaymentCents).toBe(12345)
    expect(exported.recurringRules).toEqual([]); expect(exported.recurringOccurrences).toEqual([])
  })
  it('roundtrips receipts, opening cash, rules, and generated entries atomically', async () => {
    const { d, o } = await seed(); await repo.recordPayment(payment(d, o))
    await repo.saveOpeningBalance('2026-01', 123456); await db.recurringRules.add(rule('income')); await repo.ensureRecurringMonth('2026-01')
    const backup = await exportBackup(); await clearWorkspace(); await restoreBackup(JSON.parse(JSON.stringify(backup)))
    expect(await exportBackup()).toMatchObject({ ...backup, exportedAt: expect.any(String) })
    const { interestIncludedInBalance: _flag, ...olderDraftReceipt } = backup.transactions[0].payment!
    expect(validateBackup({ ...backup, transactions: [{ ...backup.transactions[0], payment: olderDraftReceipt }] }).transactions[0].payment?.interestIncludedInBalance).toBe(false)
    const before = await readWorkspace()
    vi.spyOn(db.recurringOccurrences, 'bulkAdd').mockRejectedValueOnce(new Error('Simulated recurring write failure'))
    await expect(restoreBackup(backup)).rejects.toThrow('recurring write failure')
    expect(await readWorkspace()).toEqual(before)
    const tampered = { ...backup, transactions: backup.transactions.map(t => ({ ...t, payment: { ...t.payment!, principalCents: 1 } })) }
    await expect(restoreBackup(tampered)).rejects.toThrow('invalid payment receipt')
    expect(await readWorkspace()).toEqual(before)
  })
  it('upgrades a v2 database without rewriting balances or payment plans', async () => {
    const name = `accrynt-v2-upgrade-${newId()}`, old = new Dexie(name), upgraded = new AccryntDatabase(name)
    const d = { ...debt(), monthlyPaymentCents: 12345 }, { payment: _receipt, ...t } = transaction()
    const month = { key: '2026-01', incomeCents: 50000, updatedAt: now() }
    try {
      old.version(2).stores({ months: 'key', obligations: 'id,month,category,paidAt,debtId', transactions: 'id,date,kind,category,obligationId', debts: 'id' })
      await old.open(); const {aprMilliPercent, balanceAsOf: _date, interestMethod: _method, ...oldDebt} = d; await old.table('debts').add({ ...oldDebt, aprBasisPoints: aprMilliPercent!/10 }); await old.table('months').add(month); await old.table('transactions').add(t)
      old.close(); await upgraded.open()
      expect(await upgraded.debts.get(d.id)).toEqual(d)
      expect(await upgraded.months.get(month.key)).toEqual({ ...month, openingCents: null })
      expect(await upgraded.transactions.get(t.id)).toEqual({ ...t, payment: null })
      expect(await upgraded.recurringRules.count()).toBe(0)
    } finally { old.close(); upgraded.close(); await Dexie.delete(name) }
  })
})
