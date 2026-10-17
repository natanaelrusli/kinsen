import { createSampleSnapshot } from '@kinsen/budget-domain'
import type { BudgetSnapshot, DateOnly, Transaction } from '@kinsen/budget-domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BudgetApiClient, BudgetApiError } from '../api/budget-api-client'
import type { PendingBudgetOperation } from './pending-budget-operation'
import { ApiBudgetRepository } from './api-budget-repository'
import type { DexieBudgetRepository } from './dexie-budget-repository'

const today = '2026-10-08' as DateOnly

class MemoryBudgetRepository {
  generation = 0
  pending: PendingBudgetOperation[] = []
  private nextQueueId = 1

  constructor(public snapshot: BudgetSnapshot) {}

  async getSnapshot(): Promise<BudgetSnapshot> { return this.snapshot }
  async getDataGeneration(): Promise<number> { return this.generation }
  async setDataGeneration(value: number): Promise<void> { this.generation = value }
  clearOptions: unknown[] = []
  async clearAccountData(options?: unknown): Promise<void> {
    this.clearOptions.push(options)
    this.snapshot = { period: null, categories: [], plannedExpenses: [], transactions: [] }
    this.pending = []
  }
  async seedIfEmpty(snapshot: BudgetSnapshot): Promise<void> {
    if (this.snapshot.period) return
    this.snapshot = snapshot
    this.addPending({ kind: 'IMPORT_SNAPSHOT', snapshot, createdAt: Date.now() })
  }
  async queueImportSnapshot(snapshot: BudgetSnapshot): Promise<void> {
    this.addPending({ kind: 'IMPORT_SNAPSHOT', snapshot, createdAt: Date.now() })
  }
  async replaceSnapshotFromRemote(snapshot: BudgetSnapshot): Promise<void> { this.snapshot = snapshot }
  async getPendingOperations(): Promise<PendingBudgetOperation[]> { return this.pending.filter((operation) => !operation.conflict) }
  async getParkedOperations(): Promise<PendingBudgetOperation[]> { return this.pending.filter((operation) => operation.conflict) }
  async parkPendingOperation(queueId: number): Promise<void> {
    this.pending = this.pending.map((operation) => operation.queueId === queueId
      ? { ...operation, conflict: { code: 'SNAPSHOT_CONFLICT', at: 0 } }
      : operation)
  }
  async adoptRemoteSnapshot(snapshot: BudgetSnapshot): Promise<void> {
    this.snapshot = snapshot
    this.pending = []
  }
  async acknowledgePendingOperation(queueId: number): Promise<void> {
    this.pending = this.pending.filter((operation) => operation.queueId !== queueId)
  }
  async saveTransaction(transaction: Transaction): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      transactions: [...this.snapshot.transactions.filter((item) => item.id !== transaction.id), transaction],
    }
    this.addPending({ kind: 'SAVE_TRANSACTION', transaction, createdAt: Date.now() })
  }
  private addPending(operation: PendingBudgetOperation): void {
    this.pending.push({ ...operation, queueId: this.nextQueueId++ })
  }
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

function repositoryFor(local: MemoryBudgetRepository, api: object): ApiBudgetRepository {
  return new ApiBudgetRepository(local as unknown as DexieBudgetRepository, api as unknown as BudgetApiClient)
}

afterEach(() => vi.restoreAllMocks())

describe('ApiBudgetRepository background synchronization', () => {
  it('opens cached data and commits local transactions before a delayed sync, without duplicate sends', async () => {
    const cached = createSampleSnapshot(today)
    const local = new MemoryBudgetRepository(cached)
    const remote = deferred<{ snapshot: BudgetSnapshot; dataGeneration: number }>()
    let releaseFirstSend!: () => void
    const firstSend = new Promise<void>((resolve) => { releaseFirstSend = resolve })
    const api = {
      getSnapshot: vi.fn(() => remote.promise),
      saveTransaction: vi.fn((transaction: Transaction) => transaction.id === 'audit-sync-first' ? firstSend : Promise.resolve()),
    }
    const repository = repositoryFor(local, api)

    await repository.seedIfEmpty(cached)
    await vi.waitFor(() => expect(api.getSnapshot).toHaveBeenCalledTimes(1))
    expect(local.snapshot).toBe(cached)

    const first: Transaction = { ...cached.transactions[0]!, id: 'audit-sync-first', description: 'First delayed save' }
    const second: Transaction = { ...cached.transactions[0]!, id: 'audit-sync-second', description: 'Second delayed save' }
    await expect(repository.saveTransaction(first)).resolves.toBeUndefined()
    expect(local.snapshot.transactions.some((item) => item.id === first.id)).toBe(true)
    expect(repository.getSyncStatus()).toBe('PENDING')
    expect(api.saveTransaction).not.toHaveBeenCalled()

    remote.resolve({ snapshot: cached, dataGeneration: 0 })
    await vi.waitFor(() => expect(api.saveTransaction).toHaveBeenCalledTimes(1))
    await expect(repository.saveTransaction(second)).resolves.toBeUndefined()
    releaseFirstSend()

    await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))
    expect(api.saveTransaction.mock.calls.map(([transaction]) => transaction.id)).toEqual([first.id, second.id])
    expect(local.pending).toHaveLength(0)
  })

  it('replaces a cached snapshot only after adopting a newer remote data generation', async () => {
    const cached = createSampleSnapshot(today)
    const remoteSnapshot = {
      ...cached,
      period: { ...cached.period!, totalAmount: cached.period!.totalAmount + 100 },
    }
    const local = new MemoryBudgetRepository(cached)
    local.generation = 2
    const remote = deferred<{ snapshot: BudgetSnapshot; dataGeneration: number }>()
    const api = { getSnapshot: vi.fn(() => remote.promise) }
    const repository = repositoryFor(local, api)
    const changed = vi.fn()
    repository.subscribeAccountDataChanges(changed)

    await repository.seedIfEmpty(cached)
    await vi.waitFor(() => expect(api.getSnapshot).toHaveBeenCalledTimes(1))
    remote.resolve({ snapshot: remoteSnapshot, dataGeneration: 3 })

    await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))
    expect(local.generation).toBe(3)
    expect(local.snapshot).toEqual(remoteSnapshot)
    expect(changed).toHaveBeenCalledTimes(1)
  })
  it('keeps reset blocked during background sync and refreshes stores after a completed reset', async () => {
    const cached = createSampleSnapshot(today)
    const local = new MemoryBudgetRepository(cached)
    const remote = deferred<{ snapshot: BudgetSnapshot; dataGeneration: number }>()
    const api = {
      getSnapshot: vi.fn(() => remote.promise),
      resetAccountData: vi.fn().mockResolvedValue({ dataGeneration: 4 }),
    }
    const repository = repositoryFor(local, api)
    const changed = vi.fn()
    repository.subscribeAccountDataChanges(changed)

    await repository.seedIfEmpty(cached)
    await vi.waitFor(() => expect(api.getSnapshot).toHaveBeenCalledTimes(1))
    await expect(repository.resetAccountData()).rejects.toThrow(/syncing/i)

    remote.resolve({ snapshot: cached, dataGeneration: 0 })
    await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))
    await repository.resetAccountData()

    expect(api.resetAccountData).toHaveBeenCalledTimes(1)
    expect(local.generation).toBe(4)
    expect(local.snapshot.period).toBeNull()
    expect(changed).toHaveBeenCalledTimes(1)
  })


  it('keeps cached data visible when the API reports a different account owner', async () => {
    const cached = createSampleSnapshot(today)
    const local = new MemoryBudgetRepository(cached)
    const api = { getSnapshot: vi.fn().mockRejectedValue(new BudgetApiError(403, 'ACCOUNT_NOT_OWNER', 'Not the owner.')) }
    const repository = repositoryFor(local, api)

    await repository.seedIfEmpty(cached)
    await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('ACCOUNT_MISMATCH'))
    expect(local.snapshot).toBe(cached)
  })

  it('adopts a newer remote generation without clearing device-local PLN readings', async () => {
    const cached = createSampleSnapshot(today)
    const local = new MemoryBudgetRepository(cached)
    local.generation = 0
    const api = { getSnapshot: vi.fn().mockResolvedValue({ snapshot: cached, dataGeneration: 3 }) }
    const repository = repositoryFor(local, api)

    await repository.seedIfEmpty(cached)
    await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))

    expect(local.generation).toBe(3)
    expect(local.clearOptions).toEqual([{ keepDeviceReadings: true }])
  })

  describe('sample import rejected by the server', () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

    // Offline first run queues a sample import; the server later holds a different real budget.
    async function parkedSampleImport() {
      const sample = createSampleSnapshot(today)
      const real = { ...sample, period: { ...sample.period!, id: 'real-2026-10', totalAmount: 9_000_000 } }
      const local = new MemoryBudgetRepository({ period: null, categories: [], plannedExpenses: [], transactions: [] })
      const api = {
        getSnapshot: vi.fn()
          .mockRejectedValueOnce(new TypeError('offline'))
          .mockResolvedValue({ snapshot: real, dataGeneration: 0 }),
        importSnapshot: vi.fn().mockRejectedValue(new BudgetApiError(409, 'SNAPSHOT_CONFLICT', 'different snapshot')),
        replaceSnapshot: vi.fn(),
        saveTransaction: vi.fn().mockResolvedValue(undefined),
      }
      const repository = repositoryFor(local, api)
      await repository.seedIfEmpty(sample)
      await repository.seedIfEmpty(sample)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))
      return { sample, real, local, api, repository }
    }

    it('parks the rejected import and does not re-send it on later syncs', async () => {
      const { api, local, repository } = await parkedSampleImport()
      expect(api.importSnapshot).toHaveBeenCalledTimes(1)

      await repository.seedIfEmpty(local.snapshot)
      await repository.seedIfEmpty(local.snapshot)
      await settle()

      expect(api.importSnapshot).toHaveBeenCalledTimes(1)
      expect(repository.getSyncStatus()).toBe('NEEDS_DECISION')
      expect(local.pending.filter((operation) => operation.conflict)).toHaveLength(1)
    })

    it('reports the sample copy and the decision for the conflict', async () => {
      const { repository } = await parkedSampleImport()
      await expect(repository.getSyncConflict()).resolves.toEqual({ localIsSample: true })
    })

    it('keeps the server copy by dropping the local import and adopting the remote budget', async () => {
      const { api, local, real, repository } = await parkedSampleImport()

      await repository.resolveSyncConflict('SERVER')

      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(local.snapshot).toEqual(real)
      expect(local.pending).toHaveLength(0)
      expect(api.importSnapshot).toHaveBeenCalledTimes(1)
      expect(api.replaceSnapshot).not.toHaveBeenCalled()
    })

    it("uses this device's copy by replacing the remote budget, then resumes normal sync", async () => {
      const { api, local, sample, repository } = await parkedSampleImport()
      api.replaceSnapshot.mockResolvedValue({ snapshot: sample })

      await repository.resolveSyncConflict('DEVICE')

      expect(api.replaceSnapshot).toHaveBeenCalledWith(sample)
      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(local.pending).toHaveLength(0)
      expect(api.importSnapshot).toHaveBeenCalledTimes(1)

      const later: Transaction = { ...sample.transactions[0]!, id: 'after-resolution', description: 'Saved after decision' }
      await repository.saveTransaction(later)
      await vi.waitFor(() => expect(api.saveTransaction).toHaveBeenCalledTimes(1))
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))
    })

    it('keeps the parked copy when the device-copy upload fails', async () => {
      const { api, repository } = await parkedSampleImport()
      api.replaceSnapshot.mockRejectedValue(new BudgetApiError(409, 'DATA_GENERATION_MISMATCH', 'changed'))

      await expect(repository.resolveSyncConflict('DEVICE')).rejects.toThrow()

      expect(repository.getSyncStatus()).toBe('NEEDS_DECISION')
      await expect(repository.getSyncConflict()).resolves.toEqual({ localIsSample: true })
    })
  })
})
