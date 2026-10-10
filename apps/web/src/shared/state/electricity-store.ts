import { create } from 'zustand'
import type { TokenObservation } from '@kinsen/budget-domain'
import { ElectricityUseCases } from '../../application/use-cases/electricity-use-cases'
import { budgetRepository, electricityRepository } from '../../infrastructure/repositories/dexie-budget-repository'

const useCases = new ElectricityUseCases(electricityRepository)
let epoch = 0
let initialization: Promise<void> | null = null

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Electricity readings could not be saved on this device.'
}

type ElectricityState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  observations: TokenObservation[]
  error: string | null
  saving: boolean
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  runMutation: (operation: (useCases: ElectricityUseCases) => Promise<void>) => Promise<void>
}

export const useElectricityStore = create<ElectricityState>((set, get) => ({
  status: 'idle', observations: [], error: null, saving: false,
  initialize: async () => {
    if (get().status === 'ready') return
    if (initialization) return initialization
    const captured = epoch
    set({ status: 'loading', error: null })
    let pending!: Promise<void>
    pending = (async () => {
      try {
        const observations = await useCases.getObservations()
        if (captured === epoch) set({ observations, status: 'ready', error: null })
      } catch (error) {
        if (captured === epoch) set({ status: 'error', error: errorMessage(error) })
      } finally {
        if (initialization === pending) initialization = null
      }
    })()
    initialization = pending
    return pending
  },
  refresh: async () => {
    const captured = epoch
    try {
      const observations = await useCases.getObservations()
      if (captured === epoch) set({ observations, status: 'ready', error: null })
    } catch (error) {
      if (captured === epoch) set({ status: 'error', error: errorMessage(error) })
      throw error
    }
  },
  runMutation: async (operation) => {
    const captured = epoch
    set({ saving: true, error: null })
    try {
      await operation(useCases)
      if (captured === epoch) await get().refresh()
    } catch (error) {
      if (captured === epoch) set({ error: errorMessage(error) })
      throw error
    } finally {
      if (captured === epoch) set({ saving: false })
    }
  },
}))

budgetRepository.onAccountDataCleared(() => {
  epoch += 1
  initialization = null
  useElectricityStore.setState({ status: 'ready', observations: [], error: null, saving: false })
})
