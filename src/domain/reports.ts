import { monthlySummary, shiftMonth, sum } from './finance'
import type { MonthPlan, Obligation, Transaction, RecurringOccurrence } from './models'
/** Absence of recorded history is unknown, even if a month has a generated plan. */
export function historyRows(end: string, count: number, months: MonthPlan[], obligations: Obligation[], transactions: Transaction[], occurrences: RecurringOccurrence[], through: string) {
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(end, i - count + 1), config = months.find(m => m.key === month)
    const bills = obligations.filter(o => o.month === month), activity = transactions.filter(t => t.date.startsWith(month) && t.date <= through)
    const generated = occurrences.filter(o => o.month === month && !o.cancelled)
    const hasPlan = !!config || bills.length > 0 || generated.length > 0
    const summary = monthlySummary(month, (config?.incomeCents ?? 0) + sum(generated.filter(o => o.kind === 'income').map(o => o.amountCents)), bills, transactions, through)
    return { month, plannedCents: hasPlan ? summary.plannedCents : null, expectedCents: hasPlan ? summary.plannedCents + summary.remainingCents : null,
      incomeCents: activity.length ? summary.actualIncomeCents : null, outflowCents: activity.length ? summary.actualOutflowCents : null,
      netCents: activity.length ? summary.actualNetCents : null }
  })
}
