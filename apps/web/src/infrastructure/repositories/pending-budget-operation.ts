import type { BudgetPeriod, BudgetSnapshot, Category, PlannedExpense, Transaction } from '@kinsen/budget-domain'

type PendingOperationPayload =
  | { kind: 'IMPORT_SNAPSHOT'; snapshot: BudgetSnapshot }
  | { kind: 'SAVE_BUDGET'; period: BudgetPeriod; categories: Category[] }
  | { kind: 'SAVE_PLANNED_EXPENSE'; expense: PlannedExpense }
  | { kind: 'DELETE_PLANNED_EXPENSE'; id: string }
  | { kind: 'SAVE_TRANSACTION'; transaction: Transaction }
  | { kind: 'DELETE_TRANSACTION'; id: string }

export type PendingBudgetOperation = PendingOperationPayload & {
  queueId?: number
  createdAt: number
}
