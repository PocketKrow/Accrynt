import { expect, it } from 'vitest'
import { postedInterestContext } from '../domain/interest-context'
import { paymentSplit } from '../domain/payment'
import { type BalanceEvent, type Transaction } from '../domain/models'
const e = (id: string, date: string, recordedAt: string, deltaCents = 1500): BalanceEvent => ({ id, date, recordedAt, deltaCents, debtId: 'debt', debtName: 'Synthetic loan', kind: 'interest', reversedAt: null, balanceBeforeCents: 100000, balanceAfterCents: 100000 + deltaCents, previousBalanceAsOf: null, balanceAsOf: date, note: 'Synthetic', period: date.slice(0,7), rateMilliPercent: 18000 })
const t = (date: string, recordedAt: string, interestCents: number, included = true): Transaction => ({ id: recordedAt, date, name: 'Synthetic payment', kind: 'debt-payment', category: 'Debt payments', amountCents: 10000, account: '', obligationId: null, updatedAt: recordedAt, payment: { recordedAt, interestCents, interestIncludedInBalance: included, debtId: 'debt', debtName: 'Synthetic loan', principalCents: 10000 - interestCents, balanceBeforeCents: 100000, balanceAfterCents: 90000, balanceAsOfBefore: null, balanceAsOfAfter: date } })
it('includes prior-month postings and allocates partial/repeated included payments oldest first', () => {
 const events = [e('jan','2026-01-31','2026-01-31T00:00:00Z'), e('feb','2026-02-01','2026-02-01T00:00:00Z',1000)]
 const payments = [t('2026-02-02','2026-02-02T00:00:00Z',500),t('2026-02-03','2026-02-03T00:00:00Z',1200)]
 const result = postedInterestContext('debt','2026-02-04',events,payments)
 expect(result.remainingCents).toBe(800); expect(result.postings.map(p=>p.remainingCents)).toEqual([0,800])
 expect(postedInterestContext('debt','2026-01-31',events,payments).remainingCents).toBe(1500)
 expect(postedInterestContext('debt','2026-02-04',events,[...payments,t('2026-02-04','2026-02-04T00:00:00Z',800)]).remainingCents).toBe(0)
})
it('excludes reversed postings, ignores unincluded interest allocation and flags statement/refund ambiguity', () => {
 const posting = e('jan','2026-01-31','2026-01-31T00:00:00Z')
 expect(postedInterestContext('debt','2026-02-10',[posting],[t('2026-02-02','2026-02-02T00:00:00Z',1500,false)]).remainingCents).toBe(1500)
 expect(postedInterestContext('debt','2026-02-10',[{...posting,reversedAt:'2026-02-03T00:00:00Z'}],[]).postings).toEqual([])
 for (const kind of ['fee','purchase','refund','statement'] as const) {
   const later = {...e('later','2026-02-02','2026-02-02T00:00:00Z'),kind}
   expect(postedInterestContext('debt','2026-02-10',[posting,later],[]).uncertain).toBe(kind === 'statement' || kind === 'refund')
 }
})
it('retains the confirmed arithmetic: included interest changes balance consequence, not the historical split', () => {
 expect(paymentSplit(101500,10000,1500,false).balanceAfterCents).toBe(93000)
 expect(paymentSplit(101500,10000,1500,true).balanceAfterCents).toBe(91500)
})
