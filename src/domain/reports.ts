import { monthlySummary, shiftMonth, sum } from './finance'
import type { MonthPlan, Obligation, Transaction, RecurringOccurrence } from './models'
/** Absence of recorded history is unknown, even if a month has a generated plan. */
export function historyRows(end: string, count: number, months: MonthPlan[], obligations: Obligation[], transactions: Transaction[], occurrences: RecurringOccurrence[], through: string) {
  if (!Number.isInteger(count) || count < 1 || count > 1200) throw new RangeError('Choose a supported history length.')
  shiftMonth(end, 0)
  const [year, monthNumber] = end.split('-').map(Number), length = Math.min(count, (year - 1) * 12 + monthNumber)
  return Array.from({ length }, (_, i) => {
    const month = shiftMonth(end, i - length + 1), config = months.find(m => m.key === month)
    const bills = obligations.filter(o => o.month === month), activity = transactions.filter(t => t.date.startsWith(month) && t.date <= through)
    const generated = occurrences.filter(o => o.month === month && !o.cancelled)
    const hasPlan = !!config || bills.length > 0 || generated.length > 0
    const summary = monthlySummary(month, (config?.incomeCents ?? 0) + sum(generated.filter(o => o.kind === 'income').map(o => o.amountCents)), bills, transactions, through)
    return { month, plannedCents: hasPlan ? summary.plannedCents : null, expectedCents: hasPlan ? summary.plannedCents + summary.remainingCents : null,
      incomeCents: activity.length ? summary.actualIncomeCents : null, outflowCents: activity.length ? summary.actualOutflowCents : null,
      netCents: activity.length ? summary.actualNetCents : null }
  })
}

/** Only validated month keys, internally computed numeric amounts and fixed labels enter this export. */
export function historyCsv(rows: ReturnType<typeof historyRows>) {
  const dollars = (cents:number|null) => cents===null ? '' : `${cents<0?'-':''}${Math.trunc(Math.abs(cents)/100)}.${String(Math.abs(cents)%100).padStart(2,'0')}`
  const lines = [['Workspace','Month','Expected income USD','Planned outflow USD','Received USD','Actual outflow USD','Actual net USD'],
    ...rows.map(r=>['Personal workspace',r.month,dollars(r.expectedCents),dollars(r.plannedCents),dollars(r.incomeCents),dollars(r.outflowCents),dollars(r.netCents)])]
  return '\uFEFF'+lines.map(line=>line.map(value=>`"${value.replace(/"/g,'""')}"`).join(',')).join('\r\n')+'\r\n'
}
