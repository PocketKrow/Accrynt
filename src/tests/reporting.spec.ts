import { describe, expect, it } from 'vitest'
import { ledgerCsv, compareTransactions } from '../domain/ledger'
import { historyRows } from '../domain/reports'
import { demoFixture } from '../data/demo'
describe('honest reporting and safe exports', () => {
  it('keeps missing history unknown and excludes scheduled actuals', () => {
    const f = demoFixture('2026-10-16')
    const rows = historyRows('2026-10', 12, f.months, f.obligations, f.transactions, f.recurringOccurrences, '2026-10-16')
    expect(rows[0]).toMatchObject({ plannedCents: null, outflowCents: null, incomeCents: null })
    expect(rows[11].incomeCents).toBe(332500)
    expect(rows[11].outflowCents).toBe(165000) // rent + utilities + insurance + partial groceries + card payment
  })
  it('quotes commas, quotes, newlines and neutralizes formula prefixes', () => {
    const t = demoFixture('2026-10-16').transactions[0]
    const csv = ledgerCsv([{ ...t, name: '=SUM(1,2)', account: '  @cmd', amountCents: 101 }, { ...t, name: 'Two, "quotes"\nand a line', account: '\tDanger' }], true)
    expect(csv).toContain('"\'=SUM(1,2)"'); expect(csv).toContain('"\'  @cmd"')
    expect(csv).toContain('"Two, ""quotes""\nand a line"'); expect(csv).toContain('"1.01"'); expect(csv).toContain('DEMO · SYNTHETIC DATA')
  })
  it('uses receipt recording order and deterministic IDs, never mutable edit timestamps', () => {
    const t = demoFixture('2026-10-16').transactions.find(t => t.payment)!
    const older = { ...t, id: 'a', updatedAt: '2099-01-01T00:00:00Z', payment: { ...t.payment!, recordedAt: '2026-10-15T00:00:00Z' } }
    expect([older, t].sort(compareTransactions)[0]).toBe(t)
    expect(compareTransactions({ ...t, payment: null, id:'a' }, { ...t, payment: null, id:'b' })).toBeLessThan(0)
  })
})
