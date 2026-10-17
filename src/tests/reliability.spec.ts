import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearWorkspace, db, readWorkspace } from '../data/database'
import { localRepository as repo } from '../data/repository'
import { assertBackupSize, BACKUP_MAX_BYTES, exportBackup, readBackupFile, restoreBackup, serializeBackup, utf8Bytes } from '../data/backup'
import { newId, now, type RecurringRule, type Transaction } from '../domain/models'

beforeEach(async () => { await db.open(); await clearWorkspace() })
afterEach(async () => { vi.restoreAllMocks(); await clearWorkspace(); db.close() })
const baseline = async () => await db.months.get('2026-10') ?? null

describe('monthly compare-and-set', () => {
  it.each(['income', 'opening'] as const)('rejects competing %s saves and keeps the first value', async field => {
    await repo.saveIncome('2026-10', 100, null)
    const snapshot = await baseline()
    const save = (cents: number) => field === 'income' ? repo.saveIncome('2026-10', cents, snapshot) : repo.saveOpeningBalance('2026-10', cents, snapshot)
    const results = await Promise.allSettled([save(200), save(300)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.message).toContain('Your draft is kept')
  })
  it('allows independent field saves from the same baseline without sibling loss', async () => {
    await repo.saveIncome('2026-10', 100, null)
    const snapshot = await baseline()
    await Promise.all([repo.saveIncome('2026-10', 500, snapshot), repo.saveOpeningBalance('2026-10', -100, snapshot)])
    expect(await baseline()).toMatchObject({ incomeCents: 500, openingCents: -100 })
  })
  it('handles absent-month creation, explicit zero/unknown and deletion deliberately', async () => {
    await Promise.all([repo.saveIncome('2026-10', 0, null), repo.saveOpeningBalance('2026-10', 0, null)])
    expect(await baseline()).toMatchObject({ incomeCents: 0, openingCents: 0 })
    await expect(repo.saveOpeningBalance('2026-10', 100, null)).rejects.toThrow('changed while')
    const snapshot = await baseline(); await db.months.delete('2026-10')
    await expect(repo.saveIncome('2026-10', 500, snapshot)).rejects.toThrow('changed while')
    await expect(repo.saveOpeningBalance('2026-10', null, snapshot)).rejects.toThrow('changed while')
    expect(await baseline()).toBeNull()
    await repo.saveOpeningBalance('2026-10', -300, null)
    await expect(repo.saveOpeningBalance('2026-10', 1, snapshot)).rejects.toThrow('changed while')
  })
  it('checks copy-month income against the opening baseline and rolls back copied bills', async () => {
    await repo.saveIncome('2026-09', 900, null)
    await repo.saveIncome('2026-10', 100, null)
    const snapshot = await baseline()
    await repo.saveIncome('2026-10', 200, snapshot)
    const before = await readWorkspace()
    await expect(repo.copyPreviousMonth('2026-10', { copyAdditionalIncome: true, incomeBaseline: snapshot })).rejects.toThrow('changed while')
    expect(await readWorkspace()).toEqual(before)
    await repo.copyPreviousMonth('2026-10', { copyAdditionalIncome: false, incomeBaseline: snapshot })
    expect((await baseline())?.incomeCents).toBe(200)
  })
})

describe('bounded UTF-8 portable files', () => {
  it('exports a valid non-ASCII archive above the previous 15 MB limit and restores its exact bytes', async () => {
    const rows: Transaction[] = Array.from({ length: 24_000 }, () => ({ id: newId(), date: '2026-10-01',
      name: '備'.repeat(100), kind: 'expense', category: 'Other', amountCents: 100,
      account: '雪'.repeat(80), obligationId: null, payment: null, updatedAt: now() }))
    await db.transactions.bulkAdd(rows)
    const backup = await exportBackup(), text = serializeBackup(backup)
    expect(utf8Bytes(text)).toBeGreaterThan(15_000_000)
    expect(utf8Bytes(text)).toBeGreaterThan(text.length)
    const parsed = await readBackupFile({ size: utf8Bytes(text), text: async () => text })
    await clearWorkspace(); await restoreBackup(parsed)
    expect((await exportBackup()).transactions).toEqual(backup.transactions)
  }, 20_000)
  it('refuses a schema-valid export above 64 MB instead of producing an unrestorable portable artifact', async () => {
    await db.transactions.bulkAdd(Array.from({ length: 80_000 }, () => ({ id: newId(), date: '2026-10-01',
      name: '備'.repeat(100), kind: 'expense' as const, category: 'Other' as const, amountCents: 1,
      account: '雪'.repeat(80), obligationId: null, payment: null, updatedAt: now() })))
    await expect(exportBackup()).rejects.toThrow('64 MB')
    expect(await db.transactions.count()).toBe(80_000)
  }, 20_000)
  it('accepts the exact byte budget, rejects one byte over before reading, and leaves records unchanged', async () => {
    expect(() => assertBackupSize(BACKUP_MAX_BYTES)).not.toThrow()
    expect(() => assertBackupSize(BACKUP_MAX_BYTES + 1)).toThrow('64 MB')
    await repo.saveIncome('2026-10', 123, null)
    const before = await readWorkspace(), text = vi.fn(async () => '{}')
    await expect(readBackupFile({ size: BACKUP_MAX_BYTES + 1, text })).rejects.toThrow('64 MB')
    expect(text).not.toHaveBeenCalled()
    await expect(readBackupFile({ size: 3, text: async () => 'bad' })).rejects.toThrow()
    await expect(readBackupFile({ size: 2, text: async () => '{}' })).rejects.toThrow()
    expect(await readWorkspace()).toEqual(before)
  })
})

describe('explicit skipped bill restore', () => {
  it('restores the saved monthly snapshot once across races, despite changed/paused rules, retaining detached receipts', async () => {
    const rule: RecurringRule = { id: newId(), name: 'Original utility', kind: 'bill', category: 'Utilities', amountCents: 5000,
      dueDay: 31, debtId: null, startMonth: '2026-01', endMonth: null, enabled: true, updatedAt: now() }
    await db.recurringRules.add(rule); await repo.ensureRecurringMonth('2026-10')
    let bill = (await db.obligations.toArray())[0]
    await repo.saveObligation({ ...bill, name: 'Monthly edited utility', plannedCents: 7000, dueDay: 20 }, bill.id, bill.updatedAt)
    bill = (await db.obligations.get(bill.id))!
    await repo.recordPayment({ id: newId(), date: '2026-10-01', name: 'Partial utility payment', amountCents: 1000, interestCents: 0, account: '',
      debtId: null, obligationId: bill.id, expectedObligationUpdatedAt: bill.updatedAt })
    await repo.deleteObligation(bill.id)
    const entry = (await db.recurringOccurrences.toArray())[0], receipts = await db.transactions.toArray()
    await repo.saveRecurringRule({ ...rule, amountCents: 9999, name: 'Changed rule', enabled: false }, rule.id, rule.updatedAt)
    const [one, two] = await Promise.all([repo.restoreSkippedBill(entry.id, entry.updatedAt, { category: 'Utilities', debtId: null }),
      repo.restoreSkippedBill(entry.id, entry.updatedAt, { category: 'Utilities', debtId: null })])
    expect(one?.id).toBe(two?.id); expect(one?.id).not.toBe(bill.id)
    await expect(repo.restoreSkippedBill(entry.id, entry.updatedAt, { category: 'Other', debtId: null })).rejects.toThrow('different links')
    expect(one).toMatchObject({ name: 'Monthly edited utility', plannedCents: 7000, dueDay: 20, paidAt: null })
    await repo.ensureRecurringMonth('2026-10'); db.close(); await db.open(); await repo.ensureRecurringMonth('2026-10')
    expect(await db.obligations.count()).toBe(1)
    expect(await db.transactions.toArray()).toEqual(receipts)
    expect((await exportBackup()).recurringOccurrences[0].id).toBe(entry.id)
  })
  it('rejects a deleted selected debt and stale skip snapshots without writes', async () => {
    const rule: RecurringRule = { id: newId(), name: 'Skipped bill', kind: 'bill', category: 'Other', amountCents: 500,
      dueDay: null, debtId: null, startMonth: '2026-01', endMonth: null, enabled: true, updatedAt: now() }
    await db.recurringRules.add(rule); await repo.ensureRecurringMonth('2026-10')
    await repo.deleteObligation((await db.obligations.toArray())[0].id)
    const entry = (await db.recurringOccurrences.toArray())[0], before = await readWorkspace()
    await expect(repo.restoreSkippedBill(entry.id, entry.updatedAt, { category: 'Other', debtId: newId() })).rejects.toThrow('debt no longer exists')
    await expect(repo.restoreSkippedBill(entry.id, '2000-01-01T00:00:00.000Z', { category: 'Other', debtId: null })).rejects.toThrow('changed while')
    expect(await readWorkspace()).toEqual(before)
  })
})
