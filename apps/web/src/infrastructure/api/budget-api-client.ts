import type { BudgetPeriod, BudgetSnapshot, Category, PlannedExpense, Transaction } from '@kinsen/budget-domain'
import { getClerkToken } from './clerk-token-provider'

export class BudgetApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message)
    this.name = 'BudgetApiError'
  }
}

type ApiErrorPayload = { error?: { code?: string; message?: string } }

export class BudgetApiClient {
  private dataGeneration = 0

  async getSnapshot(): Promise<{ snapshot: BudgetSnapshot; dataGeneration: number }> {
    const budget = await this.request<{ snapshot: BudgetSnapshot; dataGeneration: number }>('/budget')
    this.dataGeneration = budget.dataGeneration
    return budget
  }

  importSnapshot(snapshot: BudgetSnapshot): Promise<void> {
    return this.request('/budget/import', {
      method: 'POST',
      headers: this.generationHeaders(),
      body: JSON.stringify(snapshot),
    })
  }

  saveBudget(period: BudgetPeriod, categories: Category[]): Promise<void> {
    return this.request('/budget', {
      method: 'PUT',
      headers: this.generationHeaders(),
      body: JSON.stringify({ period, categories }),
    })
  }

  savePlannedExpense(expense: PlannedExpense): Promise<void> {
    return this.request(`/planned-expenses/${encodeURIComponent(expense.id)}`, {
      method: 'PUT',
      headers: this.generationHeaders(),
      body: JSON.stringify(expense),
    })
  }

  deletePlannedExpense(id: string): Promise<void> {
    return this.request(`/planned-expenses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.generationHeaders(),
    })
  }

  saveTransaction(transaction: Transaction): Promise<void> {
    return this.request(`/transactions/${encodeURIComponent(transaction.id)}`, {
      method: 'PUT',
      headers: this.generationHeaders(),
      body: JSON.stringify(transaction),
    })
  }

  deleteTransaction(id: string): Promise<void> {
    return this.request(`/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.generationHeaders(),
    })
  }

  async resetAccountData(): Promise<{ dataGeneration: number }> {
    const result = await this.request<{ dataGeneration: number }>('/account/data', {
      method: 'DELETE',
      headers: this.generationHeaders(),
    })
    this.dataGeneration = result.dataGeneration
    return result
  }

  deactivateAccount(): Promise<void> {
    return this.request('/account/deactivate', { method: 'POST' })
  }

  private generationHeaders(): Record<string, string> {
    return { 'X-Kinsen-Data-Generation': String(this.dataGeneration) }
  }

  private async request<T = void>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getClerkToken()
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
    if (response.status === 204) return undefined as T

    const payload = await response.json().catch(() => null) as ApiErrorPayload | T | null
    if (!response.ok) {
      const apiError = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined
      throw new BudgetApiError(
        response.status,
        apiError?.code ?? 'API_ERROR',
        apiError?.message ?? `API request failed (${response.status}).`,
      )
    }
    return payload as T
  }
}
