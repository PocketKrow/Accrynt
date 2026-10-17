import { db } from './database'
import { checkEdit, nextTimestamp } from './integrity'
import { monthlyInterest } from '../domain/debt'
import { balanceEventSchema, localDate, newId, type BalanceEvent, type Debt } from '../domain/models'

/** Called only inside a write transaction containing debts, transactions and balanceEvents. */
export async function newerBalanceEvent(debtId: string, recordedAt: string) {
  const payment = await db.transactions.filter(t => t.payment?.debtId === debtId && t.payment.recordedAt > recordedAt).count()
  const adjustment = await db.balanceEvents.where('debtId').equals(debtId).filter(e => !e.reversedAt && e.recordedAt > recordedAt).count()
  return payment > 0 || adjustment > 0
}
export function statementEvent(previous: Debt, next: Debt, stamp: string): BalanceEvent {
  return balanceEventSchema.parse({ id: newId(), debtId: previous.id, debtName: next.name, kind: 'statement', date: next.balanceAsOf ?? localDate(),
    recordedAt: stamp, reversedAt: null, balanceBeforeCents: previous.balanceCents, balanceAfterCents: next.balanceCents,
    deltaCents: next.balanceCents - previous.balanceCents, previousBalanceAsOf: previous.balanceAsOf, balanceAsOf: next.balanceAsOf,
    note: 'Statement balance/reference date updated in debt editor', period: null, rateMilliPercent: null })
}
export const balanceRepository = {
  async adjustDebt(input: { id: string; debtId: string; expectedUpdatedAt: string; kind: BalanceEvent['kind']; date: string; amountCents: number; note: string; period?: string }) {
    if (!input.expectedUpdatedAt) throw new Error('Reopen the adjustment form to review the current debt.')
    if (input.date > localDate()) throw new Error('Balance adjustments cannot be posted in the future.')
    return db.transaction('rw', db.debts, db.transactions, db.balanceEvents, async () => {
      const previous = await db.balanceEvents.get(input.id)
      if (previous) {
        if (previous.debtId === input.debtId && previous.kind === input.kind && previous.date === input.date && previous.note === input.note &&
          (input.kind === 'statement' ? previous.balanceAfterCents : previous.deltaCents) === input.amountCents && !previous.reversedAt) return previous
        throw new Error('This adjustment request or interest period was already used. Review the balance history.')
      }
      const debt = await db.debts.get(input.debtId); checkEdit(debt, input.expectedUpdatedAt)
      if (debt.balanceAsOf && input.date < debt.balanceAsOf) throw new Error('Choose a date on or after the saved balance reference date.')
      let delta = input.kind === 'statement' ? input.amountCents - debt.balanceCents : input.amountCents
      if (input.kind === 'interest') {
        if (!input.period || input.period !== input.date.slice(0, 7) || input.id !== `interest:${debt.id}:${input.period}`) throw new Error('Choose a matching interest month.')
        if (debt.aprMilliPercent === null) throw new Error('An annual rate is required.')
        if (debt.interestMethod !== 'monthly') throw new Error('Only the nominal monthly model supports estimate posting. Daily estimates are display-only.')
        const recorded = await db.transactions.filter(t => t.payment?.debtId === debt.id && t.date.startsWith(input.period!) && t.payment.interestCents > 0).count()
        if (recorded) throw new Error('Interest was already recorded in a payment this month. Reconcile the actual statement instead of posting another full month.')
        delta = monthlyInterest(debt.balanceCents, debt.aprMilliPercent)
        if (input.amountCents !== delta) throw new Error('The estimate changed. Reopen the adjustment to review it.')
      } else if ((input.kind === 'fee' || input.kind === 'purchase') && delta <= 0) throw new Error('Enter a positive charge amount.')
      else if (input.kind === 'refund' && delta >= 0) throw new Error('Enter a negative refund amount.')
      const stamp = nextTimestamp(debt.updatedAt)
      const row = balanceEventSchema.parse({ id: input.id, debtId: debt.id, debtName: debt.name, kind: input.kind, date: input.date,
        recordedAt: stamp, reversedAt: null, balanceBeforeCents: debt.balanceCents, balanceAfterCents: debt.balanceCents + delta, deltaCents: delta,
        previousBalanceAsOf: debt.balanceAsOf, balanceAsOf: input.date, note: input.note, period: input.kind === 'interest' ? input.period : null,
        rateMilliPercent: input.kind === 'interest' ? debt.aprMilliPercent : null })
      await db.balanceEvents.add(row)
      await db.debts.update(debt.id, { balanceCents: row.balanceAfterCents, balanceAsOf: row.balanceAsOf, updatedAt: stamp })
      return row
    })
  },
  async undoAdjustment(id: string) {
    await db.transaction('rw', db.debts, db.transactions, db.balanceEvents, async () => {
      const event = await db.balanceEvents.get(id)
      if (!event || event.reversedAt) throw new Error('This adjustment is missing or already reversed.')
      const debt = await db.debts.get(event.debtId)
      if (!debt) throw new Error('The original debt was deleted. Its historical adjustment is retained.')
      if (await newerBalanceEvent(debt.id, event.recordedAt) || debt.balanceCents !== event.balanceAfterCents || debt.balanceAsOf !== event.balanceAsOf) throw new Error('Undo the latest debt balance event first. The saved balance must match this event.')
      const stamp = nextTimestamp(debt.updatedAt)
      await db.debts.update(debt.id, { balanceCents: event.balanceBeforeCents, balanceAsOf: event.previousBalanceAsOf, updatedAt: stamp })
      await db.balanceEvents.update(id, { reversedAt: stamp })
    })
  }
}
