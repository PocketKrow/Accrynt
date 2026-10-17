import { newerBalanceEvent } from './balance-events'
import { db } from './database'
import { checkEdit, nextTimestamp } from './integrity'
import { paymentSplit } from '../domain/payment'
import { localDate, monthKeySchema, monthSchema, newId, now, recurringOccurrenceSchema,
  recurringRuleSchema, transactionSchema, type RecurringRule } from '../domain/models'

export interface RecordPaymentInput {
  id: string; date: string; name: string; amountCents: number; interestCents: number; account: string
  debtId: string | null; obligationId: string | null
  expectedDebtUpdatedAt?: string; expectedObligationUpdatedAt?: string
  interestIncludedInBalance?: boolean
}

export const connectedRepository = {
  async saveOpeningBalance(month: string, openingCents: number | null) {
    monthKeySchema.parse(month)
    await db.transaction('rw', db.months, async () => {
      const previous = await db.months.get(month)
      await db.months.put(monthSchema.parse({ key: month, incomeCents: previous?.incomeCents ?? 0,
        openingCents, updatedAt: previous ? nextTimestamp(previous.updatedAt) : now() }))
    })
  },
  async recordPayment(input: RecordPaymentInput) {
    if (input.date > localDate()) throw new Error('Record payments after money has moved. Use Monthly Plan for future payments.')
    if (!input.debtId && !input.obligationId) throw new Error('Choose a debt or obligation to pay.')
    return db.transaction('rw', db.transactions, db.debts, db.obligations, db.balanceEvents, async () => {
      const previous = await db.transactions.get(input.id)
      if (previous) {
        if (previous.payment && previous.date === input.date && previous.name === input.name && previous.amountCents === input.amountCents &&
          previous.account === input.account && previous.obligationId === input.obligationId && previous.payment.debtId === input.debtId &&
          previous.payment.interestCents === input.interestCents &&
          (previous.payment.interestIncludedInBalance ?? false) === (input.interestIncludedInBalance ?? false)) return previous
        throw new Error('This payment request was already used. Close and reopen the payment form.')
      }
      const debt = input.debtId ? await db.debts.get(input.debtId) : undefined
      const obligation = input.obligationId ? await db.obligations.get(input.obligationId) : undefined
      if (input.debtId) {
        if (!input.expectedDebtUpdatedAt) throw new Error('Reopen the payment form to review the current debt balance.')
        checkEdit(debt, input.expectedDebtUpdatedAt)
      }
      if (input.obligationId) {
        if (!input.expectedObligationUpdatedAt) throw new Error('Reopen the payment form to review the current obligation.')
        checkEdit(obligation, input.expectedObligationUpdatedAt)
        if (obligation!.debtId !== input.debtId) throw new Error('The obligation and selected debt do not match.')
      }
      if (!debt && input.interestCents !== 0) throw new Error('Only debt payments can include an interest split.')
      if (!debt && input.interestIncludedInBalance) throw new Error('Only debt payments can specify interest in the saved balance.')
      if (debt?.balanceAsOf && input.date < debt.balanceAsOf) throw new Error('Payment date precedes the saved balance reference date. Reconcile the statement before recording it.')
      const split = debt ? paymentSplit(debt.balanceCents, input.amountCents, input.interestCents, input.interestIncludedInBalance ?? false) : null
      const stamp = nextTimestamp(debt?.updatedAt ?? obligation!.updatedAt)
      const row = transactionSchema.parse({ id: input.id, date: input.date, name: input.name,
        kind: debt ? 'debt-payment' : 'expense', category: debt ? 'Debt payments' : obligation!.category,
        amountCents: input.amountCents, account: input.account, obligationId: input.obligationId, updatedAt: stamp,
        payment: { recordedAt: stamp, debtId: debt?.id ?? null, debtName: debt?.name ?? null, principalCents: split?.principalCents ?? 0,
          interestCents: split?.interestCents ?? 0, interestIncludedInBalance: debt ? input.interestIncludedInBalance ?? false : false,
          balanceAsOfBefore: debt?.balanceAsOf ?? null, balanceAsOfAfter: debt ? input.date : null,
          balanceBeforeCents: debt?.balanceCents ?? null, balanceAfterCents: split?.balanceAfterCents ?? null } })
      if (row.amountCents <= 0) throw new Error('Payment must be greater than zero.')
      if (debt && split) await db.debts.update(debt.id, { balanceCents: split.balanceAfterCents, balanceAsOf: input.date, updatedAt: stamp })
      if (obligation) await db.obligations.update(obligation.id, { updatedAt: nextTimestamp(obligation.updatedAt) })
      await db.transactions.add(row)
      return row
    })
  },
  async undoPayment(id: string, expectedUpdatedAt: string) {
    await db.transaction('rw', db.transactions, db.debts, db.obligations, db.balanceEvents, async () => {
      const row = await db.transactions.get(id)
      checkEdit(row, expectedUpdatedAt)
      if (!row.payment) throw new Error('This entry is not a connected payment.')
      const receipt = row.payment
      const debt = receipt.debtId ? await db.debts.get(receipt.debtId) : undefined
      if (debt) {
        const newer = await newerBalanceEvent(debt.id, receipt.recordedAt)
        if (newer || debt.balanceCents !== receipt.balanceAfterCents || debt.balanceAsOf !== receipt.balanceAsOfAfter) throw new Error('The debt has changed since this payment. Undo newer payments or reverse newer balance adjustments first. The saved balance and reference date must match this receipt.')
        await db.debts.update(debt.id, { balanceCents: receipt.balanceBeforeCents!, balanceAsOf: receipt.balanceAsOfBefore, updatedAt: nextTimestamp(debt.updatedAt) })
      }
      const obligation = row.obligationId ? await db.obligations.get(row.obligationId) : undefined
      if (obligation) await db.obligations.update(obligation.id, { updatedAt: nextTimestamp(obligation.updatedAt) })
      await db.transactions.delete(id)
    })
  },
  async saveRecurringRule(data: Omit<RecurringRule, 'id' | 'updatedAt'>, id?: string, expectedUpdatedAt?: string,
    sourceObligation?: { id: string; expectedUpdatedAt: string }) {
    const row = recurringRuleSchema.parse({ ...data, id: id ?? newId(), updatedAt: now() })
    await db.transaction('rw', db.recurringRules, db.debts, db.obligations, db.recurringOccurrences, async () => {
      if (id) {
        const previous = await db.recurringRules.get(id)
        checkEdit(previous, expectedUpdatedAt)
        if (previous.kind !== row.kind) throw new Error('A recurring item cannot change between bill and income. Pause it and create another.')
        row.updatedAt = nextTimestamp(previous.updatedAt)
      }
      if (row.debtId && !await db.debts.get(row.debtId)) throw new Error('The linked debt no longer exists.')
      if (!id && !sourceObligation && row.kind === 'bill') {
        const matching = await db.obligations.where('month').equals(row.startMonth).filter(bill => bill.name.toLowerCase() === row.name.toLowerCase()).count()
        if (matching) throw new Error('A bill with this name already exists in the start month. Use Repeat monthly on that bill, or choose a later start month.')
      }
      if (sourceObligation) {
        const source = await db.obligations.get(sourceObligation.id)
        checkEdit(source, sourceObligation.expectedUpdatedAt)
        if (id || row.kind !== 'bill' || row.startMonth !== source.month) throw new Error('Repeat an existing bill from its own month using a new bill rule.')
        if (await db.recurringOccurrences.where('obligationId').equals(source.id).count()) throw new Error('This bill already has a recurring definition.')
        await db.recurringOccurrences.add(recurringOccurrenceSchema.parse({ id: `${row.id}:${source.month}`, ruleId: row.id,
          month: source.month, kind: 'bill', name: source.name, amountCents: source.plannedCents, dueDay: source.dueDay,
          obligationId: source.id, cancelled: false, updatedAt: now() }))
      }
      await db.recurringRules.put(row)
    })
  },
  async ensureRecurringMonth(month: string) {
    monthKeySchema.parse(month)
    await db.transaction('rw', db.recurringRules, db.recurringOccurrences, db.obligations, db.debts, async () => {
      const rules = await db.recurringRules.toArray()
      for (const rule of rules) {
        if (!rule.enabled || month < rule.startMonth || (rule.endMonth !== null && month > rule.endMonth)) continue
        const id = `${rule.id}:${month}`
        if (await db.recurringOccurrences.get(id)) continue
        const obligationId = rule.kind === 'bill' ? newId() : null, stamp = now()
        if (obligationId) await db.obligations.add({ id: obligationId, month, name: rule.name,
          category: rule.category, plannedCents: rule.amountCents, dueDay: rule.dueDay,
          debtId: rule.debtId, paidAt: null, updatedAt: stamp })
        await db.recurringOccurrences.add(recurringOccurrenceSchema.parse({ id, ruleId: rule.id, month,
          kind: rule.kind, name: rule.name, amountCents: rule.amountCents, dueDay: rule.dueDay,
          obligationId, cancelled: false, updatedAt: stamp }))
      }
    })
  },
  async saveExpectedOccurrence(id: string, amountCents: number, dueDay: number | null, cancelled: boolean, expectedUpdatedAt: string) {
    await db.transaction('rw', db.recurringOccurrences, async () => {
      const row = await db.recurringOccurrences.get(id)
      checkEdit(row, expectedUpdatedAt)
      if (row.kind !== 'income') throw new Error('Edit recurring bills in Monthly Plan.')
      await db.recurringOccurrences.put(recurringOccurrenceSchema.parse({ ...row, amountCents, dueDay, cancelled, updatedAt: nextTimestamp(row.updatedAt) }))
    })
  }
}
