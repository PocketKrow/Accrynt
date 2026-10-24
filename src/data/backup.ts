import Dexie from 'dexie'
import { validHealth, verifySnapshot, type BackupHealth } from './backup-health'
import { financialTables } from './backup-health'
import { monthlyInterest } from '../domain/debt'
import { db, readWorkspace, readTrackedWorkspace } from './database'
import { portableBackupSchema, now, type Backup } from '../domain/models'

export async function exportBackup(): Promise<Backup> {
  const data: Backup = {
    format: 'accrynt-portable', schemaVersion: 5, workspace: 'personal', exportedAt: now(),
    ...await readWorkspace()
  }
  const validated = validateBackup(data)
  serializeBackup(validated) // Every supported export must fit the file restore budget.
  return validated
}
// Decimal MB. File bytes are checked before reading/parsing; record-count limits still apply.
export const BACKUP_MAX_BYTES = 64_000_000
export const BACKUP_REVIEW_BYTES = 15_000_000
export const backupSizeMessage = 'Portable backups support up to 64 MB of UTF-8 JSON. This file exceeds that limit; keep it for manual recovery. Existing records have not changed.'
export function utf8Bytes(content: string) { return new TextEncoder().encode(content).byteLength }
export function assertBackupSize(bytes: number) {
  if (bytes > BACKUP_MAX_BYTES) throw new Error(backupSizeMessage)
}
export function serializeBackup(data: Backup) {
  const content = JSON.stringify(data, null, 2)
  assertBackupSize(utf8Bytes(content))
  return content
}
export async function readBackupFile(file: Pick<File, 'size' | 'text'>): Promise<Backup> {
  assertBackupSize(file.size)
  const text = await file.text()
  assertBackupSize(utf8Bytes(text))
  return validateBackup(JSON.parse(text))
}
export function validateBackup(content: unknown): Backup {
  const data = portableBackupSchema.parse(content)
  const unique = (label: string, ids: string[]) => {
    if (new Set(ids).size !== ids.length) throw new Error(`Backup has duplicate ${label} IDs.`)
  }
  unique('balance events', data.balanceEvents.map(row => row.id))
  for (const event of data.balanceEvents) {
    if (event.kind === 'interest' && (event.period === null || event.rateMilliPercent === null || event.id !== `interest:${event.debtId}:${event.period}`)) throw new Error('Invalid interest period event.')
    if (event.kind === 'interest' && (event.date.slice(0, 7) !== event.period || event.deltaCents !== monthlyInterest(event.balanceBeforeCents, event.rateMilliPercent!))) throw new Error('Interest event date or historical calculation does not match its period/rate.')
    if (event.kind !== 'interest' && event.period !== null) throw new Error('Only interest events can claim a period.')
  }
  unique('months', data.months.map(row => row.key))
  unique('obligations', data.obligations.map(row => row.id))
  unique('transactions', data.transactions.map(row => row.id))
  unique('debts', data.debts.map(row => row.id))
  unique('recurring rules', data.recurringRules.map(row => row.id))
  unique('recurring occurrences', data.recurringOccurrences.map(row => row.id))
  const obligationsById = new Map(data.obligations.map(row => [row.id, row]))
  const obligationIds = new Set(obligationsById.keys())
  const debtIds = new Set(data.debts.map(row => row.id))
  for (const row of data.obligations) {
    if (row.debtId !== null && !debtIds.has(row.debtId)) throw new Error('Backup has an obligation linked to a missing debt.')
  }
  for (const row of data.transactions) {
    if (row.obligationId !== null && !obligationIds.has(row.obligationId)) throw new Error('Backup has a transaction linked to a missing obligation.')
    if (row.kind === 'income' && row.obligationId !== null) throw new Error('Income cannot link to a payment obligation.')
    // Historical receipts retain their debt identity after obligation relinking/debt deletion.
    const p = row.payment
    if (p) {
      if (p.balanceAsOfAfter !== null && (p.debtId === null || p.balanceAsOfAfter !== row.date)) throw new Error('Payment receipt has an invalid balance reference date.')
      if (row.amountCents <= 0 || row.kind === 'income' || (p.debtId === null && (row.kind !== 'expense' || p.debtName !== null || p.principalCents !== 0 || p.interestCents !== 0 || p.interestIncludedInBalance || p.balanceBeforeCents !== null || p.balanceAfterCents !== null)) ||
        (p.debtId !== null && (row.kind !== 'debt-payment' || row.category !== 'Debt payments' || p.debtName === null ||
          p.balanceBeforeCents === null || p.balanceAfterCents === null || p.principalCents + p.interestCents !== row.amountCents ||
          p.balanceBeforeCents - p.principalCents - (p.interestIncludedInBalance ? p.interestCents : 0) !== p.balanceAfterCents))) throw new Error('Backup has an invalid payment receipt.')
    }
  }
  const occurrencesById = new Map(data.recurringOccurrences.map(row => [row.id, row]))
  for (const row of data.transactions) {
    if (row.incomeOccurrenceId != null && (row.kind !== 'income' || occurrencesById.get(row.incomeOccurrenceId)?.kind !== 'income')) throw new Error('Income receipt has a missing or incompatible occurrence link.')
  }
  const rulesById = new Map(data.recurringRules.map(row => [row.id, row])), generatedBills = new Set<string>()
  for (const rule of data.recurringRules) if (rule.debtId !== null && !debtIds.has(rule.debtId)) throw new Error('Recurring rule links to a missing debt.')
  for (const row of data.recurringOccurrences) {
    const rule = rulesById.get(row.ruleId)
    if (!rule || rule.kind !== row.kind) throw new Error('Recurring occurrence has a missing or incompatible rule.')
    if (row.cancelled && row.obligationId !== null) throw new Error('Skipped recurring bill still has an obligation.')
    if (row.kind === 'bill' && !row.cancelled && row.obligationId === null) throw new Error('Recurring bill has no obligation.')
    if (row.obligationId !== null) {
      const bill = obligationsById.get(row.obligationId)
      if (!bill || bill.month !== row.month || generatedBills.has(bill.id)) throw new Error('Recurring bill has an invalid obligation link.')
      generatedBills.add(bill.id)
    }
  }
  return data
}
export async function restoreBackup(content: unknown) {
  // Validate here too: callers must never be able to clear data with an invalid payload.
  const data = validateBackup(content)
  // Atomic replacement: either all tables restore or none do.
  await db.transaction('rw', db.tables, async () => {
    for (const name of financialTables) await db.table(name).clear()
    await db.months.bulkAdd(data.months)
    await db.obligations.bulkAdd(data.obligations)
    await db.transactions.bulkAdd(data.transactions)
    await db.debts.bulkAdd(data.debts)
    await db.recurringRules.bulkAdd(data.recurringRules)
    await db.recurringOccurrences.bulkAdd(data.recurringOccurrences)
    await db.balanceEvents.bulkAdd(data.balanceEvents)
  })
}
export function downloadFile(filename: string, content: string, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
}

/** Recovery-only envelope: preserves corrupt rows without mislabelling them a portable backup. */
export async function recoverySnapshot() {
  const current = { format: 'accrynt-portable', schemaVersion: 5, workspace: 'personal', exportedAt: now(), ...await readWorkspace() }
  try { const data = validateBackup(current); serializeBackup(data); return { raw: false, data } }
  catch { return { raw: true, data: { ...current, format: 'accrynt-raw-recovery', warning: 'UNVALIDATED recovery data. Not directly restorable. Preserve this file for manual repair.' } } }
}

export async function capturePortableSnapshot() {
  const snapshot = await readTrackedWorkspace()
  const data = validateBackup({ format: 'accrynt-portable', schemaVersion: 5, workspace: 'personal', exportedAt: now(), ...snapshot.data })
  return { data, content: serializeBackup(data), health: snapshot.health }
}
export async function markBackupInitiated(snapshot: BackupHealth | undefined, initiatedAt: string) {
  if (!validHealth(snapshot) || !snapshot.reliable) return
  await db.transaction('rw', db.tables, async () => {
    const current = await Dexie.waitFor(verifySnapshot(await readWorkspace(), await db.backupHealth.get('workspace')))
    if (!validHealth(current) || !current.reliable || current.epoch !== snapshot.epoch || current.revision < snapshot.revision) return
    const saved = current.exported
    if (saved?.epoch === current.epoch && (saved.revision > snapshot.revision || (saved.revision === snapshot.revision && saved.initiatedAt >= initiatedAt))) return
    await db.backupHealth.put({ ...current, exported: { epoch: snapshot.epoch, revision: snapshot.revision, initiatedAt } })
  })
}
export async function initiatePortableDownload(filename: string, initiate = downloadFile) {
  const snapshot = await capturePortableSnapshot()
  initiate(filename, snapshot.content)
  await markBackupInitiated(snapshot.health, now())
}
export async function snoozeBackupReminder(time = Date.now()) {
  await db.transaction('rw', db.backupHealth, async () => {
    const current = await db.backupHealth.get('workspace')
    if (validHealth(current)) await db.backupHealth.put({ ...current, snoozedUntil: time + 7 * 24 * 60 * 60 * 1000 })
  })
}
