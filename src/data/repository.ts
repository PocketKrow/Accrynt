import { db } from './database'
import {
  obligationSchema, transactionSchema, monthSchema, debtSchema,
  monthKeySchema, newId, now,
  type MonthPlan, type Obligation, type Transaction, type Debt
} from '../domain/models'

export const localRepository = {
  async saveIncome(month: string, incomeCents: number) {
    const data: MonthPlan = monthSchema.parse({ key: monthKeySchema.parse(month), incomeCents, updatedAt: now() })
    await db.months.put(data)
  },
  async saveObligation(data: Omit<Obligation, 'id' | 'updatedAt'>, id?: string) {
    const row = obligationSchema.parse({ ...data, id: id ?? newId(), updatedAt: now() })
    await db.obligations.put(row)
    return row
  },
  async setObligationPaid(id: string, paid: boolean) {
    const row = await db.obligations.get(id)
    if (!row) throw new Error('This obligation no longer exists.')
    await db.obligations.put({ ...row, paidAt: paid ? now() : null, updatedAt: now() })
  },
  async deleteObligation(id: string) {
    // Detach any historical ledger transaction before deleting its plan line.
    await db.transaction('rw', db.obligations, db.transactions, async () => {
      const linked = await db.transactions.where('obligationId').equals(id).toArray()
      for (const item of linked) await db.transactions.put({ ...item, obligationId: null, updatedAt: now() })
      await db.obligations.delete(id)
    })
  },
  async saveTransaction(data: Omit<Transaction, 'id' | 'updatedAt'>, id?: string) {
    const row = transactionSchema.parse({ ...data, id: id ?? newId(), updatedAt: now() })
    await db.transactions.put(row)
  },
  deleteTransaction(id: string) { return db.transactions.delete(id) },
  async saveDebt(data: Omit<Debt, 'id' | 'updatedAt'>, id?: string) {
    const row = debtSchema.parse({ ...data, id: id ?? newId(), updatedAt: now() })
    if (row.startingBalanceCents !== null && row.startingBalanceCents < row.balanceCents) {
      throw new Error('Starting balance must be at least the current balance.')
    }
    await db.debts.put(row)
  },
  async deleteDebt(id: string) {
    await db.transaction('rw', db.debts, db.obligations, async () => {
      const linked = await db.obligations.where('debtId').equals(id).toArray()
      for (const item of linked) await db.obligations.put({ ...item, debtId: null, updatedAt: now() })
      await db.debts.delete(id)
    })
  },
  async copyPreviousMonth(target: string) {
    const previous = new Date(`${target}-01T12:00:00Z`)
    previous.setUTCMonth(previous.getUTCMonth() - 1)
    const key = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`
    await db.transaction('rw', db.months, db.obligations, async () => {
      const destination = await db.obligations.where('month').equals(target).count()
      const currentConfig = await db.months.get(target)
      if (destination || currentConfig) throw new Error('The selected month already contains a plan.')
      const source = await db.obligations.where('month').equals(key).toArray()
      const month = await db.months.get(key)
      if (!month && !source.length) throw new Error('There is no previous month to copy.')
      await db.months.put({ key: target, incomeCents: month?.incomeCents ?? 0, updatedAt: now() })
      if (source.length) await db.obligations.bulkAdd(source.map(row => ({
        ...row, id: newId(), month: target, paidAt: null, updatedAt: now()
      })))
    })
  }
}
