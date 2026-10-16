import Dexie, { type Table } from 'dexie'
import type { MonthPlan, Obligation, Transaction, Debt } from '../domain/models'

export class AccryntDatabase extends Dexie {
  months!: Table<MonthPlan, string>
  obligations!: Table<Obligation, string>
  transactions!: Table<Transaction, string>
  debts!: Table<Debt, string>

  constructor() {
    super('accrynt-local-v1')
    this.version(1).stores({
      months: 'key',
      obligations: 'id,month,category,paidAt,debtId',
      transactions: 'id,date,kind,category,obligationId',
      debts: 'id'
    })
  }
}
export const db = new AccryntDatabase()

// A single snapshot keeps UI totals and portable backups consistent across tabs.
export function readWorkspace() {
  return db.transaction('r', db.months, db.obligations, db.transactions, db.debts, async () => ({
    months: await db.months.toArray(),
    obligations: await db.obligations.toArray(),
    transactions: await db.transactions.toArray(),
    debts: await db.debts.toArray()
  }))
}

export function clearWorkspace() {
  return db.transaction('rw', db.months, db.obligations, db.transactions, db.debts, async () => {
    await db.months.clear()
    await db.obligations.clear()
    await db.transactions.clear()
    await db.debts.clear()
  })
}
