import { financialTables } from './backup-health'
import { db } from './database'
import { newId, now, type Category } from '../domain/models'

/** Small fictional selected-month example; normal workspaces never seed automatically. */
export async function loadOctoberExample(month: string) {
  await db.transaction('rw', db.tables, async () => {
    for (const name of financialTables) if (await db.table(name).count()) throw new Error('Example data can only be loaded into a completely empty workspace.')
    await db.months.add({ key: month, incomeCents: 332500, openingCents: null, updatedAt: now() })
    const bills: Array<[string, number, Category]> = [['Example rent', 125000, 'Housing'], ['Example utilities', 14500, 'Utilities'], ['Example groceries', 34000, 'Groceries']]
    await db.obligations.bulkAdd(bills.map(([name, plannedCents, category]) => ({ id: newId(), month, name, plannedCents, category, paidAt: null, dueDay: 15, debtId: null, updatedAt: now() })))
  })
}
