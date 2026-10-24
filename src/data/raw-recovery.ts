import { now } from '../domain/models'
import { databaseName } from './workspace'

/** Read the existing native version without running Dexie's application migrations. */
export function readRawRecovery(name = databaseName) {
  return new Promise<{
    format: 'accrynt-raw-recovery'
    exportedAt: string
    workspace: 'personal' | 'demo-synthetic'
    databaseName: string
    nativeVersion: number
    warning: string
    tables: Record<string, unknown[]>
  }>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser does not provide IndexedDB access.')); return }
    let cancelled = false
    let missing = false
    const request = indexedDB.open(name)
    const timer = setTimeout(() => {
      cancelled = true
      reject(new Error('Recovery access timed out. Close other Accrynt tabs and try again.'))
    }, 10_000)
    request.onupgradeneeded = () => {
      // A versionless open would create an absent database. Abort instead of writing.
      missing = true
      request.transaction?.abort()
    }
    request.onblocked = () => {
      clearTimeout(timer)
      cancelled = true
      reject(new Error('Recovery access is blocked. Close other Accrynt tabs and try again.'))
    }
    request.onerror = () => {
      clearTimeout(timer)
      reject(new Error(missing ? 'No existing records database was found at this origin.' : 'The browser could not read this database. Recovery cannot bypass blocked storage access.'))
    }
    request.onsuccess = () => {
      clearTimeout(timer)
      const database = request.result
      if (cancelled) { database.close(); return }
      database.onversionchange = () => database.close()
      const names = Array.from(database.objectStoreNames)
      const tables: Record<string, unknown[]> = Object.create(null)
      const result = () => ({
        format: 'accrynt-raw-recovery' as const,
        exportedAt: now(), workspace: 'personal' as const,
        databaseName: name, nativeVersion: database.version,
        warning: 'UNVALIDATED native records. Not directly restorable. Preserve this file for manual repair. Native versions are not portable backup versions.',
        tables
      })
      if (!names.length) { const snapshot = result(); database.close(); resolve(snapshot); return }
      try {
        const transaction = database.transaction(names, 'readonly')
        transaction.oncomplete = () => { const snapshot = result(); database.close(); resolve(snapshot) }
        transaction.onabort = () => { database.close(); reject(new Error('Raw recovery could not read a complete snapshot. No records were changed.')) }
        for (const table of names) {
          const rows = transaction.objectStore(table).getAll()
          rows.onsuccess = () => { tables[table] = rows.result }
        }
      } catch {
        database.close()
        reject(new Error('Raw recovery could not start a complete snapshot. No records were changed.'))
      }
    }
  })
}
