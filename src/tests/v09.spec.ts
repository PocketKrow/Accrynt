import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import { AccryntDatabase, db, clearWorkspace, readWorkspace, readTrackedWorkspace } from '../data/database'
import { capturePortableSnapshot, exportBackup, initiatePortableDownload, markBackupInitiated, restoreBackup, snoozeBackupReminder } from '../data/backup'
import { backupFreshness, financialTables, initialHealth, needsBackupReminder, BACKUP_SNOOZE_MS } from '../data/backup-health'
import { localRepository as repo } from '../data/repository'
import { demoFixture, seedDemo } from '../data/demo'
import { loadOctoberExample } from '../data/example'
import { matchingTotals } from '../domain/ledger'
import { availableMoney, buildObligationPayments } from '../domain/finance'
import { newId, now, type Transaction } from '../domain/models'

beforeEach(async () => { await db.open(); await clearWorkspace(); await db.backupHealth.put(initialHealth()) })
afterEach(async () => { vi.restoreAllMocks(); await clearWorkspace(); db.close() })
const health = async () => (await db.backupHealth.get('workspace'))!
const tx = (overrides: Partial<Transaction> = {}): Transaction => ({ id: newId(), date:'2026-10-01', name:'Synthetic entry', kind:'expense', category:'Other', amountCents:100, account:'', obligationId:null, incomeOccurrenceId:null, payment:null, updatedAt:now(), ...overrides })
async function expectChange(action: () => Promise<unknown>) { const before = await health(); await action(); expect((await health()).revision).toBeGreaterThan(before.revision) }

it('tracks each of the seven financial tables, including implicit writes, bulk writes, edits and deletion', async () => {
  const fixture = demoFixture('2026-10-18')
  for (const name of financialTables) {
    const row = fixture[name][0]
    if (!row) throw Error(`Missing test fixture for ${name}`)
    await expectChange(() => db.table(name).put(row))
    await expectChange(() => db.table(name).put(row)) // conservative identical durable writes count
    const key = name === 'months' ? (row as {key:string}).key : (row as {id:string}).id
    await expectChange(() => db.table(name).delete(key))
    await expectChange(() => db.table(name).bulkPut(fixture[name]))
  }
})
it('commits metadata with financial writes and rolls both back, including partially failed bulk operations', async () => {
  const before = await health(), a = tx()
  await expect(db.transaction('rw', db.transactions, async () => { await db.transactions.add(a); throw Error('rollback') })).rejects.toThrow('rollback')
  expect(await db.transactions.count()).toBe(0); expect(await health()).toEqual(before)
  await expect(db.transaction('rw', db.transactions, () => db.transactions.bulkAdd([a,a]))).rejects.toThrow()
  expect(await db.transactions.count()).toBe(0); expect(await health()).toEqual(before)
  await db.transaction('rw', db.transactions, async () => { try { await db.transactions.bulkAdd([a,a]) } catch { /* explicitly retain partial success */ } })
  expect(await db.transactions.count()).toBe(1); expect((await health()).revision).toBeGreaterThan(before.revision)
})
it('serializes parallel financial writes in one transaction without losing revisions', async () => {
  const before = await health()
  await db.transaction('rw', db.transactions, db.months, async () => {
    await Promise.all([db.transactions.add(tx()), db.transactions.add(tx()), db.months.put({key:'2026-10', incomeCents:0, openingCents:0, updatedAt:now()})])
  })
  expect((await health()).revision).toBe(before.revision + 3)
})
it('keeps reads, metadata updates, idempotent requests and already-generated recurrence clean', async () => {
  const requestId = newId(), row = tx()
  await repo.saveTransaction(row, undefined, undefined, {requestId})
  const revision = (await health()).revision
  await Promise.all([readWorkspace(), exportBackup(), snoozeBackupReminder()])
  await repo.saveTransaction(row, undefined, undefined, {requestId})
  expect((await health()).revision).toBe(revision)
  await repo.saveRecurringRule({name:'Test recurring', kind:'income', category:'Other', amountCents:1000, dueDay:1, debtId:null, startMonth:'2026-10', endMonth:null, enabled:true})
  await expectChange(() => repo.ensureRecurringMonth('2026-10'))
  const generated = (await health()).revision
  await repo.ensureRecurringMonth('2026-10'); expect((await health()).revision).toBe(generated)
})
it('tracks monthly edits/copy, manual paid, linked payment/undo, adjustments/reversal and recurring skip/restore', async () => {
  await restoreBackup(demoFixture('2026-10-18'))
  await expectChange(async () => repo.saveIncome('2026-10', 123, await db.months.get('2026-10') ?? null))
  await expectChange(async () => repo.saveOpeningBalance('2026-10', 0, await db.months.get('2026-10') ?? null))
  await expectChange(() => repo.copyPreviousMonth('2026-11'))
  const bill = (await db.obligations.toArray()).find(o => o.month === '2026-10' && !o.debtId)!
  await expectChange(() => repo.setObligationPaid(bill.id, true))
  await expectChange(() => repo.setObligationPaid(bill.id, false))
  await expectChange(() => repo.saveObligation({...bill,name:'Changed bill'},bill.id, undefined))
  const input = {id:newId(),date:'2026-10-18',name:'Synthetic connected',amountCents:100,interestCents:0,account:'',debtId:null,obligationId:bill.id,expectedObligationUpdatedAt:(await db.obligations.get(bill.id))!.updatedAt}
  let payment: Awaited<ReturnType<typeof repo.recordPayment>>
  await expectChange(async () => { payment = await repo.recordPayment(input) })
  const paidRevision = (await health()).revision
  await repo.recordPayment(input); expect((await health()).revision).toBe(paidRevision)
  await expectChange(() => repo.undoPayment(payment!.id,payment!.updatedAt))
  const debt = (await db.debts.toArray()).find(d=>d.balanceCents>0)!
  const adjustment = {id:newId(),debtId:debt.id,expectedUpdatedAt:debt.updatedAt,kind:'fee' as const,date:'2026-10-18',amountCents:100,note:'Synthetic fee'}
  await expectChange(() => repo.adjustDebt(adjustment))
  await expectChange(() => repo.undoAdjustment(adjustment.id))
  const generated = (await db.recurringOccurrences.toArray()).find(o=>o.obligationId===bill.id)!
  await expectChange(() => repo.deleteObligation(bill.id))
  await expectChange(async () => repo.restoreSkippedBill(generated.id, (await db.recurringOccurrences.get(generated.id))!.updatedAt, {category:'Utilities',debtId:null}))
  const income = (await db.recurringOccurrences.toArray()).find(o=>o.kind==='income')!
  await expectChange(() => repo.saveExpectedOccurrence(income.id,income.amountCents,income.dueDay,true,income.updatedAt))
  await expectChange(async () => repo.saveExpectedOccurrence(income.id,income.amountCents,income.dueDay,false,(await db.recurringOccurrences.get(income.id))!.updatedAt))
  await expectChange(() => repo.deleteDebt(debt.id))

})
it('leaves an exact exported snapshot stale when a write commits before download initiation', async () => {
  await db.transactions.add(tx())
  const snapshot = await capturePortableSnapshot()
  await db.transactions.add(tx())
  await markBackupInitiated(snapshot.health, now())
  expect(backupFreshness(await health())).toBe('changed')
  expect((await health()).exported?.revision).toBe(snapshot.health!.revision)
  expect(snapshot.data.transactions).toHaveLength(1)
})
it('prevents overlapping exports completing in reverse order from regressing the recorded revision', async () => {
  const older = await capturePortableSnapshot()
  await db.transactions.add(tx())
  const newer = await capturePortableSnapshot()
  await markBackupInitiated(newer.health, '2026-10-18T12:00:00.000Z')
  await markBackupInitiated(older.health, '2026-10-18T13:00:00.000Z')
  expect(backupFreshness(await health())).toBe('current')
  expect((await health()).exported?.revision).toBe(newer.health!.revision)
  await markBackupInitiated(newer.health, '2026-10-18T11:00:00.000Z')
  expect((await health()).exported?.initiatedAt).toBe('2026-10-18T12:00:00.000Z')
})
it('only records initiation after a validated download succeeds; failures preserve metadata', async () => {
  const before = await health()
  await expect(initiatePortableDownload('test.json', () => { throw Error('initiation failed') })).rejects.toThrow('initiation failed')
  expect(await health()).toEqual(before)
  await db.transactions.add(tx({amountCents:-1}))
  const invalid = await health(), download = vi.fn()
  await expect(initiatePortableDownload('test.json', download)).rejects.toThrow()
  expect(download).not.toHaveBeenCalled(); expect(await health()).toEqual(invalid)
  await db.transactions.clear()
  await initiatePortableDownload('test.json', download)
  expect(download).toHaveBeenCalledOnce(); expect(backupFreshness(await health())).toBe('current')
})
it('tracks edits, deletion-only and same-count replacement without trusting timestamps or imported exportedAt', async () => {
  const row = tx(); await db.transactions.add(row)
  await initiatePortableDownload('test.json', () => {})
  await expectChange(() => db.transactions.update(row.id, {account:'New label'}))
  expect(backupFreshness(await health())).toBe('changed')
  await initiatePortableDownload('test.json', () => {})
  await expectChange(() => db.transactions.delete(row.id)); expect(backupFreshness(await health())).toBe('changed')
  await restoreBackup(demoFixture('2026-10-18'))
  await initiatePortableDownload('test.json', () => {})
  const portable = await exportBackup(), before = await health()
  await restoreBackup({...portable, exportedAt:'2099-01-01T00:00:00.000Z'})
  expect((await health()).revision).toBeGreaterThan(before.revision)
  expect(backupFreshness(await health())).toBe('changed')
  await clearWorkspace(); await restoreBackup(portable)
  expect((await health()).epoch).toBe(before.epoch)
  expect(backupFreshness(await health())).toBe('changed')
  expect(Object.keys(await exportBackup())).not.toContain('backupHealth')
  expect(JSON.stringify(await exportBackup())).not.toContain('initiatedAt')
})
it('never reuses a counter after reset, missing metadata, or revision exhaustion', async () => {
  const old = await capturePortableSnapshot()
  await db.backupHealth.delete('workspace')
  expect(backupFreshness(await db.backupHealth.get('workspace'))).toBe('unknown')
  await db.transactions.add(tx()); expect(backupFreshness(await health())).toBe('unknown')
  await markBackupInitiated(old.health, now()); expect(backupFreshness(await health())).toBe('unknown')
  await db.backupHealth.put({...await health(), epoch:newId(), reliable:true, exported:undefined, revision:Number.MAX_SAFE_INTEGER})
  const max = await capturePortableSnapshot()
  await db.transactions.add(tx()); await markBackupInitiated(max.health, now())
  expect((await health()).epoch).not.toBe(max.health!.epoch); expect(backupFreshness(await health())).toBe('never')
})
it('coordinates cross-connection writers with consistent export snapshots', async () => {
  const other = new AccryntDatabase(db.name)
  try {
    await other.open()
    const snapshot = await capturePortableSnapshot()
    await Promise.all([other.transactions.add(tx()), db.transactions.add(tx())])
    await markBackupInitiated(snapshot.health, now())
    expect((await health()).revision).toBe(snapshot.health!.revision + 2)
    expect(backupFreshness(await health())).toBe('changed')
  } finally { other.close() }
})
it('isolates demo health and allows initial seed exactly once', async () => {
  const demo = new AccryntDatabase('accrynt-demo-v1')
  try {
    await demo.open(); const personal = await health()
    await seedDemo(demo, '2026-10-18')
    expect(await demo.transactions.count()).toBeGreaterThan(0)
    const seeded = await demo.backupHealth.get('workspace')
    await seedDemo(demo, '2026-10-18')
    expect(await demo.backupHealth.get('workspace')).toEqual(seeded)
    expect(await health()).toEqual(personal)
  } finally { demo.close(); await Dexie.delete('accrynt-demo-v1') }
})
it('allows a financial-empty workspace with metadata to load the optional example', async () => {
  await loadOctoberExample('2026-10')
  expect(await db.obligations.count()).toBe(3)
  expect((await health()).revision).toBeGreaterThan(0)
})
it('initializes existing v4 records without rewriting financial rows and closes old writers', async () => {
  const name = `legacy-v4-${newId()}`, old = new Dexie(name), upgraded = new AccryntDatabase(name)
  old.version(4).stores({months:'key', obligations:'id,month,category,paidAt,debtId', transactions:'id,date,kind,category,obligationId', debts:'id', recurringRules:'id', recurringOccurrences:'id,month,ruleId,obligationId', balanceEvents:'id,debtId,recordedAt,period'})
  try {
    await old.open(); const row = tx(); await old.table('transactions').add(row)
    await upgraded.open()
    expect(old.isOpen()).toBe(false)
    expect(await upgraded.transactions.get(row.id)).toEqual(row)
    expect(backupFreshness(await upgraded.backupHealth.get('workspace'))).toBe('never')
    await old.open()
    await old.table('transactions').delete(row.id)
    const snapshot = await upgraded.transaction('r', upgraded.tables, async () => ({ data: { months:await upgraded.months.toArray(), obligations:await upgraded.obligations.toArray(), transactions:await upgraded.transactions.toArray(), debts:await upgraded.debts.toArray(), recurringRules:await upgraded.recurringRules.toArray(), recurringOccurrences:await upgraded.recurringOccurrences.toArray(), balanceEvents:await upgraded.balanceEvents.toArray() }, health:await upgraded.backupHealth.get('workspace') }))
    const { verifySnapshot } = await import('../data/backup-health')
    expect(backupFreshness(await verifySnapshot(snapshot.data,snapshot.health))).toBe('unknown')
  } finally { old.close(); upgraded.close(); await Dexie.delete(name) }
})
it('bounds reminders to populated changed workspaces with exact seven-day and snooze boundaries', () => {
  const time = Date.parse('2026-10-18T12:00:00Z'), h = initialHealth()
  expect(needsBackupReminder(h, false, time)).toBe(false)
  expect(needsBackupReminder(h, true, time)).toBe(true)
  h.exported = {epoch:h.epoch, revision:0, initiatedAt:new Date(time - BACKUP_SNOOZE_MS).toISOString()}
  expect(needsBackupReminder(h, true, time)).toBe(false) // untouched, even old
  h.revision = 1
  expect(needsBackupReminder(h, true, time - 1)).toBe(false)
  expect(needsBackupReminder(h, true, time)).toBe(true)
  h.snoozedUntil = time + BACKUP_SNOOZE_MS
  expect(needsBackupReminder(h, true, h.snoozedUntil - 1)).toBe(false)
  expect(needsBackupReminder(h, true, h.snoozedUntil)).toBe(true)
  expect(needsBackupReminder({...h,reliable:false}, true, time)).toBe(false)
})
it('sums every matching page and keeps future-only entries separate from actual net', () => {
  const rows = Array.from({length:120}, () => tx())
  rows.push(tx({kind:'income', amountCents:30000}), tx({date:'2026-11-01', amountCents:50000}))
  expect(matchingTotals(rows, '2026-10-18')).toEqual({actual:{count:121,income:30000,outflow:12000,net:18000},scheduled:{count:1,income:0,outflow:50000,net:-50000}})
  expect(matchingTotals(rows.filter(t=>t.date>'2026-10-18'),'2026-10-18').actual.net).toBe(0)
  expect(matchingTotals([], '2026-10-18').actual.count).toBe(0)
})
it.each([null, 0, -10000])('reconciles cash and manual releases for opening %s with cross-month, scheduled, and undone outflow', opening => {
  const fixture = demoFixture('2026-10-18'), bill = fixture.obligations.find(o=>o.month==='2026-10')!
  bill.paidAt = now()
  const rows = [tx({obligationId:bill.id, date:'2026-09-30',amountCents:2000}), tx({kind:'income',amountCents:10000}), tx({obligationId:bill.id, date:'2026-11-01',amountCents:9999})]
  const states = buildObligationPayments([bill], rows, '2026-10-18')
  expect(states.get(bill.id)!.manualReleasedCents).toBe(bill.plannedCents-2000)
  const cash = availableMoney('2026-10', opening, [bill], rows, '2026-10-18', states)
  expect(cash.trackedCents).toBe(opening === null ? null : opening + 10000)
  expect(cash.afterBillsCents).toBe(cash.trackedCents)
  bill.paidAt = null
  const undone = availableMoney('2026-10',opening,[bill],rows.slice(1),'2026-10-18')
  expect(undone.outstandingCents).toBe(bill.plannedCents)
})

it('detects untracked legacy edits/deletes/replacements even across reload; never blesses their snapshot', async () => {
  await db.transactions.add(tx())
  await initiatePortableDownload('test.json', () => {})
  const older = await capturePortableSnapshot()
  const legacy = new Dexie(db.name)
  legacy.version(4).stores({ months:'key', obligations:'id,month,category,paidAt,debtId', transactions:'id,date,kind,category,obligationId', debts:'id', recurringRules:'id', recurringOccurrences:'id,month,ruleId,obligationId', balanceEvents:'id,debtId,recordedAt,period' })
  try {
    await legacy.open()
    const row = (await db.transactions.toArray())[0]
    await legacy.table('transactions').put({...row, name:'Changed without revision'})
    expect(backupFreshness((await readTrackedWorkspace()).health)).toBe('unknown')
    db.close(); await db.open()
    expect(backupFreshness((await readTrackedWorkspace()).health)).toBe('unknown')
    await markBackupInitiated(older.health, now())
    expect(backupFreshness((await readTrackedWorkspace()).health)).toBe('unknown')
    await db.transactions.add(tx()) // discovers mismatch before its own write; reliability stays unknown
    expect(backupFreshness(await health())).toBe('unknown')
  } finally { legacy.close() }
})

it('aborts financial writes if post-write witness persistence fails even when the caller catches it', async () => {
  const before = await health(), digest = crypto.subtle.digest.bind(crypto.subtle)
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(digest).mockRejectedValueOnce(new Error('Synthetic witness failure'))
  await expect(db.transaction('rw', db.transactions, async () => { try { await db.transactions.put(tx()) } catch { /* caller cannot preserve an untracked write */ } })).rejects.toThrow()
  expect(await db.transactions.count()).toBe(0)
  expect(await health()).toEqual(before)
})
it('does not advance export metadata if persistence fails after a browser download starts', async () => {
  const before = await health(), download = vi.fn()
  vi.spyOn(db.backupHealth, 'put').mockRejectedValueOnce(new Error('Synthetic metadata failure'))
  await expect(initiatePortableDownload('test.json',download)).rejects.toThrow('Synthetic metadata failure')
  expect(download).toHaveBeenCalledOnce()
  expect(await health()).toEqual(before)
})
