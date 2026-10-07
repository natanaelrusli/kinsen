import type { BudgetPeriod, BudgetSnapshot, Category, PlannedExpense, Transaction } from '@kinsen/budget-domain'
import { validateSnapshot } from '@kinsen/budget-domain'
import type { DatabaseSync } from 'node:sqlite'

export class SnapshotConflictError extends Error {
  constructor() {
    super('The API already contains a different budget snapshot.')
    this.name = 'SnapshotConflictError'
  }
}

export class BudgetValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetValidationError'
  }
}

type PeriodRow = {
  id: string
  total_amount: number
  reserve_amount: number
  flexible_allocation: number
  planned_allocation: number
  start_date: string
  end_date: string
  is_sample: number
}

type CategoryRow = {
  id: string
  name: string
  mode: Category['mode']
  bucket: Category['bucket']
  allocation: number
  color: string
  default_cadence: Category['defaultCadence'] | null
}

type PlannedExpenseRow = {
  id: string
  name: string
  category_id: string
  amount: number
  due_date: string
  cadence: PlannedExpense['cadence']
  end_date: string | null
}

type TransactionRow = {
  id: string
  description: string
  category_id: string
  amount: number
  date: string
  planned_expense_id: string | null
  planned_occurrence_date: string | null
}

type AppOwnerRow = {
  user_id: string
  data_generation: number
}

export class SqliteBudgetRepository {
  constructor(private readonly database: DatabaseSync) {}

  getSnapshot(): BudgetSnapshot {
    const periodRow = this.database.prepare('SELECT * FROM budget_period WHERE singleton = 1').get() as PeriodRow | undefined
    const categories = (this.database.prepare('SELECT * FROM categories ORDER BY id').all() as CategoryRow[]).map((row): Category => ({
      id: row.id,
      name: row.name,
      mode: row.mode,
      bucket: row.bucket,
      allocation: row.allocation,
      color: row.color,
      ...(row.default_cadence ? { defaultCadence: row.default_cadence } : {}),
    }))
    const plannedExpenses = (this.database.prepare('SELECT * FROM planned_expenses ORDER BY id').all() as PlannedExpenseRow[]).map((row): PlannedExpense => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      amount: row.amount,
      dueDate: row.due_date,
      cadence: row.cadence,
      ...(row.end_date ? { endDate: row.end_date } : {}),
    }))
    const transactions = (this.database.prepare('SELECT * FROM transactions ORDER BY id').all() as TransactionRow[]).map((row): Transaction => ({
      id: row.id,
      description: row.description,
      categoryId: row.category_id,
      amount: row.amount,
      date: row.date,
      ...(row.planned_expense_id && row.planned_occurrence_date
        ? { plannedExpenseId: row.planned_expense_id, plannedOccurrenceDate: row.planned_occurrence_date }
        : {}),
    }))

    const period: BudgetPeriod | null = periodRow ? {
      id: periodRow.id,
      totalAmount: periodRow.total_amount,
      reserveAmount: periodRow.reserve_amount,
      flexibleAllocation: periodRow.flexible_allocation,
      plannedAllocation: periodRow.planned_allocation,
      startDate: periodRow.start_date,
      endDate: periodRow.end_date,
      ...(periodRow.is_sample ? { isSample: true } : {}),
    } : null

    return { period, categories, plannedExpenses, transactions }
  }
  getDataGeneration(): number {
    const row = this.database.prepare('SELECT data_generation FROM app_owner WHERE singleton = 1').get() as { data_generation: number } | undefined
    return row?.data_generation ?? 0
  }

  resetAccountData(): number {
    return this.inTransaction(() => {
      this.database.exec(`
        DELETE FROM transactions;
        DELETE FROM planned_expenses;
        DELETE FROM categories;
        DELETE FROM budget_period;
        UPDATE app_owner SET data_generation = data_generation + 1 WHERE singleton = 1;
      `)
      return this.getDataGeneration()
    })
  }


  ping(): void {
    this.database.prepare('SELECT 1').get()
  }

  claimOrVerifyOwner(userId: string): boolean {
    return this.inTransaction(() => {
      const owner = this.database.prepare('SELECT user_id FROM app_owner WHERE singleton = 1').get() as AppOwnerRow | undefined
      if (owner) return owner.user_id === userId
      this.database.prepare('INSERT INTO app_owner (singleton, user_id) VALUES (1, ?)').run(userId)
      return true
    })
  }

  transferOwnerTo(userId: string): boolean {
    if (!/^user_[A-Za-z0-9_-]+$/.test(userId)) throw new Error('A valid Clerk user ID is required.')

    return this.inTransaction(() => {
      const owner = this.database.prepare('SELECT user_id FROM app_owner WHERE singleton = 1').get() as AppOwnerRow | undefined
      if (!owner) throw new Error('No current API owner is configured.')
      if (owner.user_id === userId) return false

      this.database.prepare('UPDATE app_owner SET user_id = ? WHERE singleton = 1').run(userId)
      return true
    })
  }

  importIfEmpty(snapshot: BudgetSnapshot): boolean {
    validateBudgetSnapshot(snapshot)
    const current = this.getSnapshot()
    if (current.period) {
      if (sameSnapshot(current, snapshot)) return false
      throw new SnapshotConflictError()
    }
    this.inTransaction(() => this.insertSnapshot(snapshot))
    return true
  }

  saveBudget(period: BudgetPeriod, categories: Category[]): void {
    const snapshot = { ...this.getSnapshot(), period, categories }
    validateBudgetSnapshot(snapshot)
    this.inTransaction(() => {
      this.insertPeriod(period)
      const upsert = this.database.prepare(`
        INSERT INTO categories (id, name, mode, bucket, allocation, color, default_cadence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name, mode=excluded.mode, bucket=excluded.bucket,
          allocation=excluded.allocation, color=excluded.color, default_cadence=excluded.default_cadence
      `)
      for (const category of categories) {
        upsert.run(category.id, category.name, category.mode, category.bucket, category.allocation, category.color, category.defaultCadence ?? null)
      }
      const ids = categories.map((category) => category.id)
      this.database.prepare(`DELETE FROM categories WHERE id NOT IN (${ids.map(() => '?').join(', ')})`).run(...ids)
    })
  }

  savePlannedExpense(expense: PlannedExpense): void {
    const current = this.getSnapshot()
    const plannedExpenses = [...current.plannedExpenses.filter((item) => item.id !== expense.id), expense]
    validateBudgetSnapshot({ ...current, plannedExpenses })
    this.database.prepare(`
      INSERT INTO planned_expenses (id, name, category_id, amount, due_date, cadence, end_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, category_id=excluded.category_id, amount=excluded.amount,
        due_date=excluded.due_date, cadence=excluded.cadence, end_date=excluded.end_date
    `).run(expense.id, expense.name, expense.categoryId, expense.amount, expense.dueDate, expense.cadence, expense.endDate ?? null)
  }

  deletePlannedExpense(id: string): void {
    this.inTransaction(() => {
      this.database.prepare('UPDATE transactions SET planned_expense_id = NULL, planned_occurrence_date = NULL WHERE planned_expense_id = ?').run(id)
      this.database.prepare('DELETE FROM planned_expenses WHERE id = ?').run(id)
    })
  }

  saveTransaction(transaction: Transaction): void {
    const current = this.getSnapshot()
    const transactions = [...current.transactions.filter((item) => item.id !== transaction.id), transaction]
    validateBudgetSnapshot({ ...current, transactions })
    this.database.prepare(`
      INSERT INTO transactions (id, description, category_id, amount, date, planned_expense_id, planned_occurrence_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET description=excluded.description, category_id=excluded.category_id, amount=excluded.amount,
        date=excluded.date, planned_expense_id=excluded.planned_expense_id, planned_occurrence_date=excluded.planned_occurrence_date
    `).run(transaction.id, transaction.description, transaction.categoryId, transaction.amount, transaction.date, transaction.plannedExpenseId ?? null, transaction.plannedOccurrenceDate ?? null)
  }

  deleteTransaction(id: string): void {
    this.database.prepare('DELETE FROM transactions WHERE id = ?').run(id)
  }

  private insertSnapshot(snapshot: BudgetSnapshot): void {
    this.database.prepare('DELETE FROM transactions').run()
    this.database.prepare('DELETE FROM planned_expenses').run()
    this.database.prepare('DELETE FROM categories').run()
    this.database.prepare('DELETE FROM budget_period').run()
    if (snapshot.period) this.insertPeriod(snapshot.period)

    const insertCategory = this.database.prepare('INSERT INTO categories (id, name, mode, bucket, allocation, color, default_cadence) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const category of snapshot.categories) {
      insertCategory.run(category.id, category.name, category.mode, category.bucket, category.allocation, category.color, category.defaultCadence ?? null)
    }
    const insertPlannedExpense = this.database.prepare('INSERT INTO planned_expenses (id, name, category_id, amount, due_date, cadence, end_date) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const expense of snapshot.plannedExpenses) {
      insertPlannedExpense.run(expense.id, expense.name, expense.categoryId, expense.amount, expense.dueDate, expense.cadence, expense.endDate ?? null)
    }
    const insertTransaction = this.database.prepare('INSERT INTO transactions (id, description, category_id, amount, date, planned_expense_id, planned_occurrence_date) VALUES (?, ?, ?, ?, ?, ?, ?)')
    for (const transaction of snapshot.transactions) {
      insertTransaction.run(transaction.id, transaction.description, transaction.categoryId, transaction.amount, transaction.date, transaction.plannedExpenseId ?? null, transaction.plannedOccurrenceDate ?? null)
    }
  }

  private insertPeriod(period: BudgetPeriod): void {
    this.database.prepare(`
      INSERT INTO budget_period (singleton, id, total_amount, reserve_amount, flexible_allocation, planned_allocation, start_date, end_date, is_sample)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET id=excluded.id, total_amount=excluded.total_amount, reserve_amount=excluded.reserve_amount,
        flexible_allocation=excluded.flexible_allocation, planned_allocation=excluded.planned_allocation,
        start_date=excluded.start_date, end_date=excluded.end_date, is_sample=excluded.is_sample
    `).run(period.id, period.totalAmount, period.reserveAmount, period.flexibleAllocation, period.plannedAllocation, period.startDate, period.endDate, period.isSample ? 1 : 0)
  }

  private inTransaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}

function validateBudgetSnapshot(snapshot: BudgetSnapshot): void {
  try {
    validateSnapshot(snapshot)
  } catch (error) {
    throw new BudgetValidationError(error instanceof Error ? error.message : 'Budget snapshot is invalid')
  }
}

function sameSnapshot(left: BudgetSnapshot, right: BudgetSnapshot): boolean {
  return JSON.stringify(canonicalSnapshot(left)) === JSON.stringify(canonicalSnapshot(right))
}

function canonicalSnapshot(snapshot: BudgetSnapshot): unknown[] {
  return [
    snapshot.period && [
      snapshot.period.id,
      snapshot.period.totalAmount,
      snapshot.period.reserveAmount,
      snapshot.period.flexibleAllocation,
      snapshot.period.plannedAllocation,
      snapshot.period.startDate,
      snapshot.period.endDate,
      Boolean(snapshot.period.isSample),
    ],
    [...snapshot.categories].sort((a, b) => a.id.localeCompare(b.id)).map((item) => [
      item.id, item.name, item.mode, item.bucket, item.allocation, item.color, item.defaultCadence ?? null,
    ]),
    [...snapshot.plannedExpenses].sort((a, b) => a.id.localeCompare(b.id)).map((item) => [
      item.id, item.name, item.categoryId, item.amount, item.dueDate, item.cadence, item.endDate ?? null,
    ]),
    [...snapshot.transactions].sort((a, b) => a.id.localeCompare(b.id)).map((item) => [
      item.id, item.description, item.categoryId, item.amount, item.date, item.plannedExpenseId ?? null, item.plannedOccurrenceDate ?? null,
    ]),
  ]
}
