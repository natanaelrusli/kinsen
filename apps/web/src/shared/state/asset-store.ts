import { create } from 'zustand'
import { createGoldValuation, isAssetActiveOn, type AssetData, type GoldPriceResponse, type GoldPriceSource, type GoldProduct } from '@kinsen/budget-domain'
import { AssetUseCases } from '../../application/use-cases/asset-use-cases'
import { assetRepository, budgetRepository } from '../../infrastructure/repositories/dexie-budget-repository'
import { BudgetApiClient } from '../../infrastructure/api/budget-api-client'
import { localToday } from '../format/date'
import { newId } from '../format/id'

const assetUseCases = new AssetUseCases(assetRepository)
const goldClient = new BudgetApiClient()
const emptyData: AssetData = { assets: [], assetEntries: [], valuations: [], liabilities: [], liabilityEntries: [] }
const HOUR = 60 * 60 * 1000
let epoch = 0
let initialization: Promise<void> | null = null
let goldRefresh: Promise<void> | null = null
const flights = new Map<GoldPriceSource, { promise: Promise<GoldPriceResponse>; controller: AbortController }>()
const attempts = new Map<GoldPriceSource, number>()
const failures = new Map<GoldPriceSource, Error>()
const online = () => typeof navigator === 'undefined' || navigator.onLine
const message = (error: unknown) => error instanceof Error ? error.message : 'Gold prices are currently unavailable.'

function sameProduct(left: GoldProduct, right: GoldProduct): boolean {
  return left.source === right.source && left.materialType === right.materialType && left.weightGrams === right.weightGrams && left.lineKey === right.lineKey
}

type AssetState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: AssetData
  error: string | null
  saving: boolean
  goldPrices: Partial<Record<GoldPriceSource, GoldPriceResponse>>
  goldRefreshing: boolean
  goldErrors: Record<string, string>
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  runMutation: (operation: (useCases: AssetUseCases) => Promise<void>) => Promise<void>
  loadGoldPrices: (source: GoldPriceSource, force?: boolean) => Promise<GoldPriceResponse>
  refreshGoldPrices: (force?: boolean) => Promise<void>
}

export const useAssetStore = create<AssetState>((set, get) => ({
  status: 'idle', data: emptyData, error: null, saving: false,
  goldPrices: {}, goldRefreshing: false, goldErrors: {},
  initialize: async () => {
    if (get().status === 'ready') return
    if (initialization) return initialization
    const captured = epoch
    set({ status: 'loading', error: null })
    const promise = (async () => {
      try {
        const data = await assetUseCases.getData()
        if (captured !== epoch) return
        set({ data, status: 'ready', error: null })
        void get().refreshGoldPrices()
      } catch (error) {
        if (captured === epoch) set({ status: 'error', error: message(error) })
      } finally {
        if (captured === epoch) initialization = null
      }
    })()
    initialization = promise
    return promise
  },
  refresh: async () => {
    const captured = epoch
    try {
      const data = await assetUseCases.getData()
      if (captured !== epoch) return
      const active = new Set(data.assets.filter(asset => asset.goldPricing && isAssetActiveOn(asset, localToday())).map(asset => asset.id))
      set({ data, status: 'ready', error: null, goldErrors: Object.fromEntries(Object.entries(get().goldErrors).filter(([id]) => active.has(id))) })
    } catch (error) {
      if (captured !== epoch) return
      set({ status: 'error', error: message(error) })
      throw error
    }
  },
  runMutation: async (operation) => {
    const captured = epoch
    set({ saving: true, error: null })
    try {
      await operation(assetUseCases)
      if (captured === epoch) await get().refresh()
    } catch (error) {
      if (captured === epoch) set({ error: error instanceof Error ? error.message : 'That asset change could not be saved.' })
      throw error
    } finally {
      if (captured === epoch) set({ saving: false })
    }
  },
  loadGoldPrices: (source, force = false) => {
    const existing = flights.get(source)
    if (existing) return existing.promise
    if (!online()) return Promise.reject(new Error('Offline — showing last saved gold value.'))
    if (!force && Date.now() - (attempts.get(source) ?? -Infinity) < HOUR) {
      const failure = failures.get(source)
      if (failure) return Promise.reject(failure)
      const cached = get().goldPrices[source]
      if (cached) return Promise.resolve(cached)
    }
    const captured = epoch
    const controller = new AbortController()
    attempts.set(source, Date.now())
    const promise = goldClient.getGoldPrices(source, controller.signal).then(response => {
      if (captured !== epoch) throw new DOMException('Workspace reset', 'AbortError')
      failures.delete(source)
      set({ goldPrices: { ...get().goldPrices, [source]: response } })
      return response
    }).catch(error => {
      if (captured === epoch) failures.set(source, error instanceof Error ? error : new Error(message(error)))
      throw error
    }).finally(() => {
      if (captured === epoch && flights.get(source)?.promise === promise) flights.delete(source)
    })
    flights.set(source, { promise, controller })
    return promise
  },
  refreshGoldPrices: (force = false) => {
    if (goldRefresh) return goldRefresh
    if (!online() || get().status !== 'ready') return Promise.resolve()
    const captured = epoch
    const today = localToday()
    const holdings = get().data.assets.filter(asset => asset.goldPricing && isAssetActiveOn(asset, today))
    const sources = [...new Set(holdings.map(asset => asset.goldPricing!.source))]
    if (!sources.length) { set({ goldErrors: {} }); return Promise.resolve() }
    set({ goldRefreshing: true })
    const promise = (async () => {
      const errors: Record<string, string> = {}
      await Promise.all(sources.map(async source => {
        try {
          const response = await get().loadGoldPrices(source, force)
          if (captured !== epoch) return
          for (const asset of holdings.filter(asset => asset.goldPricing!.source === source)) {
            if (captured !== epoch) return
            const quote = response.quotes.find(quote => sameProduct(asset.goldPricing!, quote))
            if (!quote) { errors[asset.id] = 'Price unavailable for the selected gold product. Last saved value retained.'; continue }
            const latest = get().data.valuations.filter(value => value.assetId === asset.id && value.goldQuote && sameProduct(value.goldQuote, quote) && value.asOfDate <= today)
              .sort((left, right) => right.asOfDate.localeCompare(left.asOfDate) || right.recordedAt - left.recordedAt || right.id.localeCompare(left.id))[0]
            if (latest?.goldQuote && quote.recordedDate < latest.goldQuote.recordedDate) { errors[asset.id] = 'Received an older gold price. Last saved value retained.'; continue }
            if (quote.recordedDate > today) { errors[asset.id] = "Gold price is dated after today's valuation date."; continue }
            try {
              await assetUseCases.saveValuation(createGoldValuation(asset, quote, today, Date.now(), newId('valuation')))
            } catch (error) { errors[asset.id] = message(error) }
          }
        } catch (error) {
          if (captured === epoch) for (const asset of holdings.filter(asset => asset.goldPricing!.source === source)) errors[asset.id] = message(error)
        }
      }))
      if (captured !== epoch) return
      // Quote failures never become local-loading failures.
      try {
        const data = await assetUseCases.getData()
        if (captured !== epoch) return
        const active = new Set(data.assets.filter(asset => asset.goldPricing && isAssetActiveOn(asset, today) &&
          holdings.some(previous => previous.id === asset.id && previous.goldPricing!.revision === asset.goldPricing!.revision)).map(asset => asset.id))
        set({ data, goldErrors: Object.fromEntries(Object.entries(errors).filter(([id]) => active.has(id))) })
      } catch (error) {
        if (captured === epoch) set({ goldErrors: Object.fromEntries(holdings.map(asset => [asset.id, message(error)])) })
      }
    })().finally(() => {
      if (captured === epoch && goldRefresh === promise) { goldRefresh = null; set({ goldRefreshing: false }) }
    })
    goldRefresh = promise
    return promise
  },
}))

budgetRepository.onAccountDataCleared(() => {
  epoch += 1
  for (const flight of flights.values()) flight.controller.abort()
  flights.clear()
  attempts.clear()
  failures.clear()
  initialization = null
  goldRefresh = null
  useAssetStore.setState({ data: emptyData, status: 'ready', error: null, saving: false, goldPrices: {}, goldErrors: {}, goldRefreshing: false })
})
