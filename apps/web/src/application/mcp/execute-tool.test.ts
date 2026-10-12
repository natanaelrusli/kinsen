import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeMcpTool } from './execute-tool'
import { budgetRepository, assetRepository, electricityRepository } from '../../infrastructure/repositories/dexie-budget-repository'
import { localToday } from '../../shared/format/date'

const date = '2024-01-01'
const asset = { id: 'cash', name: 'Cash', type: 'CASH', institution: 'Wallet', nativeCurrency: 'IDR', balanceMode: 'LEDGER', createdAt: date }
const opening = { id: 'opening', assetId: 'cash', date, kind: 'OPENING_BALANCE', amountMinor: 1000 }

beforeEach(async () => { await budgetRepository.clearAccountData() })
afterEach(async () => {
  await budgetRepository.clearAccountData()
  vi.unstubAllGlobals()
})

describe('MCP financial boundary', () => {
  it('prevents a new asset from attaching its opening valuation to another holding', async () => {
    await executeMcpTool('kinsen_create_asset', { asset, openingRecord: { entry: opening } })
    const otherAsset = { ...asset, id: 'other', type: 'OTHER', balanceMode: 'VALUATION' }
    await expect(executeMcpTool('kinsen_create_asset', {
      asset: otherAsset,
      openingRecord: { valuation: { id: 'value', assetId: 'cash', asOfDate: date, nativeAmountMinor: 100, nativeCurrency: 'IDR', exchangeRate: '1', rateDate: date, valueIdr: 100, source: 'MANUAL', recordedAt: 1 } },
    })).rejects.toThrow('must belong')
    expect((await assetRepository.getAssetData()).assets.map(item => item.id)).toEqual(['cash'])
  })

  it('does not let standalone activity replace a linked budget debit or opening balance', async () => {
    await executeMcpTool('kinsen_create_asset', { asset, openingRecord: { entry: opening } })
    await budgetRepository.saveTransaction({ id: 'expense', description: 'Food', categoryId: 'food', date, amount: 100 }, 'cash')
    const before = await assetRepository.getAssetData()
    const linked = before.assetEntries.find(item => item.budgetTransactionId === 'expense')!
    for (const entryId of [linked.id, opening.id]) {
      await expect(executeMcpTool('kinsen_save_asset_activity', {
        entry: { id: entryId, assetId: 'cash', date, kind: 'CREDIT', amountMinor: 900 },
      })).rejects.toThrow('source action')
    }
    expect(await assetRepository.getAssetData()).toEqual(before)
  })

  it('retains both account balances when a transfer would overdraw its source', async () => {
    await executeMcpTool('kinsen_create_asset', { asset, openingRecord: { entry: opening } })
    await executeMcpTool('kinsen_create_asset', {
      asset: { ...asset, id: 'savings' }, openingRecord: { entry: { ...opening, id: 'savings-opening', assetId: 'savings', amountMinor: 0 } },
    })
    const before = await assetRepository.getAssetData()
    await expect(executeMcpTool('kinsen_transfer_assets', { sourceAssetId: 'cash', destinationAssetId: 'savings', date, amountMinor: 1001 })).rejects.toThrow()
    expect(await assetRepository.getAssetData()).toEqual(before)
  })

  it('keeps reading identity and history when an edit attempts to replace a different ID', async () => {
    const observation = { id: 'reading', date, sequence: 0, remainingMilliKwh: 10000, refillMilliKwh: null, refillCostIdr: null, refillSource: 'none' }
    await executeMcpTool('kinsen_save_electricity_reading', { observation, position: 0 })
    await expect(executeMcpTool('kinsen_save_electricity_reading', { observation: { ...observation, id: 'different' }, position: 0, replacingId: 'reading' })).rejects.toThrow('same reading ID')
    expect(await electricityRepository.getObservations()).toEqual([observation])
  })

  it('requires explicit authorization before deleting a reading and refuses revoked sessions', async () => {
    const observation = { id: 'reading', date, sequence: 0, remainingMilliKwh: 10000, refillMilliKwh: null, refillCostIdr: null, refillSource: 'none' }
    await executeMcpTool('kinsen_save_electricity_reading', { observation, position: 0 })
    await expect(executeMcpTool('kinsen_delete_electricity_reading', { id: 'reading' })).rejects.toThrow()
    const controller = new AbortController()
    controller.abort()
    await expect(executeMcpTool('kinsen_delete_electricity_reading', { id: 'reading', confirm: true }, controller.signal)).rejects.toThrow()
    expect(await electricityRepository.getObservations()).toEqual([observation])
  })
  it('creates verified package valuations for provider products with an empty line key', async () => {
    const today = localToday()
    const product = { source: 'logammulia', materialType: 'gold', weightGrams: '5', lineKey: '' }
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      source: 'logammulia', quotes: [{ ...product, displayName: 'Gold 5g', sellPrice: 500000, recordedDate: today }], fetchedAt: new Date().toISOString(),
    }), { status: 200 }))
    await executeMcpTool('kinsen_create_asset', {
      asset: { ...asset, id: 'gold', type: 'GOLD', balanceMode: 'VALUATION', createdAt: today, goldPricing: { ...product, units: '2', revision: 'holding-1' } },
      openingRecord: { valuation: {
        id: 'unused-manual-value', assetId: 'gold', asOfDate: today, nativeAmountMinor: 0, nativeCurrency: 'IDR',
        exchangeRate: '1', rateDate: today, valueIdr: 0, source: 'MANUAL', recordedAt: 1,
      } },
    })
    const data = await assetRepository.getAssetData()
    expect(data.valuations).toMatchObject([{
      assetId: 'gold', nativeAmountMinor: 1000000, valueIdr: 1000000, quantity: '2', unitPrice: '500000',
      source: 'IMPORTED', goldQuote: { ...product, holdingRevision: 'holding-1', priceBasis: 'SELL' },
    }])
  })
})
