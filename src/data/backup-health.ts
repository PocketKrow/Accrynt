import Dexie, { type DBCore, type DBCoreTransaction } from 'dexie'

export const financialTables = ['months', 'obligations', 'transactions', 'debts', 'recurringRules', 'recurringOccurrences', 'balanceEvents'] as const
export interface BackupHealth {
  key: 'workspace'; epoch: string; revision: number; reliable: boolean
  exported?: { epoch: string; revision: number; initiatedAt: string }
  snoozedUntil?: number
  fingerprints?: Partial<Record<typeof financialTables[number], string>>
}
export const initialHealth = (): BackupHealth => ({ key: 'workspace', epoch: crypto.randomUUID(), revision: 0, reliable: true })
export function validHealth(value: unknown): value is BackupHealth {
  const h = value as BackupHealth | undefined
  return !!h && h.key === 'workspace' && typeof h.epoch === 'string' && !!h.epoch && Number.isSafeInteger(h.revision) && h.revision >= 0 && typeof h.reliable === 'boolean'
}
/** Native transaction scope includes metadata, so even implicit/bulk writes are atomic. */
export function revisionMiddleware(down: DBCore): DBCore {
  if (!down.schema.tables.some(t => t.name === 'backupHealth')) return down
  const pending = new WeakMap<DBCoreTransaction, Promise<unknown>>()
  const metadata = down.table('backupHealth')
  return { ...down,
    transaction(stores, mode, options) {
      return down.transaction(mode === 'readwrite' && stores.some(s => financialTables.includes(s as typeof financialTables[number]))
        ? [...new Set([...stores, 'backupHealth'])] : stores, mode, options)
    },
    table(name) {
      const table = down.table(name)
      if (!financialTables.includes(name as typeof financialTables[number])) return table
      return { ...table, mutate(request) {
        // Historical migrations precede the v5 tracking baseline.
        if ((request.trans as IDBTransaction).mode === 'versionchange') return table.mutate(request)
        const operation = (pending.get(request.trans) ?? Dexie.Promise.resolve()).then(async () => {
          const previous = await metadata.get({ trans: request.trans, key: 'workspace' })
          const health: BackupHealth = validHealth(previous) ? previous : { ...initialHealth(), reliable: false }
          const readRows = async () => (await table.query({ trans: request.trans, values: true, query: { index: table.schema.primaryKey, range: { type: 3, lower: undefined, upper: undefined } } })).result
          const before = await readRows()
          const beforeHash = await Dexie.waitFor(fingerprint(before))
          const key = name as typeof financialTables[number]
          if (health.fingerprints?.[key] ? health.fingerprints[key] !== beforeHash : before.length > 0) health.reliable = false
          const result = await table.mutate(request)
          const count = request.type === 'deleteRange' ? 1 : request.type === 'delete' ? request.keys.length : request.values.length
          if (count > result.numFailures) {
            health.fingerprints = { ...health.fingerprints, [key]: await Dexie.waitFor(fingerprint(await readRows())) }
            if (health.revision === Number.MAX_SAFE_INTEGER) { health.epoch = crypto.randomUUID(); health.revision = 0; health.exported = undefined }
            health.revision++
            const saved = await metadata.mutate({ type: 'put', trans: request.trans, values: [health] })
            if (saved.numFailures) { request.trans.abort(); throw new Error('Unable to track record changes. No records were committed.') }
          }
          return result
        })
        const guarded = operation.catch(reason => {
          try { request.trans.abort() } catch { /* The native transaction may already be aborted. Preserve the original error. */ }
          throw reason
        })
        pending.set(request.trans, guarded)
        return guarded
      } }
    }
  }
}
export function backupFreshness(health: BackupHealth | undefined) {
  if (!validHealth(health) || !health.reliable) return 'unknown'
  const saved = health.exported
  if (!saved) return 'never'
  if (saved.epoch !== health.epoch || !Number.isSafeInteger(saved.revision) || saved.revision < 0 || saved.revision > health.revision || !Number.isFinite(Date.parse(saved.initiatedAt))) return 'unknown'
  return saved.revision === health.revision ? 'current' : 'changed'
}
export const BACKUP_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000
export function needsBackupReminder(health: BackupHealth | undefined, populated: boolean, time: number) {
  const state = backupFreshness(health)
  return populated && (state === 'never' || state === 'changed') && !(health!.snoozedUntil! > time) &&
    (!health!.exported || time - Date.parse(health!.exported.initiatedAt) >= BACKUP_SNOOZE_MS)
}

/** A persisted witness detects legacy writers that can reopen newer Dexie schemas.
 * Canonical property ordering ignores object construction order; row order is primary-key order.
 * Hash only committed table snapshots, never input/draft changes. No financial payload is persisted here.
 */
export async function fingerprint(rows: unknown[]) {
  const shapes = new Map<string, string[]>()
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object') {
      // JSON encodes the key list unambiguously, including damaged/raw keys with NULs.
      const record = value as Record<string, unknown>, keys = Object.keys(record), shape = JSON.stringify(keys)
      let ordered = shapes.get(shape)
      if (!ordered) { ordered = keys.sort(); shapes.set(shape, ordered) }
      return Object.fromEntries(ordered.map(key => [key, canonical(record[key])]))
    }
    return value
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(rows))))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
export async function verifySnapshot(data: Record<typeof financialTables[number], unknown[]>, health: BackupHealth | undefined) {
  if (!validHealth(health) || !health.reliable) return health
  for (const name of financialTables) {
    const expected = health.fingerprints?.[name]
    if (expected ? expected !== await fingerprint(data[name]) : data[name].length > 0) return { ...health, reliable: false }
  }
  return health
}
