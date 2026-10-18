import { financialTables } from './backup-health'
import { AccryntDatabase, db } from './database'
import { isDemo } from './workspace'
import { localDate, type Backup, type Category } from '../domain/models'
import { dueDate, shiftMonth } from '../domain/finance'
import { validateBackup } from './backup'

// Stable synthetic UUIDs: repeat entry/reset is reproducible, never derived from personal data.
const id = (n: number) => `de000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export type DemoScenario = 'showroom' | 'cash-shortfall' | 'near-payoff' | 'february'
export function demoFixture(reference = localDate(), scenario: DemoScenario = 'showroom'): Backup {
  if (scenario === 'february') reference = `${reference.slice(0,4)}-02-28`
  const month = scenario === 'february' ? `${reference.slice(0, 4)}-02` : reference.slice(0, 7)
  const stamp = `${reference}T12:00:00.000Z`
  const data: Backup = { format: 'accrynt-portable', schemaVersion: 5, workspace: 'demo-synthetic', balanceEvents: [], exportedAt: stamp,
    months: [], obligations: [], transactions: [], debts: [], recurringRules: [], recurringOccurrences: [] }
  const debtRows: Array<[string, number, number | null, number]> = [
    ['Fictional revolving card', 216437, 24990, 10000], ['Fictional personal loan', 389000, 17000, 17500],
    ['Fictional vehicle loan', 847500, 6125, 31000], ['Fictional promotion · 0%', 45000, 0, 5000],
    ['Fictional unknown-rate debt', 90000, null, 6000], ['Fictional paid-off loan', 0, 12000, 7000]
  ]
  data.debts = debtRows.map(([name, balanceCents, aprMilliPercent, minimumCents], i) => ({
    id: id(i + 1), name, balanceCents, startingBalanceCents: balanceCents + 30000, minimumCents,
    monthlyPaymentCents: minimumCents, aprMilliPercent, balanceAsOf: reference, interestMethod: 'monthly', updatedAt: stamp }))
  // Precise three-decimal rate is stored without rounding.
  if (scenario === 'near-payoff') data.debts[0].balanceCents = 117
  const reconciled = data.debts[1]
  data.balanceEvents.push({ id:id(90), debtId:reconciled.id, debtName:reconciled.name, kind:'statement', date:reference,
    recordedAt:`${reference}T11:00:00.000Z`, reversedAt:null, balanceBeforeCents:reconciled.balanceCents-2500,
    balanceAfterCents:reconciled.balanceCents, deltaCents:2500, previousBalanceAsOf:null, balanceAsOf:reference,
    note:'Synthetic statement reconciliation including a confirmed fee', period:null, rateMilliPercent:null })
  const specs: Array<[string, Category, number, number, number | null]> = [
    ['Fictional rent', 'Housing', 125000, 1, null], ['Fictional utilities', 'Utilities', 14500, 8, null],
    ['Fictional insurance', 'Insurance', 8000, 11, null], ['Fictional groceries', 'Groceries', 34000, 18, null],
    ['Fictional transit', 'Transport', 6500, 20, null], ['Fictional subscription', 'Subscriptions', 1500, 23, null],
    ['Fictional healthcare', 'Healthcare', 4500, 13, null], ['Fictional card payment', 'Debt payments', 10000, 22, 0],
    ['Fictional personal payment', 'Debt payments', 17500, 24, 1], ['Fictional vehicle payment', 'Debt payments', 31000, 26, 2]
  ]
  specs.forEach(([name, category, amountCents, day, debtIndex], i) => data.recurringRules.push({
    id: id(100 + i), name, kind: 'bill', amountCents, category, dueDay: scenario === 'february' && i === 4 ? 31 : day,
    debtId: debtIndex === null ? null : data.debts[debtIndex].id, startMonth: shiftMonth(month, -5), endMonth: null, enabled: true, updatedAt: stamp }))
  for (const [i, name, amount, day] of [[0, 'Fictional payroll', 285000, 3], [1, 'Fictional side work', 47500, 14]] as const) {
    data.recurringRules.push({ id: id(120 + i), name, kind: 'income', amountCents: amount, category: 'Other', dueDay: day,
      debtId: null, startMonth: shiftMonth(month, -5), endMonth: null, enabled: true, updatedAt: stamp })
  }
  let sequence = 1000
  for (let offset = -5; offset <= 0; offset++) {
    const key = shiftMonth(month, offset), historical = key < reference.slice(0, 7)
    data.months.push({ key, incomeCents: 0, openingCents: scenario === 'cash-shortfall' && offset === 0 ? -150000 : 62500 + (offset + 5) * 2500, updatedAt: stamp })
    for (const rule of data.recurringRules) {
      const obligationId = rule.kind === 'bill' ? id(sequence++) : null
      const occurrence = { id: `${rule.id}:${key}`, ruleId: rule.id, month: key, kind: rule.kind, name: rule.name,
        amountCents: rule.amountCents, dueDay: rule.dueDay, obligationId, cancelled: false, updatedAt: stamp }
      data.recurringOccurrences.push(occurrence)
      const date = dueDate(key, rule.dueDay!)
      if (rule.kind === 'income') {
        if (date <= reference) data.transactions.push({ id: id(sequence++), date, name: rule.name, kind: 'income', category: 'Other', amountCents: rule.amountCents,
          account: 'Synthetic checking', obligationId: null, incomeOccurrenceId: occurrence.id, payment: null, updatedAt: stamp })
        continue
      }
      const manualPaid = rule.category === 'Insurance' && date <= reference
      data.obligations.push({ id: obligationId!, month: key, name: rule.name, category: rule.category, plannedCents: rule.amountCents,
        dueDay: rule.dueDay, debtId: rule.debtId, paidAt: manualPaid ? stamp : null, updatedAt: stamp })
      // Healthcare remains overdue; groceries has a partial payment; subscription is scheduled.
      const paid = date <= reference && (historical || !['Healthcare', 'Groceries'].includes(rule.category))
      const partial = !historical && rule.category === 'Groceries' && `${key}-10` <= reference
      const scheduled = !historical && rule.category === 'Subscriptions' && date > reference
      if ((paid || partial || scheduled) && (!rule.debtId || historical)) data.transactions.push({ id: id(sequence++), date: partial ? `${key}-10` : date,
        name: `${scheduled ? 'Scheduled' : 'Recorded'} · ${rule.name}`, kind: rule.debtId ? 'debt-payment' : 'expense', category: rule.category,
        amountCents: partial ? 12500 : rule.amountCents, account: 'Synthetic checking', obligationId, payment: null, updatedAt: stamp })
    }
  }
  // A real, reversible split against the saved card balance, dated today; no fictitious balance mutation.
  const card = data.debts[0], bill = data.obligations.find(o => o.month === month && o.debtId === card.id)!
  const payment = Math.min(5000, card.balanceCents), interest = Math.min(2500, payment)
  data.transactions.push({ id: id(sequence++), date: reference, name: 'Synthetic partial card payment', kind: 'debt-payment', category: 'Debt payments',
    amountCents: payment, account: 'Synthetic checking', obligationId: bill.id, updatedAt: stamp,
    payment: { recordedAt: stamp, debtId: card.id, debtName: card.name, principalCents: payment - interest, interestCents: interest,
      interestIncludedInBalance: false, balanceAsOfBefore: reference, balanceAsOfAfter: reference, balanceBeforeCents: card.balanceCents + payment - interest, balanceAfterCents: card.balanceCents } })
  const skipped = data.recurringOccurrences.find(o => o.month === shiftMonth(month, -1) && o.ruleId === id(104))!
  data.obligations = data.obligations.filter(o => o.id !== skipped.obligationId)
  data.transactions.forEach(t => { if (t.obligationId === skipped.obligationId) t.obligationId = null })
  skipped.cancelled = true; skipped.obligationId = null
  return validateBackup(data)
}

async function writeFixture(database: AccryntDatabase, fixture: Backup) {
  await database.months.bulkAdd(fixture.months); await database.obligations.bulkAdd(fixture.obligations)
  await database.transactions.bulkAdd(fixture.transactions); await database.debts.bulkAdd(fixture.debts)
  await database.balanceEvents.bulkAdd(fixture.balanceEvents)
  await database.recurringRules.bulkAdd(fixture.recurringRules); await database.recurringOccurrences.bulkAdd(fixture.recurringOccurrences)
}
export async function seedDemo(database = db, reference = localDate()) {
  if (database.name !== 'accrynt-demo-v1') throw new Error('Demo seeding requires the isolated demo database.')
  const fixture = demoFixture(reference)
  await database.transaction('rw', database.tables, async () => {
    for (const name of financialTables) if (await database.table(name).count()) return
    await writeFixture(database, fixture)
  })
}
export async function resetDemo(scenario: DemoScenario = 'showroom') {
  if (!isDemo || db.name !== 'accrynt-demo-v1') throw new Error('Reset is only available in the demo workspace.')
  const fixture = demoFixture(localDate(), scenario)
  await db.transaction('rw', db.tables, async () => {
    for (const name of financialTables) await db.table(name).clear()
    await writeFixture(db, fixture)
  })
}
