import { z } from 'zod'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'

const id = z.string().min(1).max(200)
const amount = z.number().int().safe().nonnegative()
const dateOnly = z.string().refine((value) => {
  try {
    parseDateOnly(value)
    return true
  } catch {
    return false
  }
}, 'Expected a valid YYYY-MM-DD calendar date')

export const periodSchema = z.object({
  id,
  totalAmount: amount,
  reserveAmount: amount,
  flexibleAllocation: amount,
  plannedAllocation: amount,
  startDate: dateOnly,
  endDate: dateOnly,
  isSample: z.boolean().optional(),
}).strict()

export const categorySchema = z.object({
  id,
  name: z.string().trim().min(1).max(40),
  mode: z.enum(['DAILY', 'PERIOD', 'SCHEDULED']),
  bucket: z.enum(['FLEXIBLE', 'PLANNED']),
  allocation: amount,
  color: z.string().regex(/^#[\da-fA-F]{6}$/),
  defaultCadence: z.enum(['WEEKLY', 'MONTHLY']).optional(),
}).strict()

export const plannedExpenseSchema = z.object({
  id,
  name: z.string().trim().min(1).max(80),
  categoryId: id,
  amount: amount.refine((value) => value > 0, 'Must be greater than zero'),
  dueDate: dateOnly,
  cadence: z.enum(['WEEKLY', 'MONTHLY']).nullable(),
  endDate: dateOnly.optional(),
}).strict()

export const transactionSchema = z.object({
  id,
  description: z.string().trim().min(1).max(100),
  categoryId: id,
  amount: amount.refine((value) => value > 0, 'Must be greater than zero'),
  date: dateOnly,
  plannedExpenseId: id.optional(),
  plannedOccurrenceDate: dateOnly.optional(),
}).strict()

export const snapshotSchema = z.object({
  period: periodSchema.nullable(),
  categories: z.array(categorySchema),
  plannedExpenses: z.array(plannedExpenseSchema),
  transactions: z.array(transactionSchema),
}).strict()

export const saveBudgetSchema = z.object({
  period: periodSchema,
  categories: z.array(categorySchema),
}).strict()
