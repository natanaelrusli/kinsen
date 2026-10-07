import { create } from 'zustand'
import type { BudgetOverview, BudgetSnapshot, DateOnly } from '@kinsen/budget-domain'
import { BudgetUseCases } from '../../application/use-cases/budget-use-cases'
import { budgetRepository, type SyncStatus } from '../../infrastructure/repositories/api-budget-repository'
import { localToday } from '../format/date'

const budgetUseCases = new BudgetUseCases(budgetRepository)

type LoadStatus = 'loading' | 'ready' | 'error'

type BudgetState = {
  status: LoadStatus
  snapshot: BudgetSnapshot | null
  overview: BudgetOverview | null
  error: string | null
  saving: boolean
  savedAt: number | null
  syncStatus: SyncStatus
  refresh: (today?: DateOnly) => Promise<void>
  initialize: () => Promise<void>
  runMutation: (operation: (useCases: BudgetUseCases) => Promise<void>) => Promise<void>
}


export const useBudgetStore = create<BudgetState>((set, get) => ({
  status: 'loading',
  snapshot: null,
  overview: null,
  error: null,
  saving: false,
  syncStatus: budgetRepository.getSyncStatus(),
  savedAt: null,
  refresh: async (today = localToday()) => {
    try {
      const [snapshot, overview] = await Promise.all([
        budgetUseCases.getSnapshot(),
        budgetUseCases.getOverview(today),
      ])
      set({ snapshot, overview, status: 'ready', error: null, syncStatus: budgetRepository.getSyncStatus() })
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : 'Kinsen could not read your budget data.' })
      throw error
    }
  },
  initialize: async () => {
    set({ status: 'loading', error: null })
    try {
      await budgetUseCases.initialize(localToday())
      await get().refresh()
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : 'Kinsen could not read your budget data.' })
    }
  },
  runMutation: async (operation) => {
    set({ saving: true, error: null })
    try {
      await operation(budgetUseCases)
      await get().refresh()
      set({ savedAt: Date.now() })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Kinsen could not save that change.' })
      throw error
    } finally {
      set({ saving: false })
    }
  },
}))

budgetRepository.subscribeSyncStatus((syncStatus) => useBudgetStore.setState({ syncStatus }))
