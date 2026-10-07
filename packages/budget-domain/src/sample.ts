import type { BudgetSnapshot, DateOnly } from './model.js'
import { daysInMonth, formatDateOnly, parseDateOnly } from './date.js'

export function createSampleSnapshot(today: DateOnly): BudgetSnapshot {
  const { year, month } = parseDateOnly(today)
  const startDate = formatDateOnly(year, month, 1)
  const endDate = formatDateOnly(year, month, daysInMonth(year, month))
  return {
    period: { id: `sample-${year}-${String(month).padStart(2, '0')}`, totalAmount: 12_000_000, reserveAmount: 1_000_000, flexibleAllocation: 6_000_000, plannedAllocation: 5_000_000, startDate, endDate, isSample: true },
    categories: [
      { id: 'food', name: 'Food & groceries', mode: 'DAILY', bucket: 'FLEXIBLE', allocation: 3_000_000, color: '#E9A23B' },
      { id: 'transport', name: 'Transport', mode: 'DAILY', bucket: 'FLEXIBLE', allocation: 1_500_000, color: '#5D8AA8' },
      { id: 'personal', name: 'Personal', mode: 'PERIOD', bucket: 'FLEXIBLE', allocation: 1_500_000, color: '#9B7EBD' },
      { id: 'home', name: 'Home & bills', mode: 'SCHEDULED', bucket: 'PLANNED', allocation: 3_500_000, color: '#6C9A8B', defaultCadence: 'MONTHLY' },
      { id: 'subscriptions', name: 'Subscriptions', mode: 'SCHEDULED', bucket: 'PLANNED', allocation: 1_500_000, color: '#D17B88', defaultCadence: 'MONTHLY' },
    ],
    plannedExpenses: [
      { id: 'rent', name: 'Rent', categoryId: 'home', amount: 3_000_000, dueDate: startDate, cadence: null },
      { id: 'internet', name: 'Internet', categoryId: 'home', amount: 500_000, dueDate: formatDateOnly(year, month, 5), cadence: null },
      { id: 'music', name: 'Music subscription', categoryId: 'subscriptions', amount: 100_000, dueDate: formatDateOnly(year, month, 12), cadence: 'MONTHLY' },
    ],
    transactions: [
      { id: 'sample-groceries', description: 'Weekly groceries', categoryId: 'food', amount: 425_000, date: today },
      { id: 'sample-transit', description: 'Transit top-up', categoryId: 'transport', amount: 150_000, date: today },
    ],
  }
}
