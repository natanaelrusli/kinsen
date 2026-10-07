import type { BudgetPeriod, BudgetSnapshot, Category, PlannedExpense, Transaction } from '@kinsen/budget-domain'

export interface BudgetRepository {
  getSnapshot(): Promise<BudgetSnapshot>
  saveBudget(period: BudgetPeriod, categories: Category[]): Promise<void>
  savePlannedExpense(expense: PlannedExpense): Promise<void>
  deletePlannedExpense(id: string): Promise<void>
  saveTransaction(transaction: Transaction, paidFromAssetId?: string | null): Promise<void>
  deleteTransaction(id: string): Promise<void>
  seedIfEmpty(snapshot: BudgetSnapshot): Promise<void>
}
