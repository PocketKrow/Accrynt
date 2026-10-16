import { db } from './database'
import { shiftMonth } from '../domain/finance'
import {
  obligationSchema, transactionSchema, monthSchema, debtSchema,
  monthKeySchema, newId, now,
  type MonthPlan, type Obligation, type Transaction, type Debt
} from '../domain/models'

function checkEdit(row: { updatedAt: string } | undefined, expectedUpdatedAt?: string): asserts row is { updatedAt: string } {
  if (!row) throw new Error('This record no longer exists. Close the editor and refresh your view.')
  if (expectedUpdatedAt !== undefined && row.updatedAt !== expectedUpdatedAt) {
    throw new Error('This record changed while you were editing it. Close and reopen the editor before saving.')
  }
}

// A per-record monotonic timestamp also detects edits made within the same millisecond.
function nextTimestamp(previous: string) {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
}

export const localRepository = {
  async saveIncome(month: string, incomeCents: number) {
    const data: MonthPlan = monthSchema.parse({ key: monthKeySchema.parse(month), incomeCents, updatedAt: now() })
    await db.months.put(data)
  },
  async saveObligation(data: Omit<Obligation, 'id' | 'updatedAt'>, id?: string, expectedUpdatedAt?: string) {
    const row = obligationSchema.parse({ ...data, id: id ?? newId(), updatedAt: now() })
    await db.transaction('rw', db.obligations, db.debts, async () => {
      if (id) {
        const existing = await db.obligations.get(id)
        checkEdit(existing, expectedUpdatedAt)
        row.updatedAt = nextTimestamp(existing.updatedAt)
        if (existing.month !== row.month) throw new Error('An existing obligation cannot move to another month.')
      }
      if (row.debtId && !await db.debts.get(row.debtId)) {
        throw new Error('The linked debt no longer exists. Choose another debt or remove the link.')
      }
      await db.obligations.put(row)
    })
    return row
  },
  async setObligationPaid(id: string, paid: boolean) {
    // Update only these fields; never overwrite an edit from another tab with a stale row.
    await db.transaction('rw', db.obligations, async () => {
      const existing = await db.obligations.get(id)
      if (!existing) throw new Error('This obligation no longer exists.')
      const timestamp = nextTimestamp(existing.updatedAt)
      await db.obligations.update(id, { paidAt: paid ? timestamp : null, updatedAt: timestamp })
    })
  },
  async deleteObligation(id: string) {
    await db.transaction('rw', db.obligations, db.transactions, async () => {
      await db.transactions.where('obligationId').equals(id).modify(row => { row.obligationId = null; row.updatedAt = nextTimestamp(row.updatedAt) })
      await db.obligations.delete(id)
    })
  },
  async saveTransaction(data: Omit<Transaction, 'id' | 'updatedAt'>, id?: string, expectedUpdatedAt?: string) {
    const row = transactionSchema.parse({ ...data, id: id ?? newId(), updatedAt: now() })
    if (row.amountCents <= 0) throw new Error('A new or edited transaction must have an amount greater than zero.')
    if (row.kind === 'income' && row.obligationId) throw new Error('Income cannot be linked to a payment obligation.')
    if (row.kind === 'debt-payment' && row.category !== 'Debt payments') {
      throw new Error('Debt payments must use the Debt payments category.')
    }
    await db.transaction('rw', db.transactions, db.obligations, async () => {
      if (id) {
        const existing = await db.transactions.get(id)
        checkEdit(existing, expectedUpdatedAt)
        row.updatedAt = nextTimestamp(existing.updatedAt)
      }
      if (row.obligationId && !await db.obligations.get(row.obligationId)) {
        throw new Error('The related obligation no longer exists. Choose another obligation or remove the link.')
      }
      await db.transactions.put(row)
    })
  },
  deleteTransaction(id: string) { return db.transactions.delete(id) },
  async saveDebt(data: Omit<Debt, 'id' | 'updatedAt'>, id?: string, expectedUpdatedAt?: string) {
    const row = debtSchema.parse({ ...data, id: id ?? newId(), updatedAt: now() })
    // Interest, fees, and new charges may legitimately push a balance above its baseline.
    await db.transaction('rw', db.debts, async () => {
      if (id) {
        const existing = await db.debts.get(id)
        checkEdit(existing, expectedUpdatedAt)
        row.updatedAt = nextTimestamp(existing.updatedAt)
      }
      await db.debts.put(row)
    })
  },
  async deleteDebt(id: string) {
    await db.transaction('rw', db.debts, db.obligations, async () => {
      await db.obligations.where('debtId').equals(id).modify(row => { row.debtId = null; row.updatedAt = nextTimestamp(row.updatedAt) })
      await db.debts.delete(id)
    })
  },
  async copyPreviousMonth(target: string) {
    monthKeySchema.parse(target)
    const key = shiftMonth(target, -1)
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
