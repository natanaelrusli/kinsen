import { describe, expect, it } from 'vitest'
import { addDays, addMonthsPreservingDay, calculateOverview, generateOccurrences, parseDateOnly, validateSnapshot } from './index.js'
import type { BudgetSnapshot } from './model.js'

function snapshot(): BudgetSnapshot {
  return {
    period: { id: 'p', totalAmount: 1000, reserveAmount: 100, flexibleAllocation: 500, plannedAllocation: 400, startDate: '2024-01-01', endDate: '2024-01-10' },
    categories: [
      { id: 'daily', name: 'Daily', mode: 'DAILY', bucket: 'FLEXIBLE', allocation: 500, color: '#000' },
      { id: 'plan', name: 'Plan', mode: 'SCHEDULED', bucket: 'PLANNED', allocation: 400, color: '#fff' },
    ],
    plannedExpenses: [{ id: 'e', name: 'Weekly', categoryId: 'plan', amount: 120, dueDate: '2023-12-25', cadence: 'WEEKLY' }],
    transactions: [{ id: 't', description: 'part paid', categoryId: 'plan', amount: 50, date: '2024-01-02', plannedExpenseId: 'e', plannedOccurrenceDate: '2024-01-01' }],
  }
}

describe('date-only Gregorian arithmetic', () => {
  it('validates leap dates and rolls across year boundaries', () => {
    expect(parseDateOnly('2000-02-29').day).toBe(29)
    expect(() => parseDateOnly('1900-02-29')).toThrow()
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01')
  })
  it('preserves original monthly day and clamps month end', () => {
    expect(addMonthsPreservingDay('2024-01-31', 1, 31)).toBe('2024-02-29')
    expect(addMonthsPreservingDay('2024-02-29', 1, 31)).toBe('2024-03-31')
  })
})

describe('budget calculations and validation', () => {
  it('reconciles partial linked payment without double counting and retains overdue commitment', () => {
    const data = snapshot()
    const overview = calculateOverview(data, '2024-01-02')
    expect(overview.occurrences.map(o => [o.dueDate, o.fulfilledAmount, o.outstandingAmount])).toEqual([['2024-01-01', 50, 70], ['2024-01-08', 0, 120]])
    expect(overview.actualSpent).toBe(50)
    expect(overview.outstandingCommitments).toBe(190)
  })
  it('uses inclusive remaining days and floors safe-to-spend', () => {
    const data = snapshot()
    data.transactions = [{ id: 'rounding', description: 'rounding', categoryId: 'daily', amount: 1, date: '2024-01-02' }]
    data.plannedExpenses = []
    expect(calculateOverview(data, '2024-01-08').safeToSpendToday).toBe(299)
    expect(calculateOverview(data, '2024-01-11').safeToSpendToday).toBe(0)
  })
  it('marks overspending and rejects invalid allocations or category modes', () => {
    const data = snapshot()
    data.transactions.push({ id: 'x', description: 'over', categoryId: 'daily', amount: 501, date: '2024-01-03' })
    expect(calculateOverview(data, '2024-01-03').health).toBe('OVER_BUDGET')
    const bad = snapshot()
    bad.categories[0]!.mode = 'SCHEDULED'
    expect(() => validateSnapshot(bad)).toThrow()
  })
  it('generates recurrence only in inclusive period boundaries', () => {
    const data = snapshot()
    expect(generateOccurrences(data).map(o => o.dueDate)).toEqual(['2024-01-01', '2024-01-08'])
  })
})
