import { db, readWorkspace } from './database'
import { backupSchema, now, type Backup } from '../domain/models'

export async function exportBackup(): Promise<Backup> {
  const data: Backup = {
    format: 'accrynt-portable', schemaVersion: 1, exportedAt: now(),
    ...await readWorkspace()
  }
  return validateBackup(data)
}
export function validateBackup(content: unknown): Backup {
  const data = backupSchema.parse(content)
  const unique = (label: string, ids: string[]) => {
    if (new Set(ids).size !== ids.length) throw new Error(`Backup has duplicate ${label} IDs.`)
  }
  unique('months', data.months.map(row => row.key))
  unique('obligations', data.obligations.map(row => row.id))
  unique('transactions', data.transactions.map(row => row.id))
  unique('debts', data.debts.map(row => row.id))
  const obligationIds = new Set(data.obligations.map(row => row.id))
  const debtIds = new Set(data.debts.map(row => row.id))
  for (const row of data.obligations) {
    if (row.debtId !== null && !debtIds.has(row.debtId)) throw new Error('Backup has an obligation linked to a missing debt.')
  }
  for (const row of data.transactions) {
    if (row.obligationId !== null && !obligationIds.has(row.obligationId)) throw new Error('Backup has a transaction linked to a missing obligation.')
  }
  return data
}
export async function restoreBackup(content: unknown) {
  // Validate here too: callers must never be able to clear data with an invalid payload.
  const data = validateBackup(content)
  // Atomic replacement: either all tables restore or none do.
  await db.transaction('rw', db.months, db.obligations, db.transactions, db.debts, async () => {
    await Promise.all([db.months.clear(), db.obligations.clear(), db.transactions.clear(), db.debts.clear()])
    await db.months.bulkAdd(data.months)
    await db.obligations.bulkAdd(data.obligations)
    await db.transactions.bulkAdd(data.transactions)
    await db.debts.bulkAdd(data.debts)
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
