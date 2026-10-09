import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGoldValuation, type AssetAccount, type GoldPriceQuote, type GoldPriceResponse, type GoldPriceSource } from '@kinsen/budget-domain'
import { budgetRepository } from '../../infrastructure/repositories/dexie-budget-repository'
import { BudgetApiClient } from '../../infrastructure/api/budget-api-client'
import { localToday } from '../format/date'
import { useAssetStore } from './asset-store'

const today = localToday()
function holding(id: string, source: GoldPriceSource = 'logammulia'): AssetAccount {
  return { id, name: id, type: 'GOLD', institution: 'Home', nativeCurrency: 'IDR', balanceMode: 'VALUATION', createdAt: today,
    goldPricing: { source, materialType: 'Bar', weightGrams: '5', lineKey: '', units: '2', revision: id } }
}
function response(source: GoldPriceSource, price = 100): GoldPriceResponse {
  return { source, fetchedAt: new Date().toISOString(), quotes: [{ source, materialType: 'Bar', weightGrams: '5', lineKey: '', displayName: source, sellPrice: price, recordedDate: today }] }
}
async function seed(asset: AssetAccount) {
  const quote: GoldPriceQuote = response(asset.goldPricing!.source).quotes[0]!
  await budgetRepository.createAsset(asset, { valuation: createGoldValuation(asset, quote, today, 1, `${asset.id}-open`) })
}

beforeEach(async () => {
  await budgetRepository.clearAccountData()
  vi.restoreAllMocks()
  useAssetStore.setState({ status: 'idle' })
})
afterEach(() => vi.restoreAllMocks())

describe('gold refresh lifecycle', () => {
  it('keeps local data ready during failure and throttles failed sources until explicit refresh', async () => {
    await seed(holding('gold'))
    const fetch = vi.spyOn(BudgetApiClient.prototype, 'getGoldPrices').mockRejectedValue(new Error('Provider unavailable'))
    await useAssetStore.getState().initialize()
    await useAssetStore.getState().refreshGoldPrices()
    expect(useAssetStore.getState().status).toBe('ready')
    expect(useAssetStore.getState().saving).toBe(false)
    expect(useAssetStore.getState().data.valuations[0]!.valueIdr).toBe(200)
    expect(useAssetStore.getState().goldErrors.gold).toBe('Provider unavailable')
    await useAssetStore.getState().refreshGoldPrices()
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValue(response('logammulia', 120))
    await useAssetStore.getState().refreshGoldPrices(true)
    expect(useAssetStore.getState().data.valuations.map(value => value.valueIdr)).toContain(240)
    expect(useAssetStore.getState().goldErrors).toEqual({})
  })
  it('coalesces catalog and refresh requests while allowing another source to succeed', async () => {
    await seed(holding('a'))
    await seed(holding('b', 'galeri24'))
    await useAssetStore.getState().refresh()
    let resolve!: (value: GoldPriceResponse) => void
    const pending = new Promise<GoldPriceResponse>(done => { resolve = done })
    const fetch = vi.spyOn(BudgetApiClient.prototype, 'getGoldPrices').mockImplementation(source => source === 'logammulia' ? pending : Promise.reject(new Error('Unavailable')))
    const catalog = useAssetStore.getState().loadGoldPrices('logammulia')
    const refresh = useAssetStore.getState().refreshGoldPrices()
    resolve(response('logammulia', 130))
    await Promise.all([catalog, refresh])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(useAssetStore.getState().data.valuations.filter(value => value.assetId === 'a').map(value => value.valueIdr)).toEqual([200, 260])
    expect(useAssetStore.getState().data.valuations.filter(value => value.assetId === 'b').map(value => value.valueIdr)).toEqual([200])
    expect(useAssetStore.getState().goldErrors).toEqual({ b: 'Unavailable' })
  })
  it('rejects older provider prices without overwriting a saved value', async () => {
    await seed(holding('gold'))
    await useAssetStore.getState().refresh()
    const old = response('logammulia', 999)
    old.quotes[0]!.recordedDate = '2020-01-01'
    vi.spyOn(BudgetApiClient.prototype, 'getGoldPrices').mockResolvedValue(old)
    await useAssetStore.getState().refreshGoldPrices(true)
    expect(useAssetStore.getState().data.valuations.map(value => value.valueIdr)).toEqual([200])
    expect(useAssetStore.getState().goldErrors.gold).toMatch(/older gold price/)
  })
  it('never republishes local data loaded before a reset', async () => {
    await seed(holding('old'))
    const previous = await budgetRepository.getAssetData()
    let resolve!: (value: typeof previous) => void
    const pending = new Promise<typeof previous>(done => { resolve = done })
    vi.spyOn(budgetRepository, 'getAssetData').mockReturnValueOnce(pending)
    const loading = useAssetStore.getState().initialize()
    await budgetRepository.clearAccountData()
    resolve(previous)
    await loading
    expect(useAssetStore.getState().status).toBe('ready')
    expect(useAssetStore.getState().data.assets).toEqual([])
    expect(useAssetStore.getState().data.valuations).toEqual([])
  })
  it('discards pending quote results after account clear and does not clear newer requests', async () => {
    await seed(holding('old'))
    await useAssetStore.getState().refresh()
    let resolve!: (value: GoldPriceResponse) => void
    const pending = new Promise<GoldPriceResponse>(done => { resolve = done })
    const fetch = vi.spyOn(BudgetApiClient.prototype, 'getGoldPrices').mockReturnValueOnce(pending).mockResolvedValue(response('logammulia', 150))
    const obsolete = useAssetStore.getState().refreshGoldPrices(true)
    await budgetRepository.clearAccountData()
    await seed(holding('new'))
    await useAssetStore.getState().refresh()
    await useAssetStore.getState().refreshGoldPrices(true)
    resolve(response('logammulia', 999))
    await obsolete
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(useAssetStore.getState().data.assets.map(asset => asset.id)).toEqual(['new'])
    expect(useAssetStore.getState().data.valuations.map(value => value.valueIdr)).toEqual([200, 300])
    expect(useAssetStore.getState().goldRefreshing).toBe(false)
    expect(useAssetStore.getState().goldErrors).toEqual({})
    expect(useAssetStore.getState().goldPrices.logammulia!.quotes[0]!.sellPrice).toBe(150)
  })
})
