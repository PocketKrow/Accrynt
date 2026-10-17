import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { db, clearWorkspace, readWorkspace } from '../data/database'
import { exportBackup, recoverySnapshot, restoreBackup, validateBackup } from '../data/backup'
import { localRepository as repo } from '../data/repository'
import { useFinanceStore } from '../stores/finance'
import { localDate, now } from '../domain/models'

beforeEach(async () => { await db.open(); await clearWorkspace() })
afterEach(async () => { vi.restoreAllMocks(); await clearWorkspace(); db.close() })
it('keeps live observation after recurrence failure, suppresses automatic retries, and explicitly retries', async () => {
  setActivePinia(createPinia())
  const store = useFinanceStore()
  await repo.saveRecurringRule({ name: 'Synthetic income', kind: 'income', amountCents: 10000, category: 'Other', dueDay: 1, debtId: null, startMonth: store.month, endMonth: null, enabled: true })
  const generation = vi.spyOn(repo, 'ensureRecurringMonth').mockRejectedValue(new Error('Synthetic recurrence failure'))
  store.start()
  try {
    await vi.waitFor(() => expect(store.recurrenceWarning).toContain('Synthetic'))
    expect(store.planIncomplete).toBe(true); expect(store.error).toBe('')
    await repo.saveIncome(store.month, 12345)
    await vi.waitFor(() => expect(store.monthData?.incomeCents).toBe(12345))
    expect(generation).toHaveBeenCalledTimes(1)
    generation.mockRestore()
    await store.retryRecurrence()
    await vi.waitFor(() => expect(store.expectedOccurrences).toHaveLength(1))
    expect(store.planIncomplete).toBe(false)
  } finally { store.stop() }
})
it('rejects interest period and historical amount corruption while preserving reversed/deleted-debt history', async () => {
  await repo.saveDebt({ name: 'Synthetic loan', balanceCents: 100000, startingBalanceCents: null, minimumCents: 10000, monthlyPaymentCents: null, aprMilliPercent: 18000, balanceAsOf: null, interestMethod: 'monthly' })
  const d = (await db.debts.toArray())[0], period = localDate().slice(0, 7)
  await repo.adjustDebt({ id: `interest:${d.id}:${period}`, debtId: d.id, expectedUpdatedAt: d.updatedAt, kind: 'interest', date: localDate(), amountCents: 1500, note: 'Synthetic interest', period })
  const original = await exportBackup(), e = original.balanceEvents[0]
  expect(() => validateBackup({ ...original, balanceEvents: [{ ...e, date: period === '2026-01' ? '2026-02-01' : '2026-01-01' }] })).toThrow('historical')
  expect(() => validateBackup({ ...original, balanceEvents: [{ ...e, deltaCents: 1501, balanceAfterCents: 101501 }] })).toThrow('historical')
  await repo.undoAdjustment(e.id)
  await repo.deleteDebt(d.id)
  const valid = await exportBackup()
  await restoreBackup(valid)
  expect((await exportBackup()).balanceEvents[0].reversedAt).not.toBeNull()
})
it('reproduces a corrupt-state portable export failure and preserves raw rows for recovery and atomic repair', async () => {
  await db.months.add({ key: '2026-01', incomeCents: -1, openingCents: null, updatedAt: now() })
  await expect(exportBackup()).rejects.toThrow()
  const broken = await readWorkspace(), recovery = await recoverySnapshot()
  expect(recovery.raw).toBe(true)
  expect(recovery.data.format).toBe('accrynt-raw-recovery')
  expect(recovery.data.months).toEqual(broken.months)
  expect(() => validateBackup(recovery.data)).toThrow()
  const valid = { ...broken, format: 'accrynt-portable', schemaVersion: 4, workspace: 'personal', exportedAt: now(), months: [] }
  vi.spyOn(db.debts, 'bulkAdd').mockRejectedValueOnce(new Error('Synthetic restore failure'))
  await expect(restoreBackup(valid)).rejects.toThrow('Synthetic')
  expect(await readWorkspace()).toEqual(broken)
  await restoreBackup(valid)
  expect((await exportBackup()).months).toEqual([])
  expect((await recoverySnapshot()).raw).toBe(false)
})
