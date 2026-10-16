import { z } from 'zod'

const id = z.string().uuid()
const money = z.number().int().min(0).max(999_999_999_99)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false
  const actual = new Date(0)
  actual.setUTCFullYear(year, month - 1, day)
  return actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day
}, 'Invalid calendar date')
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
export const paymentReceiptSchema = z.object({
  recordedAt: z.string().datetime(),
  debtId: id.nullable(), debtName: z.string().max(100).nullable(),
  principalCents: money, interestCents: money,
  interestIncludedInBalance: z.boolean().default(false),
  balanceBeforeCents: money.nullable(), balanceAfterCents: money.nullable()
}).strict()
export const transactionSchema = legacyTransactionSchema.extend({ payment: paymentReceiptSchema.nullable() })
export type Transaction = z.infer<typeof transactionSchema>

export const debtSchema = z.object({
  id,
  name: z.string().trim().min(2).max(100),
  balanceCents: money,
  startingBalanceCents: money.nullable(),
  minimumCents: money,
  monthlyPaymentCents: money.nullable(),
  aprBasisPoints: z.number().int().min(0).max(100_000).nullable(),
  updatedAt: z.string().datetime()
}).strict()
export type Debt = z.infer<typeof debtSchema>

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
  debts: z.array(debtSchema).max(10_000)
}).strict()
export const backupSchema = v2BackupSchema.extend({
  schemaVersion: z.literal(3), months: z.array(monthSchema).max(1200),
  transactions: z.array(transactionSchema).max(200_000),
  recurringRules: z.array(recurringRuleSchema).max(10_000),
  recurringOccurrences: z.array(recurringOccurrenceSchema).max(100_000)
})
export type Backup = z.infer<typeof backupSchema>

// V1 exports predate saved payment plans. Strict validation still applies before migration.
const legacyBackupSchema = v2BackupSchema.extend({
  schemaVersion: z.literal(1),
  debts: z.array(debtSchema.omit({ monthlyPaymentCents: true })).max(10_000)
})
export const portableBackupSchema = z.union([backupSchema, v2BackupSchema, legacyBackupSchema]).transform((data): Backup => {
  if (data.schemaVersion === 3) return data
  return { ...data, schemaVersion: 3,
    months: data.months.map(month => ({ ...month, openingCents: null })),
    transactions: data.transactions.map(row => ({ ...row, payment: null })),
    debts: data.debts.map(debt => ({ ...debt, monthlyPaymentCents: 'monthlyPaymentCents' in debt ? debt.monthlyPaymentCents : null })),
    recurringRules: [], recurringOccurrences: [] }
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
