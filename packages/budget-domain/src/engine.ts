import type { BudgetHealth, BudgetOverview, BudgetSnapshot, DateOnly, PlannedExpense, PlannedOccurrence, Transaction } from './model.js'
import { addDays, addMonthsPreservingDay, daysBetweenInclusive, parseDateOnly } from './date.js'

export function validateMoney(value: number, name: string, positive = false): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new Error(`${name} must be a ${positive ? 'positive' : 'nonnegative'} safe integer`)
}

export function validateSnapshot(snapshot: BudgetSnapshot): void {
  const ids = <T extends { id: string }>(items: T[], label: string) => {
    const seen = new Set<string>()
    for (const item of items) { if (!item.id || seen.has(item.id)) throw new Error(`Invalid or duplicate ${label} id`); seen.add(item.id) }
    return seen
  }
  const categoryIds = ids(snapshot.categories, 'category')
  ids(snapshot.plannedExpenses, 'planned expense')
  ids(snapshot.transactions, 'transaction')
  if (!snapshot.period) {
    if (snapshot.categories.length || snapshot.plannedExpenses.length || snapshot.transactions.length) throw new Error('Data requires a budget period')
    return
  }
  const p = snapshot.period
  parseDateOnly(p.startDate); parseDateOnly(p.endDate)
  if (p.endDate < p.startDate) throw new Error('Budget end date precedes start date')
  validateMoney(p.totalAmount, 'Budget total'); validateMoney(p.reserveAmount, 'Reserve'); validateMoney(p.flexibleAllocation, 'Flexible allocation'); validateMoney(p.plannedAllocation, 'Planned allocation')
  if (p.totalAmount !== p.reserveAmount + p.flexibleAllocation + p.plannedAllocation) throw new Error('Budget allocations must equal total')
  const sums = { FLEXIBLE: 0, PLANNED: 0 }
  for (const c of snapshot.categories) {
    validateMoney(c.allocation, 'Category allocation')
    if (!c.name.trim() || !c.color) throw new Error('Category name and color are required')
    if ((c.mode === 'DAILY' && c.bucket !== 'FLEXIBLE') || (c.mode === 'SCHEDULED' && c.bucket !== 'PLANNED')) throw new Error('Category mode and bucket do not match')
    sums[c.bucket] += c.allocation
  }
  if (sums.FLEXIBLE !== p.flexibleAllocation || sums.PLANNED !== p.plannedAllocation) throw new Error('Category allocations must equal bucket allocations')
  for (const e of snapshot.plannedExpenses) {
    validateMoney(e.amount, 'Commitment', true); parseDateOnly(e.dueDate)
    if (!categoryIds.has(e.categoryId)) throw new Error('Commitment category does not exist')
    const c = snapshot.categories.find(category => category.id === e.categoryId)!
    if (e.cadence && c.mode !== 'SCHEDULED') throw new Error('Recurring commitments require a scheduled category')
    if (!e.cadence && c.mode === 'DAILY') throw new Error('One-off commitment cannot use a daily category')
    if (e.endDate) { parseDateOnly(e.endDate); if (e.endDate < e.dueDate) throw new Error('Commitment end date precedes due date') }
  }
  for (const t of snapshot.transactions) {
    validateMoney(t.amount, 'Transaction', true); parseDateOnly(t.date)
    if (!categoryIds.has(t.categoryId)) throw new Error('Transaction category does not exist')
    if (!!t.plannedExpenseId !== !!t.plannedOccurrenceDate) throw new Error('Planned transaction link requires an occurrence date')
    if (t.plannedExpenseId) {
      const expense = snapshot.plannedExpenses.find(e => e.id === t.plannedExpenseId)
      if (!expense || expense.categoryId !== t.categoryId) throw new Error('Transaction commitment link is invalid')
      parseDateOnly(t.plannedOccurrenceDate!)
    }
  }
}

export function generateOccurrences(snapshot: BudgetSnapshot): PlannedOccurrence[] {
  if (!snapshot.period) return []
  const { startDate, endDate } = snapshot.period
  const rows: PlannedOccurrence[] = []
  for (const e of snapshot.plannedExpenses) {
    const last = e.endDate && e.endDate < endDate ? e.endDate : endDate
    if (!e.cadence) {
      if (e.dueDate >= startDate && e.dueDate <= last) rows.push(makeOccurrence(e, e.dueDate, snapshot.transactions))
      continue
    }
    const originalDay = parseDateOnly(e.dueDate).day
    for (let dueDate = e.dueDate; dueDate <= last;) {
      if (dueDate >= startDate) rows.push(makeOccurrence(e, dueDate, snapshot.transactions))
      dueDate = e.cadence === 'WEEKLY' ? addDays(dueDate, 7) : addMonthsPreservingDay(dueDate, 1, originalDay)
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
}
function makeOccurrence(e: PlannedExpense, dueDate: DateOnly, transactions: Transaction[]): PlannedOccurrence {
  const linked = transactions.filter(t => t.plannedExpenseId === e.id && t.plannedOccurrenceDate === dueDate)
  const fulfilledAmount = Math.min(e.amount, linked.reduce((sum, t) => sum + t.amount, 0))
  return { id: `${e.id}:${dueDate}`, plannedExpenseId: e.id, name: e.name, categoryId: e.categoryId, amount: e.amount, dueDate, cadence: e.cadence, fulfilledAmount, outstandingAmount: Math.max(0, e.amount - fulfilledAmount), transactionCount: linked.length }
}

export function calculateOverview(snapshot: BudgetSnapshot, today: DateOnly): BudgetOverview {
  parseDateOnly(today); validateSnapshot(snapshot)
  const period = snapshot.period
  const occurrences = generateOccurrences(snapshot)
  if (!period) return { snapshot, today, totalDays: 0, remainingDays: 0, actualSpent: 0, outstandingCommitments: 0, protectedReserve: 0, availableFunds: 0, safeToSpendToday: 0, health: 'NOT_STARTED', categorySummaries: [], occurrences, upcomingCommitments: [] }
  const totalDays = daysBetweenInclusive(period.startDate, period.endDate)
  const actualSpent = snapshot.transactions.filter(t => t.date >= period.startDate && t.date <= period.endDate).reduce((sum, t) => sum + t.amount, 0)
  const outstandingCommitments = occurrences.reduce((sum, o) => sum + o.outstandingAmount, 0)
  const remainingDays = today < period.startDate ? totalDays : today > period.endDate ? 0 : daysBetweenInclusive(today, period.endDate)
  const protectedReserve = period.reserveAmount
  const availableFunds = Math.max(0, period.totalAmount - actualSpent - outstandingCommitments - protectedReserve)
  const safeToSpendToday = remainingDays ? Math.max(0, Math.floor((period.totalAmount - actualSpent - outstandingCommitments - protectedReserve) / remainingDays)) : 0
  const categorySummaries = snapshot.categories.map(category => {
    const spent = snapshot.transactions.filter(t => t.categoryId === category.id && t.date >= period.startDate && t.date <= period.endDate).reduce((sum, t) => sum + t.amount, 0)
    const committed = occurrences.filter(o => o.categoryId === category.id).reduce((sum, o) => sum + o.outstandingAmount, 0)
    return { category, spent, committed, remainingAllocation: category.allocation - spent, overspent: spent > category.allocation }
  })
  let health: BudgetHealth = actualSpent > period.totalAmount - period.reserveAmount || categorySummaries.some(c => c.overspent) ? 'OVER_BUDGET' : actualSpent + outstandingCommitments > period.totalAmount - period.reserveAmount ? 'AT_RISK' : 'ON_TRACK'
  if (today > period.endDate) health = 'ENDED'
  else if (today < period.startDate && health !== 'OVER_BUDGET' && health !== 'AT_RISK') health = 'NOT_STARTED'
  return { snapshot, today, totalDays, remainingDays, actualSpent, outstandingCommitments, protectedReserve, availableFunds, safeToSpendToday, health, categorySummaries, occurrences, upcomingCommitments: occurrences.filter(o => o.outstandingAmount > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)) }
}
