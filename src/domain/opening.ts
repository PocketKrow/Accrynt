import { availableMoney, dueDate, shiftMonth } from './finance'
import type { MonthPlan, Transaction } from './models'

/** A reviewed suggestion from a completed calendar month, never an automatic rollover. */
export function openingSuggestion(target: string, today: string, months: MonthPlan[], transactions: Transaction[]) {
  if (target === '0001-01' || months.find(m => m.key === target)?.openingCents != null) return null
  const source = shiftMonth(target, -1)
  if (source >= today.slice(0, 7)) return null
  const month = months.find(m => m.key === source)
  if (month?.openingCents == null) return null
  const cents = availableMoney(source, month.openingCents, [], transactions, dueDate(source, 31)).trackedCents
  return cents === null ? null : { source, cents }
}
