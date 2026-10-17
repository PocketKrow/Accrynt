import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import Dexie from 'dexie'
import { AccryntDatabase, db, clearWorkspace, readWorkspace } from '../data/database'
import { exportBackup, restoreBackup, validateBackup } from '../data/backup'
import { loadOctoberExample } from '../data/example'
import { localRepository as repo } from '../data/repository'
import { monthlySummary } from '../domain/finance'
import { migrateLegacyDebt, newId, now, type Backup, type Debt, type Obligation, type Transaction } from '../domain/models'
import { useFinanceStore } from '../stores/finance'

const debt = (): Debt => ({ id: newId(), name: 'Test loan', balanceCents: 10000,
  startingBalanceCents: 10000, minimumCents: 2000, monthlyPaymentCents: null, aprMilliPercent: 17000, balanceAsOf: null, interestMethod: 'monthly', updatedAt: now() })
const legacyDebt = () => {
  const { aprMilliPercent, balanceAsOf: _asOf, interestMethod: _method, ...rest } = debt()
  return { ...rest, aprBasisPoints: aprMilliPercent === null ? null : aprMilliPercent / 10 }
}
const obligation = (debtId: string | null = null): Obligation => ({ id: newId(), month: '2026-12',
  name: 'Test bill', category: 'Utilities', plannedCents: 2000, dueDay: 31, paidAt: null, debtId, updatedAt: now() })
const transaction = (obligationId: string | null = null): Transaction => ({ id: newId(), date: '2026-12-31',
  name: 'Test payment', kind: 'expense', category: 'Utilities', amountCents: 1800, account: 'Test checking', obligationId, payment: null, updatedAt: now() })
const blankBackup = (): Backup => ({ format: 'accrynt-portable', schemaVersion: 5, workspace: 'personal', balanceEvents: [], exportedAt: now(),
  months: [], obligations: [], transactions: [], debts: [], recurringRules: [], recurringOccurrences: [] })

beforeEach(async () => { await db.open(); await clearWorkspace() })
afterEach(async () => { vi.restoreAllMocks(); await clearWorkspace(); db.close() })

async function seed() {
  const d = debt(), o = obligation(d.id), t = transaction(o.id)
  await restoreBackup({ ...blankBackup(), debts: [d], obligations: [o], transactions: [t],
    months: [{ key: '2026-12', incomeCents: 50000, openingCents: null, updatedAt: now() }] })
  return { d, o, t }
}

describe('repository integrity', () => {
  it('keeps paid status, plan totals, ledger totals, and debt balances independent', async () => {
    const { o } = await seed()
    await repo.setObligationPaid(o.id, true)
    const state = await readWorkspace()
    expect(state.transactions).toHaveLength(1)
    expect(state.debts[0].balanceCents).toBe(10000)
    expect(monthlySummary('2026-12', 50000, state.obligations, state.transactions, '2026-12-31')).toMatchObject({
      plannedCents: 2000, remainingCents: 48000, actualOutflowCents: 1800, paidCount: 1
    })
  })
  it('deletes debts and obligations without deleting historical transactions', async () => {
    const { d, o, t } = await seed()
    await repo.deleteDebt(d.id)
    expect((await db.obligations.get(o.id))?.debtId).toBeNull()
    await repo.deleteObligation(o.id)
    expect((await db.transactions.get(t.id))?.obligationId).toBeNull()
    expect((await db.transactions.get(t.id))?.amountCents).toBe(1800)
    expect((await exportBackup()).debts).toEqual([])
  })
  it('rejects missing links and incompatible new transaction kinds', async () => {
    await expect(repo.saveObligation(obligation(newId()))).rejects.toThrow('linked debt')
    await expect(repo.saveTransaction(transaction(newId()))).rejects.toThrow('related obligation')
    const { o } = await seed()
    await expect(repo.saveTransaction({ ...transaction(o.id), kind: 'income' })).rejects.toThrow('Income cannot')
    await expect(repo.saveTransaction({ ...transaction(), kind: 'debt-payment' })).rejects.toThrow('category')
    await expect(repo.saveTransaction({ ...transaction(), amountCents: 0 })).rejects.toThrow('greater than zero')
  })
  it('does not resurrect deleted records from stale editors', async () => {
    const { d, o, t } = await seed()
    await repo.deleteTransaction(t.id)
    await repo.deleteObligation(o.id)
    await repo.deleteDebt(d.id)
    await expect(repo.saveTransaction({ ...t, obligationId: null }, t.id, t.updatedAt)).rejects.toThrow('no longer exists')
    await expect(repo.saveObligation({ ...o, debtId: null }, o.id, o.updatedAt)).rejects.toThrow('no longer exists')
    await expect(repo.saveDebt(d, d.id, d.updatedAt)).rejects.toThrow('no longer exists')
    await expect(repo.setObligationPaid(o.id, true)).rejects.toThrow('no longer exists')
  })
  it('rejects stale edits and moving a historical obligation between months', async () => {
    const { o, t, d } = await seed()
    const newer = '2027-01-01T00:00:00.000Z'
    await db.obligations.update(o.id, { updatedAt: newer })
    await db.transactions.update(t.id, { updatedAt: newer })
    await db.debts.update(d.id, { updatedAt: newer })
    await expect(repo.saveObligation(o, o.id, o.updatedAt)).rejects.toThrow('changed while')
    await expect(repo.saveTransaction(t, t.id, t.updatedAt)).rejects.toThrow('changed while')
    await expect(repo.saveDebt(d, d.id, d.updatedAt)).rejects.toThrow('changed while')
    await expect(repo.saveObligation({ ...o, month: '2027-01' }, o.id)).rejects.toThrow('cannot move')
  })
  it('detects consecutive edits even when the clock returns the same millisecond', async () => {
    const { d } = await seed()
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(d.updatedAt))
    await repo.saveDebt({ ...d, balanceCents: 9000 }, d.id, d.updatedAt)
    const updated = await db.debts.get(d.id)
    expect(updated?.updatedAt).not.toBe(d.updatedAt)
    await expect(repo.saveDebt(d, d.id, d.updatedAt)).rejects.toThrow('changed while')
  })
  it('permits debt growth above the starting balance', async () => {
    const { d } = await seed()
    await repo.saveDebt({ ...d, balanceCents: 15000 }, d.id, d.updatedAt)
    expect((await db.debts.get(d.id))?.balanceCents).toBe(15000)
  })
  it('serializes a link creation racing a debt deletion without orphans', async () => {
    const d = debt(); await db.debts.add(d)
    await Promise.allSettled([repo.saveObligation(obligation(d.id)), repo.deleteDebt(d.id)])
    const backup = await exportBackup()
    expect(backup.obligations.every(o => o.debtId === null)).toBe(true)
  })
  it('updates paid fields without overwriting an existing name or amount', async () => {
    const { o } = await seed()
    await Promise.all([repo.setObligationPaid(o.id, true), repo.saveObligation({ ...o, name: 'Changed bill', plannedCents: 3500 }, o.id)])
    const saved = await db.obligations.get(o.id)
    expect(saved?.name).toBe('Changed bill')
    expect(saved?.plannedCents).toBe(3500)
  })
})

describe('month rollover and examples', () => {
  it('copies December into January with new IDs and cleared paid status', async () => {
    const { o } = await seed(); await repo.setObligationPaid(o.id, true)
    await repo.copyPreviousMonth('2027-01')
    const january = await db.obligations.where('month').equals('2027-01').toArray()
    expect(january).toHaveLength(1)
    expect(january[0]).toMatchObject({ name: o.name, plannedCents: 2000, debtId: o.debtId, paidAt: null })
    expect(january[0].id).not.toBe(o.id)
    expect((await db.obligations.get(o.id))?.paidAt).not.toBeNull()
    expect((await db.months.get('2027-01'))?.incomeCents).toBe(50000)
    await expect(repo.copyPreviousMonth('2027-01')).rejects.toThrow('already contains')
  })
  it('refuses empty sources and malformed months without writes', async () => {
    await expect(repo.copyPreviousMonth('2026-12')).rejects.toThrow('no previous')
    await expect(repo.copyPreviousMonth('2026-13')).rejects.toThrow()
    await expect(repo.copyPreviousMonth('0001-01')).rejects.toThrow()
    expect((await readWorkspace()).months).toEqual([])
  })
  it('loads examples only into an empty workspace', async () => {
    await loadOctoberExample('2026-10')
    expect((await db.obligations.toArray()).length).toBeGreaterThan(0)
    expect(await db.transactions.count()).toBe(0)
    expect(await db.debts.count()).toBe(0)
    await expect(loadOctoberExample('2026-11')).rejects.toThrow('completely empty')
  })
})

describe('portable backup safety', () => {
  it('roundtrips all four tables and survives closing and reopening the database', async () => {
    await seed(); const first = await exportBackup()
    await clearWorkspace(); await restoreBackup(JSON.parse(JSON.stringify(first)))
    db.close(); await db.open()
    expect(await readWorkspace()).toEqual({ months: first.months, obligations: first.obligations,
      transactions: first.transactions, debts: first.debts, recurringRules: first.recurringRules, recurringOccurrences: first.recurringOccurrences, balanceEvents: first.balanceEvents })
  })
  it.each(['months', 'obligations', 'transactions', 'debts'] as const)('rejects duplicate %s', async table => {
    await seed(); const backup = await exportBackup()
    const invalid = { ...backup, [table]: [backup[table][0], backup[table][0]] }
    await expect(restoreBackup(invalid)).rejects.toThrow('duplicate')
    expect(await readWorkspace()).toEqual({ months: backup.months, obligations: backup.obligations,
      transactions: backup.transactions, debts: backup.debts, recurringRules: backup.recurringRules, recurringOccurrences: backup.recurringOccurrences, balanceEvents: backup.balanceEvents })
  })
  it('rejects invalid payloads and missing relations before clearing anything', async () => {
    await seed(); const before = await readWorkspace()
    for (const invalid of [null, {}, { ...blankBackup(), schemaVersion: 99 },
      { ...blankBackup(), obligations: [obligation(newId())] },
      { ...blankBackup(), transactions: [transaction(newId())] },
      { ...blankBackup(), transactions: [{ ...transaction(), date: '2026-02-30' }] }]) {
      await expect(restoreBackup(invalid)).rejects.toThrow()
      expect(await readWorkspace()).toEqual(before)
    }
  })
  it('rolls back every table when a write fails partway through replacement', async () => {
    await seed(); const before = await readWorkspace()
    vi.spyOn(db.transactions, 'bulkAdd').mockRejectedValueOnce(new Error('Simulated disk write failure'))
    await expect(restoreBackup({ ...blankBackup(), obligations: [obligation()] })).rejects.toThrow('disk write failure')
    expect(await readWorkspace()).toEqual(before)
  })
  it('exports a consistent snapshot while another transaction deletes a linked debt', async () => {
    const { d } = await seed()
    const [backup] = await Promise.all([exportBackup(), repo.deleteDebt(d.id)])
    expect(validateBackup(backup)).toEqual(backup)
    expect(validateBackup(await exportBackup()).debts).toEqual([])
  })
  it('retains valid v1 zero-value history and cross-month payment links', async () => {
    const o = obligation(); const t = { ...transaction(o.id), date: '2027-01-02', amountCents: 0 }
    const { payment: _receipt, ...legacyTransaction } = t
    await restoreBackup({ format: 'accrynt-portable', schemaVersion: 1, exportedAt: now(), months: [], debts: [], obligations: [o], transactions: [legacyTransaction] })
    expect((await exportBackup()).transactions[0]).toEqual({ ...t, incomeOccurrenceId: null })
  })
})

describe('debt payment storage and upgrades', () => {
  it('persists a custom payment including explicit zero through export and restore', async () => {
    const d = debt()
    await repo.saveDebt({ ...d, monthlyPaymentCents: 3500 })
    let backup = await exportBackup()
    expect(backup.schemaVersion).toBe(5)
    expect(backup.debts[0].monthlyPaymentCents).toBe(3500)
    await repo.saveDebt({ ...backup.debts[0], monthlyPaymentCents: 0 }, backup.debts[0].id)
    backup = await exportBackup()
    await clearWorkspace(); await restoreBackup(JSON.parse(JSON.stringify(backup)))
    expect((await db.debts.toArray())[0].monthlyPaymentCents).toBe(0)
  })
  it('restores strict legacy v1 debts with a minimum-payment fallback', async () => {
    const { monthlyPaymentCents: _payment, ...legacy } = legacyDebt()
    const original = { format: 'accrynt-portable', schemaVersion: 1, exportedAt: now(), months: [], obligations: [], transactions: [], debts: [legacy] }
    await restoreBackup(original)
    expect((await exportBackup()).debts).toEqual([migrateLegacyDebt({ ...legacy, monthlyPaymentCents: null })])
    expect(original.debts[0]).not.toHaveProperty('monthlyPaymentCents')
  })
  it('rejects invalid v2 payments and version-disguised fields without clearing data', async () => {
    await seed(); const before = await readWorkspace()
    const { monthlyPaymentCents: _payment, ...legacy } = legacyDebt()
    for (const row of [legacy, { ...debt(), monthlyPaymentCents: -1 }, { ...debt(), monthlyPaymentCents: 1.5 }]) {
      await expect(restoreBackup({ ...blankBackup(), debts: [row] })).rejects.toThrow()
    }
    await expect(restoreBackup({ ...blankBackup(), schemaVersion: 1, debts: [legacyDebt()] })).rejects.toThrow()
    expect(await readWorkspace()).toEqual(before)
  })
  it('upgrades an actual v1 IndexedDB in place without changing balances or linked history', async () => {
    const name = `accrynt-migration-test-${newId()}`
    const old = new Dexie(name), upgraded = new AccryntDatabase(name)
    const { monthlyPaymentCents: _payment, ...legacy } = legacyDebt()
    const o = obligation(legacy.id), t = transaction(o.id)
    const month = { key: '2026-12', incomeCents: 50000, updatedAt: now() }
    try {
      old.version(1).stores({ months: 'key', obligations: 'id,month,category,paidAt,debtId',
        transactions: 'id,date,kind,category,obligationId', debts: 'id' })
      await old.open()
      await old.table('debts').add(legacy); await old.table('obligations').add(o)
      await old.table('transactions').add(t); await old.table('months').add(month)
      old.close(); await upgraded.open()
      expect(await upgraded.debts.get(legacy.id)).toEqual(migrateLegacyDebt({ ...legacy, monthlyPaymentCents: null }))
      expect(await upgraded.obligations.toArray()).toEqual([o])
      expect(await upgraded.transactions.toArray()).toEqual([t])
      expect(await upgraded.months.toArray()).toEqual([{ ...month, openingCents: null }])
      upgraded.close(); await upgraded.open()
      expect(await upgraded.debts.count()).toBe(1)
    } finally { old.close(); upgraded.close(); await Dexie.delete(name) }
  })
})

describe('live workspace refresh', () => {
  it('observes writes, disposes its subscription, and can restart', async () => {
    setActivePinia(createPinia())
    const store = useFinanceStore(); store.month = '2026-12'; store.start()
    try {
      await vi.waitFor(() => expect(store.loaded).toBe(true))
      await repo.saveIncome('2026-12', 12300, await db.months.get('2026-12') ?? null)
      await vi.waitFor(() => expect(store.monthData?.incomeCents).toBe(12300))
      store.stop(); await repo.saveIncome('2026-12', 23400, await db.months.get('2026-12') ?? null)
      store.start()
      await vi.waitFor(() => expect(store.monthData?.incomeCents).toBe(23400))
    } finally { store.$dispose() }
  })
  it('recovers from a database read error using Retry', async () => {
    setActivePinia(createPinia())
    const store = useFinanceStore()
    vi.spyOn(db.months, 'toArray').mockRejectedValueOnce(new Error('Simulated storage unavailable'))
    store.start()
    try {
      await vi.waitFor(() => expect(store.error).toContain('storage unavailable'))
      store.start()
      await vi.waitFor(() => { expect(store.loaded).toBe(true); expect(store.error).toBe('') })
    } finally { store.$dispose() }
  })
})
