import type { BudgetPeriod, BudgetSnapshot, Category, PlannedExpense, Transaction } from '@kinsen/budget-domain'
import type { BudgetRepository } from './budget-repository'
import { DexieBudgetRepository, budgetRepository as localRepository } from './dexie-budget-repository'
import type { PendingBudgetOperation } from './pending-budget-operation'
import { BudgetApiClient, BudgetApiError } from '../api/budget-api-client'

export type SyncStatus = 'LOCAL' | 'SYNCED' | 'PENDING' | 'CONFLICT' | 'ERROR' | 'ACCOUNT_MISMATCH'
type SyncListener = (status: SyncStatus) => void

export class ApiBudgetRepository implements BudgetRepository {
  private status: SyncStatus = 'LOCAL'
  private synchronizing = false
  private remoteInitialized = false
  private readonly listeners = new Set<SyncListener>()

  constructor(
    private readonly local: DexieBudgetRepository = localRepository,
    private readonly api = new BudgetApiClient(),
  ) {
    if (typeof window !== 'undefined') window.addEventListener('online', () => void this.synchronize())
  }

  getSyncStatus(): SyncStatus {
    return this.status
  }

  subscribeSyncStatus(listener: SyncListener): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): Promise<BudgetSnapshot> {
    return this.local.getSnapshot()
  }

  async seedIfEmpty(snapshot: BudgetSnapshot): Promise<void> {
    await this.synchronize(snapshot)
  }

  async saveBudget(period: BudgetPeriod, categories: Category[]): Promise<void> {
    await this.local.saveBudget(period, categories)
    await this.afterLocalMutation()
  }

  async savePlannedExpense(expense: PlannedExpense): Promise<void> {
    await this.local.savePlannedExpense(expense)
    await this.afterLocalMutation()
  }

  async deletePlannedExpense(id: string): Promise<void> {
    await this.local.deletePlannedExpense(id)
    await this.afterLocalMutation()
  }

  async saveTransaction(transaction: Transaction, paidFromAssetId?: string | null): Promise<void> {
    await this.local.saveTransaction(transaction, paidFromAssetId)
    await this.afterLocalMutation()
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.local.deleteTransaction(id)
    await this.afterLocalMutation()
  }

  private async afterLocalMutation(): Promise<void> {
    if (this.remoteInitialized) await this.flushPending()
    else await this.synchronize()
  }

  private async synchronize(seed?: BudgetSnapshot): Promise<void> {
    if (this.synchronizing) return
    this.synchronizing = true
    try {
      let localSnapshot = await this.local.getSnapshot()
      let remoteBudget: { snapshot: BudgetSnapshot; dataGeneration: number }
      try {
        remoteBudget = await this.api.getSnapshot()
      } catch (error) {
        if (error instanceof BudgetApiError && error.code === 'ACCOUNT_NOT_OWNER') {
          this.remoteInitialized = false
          this.setStatus('ACCOUNT_MISMATCH')
          return
        }
        if (seed) await this.local.seedIfEmpty(seed)
        const pending = await this.local.getPendingOperations()
        this.remoteInitialized = false
        this.setStatus(pending.length ? 'PENDING' : 'LOCAL')
        return
      }

      const localGeneration = await this.local.getDataGeneration()
      if (remoteBudget.dataGeneration > localGeneration) {
        await this.local.clearAccountData()
        await this.local.setDataGeneration(remoteBudget.dataGeneration)
        localSnapshot = await this.local.getSnapshot()
      } else if (remoteBudget.dataGeneration < localGeneration) {
        this.remoteInitialized = false
        this.setStatus('CONFLICT')
        return
      }
      const remoteSnapshot = remoteBudget.snapshot
      const pending = await this.local.getPendingOperations()
      if (!localSnapshot.period && !remoteSnapshot.period) {
        if (seed && remoteBudget.dataGeneration === 0) await this.local.seedIfEmpty(seed)
        this.remoteInitialized = true
        await this.flushPending()
        return
      }
      if (localSnapshot.period && !remoteSnapshot.period) {
        await this.local.queueImportSnapshot(localSnapshot)
        this.remoteInitialized = true
        await this.flushPending()
        return
      }
      if (!localSnapshot.period && remoteSnapshot.period) {
        if (pending.length) {
          this.remoteInitialized = false
          this.setStatus('CONFLICT')
          return
        }
        try {
          await this.local.replaceSnapshotFromRemote(remoteSnapshot)
          this.remoteInitialized = true
          this.setStatus('SYNCED')
        } catch {
          this.remoteInitialized = false
          this.setStatus('CONFLICT')
        }
        return
      }

      if (pending.length) {
        this.remoteInitialized = true
        await this.flushPending()
        return
      }
      if (snapshotsMatch(localSnapshot, remoteSnapshot)) {
        this.remoteInitialized = true
        this.setStatus('SYNCED')
        return
      }

      this.remoteInitialized = false
      this.setStatus('CONFLICT')
    } finally {
      this.synchronizing = false
    }
  }

  async resetAccountData(): Promise<void> {
    if (this.synchronizing) throw new Error('Wait for account data to finish syncing, then try again.')
    this.synchronizing = true
    this.remoteInitialized = false
    try {
      const { dataGeneration } = await this.api.resetAccountData()
      await this.local.clearAccountData()
      await this.local.setDataGeneration(dataGeneration)
      this.remoteInitialized = true
      this.setStatus('SYNCED')
    } finally {
      this.synchronizing = false
    }
  }

  async deactivateAccount(): Promise<void> {
    if (this.synchronizing) throw new Error('Wait for account data to finish syncing, then try again.')
    this.synchronizing = true
    try {
      await this.api.deactivateAccount()
    } finally {
      this.synchronizing = false
    }
  }

  private async flushPending(): Promise<void> {
    if (this.synchronizing && !this.remoteInitialized) return
    this.synchronizing = true
    try {
      while (true) {
        const pending = await this.local.getPendingOperations()
        if (pending.length === 0) {
          this.setStatus(this.remoteInitialized ? 'SYNCED' : 'LOCAL')
          return
        }

        for (const operation of pending) {
          try {
            await this.send(operation)
            if (operation.queueId !== undefined) await this.local.acknowledgePendingOperation(operation.queueId)
          } catch (error) {
            if (
              error instanceof BudgetApiError
              && error.code === 'DATA_GENERATION_MISMATCH'
              && await this.reconcileDataGeneration()
            ) return

            this.remoteInitialized = error instanceof BudgetApiError && (error.status === 409 || error.code === 'ACCOUNT_NOT_OWNER') ? false : this.remoteInitialized
            this.setStatus(error instanceof BudgetApiError && error.code === 'ACCOUNT_NOT_OWNER'
              ? 'ACCOUNT_MISMATCH'
              : error instanceof BudgetApiError && error.status === 409
                ? 'CONFLICT'
                : error instanceof BudgetApiError && error.status < 500 ? 'ERROR' : 'PENDING')
            return
          }
        }
      }
    } finally {
      this.synchronizing = false
    }
  }

  private async reconcileDataGeneration(): Promise<boolean> {
    try {
      const remoteBudget = await this.api.getSnapshot()
      const localGeneration = await this.local.getDataGeneration()
      if (remoteBudget.dataGeneration <= localGeneration) return false

      await this.local.clearAccountData()
      await this.local.setDataGeneration(remoteBudget.dataGeneration)
      if (remoteBudget.snapshot.period) await this.local.replaceSnapshotFromRemote(remoteBudget.snapshot)
      this.remoteInitialized = true
      this.setStatus('SYNCED')
      return true
    } catch {
      return false
    }
  }

  private async send(operation: PendingBudgetOperation): Promise<void> {
    switch (operation.kind) {
      case 'IMPORT_SNAPSHOT':
        await this.api.importSnapshot(operation.snapshot)
        return
      case 'SAVE_BUDGET':
        await this.api.saveBudget(operation.period, operation.categories)
        return
      case 'SAVE_PLANNED_EXPENSE':
        await this.api.savePlannedExpense(operation.expense)
        return
      case 'DELETE_PLANNED_EXPENSE':
        await this.api.deletePlannedExpense(operation.id)
        return
      case 'SAVE_TRANSACTION':
        await this.api.saveTransaction(operation.transaction)
        return
      case 'DELETE_TRANSACTION':
        await this.api.deleteTransaction(operation.id)
        return
    }
  }

  private setStatus(status: SyncStatus): void {
    if (status === this.status) return
    this.status = status
    for (const listener of this.listeners) listener(status)
  }
}

function snapshotsMatch(left: BudgetSnapshot, right: BudgetSnapshot): boolean {
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

export const budgetRepository = new ApiBudgetRepository()
