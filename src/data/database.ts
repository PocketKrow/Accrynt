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
