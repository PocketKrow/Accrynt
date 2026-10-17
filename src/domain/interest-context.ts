import type { BalanceEvent, Transaction } from './models'

/** Historical suggestions only. The user confirms the split; no saved balance is inferred. */
export function postedInterestContext(debtId: string, date: string, events: BalanceEvent[], transactions: Transaction[]) {
  const postings = events.filter(e => e.debtId === debtId && e.kind === 'interest' && !e.reversedAt && e.date <= date)
    .sort((a,b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id))
    .map(e => ({ ...e, remainingCents: e.deltaCents }))
  const payments = transactions.filter(t => t.payment?.debtId === debtId && t.date <= date)
    .sort((a,b) => a.payment!.recordedAt.localeCompare(b.payment!.recordedAt) || a.id.localeCompare(b.id))
  for (const t of payments) {
    if (!t.payment!.interestIncludedInBalance) continue
    let amount = t.payment!.interestCents
    for (const e of postings) {
      if (e.recordedAt >= t.payment!.recordedAt) continue
      const used = Math.min(e.remainingCents, amount)
      e.remainingCents -= used; amount -= used
    }
  }
  // A reconciled statement or refund does not tell us which interest it includes/removes.
  const uncertain = postings.some(p => events.some(e => e.debtId === debtId && !e.reversedAt &&
    (e.kind === 'statement' || e.kind === 'refund') && e.recordedAt > p.recordedAt && e.date <= date))
  return { postings, remainingCents: postings.reduce((total,e) => total + e.remainingCents, 0), uncertain }
}
