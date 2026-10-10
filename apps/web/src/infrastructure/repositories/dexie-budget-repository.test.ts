import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it, vi } from 'vitest'
import { calculateFinancialPosition, createGoldValuation, deriveLedgerBalance } from '@kinsen/budget-domain'
import type { AssetAccount, AssetEntry, AssetValuation, GoldPriceQuote, LiabilityAccount, LiabilityEntry, TokenObservation, Transaction } from '@kinsen/budget-domain'
import { DexieBudgetRepository } from './dexie-budget-repository'
import { AssetUseCases } from '../../application/use-cases/asset-use-cases'
import { localToday } from '../../shared/format/date'
import { ElectricityUseCases } from '../../application/use-cases/electricity-use-cases'

const activityDate = '2024-01-02'

function account(id: string, name: string, opening: number): { asset: AssetAccount; openingEntry: AssetEntry } {
  const asset: AssetAccount = {
    id,
    name,
    type: 'BANK_ACCOUNT',
    institution: name,
    nativeCurrency: 'IDR',
    balanceMode: 'LEDGER',
    createdAt: '2024-01-01',
  }
  return {
    asset,
    openingEntry: { id: `${id}-opening`, assetId: id, date: '2024-01-01', kind: 'OPENING_BALANCE', amountMinor: opening },
  }
}

const expense: Transaction = {
  id: 'expense-1',
  description: 'Groceries',
  categoryId: 'food',
  amount: 300,
  date: activityDate,
}

describe('Dexie budget/asset transaction atomicity', () => {
  it('upgrades the previous local schema without replacing the existing budget', async () => {
    const legacy = new Dexie('kinsen-budget')
    legacy.version(3).stores({
      periods: 'id',
      categories: 'id',
      plannedExpenses: 'id, categoryId',
      transactions: 'id, categoryId, plannedExpenseId',
      pendingOperations: '++queueId, createdAt',
      accountMetadata: 'key',
    })
    const period = {
      id: 'period-from-v3',
      totalAmount: 1_000,
      reserveAmount: 100,
      flexibleAllocation: 800,
      plannedAllocation: 100,
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    }
    await legacy.open()
    await legacy.table('periods').put(period)
    await legacy.table('transactions').put(expense)
    legacy.close()

    const repository = new DexieBudgetRepository()
    expect((await repository.getSnapshot()).period).toEqual(period)
    expect((await repository.getSnapshot()).transactions).toEqual([expense])
    expect(await repository.getAssetData()).toEqual({
      assets: [],
      assetEntries: [],
      valuations: [],
      liabilities: [],
      liabilityEntries: [],
    })
    await repository.clearAccountData()
  })

  it('creates, edits, removes, reloads, and rolls back a Paid from debit atomically', async () => {
    const repository = new DexieBudgetRepository()
    await repository.clearAccountData()
    const first = account('daily-account', 'Daily account', 1_000)
    const second = account('savings-account', 'Savings account', 400)
    await repository.createAsset(first.asset, { entry: first.openingEntry })
    await repository.createAsset(second.asset, { entry: second.openingEntry })

    await repository.saveTransaction(expense, first.asset.id)
    let data = await repository.getAssetData()
    expect(data.assetEntries.filter((entry) => entry.budgetTransactionId === expense.id)).toMatchObject([
      { assetId: first.asset.id, amountMinor: 300, date: activityDate },
    ])
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === first.asset.id), activityDate)).toBe(700)

    const edited: Transaction = { ...expense, amount: 250 }
    await repository.saveTransaction(edited, second.asset.id)
    data = await repository.getAssetData()
    expect(data.assetEntries.filter((entry) => entry.budgetTransactionId === expense.id)).toMatchObject([
      { assetId: second.asset.id, amountMinor: 250, date: activityDate },
    ])
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === first.asset.id), activityDate)).toBe(1_000)
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === second.asset.id), activityDate)).toBe(150)
    expect((await repository.getSnapshot()).transactions).toEqual([edited])

    await expect(repository.saveTransaction({ ...edited, amount: 500 }, second.asset.id)).rejects.toThrow(/negative/i)
    expect((await repository.getSnapshot()).transactions).toEqual([edited])
    data = await repository.getAssetData()
    expect(data.assetEntries.filter((entry) => entry.budgetTransactionId === expense.id)).toMatchObject([
      { assetId: second.asset.id, amountMinor: 250 },
    ])

    await repository.saveTransaction(edited, null)
    data = await repository.getAssetData()
    expect(data.assetEntries.some((entry) => entry.budgetTransactionId === expense.id)).toBe(false)
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === second.asset.id), activityDate)).toBe(400)

    await repository.saveTransaction({ ...edited, amount: 200 }, first.asset.id)
    const reloadedRepository = new DexieBudgetRepository()
    const reloadedData = await reloadedRepository.getAssetData()
    expect(deriveLedgerBalance(reloadedData.assetEntries.filter((entry) => entry.assetId === first.asset.id), activityDate)).toBe(800)
    expect((await reloadedRepository.getSnapshot()).transactions).toMatchObject([{ id: expense.id, amount: 200 }])

    await reloadedRepository.deleteTransaction(expense.id)
    const afterDelete = await repository.getAssetData()
    expect((await repository.getSnapshot()).transactions).toEqual([])
    expect(afterDelete.assetEntries.some((entry) => entry.budgetTransactionId === expense.id)).toBe(false)
    expect(deriveLedgerBalance(afterDelete.assetEntries.filter((entry) => entry.assetId === first.asset.id), activityDate)).toBe(1_000)
    await repository.clearAccountData()
  })
  it('moves value between tracked accounts and settles a liability without changing budget transactions', async () => {
    const repository = new DexieBudgetRepository()
    await repository.clearAccountData()
    const cash = account('cash-for-settlement', 'Cash', 1_000)
    const savings = account('savings-for-transfer', 'Savings', 500)
    await repository.createAsset(cash.asset, { entry: cash.openingEntry })
    await repository.createAsset(savings.asset, { entry: savings.openingEntry })

    const transferId = 'transfer-1'
    await repository.transferAssets(
      { id: 'transfer-out-1', assetId: cash.asset.id, date: activityDate, kind: 'TRANSFER_OUT', amountMinor: 200, transferId },
      { id: 'transfer-in-1', assetId: savings.asset.id, date: activityDate, kind: 'TRANSFER_IN', amountMinor: 200, transferId },
    )
    let data = await repository.getAssetData()
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === cash.asset.id), activityDate)).toBe(800)
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === savings.asset.id), activityDate)).toBe(700)

    const liability: LiabilityAccount = {
      id: 'card-1',
      name: 'Credit card',
      type: 'CREDIT_CARD',
      institution: 'Bank',
      nativeCurrency: 'IDR',
      createdAt: '2024-01-01',
    }
    const opening: LiabilityEntry = {
      id: 'card-opening',
      liabilityId: liability.id,
      date: '2024-01-01',
      kind: 'OPENING_BALANCE',
      amountMinor: 300,
    }
    await repository.createLiability(liability, opening)
    await repository.recordLiabilityPayment(
      { id: 'payment-debit', assetId: cash.asset.id, date: activityDate, kind: 'DEBIT', amountMinor: 200, liabilityEntryId: 'card-payment' },
      { id: 'card-payment', liabilityId: liability.id, date: activityDate, kind: 'PAYMENT', amountMinor: 200, assetEntryId: 'payment-debit' },
    )

    data = await repository.getAssetData()
    expect(calculateFinancialPosition(data, activityDate)).toMatchObject({
      totalAssets: 1_300,
      totalLiabilities: 100,
      netWorth: 1_200,
    })
    expect((await repository.getSnapshot()).transactions).toEqual([])
    await repository.clearAccountData()
  })

  it('reopens version-4 manual gold unchanged and enables pricing with an atomic snapshot', async () => {
    const repository = new DexieBudgetRepository()
    await repository.clearAccountData()
    const manual = manualGold('legacy-gold')
    const opening = manualValue(manual)
    await repository.createAsset(manual, { valuation: opening })
    const reopened = new DexieBudgetRepository()
    expect(await reopened.getAssetData()).toMatchObject({ assets: [manual], valuations: [opening] })
    const automatic = automatedGold(manual.id, manual.createdAt)
    await expect(repository.saveAsset(automatic)).rejects.toThrow('matching valuation')
    const imported = goldValue(automatic, 'enabled')
    await expect(repository.saveAsset(automatic, { ...imported, valueIdr: 1 })).rejects.toThrow()
    expect(await repository.getAssetData()).toMatchObject({ assets: [manual], valuations: [opening] })
    await repository.saveAsset(automatic, imported)
    const data = await reopened.getAssetData()
    expect(data.assets).toEqual([automatic])
    expect(data.valuations.sort((left, right) => left.recordedAt - right.recordedAt)).toEqual([opening, imported])
    await repository.saveAsset({ ...automatic, name: 'Renamed' })
    expect((await repository.getAssetData()).assets[0]?.goldPricing).toEqual(automatic.goldPricing)
    await expect(repository.saveAssetValuation({ ...opening, id: 'manual-override', asOfDate: localToday() })).rejects.toThrow('Disable automatic')
    await repository.clearAccountData()
  })

  it('deduplicates only the latest effective quote and appends corrections and reversions in stable order', async () => {
    const repository = new DexieBudgetRepository()
    await repository.clearAccountData()
    const asset = automatedGold('quote-history')
    const first = goldValue(asset, 'first')
    await repository.createAsset(asset, { valuation: first })
    await repository.saveAssetValuation(goldValue(asset, 'same'))
    expect((await repository.getAssetData()).valuations).toHaveLength(1)
    await repository.saveAssetValuation(goldValue(asset, 'changed', 12_700_000))
    await repository.saveAssetValuation(goldValue(asset, 'reverted'))
    const history = (await repository.getAssetData()).valuations.sort((a, b) => a.recordedAt - b.recordedAt)
    expect(history.map((item) => item.valueIdr)).toEqual([25_200_000, 25_400_000, 25_200_000])
    expect(history.map((item) => item.recordedAt)).toEqual([100, 101, 102])
    await expect(repository.saveAssetValuation({ ...first, goldQuote: undefined })).rejects.toThrow('Disable automatic')
    const changedUnits: AssetAccount = { ...asset, goldPricing: { ...asset.goldPricing!, units: '3', revision: 'revision-2' } }
    await repository.saveAsset(changedUnits, goldValue(changedUnits, 'units'))
    expect((await repository.getAssetData()).valuations.sort((left, right) => left.recordedAt - right.recordedAt).map((item) => item.quantity)).toEqual(['2', '2', '2', '3'])
    await repository.saveAssetValuation(goldValue(asset, 'obsolete-revision', 13_000_000))
    expect((await repository.getAssetData()).valuations).toHaveLength(4)
    const changedProduct: AssetAccount = { ...changedUnits, goldPricing: { ...changedUnits.goldPricing!, weightGrams: '1', revision: 'revision-3' } }
    await repository.saveAsset(changedProduct, goldValue(changedProduct, 'product', 2_565_000))
    expect((await repository.getAssetData()).valuations.find((item) => item.id === 'first')?.goldQuote?.weightGrams).toBe('5')
    const disabled = { ...changedProduct, goldPricing: undefined }
    await repository.saveAsset(disabled)
    const manual = { ...manualValue(disabled), id: 'manual-after-disable', asOfDate: localToday(), rateDate: localToday(), nativeAmountMinor: 39_000_000, valueIdr: 39_000_000, recordedAt: 100 }
    await repository.saveAssetValuation(manual)
    const finalData = await repository.getAssetData()
    expect(calculateFinancialPosition(finalData, localToday()).totalAssets).toBe(39_000_000)
    expect(finalData.valuations.find(item => item.id === manual.id)?.recordedAt).toBe(105)
    await repository.clearAccountData()
  })

  it('ignores obsolete imports after archive, disable and reset, including use-case preflight', async () => {
    const repository = new DexieBudgetRepository()
    const useCases = new AssetUseCases(repository)
    await repository.clearAccountData()
    const asset = automatedGold('obsolete-gold')
    await repository.createAsset(asset, { valuation: goldValue(asset, 'opening') })
    const pending = goldValue(asset, 'pending', 13_000_000)
    await repository.archiveAsset(asset.id, localToday())
    await useCases.saveValuation(pending)
    expect((await repository.getAssetData()).valuations).toHaveLength(1)
    await repository.clearAccountData()
    await repository.createAsset(asset, { valuation: goldValue(asset, 'new-opening') })
    const { goldPricing: _pricing, ...manual } = asset
    await repository.saveAsset(manual)
    await repository.saveAssetValuation(pending)
    expect((await repository.getAssetData()).valuations).toHaveLength(1)
    const manualSnapshot = { ...manualValue(manual), id: 'manual-after-disable', asOfDate: localToday() }
    await useCases.saveValuation(manualSnapshot)
    await expect(repository.saveAssetValuation(manualSnapshot)).rejects.toThrow()
    await repository.clearAccountData()
    await useCases.saveValuation(pending)
    await repository.saveAssetValuation(pending)
    expect((await repository.getAssetData()).assets).toEqual([])
    expect((await repository.getAssetData()).valuations).toEqual([])
  })

  it('notifies clear subscribers after commit and supports unsubscribing', async () => {
    const repository = new DexieBudgetRepository()
    await repository.clearAccountData()
    const asset = automatedGold('clear-gold')
    await repository.createAsset(asset, { valuation: goldValue(asset, 'opening') })
    const observations: Array<Promise<number>> = []
    const unsubscribe = repository.onAccountDataCleared(() => {
      observations.push(repository.getAssetData().then((data) => data.assets.length + data.valuations.length))
    })
    await repository.clearAccountData()
    expect(await Promise.all(observations)).toEqual([0])
    unsubscribe()
    await repository.clearAccountData()
    expect(observations).toHaveLength(1)
  })

  it('does not copy an unchanged cached quote into the next observation day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 9, 9, 12))
      const repository = new DexieBudgetRepository()
      await repository.clearAccountData()
      const asset = automatedGold('daily-dedup')
      const opening = goldValue(asset, 'opening')
      await repository.createAsset(asset, { valuation: opening })
      vi.setSystemTime(new Date(2026, 9, 10, 12))
      const cached = { ...goldValue(asset, 'cached'), goldQuote: opening.goldQuote }
      await repository.saveAssetValuation(cached)
      expect((await repository.getAssetData()).valuations).toEqual([opening])
      await repository.saveAssetValuation(goldValue(asset, 'new-provider-date'))
      expect((await repository.getAssetData()).valuations).toHaveLength(2)
      expect(calculateFinancialPosition(await repository.getAssetData(), '2026-10-09').totalAssets).toBe(25_200_000)
      await repository.clearAccountData()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects invalid new automation and unchanged revisions on changed holdings without partial writes', async () => {
    const repository = new DexieBudgetRepository()
    await repository.clearAccountData()
    const asset = automatedGold('invalid-gold')
    const opening = goldValue(asset, 'opening')
    await expect(repository.createAsset(asset, { valuation: { ...opening, nativeAmountMinor: 1 } })).rejects.toThrow()
    expect((await repository.getAssetData()).assets).toEqual([])
    await repository.createAsset(asset, { valuation: opening })
    const changed: AssetAccount = { ...asset, goldPricing: { ...asset.goldPricing!, units: '3' } }
    await expect(repository.saveAsset(changed, goldValue(changed, 'changed'))).rejects.toThrow('new holding revision')
    await expect(repository.saveAssetValuation({ ...goldValue(asset, 'invalid-repeat'), valueIdr: 1 })).rejects.toThrow()
    expect((await repository.getAssetData()).assets).toEqual([asset])
    expect((await repository.getAssetData()).valuations).toEqual([opening])
    await repository.clearAccountData()
  })
  it('persists ordered meter readings atomically, rejects unreconciled edits, and clears them on reset', async () => {
    const repository = new DexieBudgetRepository()
    const useCases = new ElectricityUseCases(repository)
    const today = '2026-01-03'
    const opening: TokenObservation = {
      id: 'electricity-opening', date: '2026-01-01', sequence: 0, remainingMilliKwh: 68_000,
      refillMilliKwh: null, refillCostIdr: null, refillSource: 'none',
    }
    const before: TokenObservation = {
      id: 'electricity-before', date: '2026-01-02', sequence: 0, remainingMilliKwh: 19_000,
      refillMilliKwh: null, refillCostIdr: null, refillSource: 'none',
    }
    const after: TokenObservation = {
      id: 'electricity-after', date: '2026-01-02', sequence: 0, remainingMilliKwh: 351_860,
      refillMilliKwh: 332_860, refillCostIdr: 500_000, refillSource: 'entered',
    }
    await useCases.saveObservation(opening, 0, today)
    await useCases.saveObservation(before, 0, today)
    await useCases.saveObservation(after, 1, today)
    expect(await repository.getObservations()).toMatchObject([
      { id: opening.id, sequence: 0 },
      { id: before.id, sequence: 0 },
      { id: after.id, sequence: 1 },
    ])

    await expect(useCases.saveObservation({ ...after, refillMilliKwh: 332_859 }, 1, today, after.id)).rejects.toThrow(/does not reconcile/i)
    expect(await new DexieBudgetRepository().getObservations()).toEqual(await repository.getObservations())

    await repository.clearAccountData()
    expect(await repository.getObservations()).toEqual([])
  })

})

function manualGold(id: string): AssetAccount {
  return { id, name: 'Gold', type: 'GOLD', institution: 'Personal', nativeCurrency: 'IDR', balanceMode: 'VALUATION', createdAt: '2024-01-01' }
}

function manualValue(asset: AssetAccount): AssetValuation {
  return {
    id: `${asset.id}-manual`, assetId: asset.id, asOfDate: asset.createdAt, recordedAt: 1,
    valueIdr: 500, nativeAmountMinor: 500, nativeCurrency: 'IDR', exchangeRate: '1',
    rateDate: asset.createdAt, source: 'MANUAL', quantity: '2', unitPrice: '100',
  }
}

function automatedGold(id: string, createdAt = localToday()): AssetAccount {
  return {
    ...manualGold(id), createdAt,
    goldPricing: { source: 'logammulia', materialType: 'Emas Batangan', weightGrams: '5', lineKey: '', units: '2', revision: 'revision-1' },
  }
}

function goldValue(asset: AssetAccount, id: string, sellPrice = 12_600_000): AssetValuation {
  const quote: GoldPriceQuote = { ...asset.goldPricing!, displayName: 'Antam', sellPrice, recordedDate: localToday() }
  return createGoldValuation(asset, quote, localToday(), 100, id)
}
