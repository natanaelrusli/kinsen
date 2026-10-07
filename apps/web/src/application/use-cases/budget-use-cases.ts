import type { BudgetOverview, BudgetPeriod, BudgetSnapshot, Category, DateOnly, PlannedExpense, Transaction } from '@kinsen/budget-domain'
import { calculateOverview, createSampleSnapshot, validateSnapshot } from '@kinsen/budget-domain'
import type { BudgetRepository } from '../../infrastructure/repositories/budget-repository'

export class BudgetUseCases {
  constructor(private readonly repository: BudgetRepository) {}
  async initialize(today: DateOnly): Promise<void> {
    const snapshot = createSampleSnapshot(today)
    await this.repository.seedIfEmpty(snapshot)
  }
  getSnapshot(): Promise<BudgetSnapshot> { return this.repository.getSnapshot() }
  async getOverview(today: DateOnly): Promise<BudgetOverview> { return calculateOverview(await this.getSnapshot(), today) }
  async saveBudget(period: BudgetPeriod, categories: Category[]): Promise<void> {
    const old = await this.getSnapshot()
    const snapshot = { ...old, period, categories }
    validateSnapshot(snapshot)
    await this.repository.saveBudget(period, categories)
  }
  async savePlannedExpense(expense: PlannedExpense): Promise<void> {
    const snapshot = await this.getSnapshot()
    const plannedExpenses = [...snapshot.plannedExpenses.filter(item => item.id !== expense.id), expense]
    validateSnapshot({ ...snapshot, plannedExpenses })
    await this.repository.savePlannedExpense(expense)
  }
  async deletePlannedExpense(id: string): Promise<void> { await this.repository.deletePlannedExpense(id) }
  async saveTransaction(transaction: Transaction, paidFromAssetId?: string | null): Promise<void> {
    const snapshot = await this.getSnapshot()
    const transactions = [...snapshot.transactions.filter(item => item.id !== transaction.id), transaction]
    validateSnapshot({ ...snapshot, transactions })
    await this.repository.saveTransaction(transaction, paidFromAssetId)
  }
  async deleteTransaction(id: string): Promise<void> { await this.repository.deleteTransaction(id) }
}
