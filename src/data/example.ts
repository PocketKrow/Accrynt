import { db } from './database'
import { newId, now, type Category, type Obligation } from '../domain/models'

// Optional import of the approved October concept's sample data.
// Never automatically load personal/demo financial information into a new database.
const example: Array<[string, number, Category]> = [
  ['AEP Ohio · Electricity', 26000, 'Utilities'],
  ['Breezeline · Internet', 4100, 'Utilities'],
  ['Google Fi · Mobile', 12100, 'Utilities'],
  ['State Farm · Auto insurance', 10000, 'Insurance'],
  ['WPCU · QCash loan', 10000, 'Debt payments'],
  ['WPCU · Personal loan', 25400, 'Debt payments'],
  ['WPCU · Auto loan', 24000, 'Debt payments'],
  ['ChatGPT', 2000, 'Subscriptions'],
  ['Twitch Turbo', 1200, 'Subscriptions'],
  ['Discord Nitro', 1100, 'Subscriptions'],
  ['Crunchyroll', 1100, 'Subscriptions'],
  ['YouTube Premium', 0, 'Subscriptions'],
  ['WPCU credit card', 9100, 'Debt payments'],
  ['PayPal credit card', 10500, 'Debt payments'],
  ['BigLots credit card', 3600, 'Debt payments'],
  ['MicroCenter credit card', 5400, 'Debt payments'],
  ['Chase Freedom card', 4000, 'Debt payments'],
  ['Chase Prime card', 3500, 'Debt payments'],
  ['CareCredit card', 3800, 'Debt payments'],
  ['Amazon Store card', 4200, 'Debt payments']
]

export async function loadOctoberExample(month: string) {
  await db.transaction('rw', db.tables, async () => {
    if (await db.months.count() || await db.obligations.count() ||
        await db.transactions.count() || await db.debts.count() || await db.recurringRules.count() || await db.recurringOccurrences.count()) {
      throw new Error('Example data can only be loaded into a completely empty workspace.')
    }
    await db.months.put({ key: month, incomeCents: 182200, openingCents: null, updatedAt: now() })
    const rows: Obligation[] = example.map(([name, plannedCents, category]) => ({
      id: newId(), month, name, plannedCents, category,
      paidAt: null, dueDay: null, debtId: null, updatedAt: now()
    }))
    await db.obligations.bulkAdd(rows)
  })
}
