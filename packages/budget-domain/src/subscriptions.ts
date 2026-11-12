import type { BudgetSnapshot, DateOnly, PlannedExpense, PlannedOccurrence, RecurrenceCadence, Subscription, SubscriptionSegment, Transaction } from './model.js'
import { addDays, parseDateOnly } from './date.js'
import { recurrenceDates } from './recurrence.js'

export type { Subscription, SubscriptionSegment } from './model.js'

export interface SubscriptionSummaryRow {
  subscriptionId: string
  name: string
  status: Subscription['status']
  monthlyCostIdr: number
  yearlyCostIdr: number
  nextRenewalDate: DateOnly | null
}
export interface SubscriptionReminder { id: string; subscriptionId: string; dueDate: DateOnly; kind: 'TRIAL' | 'RENEWAL' | 'OVERDUE'; amountIdr: number }
export interface SubscriptionSummary {
  rows: SubscriptionSummaryRow[]
  monthlyCostIdr: number
  yearlyCostIdr: number
  activeCount: number
  pausedCount: number
  cancelledCount: number
  upcoming7Days: PlannedOccurrence[]
  upcoming30Days: PlannedOccurrence[]
  categoryMonthlyCosts: { categoryId: string; amountIdr: number }[]
  reminders: SubscriptionReminder[]
}

export function normalizeBudgetSnapshot(snapshot: BudgetSnapshot): BudgetSnapshot & { subscriptions: Subscription[] } {
  return { ...snapshot, subscriptions: snapshot.subscriptions ?? [] }
}

export function subscriptionPlannedExpenses(subscriptions: readonly Subscription[]): PlannedExpense[] {
  const expenses: PlannedExpense[] = []
  for (const subscription of subscriptions) {
    for (const segment of subscription.segments) {
      if (segment.myShareIdr <= 0) continue
      const id = subscriptionRuleId(subscription.id, segment.id)
      expenses.push({ id, name: subscription.name, categoryId: segment.categoryId, amount: segment.myShareIdr,
        dueDate: segment.dueDate, cadence: segment.cadence, ...(segment.endDate ? { endDate: segment.endDate } : {}), subscriptionId: subscription.id })
    }
  }
  return expenses
}

export function subscriptionRuleId(subscriptionId: string, segmentId: string): string { return `subscription:${subscriptionId}:${segmentId}` }
export function subscriptionPaymentId(subscriptionId: string, segmentId: string, dueDate: DateOnly): string {
  return `subscription-payment:${subscriptionId}:${segmentId}:${dueDate}`
}

export function validateSubscriptions(snapshot: BudgetSnapshot): void {
  const categories = new Map(snapshot.categories.map(category => [category.id, category]))
  const ids = new Set<string>()
  for (const subscription of snapshot.subscriptions ?? []) {
    if (!subscription.id || ids.has(subscription.id)) throw new Error('Invalid or duplicate subscription id')
    ids.add(subscription.id)
    if (!subscription.name.trim() || subscription.name.length > 80) throw new Error('Subscription name must be 1–80 characters')
    if (subscription.plan.length > 80 || subscription.notes.length > 2000) throw new Error('Subscription plan or notes are too long')
    if (!Number.isInteger(subscription.reminderDays) || subscription.reminderDays < 0 || subscription.reminderDays > 30) throw new Error('Subscription reminder days must be between 0 and 30')
    if (subscription.trialEndDate) parseDateOnly(subscription.trialEndDate)
    if (subscription.deletedAt) parseDateOnly(subscription.deletedAt)
    const segmentIds = new Set<string>()
    const segments = [...subscription.segments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    for (const segment of segments) {
      if (!segment.id || segmentIds.has(segment.id)) throw new Error('Invalid or duplicate subscription segment id')
      segmentIds.add(segment.id)
      parseDateOnly(segment.dueDate)
      if (segment.endDate) { parseDateOnly(segment.endDate); if (segment.endDate < segment.dueDate) throw new Error('Subscription segment ends before it starts') }
      validateAmount(segment.grossAmountIdr, true)
      validateAmount(segment.myShareIdr, false)
      if (segment.myShareIdr > segment.grossAmountIdr) throw new Error('Subscription share cannot exceed full price')
      const category = categories.get(segment.categoryId)
      if (!category || category.mode !== 'SCHEDULED') throw new Error('Subscription requires a scheduled category')
      if (segment.nativePrice) {
        const { currency, amount, rateToIdr } = segment.nativePrice
        if (!/^[A-Z]{3}$/.test(currency) || currency === 'IDR' || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rateToIdr) || rateToIdr <= 0 || Math.round(amount * rateToIdr) !== segment.grossAmountIdr) throw new Error('Invalid native subscription price')
      }
    }
    for (let index = 1; index < segments.length; index++) {
      if (!segments[index - 1]!.endDate || segments[index - 1]!.endDate! >= segments[index]!.dueDate) throw new Error('Subscription segments overlap')
    }
    if (subscription.segments.length === 0 && subscription.status === 'ACTIVE' && !subscription.deletedAt) throw new Error('Active subscription needs a schedule')
    if (subscription.trialEndDate && segments[0]?.dueDate !== subscription.trialEndDate) throw new Error('Trial end date must match the first charge date')
  }
}

export function validateSubscriptionChange(previous: Subscription | undefined, next: Subscription, today: DateOnly, transactions: readonly Transaction[]): void {
  parseDateOnly(today)
  // Segment categories are checked by the caller against the real budget snapshot.
  const segments = next.segments
  if (!segments.length) throw new Error('Subscription needs a schedule')
  if (previous) {
    const nextById = new Map(segments.map(s => [s.id, s]))
    const oldExpenses = new Map(subscriptionPlannedExpenses([previous]).map(e => [e.id, e]))
    const nextExpenses = new Map(subscriptionPlannedExpenses([next]).map(e => [e.id, e]))
    for (const [id, expense] of oldExpenses) {
      const retained = nextExpenses.get(id)
      const paid = transactions.some(t => t.plannedExpenseId === id)
      if (paid && (!retained || retained.amount !== expense.amount || retained.categoryId !== expense.categoryId || retained.dueDate !== expense.dueDate)) throw new Error('Paid subscription history cannot be changed')
    }
  }
}

export function changeSubscriptionStatus(subscription: Subscription, status: 'PAUSED' | 'CANCELLED', today: DateOnly, transactions: readonly Transaction[]): Subscription {
  parseDateOnly(today)
  if (subscription.deletedAt) return subscription
  const segments = subscription.segments.map(segment => {
    if (segment.endDate && segment.endDate < today) return segment
    const paidToday = transactions.some(t => t.plannedExpenseId === subscriptionRuleId(subscription.id, segment.id) && t.plannedOccurrenceDate === today)
    const endDate = paidToday ? today : addDays(today, -1)
    if (endDate < segment.dueDate) return null
    return { ...segment, endDate }
  }).filter((segment): segment is SubscriptionSegment => segment !== null)
  return { ...subscription, status, segments }
}

export function resumeSubscription(subscription: Subscription, segment: SubscriptionSegment, today: DateOnly): Subscription {
  parseDateOnly(today)
  if (subscription.status !== 'PAUSED' || subscription.deletedAt) throw new Error('Only a paused subscription can resume')
  if (segment.dueDate < today || subscription.segments.some(s => s.id === segment.id)) throw new Error('Resume schedule must start today or later with a new segment')
  return { ...subscription, status: 'ACTIVE', segments: [...subscription.segments, segment] }
}

export function replaceSubscriptionSegment(subscription: Subscription, segment: SubscriptionSegment, today: DateOnly, transactions: readonly Transaction[]): Subscription {
  parseDateOnly(today)
  if (subscription.status !== 'ACTIVE' || subscription.deletedAt) throw new Error('Only an active subscription schedule can change')
  if (segment.dueDate < today || subscription.segments.some(s => s.id === segment.id)) throw new Error('Replacement schedule must start today or later with a new segment')
  const current = [...subscription.segments].reverse().find(s => !s.endDate || s.endDate >= today)
  if (!current) throw new Error('Active subscription has no current schedule')
  const endDate = addDays(segment.dueDate, -1)
  if (endDate < current.dueDate && transactions.some(t => t.plannedExpenseId === subscriptionRuleId(subscription.id, current.id))) throw new Error('Paid subscription history cannot be changed')
  const segments = subscription.segments.map(s => s.id === current.id ? { ...s, endDate } : s)
  const next = { ...subscription, segments: [...segments, segment] }
  validateSubscriptionChange(subscription, next, today, transactions)
  return next
}

function validateAmount(value: number, positive: boolean): void {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new Error('Subscription amount must be a safe whole IDR amount')
}

export function summarizeSubscriptions(snapshot: BudgetSnapshot, today: DateOnly): SubscriptionSummary {
  parseDateOnly(today)
  const subs = (snapshot.subscriptions ?? []).filter(s => !s.deletedAt)
  const end = addDays(today, 29)
  const occurrences: PlannedOccurrence[] = []
  const rows = subs.map(subscription => {
    const active = subscription.status === 'ACTIVE'
    let monthly = 0, yearly = 0
    let nextRenewalDate: DateOnly | null = null
    if (active) for (const segment of subscription.segments) {
      const factor = segment.cadence === 'WEEKLY' ? 52 : segment.cadence === 'MONTHLY' ? 12 : segment.cadence === 'QUARTERLY' ? 4 : 1
      monthly += segment.myShareIdr * factor / 12
      yearly += segment.myShareIdr * factor
      const dates = recurrenceDates(segment.dueDate, segment.cadence, today, end)
      for (const dueDate of dates) {
        if (segment.endDate && dueDate > segment.endDate) continue
        const expense = subscriptionPlannedExpenses([{ ...subscription, segments: [segment] }])[0]
        if (!expense) continue
        const paid = (snapshot.transactions ?? []).filter(t => t.plannedExpenseId === expense.id && t.plannedOccurrenceDate === dueDate)
        const fulfilledAmount = Math.min(expense.amount, paid.reduce((sum, t) => sum + t.amount, 0))
        const occurrence: PlannedOccurrence = { id: `${expense.id}:${dueDate}`, plannedExpenseId: expense.id, subscriptionId: subscription.id,
          name: subscription.name, categoryId: segment.categoryId, amount: expense.amount, dueDate, cadence: segment.cadence,
          fulfilledAmount, outstandingAmount: Math.max(0, expense.amount - fulfilledAmount), transactionCount: paid.length }
        if (occurrence.outstandingAmount > 0) occurrences.push(occurrence)
        if (!nextRenewalDate && occurrence.outstandingAmount > 0) nextRenewalDate = dueDate
        if (occurrence.outstandingAmount > 0 && dueDate <= addDays(today, subscription.reminderDays)) { /* surfaced below */ }
      }
    }
    return { subscriptionId: subscription.id, name: subscription.name, status: subscription.status, monthlyCostIdr: monthly, yearlyCostIdr: yearly, nextRenewalDate }
  })
  const reminders: SubscriptionReminder[] = []
  for (const subscription of subs.filter(s => s.status === 'ACTIVE')) {
    for (const occurrence of occurrences.filter(o => o.subscriptionId === subscription.id && o.dueDate <= end)) {
      const start = addDays(occurrence.dueDate, -subscription.reminderDays)
      if (today >= start && today <= occurrence.dueDate) reminders.push({ id: occurrence.id, subscriptionId: subscription.id, dueDate: occurrence.dueDate, kind: 'RENEWAL', amountIdr: occurrence.amount })
      if (occurrence.dueDate < today) reminders.push({ id: `${occurrence.id}:overdue`, subscriptionId: subscription.id, dueDate: occurrence.dueDate, kind: 'OVERDUE', amountIdr: occurrence.amount })
    }
    if (subscription.trialEndDate && today >= addDays(subscription.trialEndDate, -subscription.reminderDays) && today <= subscription.trialEndDate) reminders.push({ id: `${subscription.id}:trial`, subscriptionId: subscription.id, dueDate: subscription.trialEndDate, kind: 'TRIAL', amountIdr: 0 })
  }
  const categoryTotals = new Map<string, number>()
  for (const subscription of subs.filter(s => s.status === 'ACTIVE')) for (const segment of subscription.segments) {
    const factor = segment.cadence === 'WEEKLY' ? 52 : segment.cadence === 'MONTHLY' ? 12 : segment.cadence === 'QUARTERLY' ? 4 : 1
    categoryTotals.set(segment.categoryId, (categoryTotals.get(segment.categoryId) ?? 0) + segment.myShareIdr * factor / 12)
  }
  return { rows, monthlyCostIdr: Math.round(rows.reduce((sum, row) => sum + row.monthlyCostIdr, 0)), yearlyCostIdr: Math.round(rows.reduce((sum, row) => sum + row.yearlyCostIdr, 0)),
    activeCount: subs.filter(s => s.status === 'ACTIVE').length, pausedCount: subs.filter(s => s.status === 'PAUSED').length,
    cancelledCount: subs.filter(s => s.status === 'CANCELLED').length, upcoming7Days: occurrences.filter(o => o.dueDate <= addDays(today, 6)),
    upcoming30Days: occurrences, categoryMonthlyCosts: [...categoryTotals].map(([categoryId, amountIdr]) => ({ categoryId, amountIdr: Math.round(amountIdr) })), reminders }
}
