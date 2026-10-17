import Dexie from 'dexie'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { AccryntDatabase } from '../data/database'
import { readRawRecovery } from '../data/raw-recovery'
import { validateBackup } from '../data/backup'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/v3-original-export.json', import.meta.url), 'utf8'))
it('preserves every legacy table after repeated failed upgrades without running another migration', async () => {
  const name = `accrynt-poisoned-upgrade-${crypto.randomUUID()}`
  const old = new Dexie(name), upgraded = new AccryntDatabase(name)
  old.version(3).stores({ months:'key', obligations:'id,month,category,paidAt,debtId', transactions:'id,date,kind,category,obligationId', debts:'id', recurringRules:'id', recurringOccurrences:'id,month,ruleId,obligationId' })
  const poisoned = { ...fixture.debts[0], unexpectedLegacyProperty: 'keep this original value' }
  try {
    await old.open()
    for (const table of old.tables) await table.bulkAdd(table.name === 'debts' ? [poisoned] : fixture[table.name])
    old.close()
    await expect(upgraded.open()).rejects.toThrow(); upgraded.close()
    await expect(upgraded.open()).rejects.toThrow(); upgraded.close()
    const raw = await readRawRecovery(name)
    expect(raw).toMatchObject({ format:'accrynt-raw-recovery', nativeVersion:30, databaseName:name })
    expect(Object.keys(raw.tables).sort()).toEqual(['months','obligations','transactions','debts','recurringRules','recurringOccurrences'].sort())
    expect(raw.tables.debts).toEqual([poisoned])
    for (const table of ['months','obligations','transactions','recurringRules','recurringOccurrences']) expect(raw.tables[table]).toEqual(fixture[table])
    expect(() => validateBackup(raw)).toThrow()
    expect(await readRawRecovery(name)).toMatchObject({ nativeVersion:30, tables:raw.tables })
  } finally { old.close(); upgraded.close(); await Dexie.delete(name) }
})
it('does not create an absent database while attempting recovery', async () => {
  const name = `accrynt-missing-recovery-${crypto.randomUUID()}`
  await expect(readRawRecovery(name)).rejects.toThrow('No existing records database')
  expect((await indexedDB.databases()).some(row => row.name === name)).toBe(false)
})
it('reads current native v4 records unchanged without schema validation or repair', async () => {
  const name = `accrynt-current-recovery-${crypto.randomUUID()}`, current = new AccryntDatabase(name)
  try {
    await current.open()
    await current.months.put({ key:'2026-10', incomeCents:-1, openingCents:null, updatedAt:'2026-10-17T12:00:00.000Z' })
    const raw = await readRawRecovery(name)
    expect(raw.nativeVersion).toBe(40)
    expect(raw.tables.months).toEqual(await current.months.toArray())
    expect(Object.keys(raw.tables)).toHaveLength(7)
  } finally { current.close(); await Dexie.delete(name) }
})
