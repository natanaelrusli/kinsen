export type DateOnly = string
export type BudgetId = string
export type CategoryId = string
export type PlannedExpenseId = string
export type TransactionId = string

export type BudgetBucket = 'FLEXIBLE' | 'PLANNED'
export type CategoryMode = 'DAILY' | 'PERIOD' | 'SCHEDULED'
export type RecurrenceCadence = 'WEEKLY' | 'MONTHLY'
export type BudgetHealth = 'ON_TRACK' | 'AT_RISK' | 'OVER_BUDGET' | 'ENDED' | 'NOT_STARTED'

export interface BudgetPeriod {
  id: BudgetId
  totalAmount: number
  reserveAmount: number
  flexibleAllocation: number
  plannedAllocation: number
  startDate: DateOnly
  endDate: DateOnly
  isSample?: boolean
}

export interface Category {
  id: CategoryId
  name: string
  mode: CategoryMode
  bucket: BudgetBucket
  allocation: number
  color: string
  defaultCadence?: RecurrenceCadence
}

/** A one-off commitment or a rule that expands into dated occurrences. */
export interface PlannedExpense {
  id: PlannedExpenseId
  name: string
  categoryId: CategoryId
  amount: number
  dueDate: DateOnly
  cadence: RecurrenceCadence | null
  endDate?: DateOnly
}

export interface Transaction {
  id: TransactionId
  description: string
  categoryId: CategoryId
  amount: number
  date: DateOnly
  /** Links to a planned-expense rule; occurrenceDate identifies the exact occurrence. */
  plannedExpenseId?: PlannedExpenseId
  plannedOccurrenceDate?: DateOnly
}

export interface BudgetSnapshot {
  period: BudgetPeriod | null
  categories: Category[]
  plannedExpenses: PlannedExpense[]
  transactions: Transaction[]
}

export interface PlannedOccurrence {
  id: string
  plannedExpenseId: PlannedExpenseId
  name: string
  categoryId: CategoryId
  amount: number
  dueDate: DateOnly
  cadence: RecurrenceCadence | null
  fulfilledAmount: number
  outstandingAmount: number
  transactionCount: number
}

export interface CategorySummary {
  category: Category
  spent: number
  committed: number
  remainingAllocation: number
  overspent: boolean
}

export interface BudgetOverview {
  snapshot: BudgetSnapshot
  today: DateOnly
  totalDays: number
  remainingDays: number
  actualSpent: number
  outstandingCommitments: number
  protectedReserve: number
  availableFunds: number
  safeToSpendToday: number
  health: BudgetHealth
  categorySummaries: CategorySummary[]
  occurrences: PlannedOccurrence[]
  upcomingCommitments: PlannedOccurrence[]
}
