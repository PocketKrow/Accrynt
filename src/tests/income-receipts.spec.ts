import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { db, clearWorkspace, readWorkspace } from '../data/database'
import { localRepository as repo } from '../data/repository'
import { exportBackup, restoreBackup, validateBackup } from '../data/backup'
import { incomeReceipt, monthlySummary } from '../domain/finance'
import { newId } from '../domain/models'

beforeEach(async () => { await db.open(); await clearWorkspace() })
afterEach(async () => { vi.restoreAllMocks(); await clearWorkspace(); db.close() })
async function setup() {
  await repo.saveRecurringRule({ name: 'Synthetic salary', kind: 'income', amountCents: 100000, category: 'Other', dueDay: 1, debtId: null, startMonth: '2026-01', endMonth: null, enabled: true })
  await repo.ensureRecurringMonth('2026-01')
  return (await db.recurringOccurrences.toArray())[0]
}
const input = (link: string | null, amountCents = 30000) => ({ date: '2026-01-02', name: 'Synthetic deposit', kind: 'income' as const, category: 'Other' as const, amountCents, account: '', obligationId: null, incomeOccurrenceId: link })
it('derives partial/multiple/excess receipts, excludes scheduled amounts and preserves expected totals', async () => {
  const occurrence = await setup(), requestId = newId()
  await Promise.all([repo.saveTransaction(input(occurrence.id), undefined, undefined, { requestId }), repo.saveTransaction(input(occurrence.id), undefined, undefined, { requestId })])
  expect(await db.transactions.count()).toBe(1)
  await expect(repo.saveTransaction(input(occurrence.id, 40000), undefined, undefined, { requestId })).rejects.toThrow('already used')
  await repo.saveTransaction({ ...input(occurrence.id, 80000), date: '2026-01-20' })
  await repo.saveTransaction(input(null, 1000))
  const rows = await db.transactions.toArray()
  expect(incomeReceipt(occurrence, rows, '2026-01-10')).toEqual({ receivedCents: 30000, scheduledCents: 80000, remainingCents: 70000, status: 'Partial' })
  expect(incomeReceipt(occurrence, rows, '2026-01-31')).toMatchObject({ receivedCents: 110000, remainingCents: 0, status: 'Received' })
  expect(monthlySummary('2026-01', occurrence.amountCents, [], rows, '2026-01-10').remainingCents).toBe(100000)
  expect((await db.recurringOccurrences.get(occurrence.id))?.amountCents).toBe(100000)
})
it('links existing income only on explicit edit; edits/deletes/type changes and skipped/restored plans retain honest status', async () => {
  const o = await setup()
  await repo.saveTransaction(input(null))
  let t = (await db.transactions.toArray())[0]
  expect(incomeReceipt(o, [t], '2026-01-10').receivedCents).toBe(0)
  await repo.saveTransaction(input(o.id), t.id, t.updatedAt)
  t = (await db.transactions.get(t.id))!
  expect(incomeReceipt(o, [t], '2026-01-10').receivedCents).toBe(30000)
  await repo.saveExpectedOccurrence(o.id, o.amountCents, o.dueDay, true, o.updatedAt)
  expect(incomeReceipt((await db.recurringOccurrences.get(o.id))!, [t], '2026-01-10').receivedCents).toBe(30000)
  const skipped = (await db.recurringOccurrences.get(o.id))!
  await repo.saveExpectedOccurrence(o.id, o.amountCents, o.dueDay, false, skipped.updatedAt)
  await repo.saveTransaction(input(o.id, 45000), t.id, t.updatedAt)
  t = (await db.transactions.get(t.id))!
  await expect(repo.saveTransaction({ ...input(o.id), kind: 'expense' }, t.id, t.updatedAt)).rejects.toThrow('Only income')
  await expect(repo.saveTransaction(input(o.id), t.id, o.updatedAt)).rejects.toThrow('changed')
  await repo.deleteTransaction(t.id)
  expect(incomeReceipt(o, await db.transactions.toArray(), '2026-01-10').status).toBe('Expected')
})
it('validates link references and supports original v4, v5 roundtrip, native reopen and atomic rollback', async () => {
  const o = await setup()
  await repo.saveTransaction(input(o.id))
  const modern = await exportBackup()
  expect(modern.schemaVersion).toBe(5)
  expect(() => validateBackup({ ...modern, transactions: [{ ...modern.transactions[0], incomeOccurrenceId: 'missing' }] })).toThrow('occurrence')
  const v4 = { ...modern, schemaVersion: 4, transactions: modern.transactions.map(({ incomeOccurrenceId: _, ...row }) => row) }
  expect(validateBackup(v4).transactions[0].incomeOccurrenceId).toBeNull()
  await restoreBackup(modern)
  expect((await exportBackup()).transactions).toEqual(modern.transactions)
  const before = await readWorkspace()
  vi.spyOn(db.transactions, 'bulkAdd').mockRejectedValueOnce(new Error('Synthetic failure'))
  await expect(restoreBackup(v4)).rejects.toThrow('Synthetic')
  expect(await readWorkspace()).toEqual(before)
  db.close(); await db.open()
  expect((await db.transactions.toArray())[0].incomeOccurrenceId).toBe(o.id)
  expect(db.verno).toBe(4)
})
