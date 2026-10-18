import type { BudgetPeriod, BudgetSnapshot, Category, PlannedExpense, Transaction } from '@kinsen/budget-domain'
import type { BudgetRepository } from './budget-repository'
import { DexieBudgetRepository, budgetRepository as localRepository } from './dexie-budget-repository'
import type { PendingBudgetOperation } from './pending-budget-operation'
import { BudgetApiClient, BudgetApiError } from '../api/budget-api-client'

// Every conflict ends in NEEDS_DECISION: the user picks one whole copy, so no state is a plain pause.
export type SyncStatus = 'LOCAL' | 'SYNCING' | 'SYNCED' | 'PENDING' | 'NEEDS_DECISION' | 'ERROR' | 'ACCOUNT_MISMATCH'
export type SyncConflict = { localIsSample: boolean; explanation: string }
export type SyncConflictChoice = 'SERVER' | 'DEVICE'
type SyncListener = (status: SyncStatus) => void

const sampleConflictExplanation = 'This device has the sample budget, and the server already has a different budget.'
const snapshotConflictExplanation = 'This device and the server have different budgets.'
const rejectedChangeExplanation = 'The server rejected a change because its budget differs from this device.'
const unsentRemoteOnlyExplanation = 'This device has unsent changes but no budget, and the server has a budget. Keeping the server copy discards the unsent changes.'
const olderServerGenerationExplanation = 'The server has an older account data generation than this device.'
const leftoverLocalDataExplanation = 'This device has leftover budget data that the server budget cannot be loaded over.'

export class ApiBudgetRepository implements BudgetRepository {
  private status: SyncStatus = 'LOCAL'
  private synchronizing = false
  private syncPromise: Promise<void> | null = null
  private syncRequested = false
  private remoteCheckRequested = false
  private requestedSeed: BudgetSnapshot | undefined
  private remoteInitialized = false
  // Why a divergence (not a parked import) needs a decision; re-derived from the server on every remote check.
  private conflictExplanation: string | null = null
  private readonly listeners = new Set<SyncListener>()
  private readonly accountDataListeners = new Set<() => void>()

  constructor(
    private readonly local: DexieBudgetRepository = localRepository,
    private readonly api = new BudgetApiClient(),
  ) {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.synchronize().catch(() => this.setStatus('ERROR'))
      })
    }
  }

  getSyncStatus(): SyncStatus {
    return this.status
  }

  subscribeSyncStatus(listener: SyncListener): () => void {
    this.listeners.add(listener)
    listener(this.status)
    return () => this.listeners.delete(listener)
  }
  subscribeAccountDataChanges(listener: () => void): () => void {
    this.accountDataListeners.add(listener)
    return () => this.accountDataListeners.delete(listener)
  }

  getSnapshot(): Promise<BudgetSnapshot> {
    return this.local.getSnapshot()
  }

  async seedIfEmpty(snapshot: BudgetSnapshot): Promise<void> {
    const cached = await this.local.getSnapshot()
    if (cached.period) {
      void this.synchronize().catch(() => this.setStatus('ERROR'))
      return
    }
    await this.synchronize(snapshot)
  }

  async saveBudget(period: BudgetPeriod, categories: Category[]): Promise<void> {
    await this.local.saveBudget(period, categories)
    this.afterLocalMutation()
  }

  async savePlannedExpense(expense: PlannedExpense): Promise<void> {
    await this.local.savePlannedExpense(expense)
    this.afterLocalMutation()
  }

  async deletePlannedExpense(id: string): Promise<void> {
    await this.local.deletePlannedExpense(id)
    this.afterLocalMutation()
  }

  async saveTransaction(transaction: Transaction, paidFromAssetId?: string | null): Promise<void> {
    await this.local.saveTransaction(transaction, paidFromAssetId)
    this.afterLocalMutation()
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.local.deleteTransaction(id)
    this.afterLocalMutation()
  }

  private afterLocalMutation(): void {
    if (this.status !== 'ACCOUNT_MISMATCH' && this.status !== 'NEEDS_DECISION') this.setStatus('PENDING')
    void this.requestSynchronization(false).catch(() => this.setStatus('ERROR'))
  }

  private synchronize(seed?: BudgetSnapshot): Promise<void> {
    return this.requestSynchronization(true, seed)
  }

  private requestSynchronization(checkRemote: boolean, seed?: BudgetSnapshot): Promise<void> {
    if (seed !== undefined) this.requestedSeed = seed
    this.syncRequested = true
    this.remoteCheckRequested ||= checkRemote
    if (this.syncPromise) return this.syncPromise
    if (this.synchronizing) return Promise.resolve()

    this.synchronizing = true
    this.syncPromise = this.runSynchronizationQueue()
      .catch((error) => {
        this.setStatus('ERROR')
        throw error
      })
      .finally(() => {
        this.synchronizing = false
        this.syncPromise = null
        if (this.syncRequested) this.startRequestedSynchronization()
      })
    return this.syncPromise
  }

  private startRequestedSynchronization(): void {
    if (!this.syncRequested || this.synchronizing) return
    void this.requestSynchronization(false).catch(() => this.setStatus('ERROR'))
  }

  private async runSynchronizationQueue(): Promise<void> {
    while (this.syncRequested) {
      const checkRemote = this.remoteCheckRequested || !this.remoteInitialized
      const seed = this.requestedSeed
      this.syncRequested = false
      this.remoteCheckRequested = false
      this.requestedSeed = undefined
      if (checkRemote) {
        if (this.status !== 'PENDING' && this.status !== 'ACCOUNT_MISMATCH' && this.status !== 'NEEDS_DECISION') this.setStatus('SYNCING')
        await this.synchronizeRemote(seed)
      } else await this.flushPending()
    }
  }

  private async synchronizeRemote(seed?: BudgetSnapshot): Promise<void> {
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
      const parked = await this.local.getParkedOperations()
      this.remoteInitialized = false
      if (parked.length || this.conflictExplanation !== null) this.setStatus('NEEDS_DECISION')
      else this.setStatus(pending.length ? 'PENDING' : 'LOCAL')
      return
    }
    // The server answered, so any earlier divergence is re-derived from this fresh copy below.
    this.conflictExplanation = null

    const localGeneration = await this.local.getDataGeneration()
    let localDataChanged = false
    if (remoteBudget.dataGeneration > localGeneration) {
      // A server reset bumps the generation: the synced budget is replaced, device-only assets, liabilities and PLN readings stay.
      await this.local.clearAccountData({ keepDeviceOnlyData: true })
      await this.local.setDataGeneration(remoteBudget.dataGeneration)
      localSnapshot = await this.local.getSnapshot()
      localDataChanged = true
    } else if (remoteBudget.dataGeneration < localGeneration) {
      // Nothing local to lose: adopt the server generation. Otherwise the user decides which copy survives.
      const hasUnsentChanges = (await this.local.getPendingOperations()).length > 0 || (await this.local.getParkedOperations()).length > 0
      if (!isEmptySnapshot(localSnapshot) || hasUnsentChanges) {
        this.requireDecision(olderServerGenerationExplanation)
        return
      }
      await this.local.setDataGeneration(remoteBudget.dataGeneration)
    }
    if ((await this.local.getParkedOperations()).length) {
      this.setStatus('NEEDS_DECISION')
      return
    }
    const remoteSnapshot = remoteBudget.snapshot
    const pending = await this.local.getPendingOperations()
    if (!localSnapshot.period && !remoteSnapshot.period) {
      if (seed && remoteBudget.dataGeneration === 0) {
        await this.local.seedIfEmpty(seed)
        localDataChanged = true
      }
      this.remoteInitialized = true
      if (localDataChanged) this.notifyAccountDataChanges()
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
        this.requireDecision(unsentRemoteOnlyExplanation)
        return
      }
      try {
        await this.local.replaceSnapshotFromRemote(remoteSnapshot)
        this.remoteInitialized = true
        this.setStatus('SYNCED')
        this.notifyAccountDataChanges()
      } catch {
        this.requireDecision(leftoverLocalDataExplanation)
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

    this.requireDecision(describeDifferences(localSnapshot, remoteSnapshot))
  }

  // The status is NEEDS_DECISION and remoteInitialized is false, so the next change re-checks the server before it is sent.
  private requireDecision(explanation: string): void {
    this.conflictExplanation = explanation
    this.remoteInitialized = false
    this.setStatus('NEEDS_DECISION')
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
      this.notifyAccountDataChanges()
    } finally {
      this.synchronizing = false
      this.startRequestedSynchronization()
    }
  }

  async getSyncConflict(): Promise<SyncConflict | null> {
    const localIsSample = Boolean((await this.local.getSnapshot()).period?.isSample)
    if ((await this.local.getParkedOperations()).length) {
      return { localIsSample, explanation: localIsSample ? sampleConflictExplanation : snapshotConflictExplanation }
    }
    if (this.conflictExplanation === null) return null
    return { localIsSample, explanation: this.conflictExplanation }
  }

  // The user chose which copy survives. Nothing is discarded silently: a failed upload leaves the decision open.
  // Either choice replaces only the synced budget; device-only assets, liabilities and PLN readings are never touched.
  async resolveSyncConflict(choice: SyncConflictChoice): Promise<void> {
    if (this.synchronizing) throw new Error('Wait for account data to finish syncing, then try again.')
    if (!(await this.getSyncConflict())) return
    this.synchronizing = true
    try {
      if (choice === 'SERVER') {
        const remoteBudget = await this.api.getSnapshot()
        await this.local.adoptRemoteSnapshot(remoteBudget.snapshot)
        await this.local.setDataGeneration(remoteBudget.dataGeneration)
        this.conflictExplanation = null
        this.remoteInitialized = true
        this.setStatus('SYNCED')
        this.notifyAccountDataChanges()
        return
      }

      // The fresh generation becomes the upload header. Only operations queued before this upload are acknowledged; later edits stay queued.
      const remoteBudget = await this.api.getSnapshot()
      const queued = [...await this.local.getParkedOperations(), ...await this.local.getPendingOperations()]
      const queueIds = queued.flatMap((operation) => operation.queueId === undefined ? [] : [operation.queueId])
      await this.api.replaceSnapshot(await this.local.getSnapshot())
      for (const queueId of queueIds) await this.local.acknowledgePendingOperation(queueId)
      await this.local.setDataGeneration(remoteBudget.dataGeneration)
      this.conflictExplanation = null
      this.remoteInitialized = true
      await this.flushPending()
    } finally {
      this.synchronizing = false
      this.startRequestedSynchronization()
    }
  }

  async deactivateAccount(): Promise<void> {
    if (this.synchronizing) throw new Error('Wait for account data to finish syncing, then try again.')
    this.synchronizing = true
    try {
      await this.api.deactivateAccount()
    } finally {
      this.synchronizing = false
      this.startRequestedSynchronization()
    }
  }

  private async flushPending(): Promise<void> {
    while (true) {
      if ((await this.local.getParkedOperations()).length) {
        this.setStatus('NEEDS_DECISION')
        return
      }
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
          // A generation mismatch means the server changed under this device: re-check it (a newer generation is adopted, an older one is a decision).
          if (error instanceof BudgetApiError && error.code === 'DATA_GENERATION_MISMATCH') {
            this.remoteInitialized = false
            this.remoteCheckRequested = true
            this.syncRequested = true
            return
          }

          // A sample or local import the server refuses is parked for the user's choice instead of being re-sent on every sync.
          if (
            operation.kind === 'IMPORT_SNAPSHOT'
            && operation.queueId !== undefined
            && error instanceof BudgetApiError
            && error.code === 'SNAPSHOT_CONFLICT'
          ) {
            await this.local.parkPendingOperation(operation.queueId, { code: 'SNAPSHOT_CONFLICT', at: Date.now() })
            this.remoteInitialized = false
            this.setStatus('NEEDS_DECISION')
            return
          }

          if (error instanceof BudgetApiError && error.status === 409) {
            this.requireDecision(rejectedChangeExplanation)
            return
          }

          this.remoteInitialized = error instanceof BudgetApiError && error.code === 'ACCOUNT_NOT_OWNER' ? false : this.remoteInitialized
          this.setStatus(error instanceof BudgetApiError && error.code === 'ACCOUNT_NOT_OWNER'
            ? 'ACCOUNT_MISMATCH'
            : error instanceof BudgetApiError && error.status < 500 ? 'ERROR' : 'PENDING')
          return
        }
      }
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
  private notifyAccountDataChanges(): void {
    for (const listener of this.accountDataListeners) listener()
  }
}

function snapshotsMatch(left: BudgetSnapshot, right: BudgetSnapshot): boolean {
  return JSON.stringify(canonicalSnapshot(left)) === JSON.stringify(canonicalSnapshot(right))
}

function isEmptySnapshot(snapshot: BudgetSnapshot): boolean {
  return !snapshot.period && snapshot.categories.length === 0 && snapshot.plannedExpenses.length === 0 && snapshot.transactions.length === 0
}

// Names the parts that differ, with list sizes, so the user can tell which copy is which before choosing.
function describeDifferences(local: BudgetSnapshot, remote: BudgetSnapshot): string {
  const localParts = canonicalSnapshot(local)
  const remoteParts = canonicalSnapshot(remote)
  const sections = [
    { label: 'budget period', counts: null },
    { label: 'categories', counts: [local.categories.length, remote.categories.length] },
    { label: 'planned expenses', counts: [local.plannedExpenses.length, remote.plannedExpenses.length] },
    { label: 'transactions', counts: [local.transactions.length, remote.transactions.length] },
  ]
  const differing = sections.flatMap((section, index) => {
    if (JSON.stringify(localParts[index]) === JSON.stringify(remoteParts[index])) return []
    return [section.counts ? `${section.label} (device ${section.counts[0]}, server ${section.counts[1]})` : section.label]
  })
  return `This device and the server have different budgets: ${differing.join(', ')}.`
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
