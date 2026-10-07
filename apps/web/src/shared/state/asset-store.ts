import { create } from 'zustand'
import type { AssetData } from '@kinsen/budget-domain'
import { AssetUseCases } from '../../application/use-cases/asset-use-cases'
import { assetRepository } from '../../infrastructure/repositories/dexie-budget-repository'

const assetUseCases = new AssetUseCases(assetRepository)
const emptyData: AssetData = { assets: [], assetEntries: [], valuations: [], liabilities: [], liabilityEntries: [] }
let initialization: Promise<void> | null = null

type AssetState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: AssetData
  error: string | null
  saving: boolean
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  runMutation: (operation: (useCases: AssetUseCases) => Promise<void>) => Promise<void>
}

export const useAssetStore = create<AssetState>((set, get) => ({
  status: 'idle',
  data: emptyData,
  error: null,
  saving: false,
  initialize: async () => {
    if (get().status === 'ready') return
    if (initialization) return initialization
    set({ status: 'loading', error: null })
    initialization = (async () => {
      try {
        const data = await assetUseCases.getData()
        set({ data, status: 'ready', error: null })
      } catch (error) {
        set({ status: 'error', error: error instanceof Error ? error.message : 'Assets could not be loaded from this device.' })
      } finally {
        initialization = null
      }
    })()
    return initialization
  },
  refresh: async () => {
    try {
      const data = await assetUseCases.getData()
      set({ data, status: 'ready', error: null })
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : 'Assets could not be loaded from this device.' })
      throw error
    }
  },
  runMutation: async (operation) => {
    set({ saving: true, error: null })
    try {
      await operation(assetUseCases)
      await get().refresh()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'That asset change could not be saved.' })
      throw error
    } finally {
      set({ saving: false })
    }
  },
}))
