import { z } from 'zod'

// Use Zod's interpreted validators under the production no-eval CSP. Configure
// before constructing schemas so its feature probe does not emit CSP violations.
z.config({ jitless: true })

const id = z.string().uuid()
const money = z.number().int().min(0).max(999_999_999_99)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false
  const actual = new Date(0)
  actual.setUTCFullYear(year, month - 1, day)
  return actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day
}, 'Invalid calendar date')
export const transactionDateSchema = date
export const monthKeySchema = z.string().regex(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/)
export const categorySchema = z.enum(['Housing', 'Utilities', 'Insurance', 'Subscriptions', 'Debt payments', 'Groceries', 'Transport', 'Healthcare', 'Other'])
export type Category = z.infer<typeof categorySchema>

const legacyMonthSchema = z.object({
  key: monthKeySchema,
  incomeCents: money,
  updatedAt: z.string().datetime()
}).strict()
export const monthSchema = legacyMonthSchema.extend({ openingCents: z.number().int().min(-99_999_999_999).max(99_999_999_999).nullable() })
export type MonthPlan = z.infer<typeof monthSchema>

export const obligationSchema = z.object({
  id,
  month: monthKeySchema,
  name: z.string().trim().min(2).max(100),
  category: categorySchema,
  plannedCents: money,
  dueDay: z.number().int().min(1).max(31).nullable(),
  paidAt: z.string().datetime().nullable(),
  debtId: id.nullable(),
  updatedAt: z.string().datetime()
}).strict()
export type Obligation = z.infer<typeof obligationSchema>

export const transactionKindSchema = z.enum(['income', 'expense', 'debt-payment'])
export type TransactionKind = z.infer<typeof transactionKindSchema>
const legacyTransactionSchema = z.object({
  id,
  date,
  name: z.string().trim().min(2).max(100),
  kind: transactionKindSchema,
  category: categorySchema,
  amountCents: money,
  account: z.string().trim().max(80),
  obligationId: id.nullable(),
  updatedAt: z.string().datetime()
}).strict()
const legacyPaymentReceiptSchema = z.object({
  recordedAt: z.string().datetime(),
  debtId: id.nullable(), debtName: z.string().max(100).nullable(),
  principalCents: money, interestCents: money,
  interestIncludedInBalance: z.boolean().default(false),
  balanceBeforeCents: money.nullable(), balanceAfterCents: money.nullable()
}).strict()
export const paymentReceiptSchema = legacyPaymentReceiptSchema.extend({
  balanceAsOfBefore: date.nullable().default(null), balanceAsOfAfter: date.nullable().default(null)
})
const v4TransactionSchema = legacyTransactionSchema.extend({ payment: paymentReceiptSchema.nullable() })
export const transactionSchema = v4TransactionSchema.extend({ incomeOccurrenceId: z.string().min(1).max(100).nullable().optional() })
export type Transaction = z.infer<typeof transactionSchema>

export const legacyDebtSchema = z.object({
  id,
  name: z.string().trim().min(2).max(100),
  balanceCents: money,
  startingBalanceCents: money.nullable(),
  minimumCents: money,
  monthlyPaymentCents: money.nullable(),
  aprBasisPoints: z.number().int().min(0).max(100_000).nullable(),
  updatedAt: z.string().datetime()
}).strict()
export const interestMethodSchema = z.enum(['monthly', 'daily-365', 'daily-360'])
export const debtSchema = legacyDebtSchema.omit({ aprBasisPoints: true }).extend({
  aprMilliPercent: z.number().int().min(0).max(1_000_000).nullable(),
  balanceAsOf: date.nullable(), interestMethod: interestMethodSchema
})
export type Debt = z.infer<typeof debtSchema>
export function migrateLegacyDebt(debt: z.infer<typeof legacyDebtSchema>): Debt {
  const { aprBasisPoints, ...rest } = legacyDebtSchema.parse(debt)
  return { ...rest, aprMilliPercent: aprBasisPoints === null ? null : aprBasisPoints * 10, balanceAsOf: null, interestMethod: 'monthly' }
}
export const balanceEventSchema = z.object({
  id: z.string().min(1).max(150), debtId: id, debtName: z.string().min(2).max(100),
  kind: z.enum(['statement','interest','fee','purchase','refund']), date,
  recordedAt: z.string().datetime(), reversedAt: z.string().datetime().nullable(),
  balanceBeforeCents: money, balanceAfterCents: money,
  deltaCents: z.number().int().min(-99_999_999_999).max(99_999_999_999),
  previousBalanceAsOf: date.nullable(), balanceAsOf: date.nullable(),
  note: z.string().trim().min(2).max(200), period: monthKeySchema.nullable(),
  rateMilliPercent: z.number().int().min(0).max(1_000_000).nullable()
}).strict().refine(e => e.balanceBeforeCents + e.deltaCents === e.balanceAfterCents, 'Balance event does not reconcile.')
  .refine(e => (e.kind !== 'fee' && e.kind !== 'purchase') || e.deltaCents > 0, 'Charges must be positive.')
  .refine(e => e.kind !== 'refund' || e.deltaCents < 0, 'Refunds must be negative.')
  .refine(e => e.kind !== 'interest' || e.deltaCents >= 0, 'Interest cannot be negative.')
export type BalanceEvent = z.infer<typeof balanceEventSchema>

export const recurringRuleSchema = z.object({
  id, name: z.string().trim().min(2).max(100), kind: z.enum(['bill', 'income']),
  amountCents: money, category: categorySchema, dueDay: z.number().int().min(1).max(31).nullable(),
  debtId: id.nullable(), startMonth: monthKeySchema, endMonth: monthKeySchema.nullable(),
  enabled: z.boolean(), updatedAt: z.string().datetime()
}).strict().refine(row => row.endMonth === null || row.endMonth >= row.startMonth, 'End month must follow start month.')
  .refine(row => row.kind !== 'income' || row.debtId === null, 'Income cannot link to debt.')
export type RecurringRule = z.infer<typeof recurringRuleSchema>
export const recurringOccurrenceSchema = z.object({
  id: z.string(), ruleId: id, month: monthKeySchema, kind: z.enum(['bill', 'income']),
  name: z.string().trim().min(2).max(100), amountCents: money,
  dueDay: z.number().int().min(1).max(31).nullable(), obligationId: id.nullable(),
  cancelled: z.boolean(), updatedAt: z.string().datetime()
}).strict().refine(row => row.id === `${row.ruleId}:${row.month}`, 'Invalid recurring occurrence key.')
  .refine(row => row.kind !== 'income' || row.obligationId === null, 'Expected income cannot link to a bill.')
export type RecurringOccurrence = z.infer<typeof recurringOccurrenceSchema>

const v2BackupSchema = z.object({
  format: z.literal('accrynt-portable'),
  schemaVersion: z.literal(2),
  exportedAt: z.string().datetime(),
  months: z.array(legacyMonthSchema).max(1200),
  obligations: z.array(obligationSchema).max(100_000),
  transactions: z.array(legacyTransactionSchema).max(200_000),
  debts: z.array(legacyDebtSchema).max(10_000)
}).strict()
const v3BackupSchema = v2BackupSchema.extend({
  schemaVersion: z.literal(3), months: z.array(monthSchema).max(1200),
  transactions: z.array(legacyTransactionSchema.extend({ payment: legacyPaymentReceiptSchema.nullable() })).max(200_000),
  recurringRules: z.array(recurringRuleSchema).max(10_000),
  recurringOccurrences: z.array(recurringOccurrenceSchema).max(100_000)
})
const v4BackupSchema = v3BackupSchema.extend({
  schemaVersion: z.literal(4), workspace: z.enum(['personal', 'demo-synthetic']),
  debts: z.array(debtSchema).max(10_000), transactions: z.array(v4TransactionSchema).max(200_000),
  balanceEvents: z.array(balanceEventSchema).max(100_000)
})
export const backupSchema = v4BackupSchema.extend({ schemaVersion: z.literal(5), transactions: z.array(transactionSchema).max(200_000) })
export type Backup = z.infer<typeof backupSchema>

// V1 exports predate saved payment plans. Strict validation still applies before migration.
const legacyBackupSchema = v2BackupSchema.extend({
  schemaVersion: z.literal(1),
  debts: z.array(legacyDebtSchema.omit({ monthlyPaymentCents: true })).max(10_000)
})
export const portableBackupSchema = z.union([backupSchema, v4BackupSchema, v3BackupSchema, v2BackupSchema, legacyBackupSchema]).transform((data): Backup => {
  if (data.schemaVersion === 5) return data
  if (data.schemaVersion === 4) return { ...data, schemaVersion: 5, transactions: data.transactions.map(row => ({ ...row, incomeOccurrenceId: null })) }
  return { ...data, schemaVersion: 5, workspace: 'personal', balanceEvents: [],
    months: data.months.map(month => ({ ...month, openingCents: 'openingCents' in month ? month.openingCents : null })),
    transactions: data.transactions.map(row => transactionSchema.parse({ ...row, incomeOccurrenceId: null, payment: 'payment' in row ? row.payment : null })),
    debts: data.debts.map(debt => migrateLegacyDebt({ ...debt, monthlyPaymentCents: 'monthlyPaymentCents' in debt ? debt.monthlyPaymentCents : null })),
    recurringRules: 'recurringRules' in data ? data.recurringRules : [], recurringOccurrences: 'recurringOccurrences' in data ? data.recurringOccurrences : [] }
})

export const now = () => new Date().toISOString()
export const newId = () => crypto.randomUUID()
export const currentMonth = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}
export const transactionMonth = (dateValue: string) => dateValue.slice(0, 7)
export const localDate = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}
