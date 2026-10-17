import { expect, it } from 'vitest'
import { openingSuggestion } from '../domain/opening'
import { now, newId, type Transaction } from '../domain/models'
const month = (key: string, openingCents: number | null) => ({ key, openingCents, incomeCents: 999999, updatedAt: now() })
const tx = (date: string, kind: Transaction['kind'], amountCents: number): Transaction => ({ id: newId(), date, kind, amountCents, name: 'Synthetic entry', category: 'Other', account: '', payment: null, obligationId: null, updatedAt: now() })
it.each([0, -1000, 1000])('preserves %i closing semantics and uses the completed month’s dated actuals only', opening => {
  const months = [month('2026-09', opening)], transactions = [tx('2026-09-30', 'income', 500), tx('2026-09-29', 'expense', 500), tx('2026-10-01', 'income', 99999)]
  expect(openingSuggestion('2026-10', '2026-10-16', months, transactions)).toEqual({ source: '2026-09', cents: opening })
  expect(months[0].openingCents).toBe(opening)
})
it('does not use mid-month, future, unknown or existing cash, and respects the calendar floor', () => {
  expect(openingSuggestion('2026-11', '2026-10-16', [month('2026-10', 100)], [])).toBeNull()
  expect(openingSuggestion('2026-10', '2026-10-16', [month('2026-09', null)], [])).toBeNull()
  expect(openingSuggestion('2026-10', '2026-10-16', [month('2026-09', 100), month('2026-10', 0)], [])).toBeNull()
  expect(openingSuggestion('0001-01', '2026-10-16', [], [])).toBeNull()
})
