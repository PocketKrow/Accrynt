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

export const monthSchema = z.object({
  key: monthKeySchema,
  incomeCents: money,
  updatedAt: z.string().datetime()
}).strict()
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
export const transactionSchema = z.object({
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

export const backupSchema = z.object({
  format: z.literal('accrynt-portable'),
  schemaVersion: z.literal(2),
  exportedAt: z.string().datetime(),
  months: z.array(monthSchema).max(1200),
  obligations: z.array(obligationSchema).max(100_000),
  transactions: z.array(transactionSchema).max(200_000),
  debts: z.array(debtSchema).max(10_000)
}).strict()
export type Backup = z.infer<typeof backupSchema>

// V1 exports predate saved payment plans. Strict validation still applies before migration.
const legacyBackupSchema = backupSchema.extend({
  schemaVersion: z.literal(1),
  debts: z.array(debtSchema.omit({ monthlyPaymentCents: true })).max(10_000)
})
export const portableBackupSchema = z.union([backupSchema, legacyBackupSchema]).transform((data): Backup => ({
  ...data, schemaVersion: 2,
  debts: data.debts.map(debt => ({ ...debt, monthlyPaymentCents: 'monthlyPaymentCents' in debt ? debt.monthlyPaymentCents : null }))
}))

export const now = () => new Date().toISOString()
export const newId = () => crypto.randomUUID()
export const currentMonth = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}
export const transactionMonth = (dateValue: string) => dateValue.slice(0, 7)
