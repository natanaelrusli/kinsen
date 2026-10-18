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
  failReplace = false
  async replaceSnapshotFromRemote(snapshot: BudgetSnapshot): Promise<void> {
    if (this.failReplace) throw new Error('Local data already exists; refusing to replace it with the API snapshot.')
    this.snapshot = snapshot
  }
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
    // Stateful server: the first read is the delayed remote copy, later reads return what the sends stored.
    let server: BudgetSnapshot = cached
    let reads = 0
    const api = {
      getSnapshot: vi.fn(() => (reads++ === 0 ? remote.promise : Promise.resolve({ snapshot: server, dataGeneration: 0 }))),
      saveTransaction: vi.fn((transaction: Transaction) => {
        const stored = () => { server = { ...server, transactions: [...server.transactions, transaction] } }
        return transaction.id === 'audit-sync-first' ? firstSend.then(stored) : Promise.resolve().then(stored)
      }),
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

  it('adopts a newer remote generation without clearing device-only data', async () => {
    const cached = createSampleSnapshot(today)
    const local = new MemoryBudgetRepository(cached)
    local.generation = 0
    const api = { getSnapshot: vi.fn().mockResolvedValue({ snapshot: cached, dataGeneration: 3 }) }
    const repository = repositoryFor(local, api)

    await repository.seedIfEmpty(cached)
    await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))

    expect(local.generation).toBe(3)
    expect(local.clearOptions).toEqual([{ keepDeviceOnlyData: true }])
  })

  describe('sample import rejected by the server', () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

    // Offline first run queues a sample import; the server later holds a different real budget.
    async function parkedSampleImport() {
      const sample = createSampleSnapshot(today)
      const real = { ...sample, period: { ...sample.period!, id: 'real-2026-10', totalAmount: 9_000_000 } }
      const local = new MemoryBudgetRepository({ period: null, categories: [], plannedExpenses: [], transactions: [] })
      // Stateful server: writes are stored so later reads see them, as the real API does.
      let server: BudgetSnapshot = real
      const api = {
        getSnapshot: vi.fn()
          .mockRejectedValueOnce(new TypeError('offline'))
          .mockImplementation(async () => ({ snapshot: server, dataGeneration: 0 })),
        importSnapshot: vi.fn().mockRejectedValue(new BudgetApiError(409, 'SNAPSHOT_CONFLICT', 'different snapshot')),
        replaceSnapshot: vi.fn(async (snapshot: BudgetSnapshot) => { server = snapshot; return { snapshot } }),
        saveTransaction: vi.fn(async (transaction: Transaction) => {
          server = { ...server, transactions: [...server.transactions.filter((item) => item.id !== transaction.id), transaction] }
        }),
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
      await expect(repository.getSyncConflict()).resolves.toEqual({ localIsSample: true, explanation: expect.stringMatching(/sample budget/) })
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
      await expect(repository.getSyncConflict()).resolves.toEqual({ localIsSample: true, explanation: expect.stringMatching(/sample budget/) })
    })
  })

  describe('conflicts without parked operations', () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
    const emptySnapshot: BudgetSnapshot = { period: null, categories: [], plannedExpenses: [], transactions: [] }

    function divergedBudgets() {
      const local = createSampleSnapshot(today)
      const remote = { ...local, period: { ...local.period!, totalAmount: local.period!.totalAmount + 100 } }
      return { local, remote }
    }

    // Each case must end in a decision (never a plain pause), and each decision must reach SYNCED.
    it('asks for a decision when both budgets exist and differ, then keeps the server copy and reaches SYNCED', async () => {
      const { local: cached, remote } = divergedBudgets()
      const local = new MemoryBudgetRepository(cached)
      const api = { getSnapshot: vi.fn().mockResolvedValue({ snapshot: remote, dataGeneration: 0 }), replaceSnapshot: vi.fn() }
      const repository = repositoryFor(local, api)

      await repository.seedIfEmpty(cached)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))
      expect(await repository.getSyncConflict()).toEqual({ localIsSample: true, explanation: expect.stringMatching(/budget period/) })
      expect(local.snapshot).toBe(cached)
      expect(api.replaceSnapshot).not.toHaveBeenCalled()

      await repository.resolveSyncConflict('SERVER')

      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(local.snapshot).toEqual(remote)
      expect(await repository.getSyncConflict()).toBeNull()
    })

    it("asks for a decision when both budgets differ, then uploads this device's copy and reaches SYNCED", async () => {
      const { local: cached, remote } = divergedBudgets()
      const local = new MemoryBudgetRepository(cached)
      const api = {
        getSnapshot: vi.fn().mockResolvedValue({ snapshot: remote, dataGeneration: 0 }),
        replaceSnapshot: vi.fn().mockResolvedValue({ snapshot: cached }),
      }
      const repository = repositoryFor(local, api)

      await repository.seedIfEmpty(cached)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))

      await repository.resolveSyncConflict('DEVICE')

      expect(api.replaceSnapshot).toHaveBeenCalledWith(cached)
      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(await repository.getSyncConflict()).toBeNull()
    })

    it('keeps the decision after a reload, because the next load re-checks the server', async () => {
      const { local: cached, remote } = divergedBudgets()
      const local = new MemoryBudgetRepository(cached)
      const api = { getSnapshot: vi.fn().mockResolvedValue({ snapshot: remote, dataGeneration: 0 }) }
      await repositoryFor(local, api).seedIfEmpty(cached)

      const reloaded = repositoryFor(local, api)
      await reloaded.seedIfEmpty(cached)

      await vi.waitFor(() => expect(reloaded.getSyncStatus()).toBe('NEEDS_DECISION'))
      expect(await reloaded.getSyncConflict()).not.toBeNull()
    })

    it('keeps the decision visible while the server cannot be reached', async () => {
      const { local: cached, remote } = divergedBudgets()
      const local = new MemoryBudgetRepository(cached)
      const api = { getSnapshot: vi.fn().mockResolvedValueOnce({ snapshot: remote, dataGeneration: 0 }).mockRejectedValue(new TypeError('offline')) }
      const repository = repositoryFor(local, api)

      await repository.seedIfEmpty(cached)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))
      await repository.seedIfEmpty(local.snapshot)
      await settle()

      expect(repository.getSyncStatus()).toBe('NEEDS_DECISION')
      expect(await repository.getSyncConflict()).not.toBeNull()
    })

    it('adopts an older server generation automatically when this device holds no budget', async () => {
      const remote = createSampleSnapshot(today)
      const local = new MemoryBudgetRepository(emptySnapshot)
      local.generation = 5
      const api = { getSnapshot: vi.fn().mockResolvedValue({ snapshot: remote, dataGeneration: 2 }) }
      const repository = repositoryFor(local, api)

      await repository.seedIfEmpty(remote)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))
      expect(local.generation).toBe(2)
      expect(local.snapshot).toEqual(remote)
    })

    it('asks for a decision when the server generation is older than a device that holds data, then adopts it', async () => {
      const { local: cached, remote } = divergedBudgets()
      const local = new MemoryBudgetRepository(cached)
      local.generation = 5
      const api = { getSnapshot: vi.fn().mockResolvedValue({ snapshot: remote, dataGeneration: 2 }) }
      const repository = repositoryFor(local, api)

      await repository.seedIfEmpty(cached)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))
      expect(local.generation).toBe(5)

      await repository.resolveSyncConflict('SERVER')

      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(local.generation).toBe(2)
      expect(local.snapshot).toEqual(remote)
    })

    it('asks for a decision when the server has a budget but this device has only unsent changes, and keeps the server copy', async () => {
      const remote = createSampleSnapshot(today)
      const local = new MemoryBudgetRepository(emptySnapshot)
      local.pending.push({ kind: 'DELETE_TRANSACTION', id: 'unsent', createdAt: 1, queueId: 99 })
      const api = { getSnapshot: vi.fn().mockResolvedValue({ snapshot: remote, dataGeneration: 0 }) }
      const repository = repositoryFor(local, api)

      await repository.seedIfEmpty(emptySnapshot)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))
      expect(await repository.getSyncConflict()).toEqual({ localIsSample: false, explanation: expect.stringMatching(/unsent changes/) })

      await repository.resolveSyncConflict('SERVER')

      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(local.snapshot).toEqual(remote)
      expect(local.pending).toHaveLength(0)
    })

    it('uploads this device copy when a remote-only decision is made, then reaches SYNCED', async () => {
      const remote = createSampleSnapshot(today)
      const local = new MemoryBudgetRepository(emptySnapshot)
      local.pending.push({ kind: 'DELETE_TRANSACTION', id: 'unsent', createdAt: 1, queueId: 99 })
      const api = {
        getSnapshot: vi.fn().mockResolvedValue({ snapshot: remote, dataGeneration: 0 }),
        replaceSnapshot: vi.fn().mockResolvedValue({ snapshot: emptySnapshot }),
      }
      const repository = repositoryFor(local, api)

      await repository.seedIfEmpty(emptySnapshot)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))
      await repository.resolveSyncConflict('DEVICE')

      expect(api.replaceSnapshot).toHaveBeenCalledWith(emptySnapshot)
      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(local.pending).toHaveLength(0)
    })

    it('asks for a decision when the server budget cannot be written over leftover local data, then keeps the server copy', async () => {
      const remote = createSampleSnapshot(today)
      const leftover = { ...emptySnapshot, categories: createSampleSnapshot(today).categories }
      const local = new MemoryBudgetRepository(leftover)
      local.failReplace = true
      const api = { getSnapshot: vi.fn().mockResolvedValue({ snapshot: remote, dataGeneration: 0 }) }
      const repository = repositoryFor(local, api)

      await repository.seedIfEmpty(leftover)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))

      await repository.resolveSyncConflict('SERVER')

      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(local.snapshot).toEqual(remote)
    })

    it('asks for a decision when the server rejects a queued change with a generic conflict, then keeps the server copy', async () => {
      const cached = createSampleSnapshot(today)
      const local = new MemoryBudgetRepository(cached)
      const api = {
        getSnapshot: vi.fn().mockResolvedValue({ snapshot: cached, dataGeneration: 0 }),
        saveTransaction: vi.fn().mockRejectedValue(new BudgetApiError(409, 'TRANSACTION_CONFLICT', 'changed elsewhere')),
        replaceSnapshot: vi.fn(),
      }
      const repository = repositoryFor(local, api)
      await repository.seedIfEmpty(cached)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))

      await repository.saveTransaction({ ...cached.transactions[0]!, id: 'rejected', description: 'Rejected' })
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))
      expect(await repository.getSyncConflict()).toEqual({ localIsSample: true, explanation: expect.stringMatching(/rejected a change/) })

      await repository.resolveSyncConflict('SERVER')

      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(local.pending).toHaveLength(0)
      expect(api.replaceSnapshot).not.toHaveBeenCalled()
    })

    it('uploads this device copy after a generic conflict on a queued change, then reaches SYNCED', async () => {
      const cached = createSampleSnapshot(today)
      const local = new MemoryBudgetRepository(cached)
      const api = {
        getSnapshot: vi.fn().mockResolvedValue({ snapshot: cached, dataGeneration: 0 }),
        saveTransaction: vi.fn().mockRejectedValue(new BudgetApiError(409, 'TRANSACTION_CONFLICT', 'changed elsewhere')),
        replaceSnapshot: vi.fn().mockResolvedValue({ snapshot: cached }),
      }
      const repository = repositoryFor(local, api)
      await repository.seedIfEmpty(cached)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))
      await repository.saveTransaction({ ...cached.transactions[0]!, id: 'rejected', description: 'Rejected' })
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))

      await repository.resolveSyncConflict('DEVICE')

      expect(api.replaceSnapshot).toHaveBeenCalledTimes(1)
      expect(repository.getSyncStatus()).toBe('SYNCED')
      expect(local.pending).toHaveLength(0)
    })

    it('never reports Synced when unsent changes are sent but the server then differs from this device', async () => {
      const cached = createSampleSnapshot(today)
      const tx: Transaction = { ...cached.transactions[0]!, id: 'unsent-diverged', description: 'Unsent' }
      const remote = { ...cached, period: { ...cached.period!, totalAmount: cached.period!.totalAmount + 100 } }
      const local = new MemoryBudgetRepository(cached)
      await local.saveTransaction(tx)
      const api = {
        getSnapshot: vi.fn().mockResolvedValueOnce({ snapshot: cached, dataGeneration: 0 }).mockResolvedValue({ snapshot: remote, dataGeneration: 0 }),
        saveTransaction: vi.fn().mockResolvedValue(undefined),
      }
      const repository = repositoryFor(local, api)
      const statuses: string[] = []
      repository.subscribeSyncStatus((status) => statuses.push(status))

      await repository.seedIfEmpty(cached)

      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))
      expect(api.saveTransaction).toHaveBeenCalledTimes(1)
      expect(statuses).not.toContain('SYNCED')
      expect(await repository.getSyncConflict()).toEqual({ localIsSample: true, explanation: expect.stringMatching(/budget period/) })
    })

    it('reaches Synced after unsent changes are sent when the server matches this device afterwards', async () => {
      const cached = createSampleSnapshot(today)
      const tx: Transaction = { ...cached.transactions[0]!, id: 'unsent-matched', description: 'Unsent' }
      const afterSend = { ...cached, transactions: [...cached.transactions, tx] }
      const local = new MemoryBudgetRepository(cached)
      await local.saveTransaction(tx)
      const api = {
        getSnapshot: vi.fn().mockResolvedValueOnce({ snapshot: cached, dataGeneration: 0 }).mockResolvedValue({ snapshot: afterSend, dataGeneration: 0 }),
        saveTransaction: vi.fn().mockResolvedValue(undefined),
      }
      const repository = repositoryFor(local, api)

      await repository.seedIfEmpty(cached)

      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))
      expect(api.saveTransaction).toHaveBeenCalledTimes(1)
    })

    it('detects another device diverging on a save without waiting for a reload', async () => {
      const cached = createSampleSnapshot(today)
      const remote = { ...cached, period: { ...cached.period!, totalAmount: cached.period!.totalAmount + 100 } }
      const local = new MemoryBudgetRepository(cached)
      const api = {
        getSnapshot: vi.fn().mockResolvedValue({ snapshot: cached, dataGeneration: 0 }),
        saveTransaction: vi.fn().mockResolvedValue(undefined),
      }
      const repository = repositoryFor(local, api)
      await repository.seedIfEmpty(cached)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))

      api.getSnapshot.mockResolvedValue({ snapshot: remote, dataGeneration: 0 })
      const statuses: string[] = []
      repository.subscribeSyncStatus((status) => statuses.push(status))
      statuses.length = 0
      await repository.saveTransaction({ ...cached.transactions[0]!, id: 'late-diverged', description: 'Late' })

      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('NEEDS_DECISION'))
      expect(statuses).not.toContain('SYNCED')
    })

    it('re-checks the server and adopts a new generation automatically when a change is refused for a generation mismatch', async () => {
      const cached = createSampleSnapshot(today)
      const bumped = { ...cached, period: { ...cached.period!, totalAmount: cached.period!.totalAmount + 100 } }
      const local = new MemoryBudgetRepository(cached)
      const api = {
        getSnapshot: vi.fn()
          .mockResolvedValueOnce({ snapshot: cached, dataGeneration: 0 })
          .mockResolvedValue({ snapshot: bumped, dataGeneration: 1 }),
        saveTransaction: vi.fn().mockRejectedValue(new BudgetApiError(409, 'DATA_GENERATION_MISMATCH', 'changed')),
      }
      const repository = repositoryFor(local, api)
      await repository.seedIfEmpty(cached)
      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))

      await repository.saveTransaction({ ...cached.transactions[0]!, id: 'late', description: 'Late' })

      await vi.waitFor(() => expect(repository.getSyncStatus()).toBe('SYNCED'))
      expect(local.generation).toBe(1)
      expect(local.snapshot).toEqual(bumped)
      expect(local.clearOptions).toEqual([{ keepDeviceOnlyData: true }])
    })
  })
})
