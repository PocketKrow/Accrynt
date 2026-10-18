import { financialTables, fingerprint, verifySnapshot, initialHealth, revisionMiddleware, type BackupHealth } from './backup-health'
import { databaseName } from './workspace'
import Dexie, { type Table } from 'dexie'
import { migrateLegacyDebt } from '../domain/models'
import type { MonthPlan, Obligation, Transaction, Debt, RecurringRule, RecurringOccurrence, BalanceEvent } from '../domain/models'

export class AccryntDatabase extends Dexie {
  months!: Table<MonthPlan, string>
  obligations!: Table<Obligation, string>
  transactions!: Table<Transaction, string>
  debts!: Table<Debt, string>
  recurringRules!: Table<RecurringRule, string>
  recurringOccurrences!: Table<RecurringOccurrence, string>

  balanceEvents!: Table<BalanceEvent, string>
  backupHealth!: Table<BackupHealth, string>

  constructor(name = 'accrynt-local-v1') {
    super(name)
    const tables = {
      months: 'key',
      obligations: 'id,month,category,paidAt,debtId',
      transactions: 'id,date,kind,category,obligationId',
      debts: 'id'
    }
    this.version(1).stores(tables)
    this.version(2).stores(tables).upgrade(tx => tx.table('debts').toCollection().modify(debt => {
      debt.monthlyPaymentCents = null
    }))
    this.version(3).stores({ ...tables, recurringRules: 'id', recurringOccurrences: 'id,month,ruleId,obligationId' }).upgrade(async tx => {
      await tx.table('months').toCollection().modify(row => { row.openingCents = null })
      await tx.table('transactions').toCollection().modify(row => { row.payment = null })
    })
    this.version(4).stores({ ...tables, recurringRules: 'id', recurringOccurrences: 'id,month,ruleId,obligationId', balanceEvents: 'id,debtId,recordedAt,period' }).upgrade(async tx => {
      await tx.table('debts').toCollection().modify(row => {
        const upgraded = migrateLegacyDebt(row)
        delete row.aprBasisPoints
        Object.assign(row, upgraded)
      })
      await tx.table('transactions').toCollection().modify(row => {
        if (row.payment) { row.payment.balanceAsOfBefore = null; row.payment.balanceAsOfAfter = null }
      })
    })
    this.version(5).stores({ backupHealth: 'key' }).upgrade(async tx => {
      const health = initialHealth()
      health.fingerprints = {}
      for (const name of financialTables) health.fingerprints[name] = await Dexie.waitFor(fingerprint(await tx.table(name).toArray()))
      await tx.table('backupHealth').put(health)
    })
    this.on('populate', tx => tx.table('backupHealth').put(initialHealth()).then(() => undefined))
    this.use({ stack: 'dbcore', name: 'workspace-revisions', level: 0, create: revisionMiddleware })

  }
}
export const db = new AccryntDatabase(databaseName)

// A single snapshot keeps UI totals and portable backups consistent across tabs.
export function readWorkspace() {
  return db.transaction('r', db.tables, async () => ({
    months: await db.months.toArray(),
    obligations: await db.obligations.toArray(),
    transactions: await db.transactions.toArray(),
    debts: await db.debts.toArray(),
    recurringRules: await db.recurringRules.toArray(), recurringOccurrences: await db.recurringOccurrences.toArray(), balanceEvents: await db.balanceEvents.toArray()
  }))
}

export function clearWorkspace() {
  return db.transaction('rw', db.tables, async () => {
    for (const name of financialTables) await db.table(name).clear()
  })
}

/** Financial payload stays portable; browser health is read in the same snapshot separately. */
export async function readTrackedWorkspace() {
  const snapshot = await db.transaction('r', db.tables, async () => ({ data: await readWorkspace(), health: await db.backupHealth.get('workspace') }))
  return { data: snapshot.data, health: await verifySnapshot(snapshot.data, snapshot.health) }
}
