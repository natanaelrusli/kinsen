export type DateOnly = string
export type BudgetId = string
export type CategoryId = string
export type PlannedExpenseId = string
export type TransactionId = string

export type BudgetBucket = 'FLEXIBLE' | 'PLANNED'
export type CategoryMode = 'DAILY' | 'PERIOD' | 'SCHEDULED'
export type RecurrenceCadence = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
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
  subscriptionId?: string
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
  subscriptions?: Subscription[]
}

export interface SubscriptionNativePrice {
  currency: string
  amount: number
  rateToIdr: number
}

export interface SubscriptionSegment {
  id: string
  categoryId: CategoryId
  dueDate: DateOnly
  endDate?: DateOnly
  cadence: RecurrenceCadence
  grossAmountIdr: number
  myShareIdr: number
  nativePrice?: SubscriptionNativePrice
}

export interface Subscription {
  id: string
  name: string
  providerId: string
  plan: string
  notes: string
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED'
  paidFromAssetId?: string
  trialEndDate?: DateOnly
  reminderDays: number
  segments: SubscriptionSegment[]
  deletedAt?: DateOnly
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
  subscriptionId?: string
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
