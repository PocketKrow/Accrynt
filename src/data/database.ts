import { databaseName } from './workspace'
import Dexie, { type Table } from 'dexie'
import type { MonthPlan, Obligation, Transaction, Debt, RecurringRule, RecurringOccurrence } from '../domain/models'

export class AccryntDatabase extends Dexie {
  months!: Table<MonthPlan, string>
  obligations!: Table<Obligation, string>
  transactions!: Table<Transaction, string>
  debts!: Table<Debt, string>
  recurringRules!: Table<RecurringRule, string>
  recurringOccurrences!: Table<RecurringOccurrence, string>

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
    recurringRules: await db.recurringRules.toArray(), recurringOccurrences: await db.recurringOccurrences.toArray()
  }))
}

export function clearWorkspace() {
  return db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}
