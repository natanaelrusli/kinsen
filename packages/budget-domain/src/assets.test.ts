import { describe, expect, it } from 'vitest'
import {
  calculateAssetPeriodComparison,
  calculateGoldValueIdr,
  createGoldValuation,
  normalizeGoldDecimal,
  calculateFinancialPosition,
  convertMinorUnitsToIdr,
  daysSince,
  deriveAssetValue,
  parseAmountToMinorUnits,
  validateAssetData,
} from './assets.js'
import type { AssetAccount, AssetData, AssetEntry, AssetValuation, LiabilityAccount } from './assets.js'

const bank: AssetAccount = {
  id: 'bank', name: 'Daily account', type: 'BANK_ACCOUNT', institution: 'BCA', purpose: 'DAILY_CASH',
  nativeCurrency: 'IDR', balanceMode: 'LEDGER', createdAt: '2024-01-01',
}
const wallet: AssetAccount = {
  id: 'wallet', name: 'Wallet', type: 'E_WALLET', institution: 'SeaBank', purpose: 'PROTECTED_SAVINGS',
  nativeCurrency: 'IDR', balanceMode: 'LEDGER', createdAt: '2024-01-01',
}
const fund: AssetAccount = {
  id: 'fund', name: 'Index fund', type: 'MUTUAL_FUND', institution: 'Bibit', purpose: 'INVESTMENT',
  nativeCurrency: 'IDR', balanceMode: 'VALUATION', createdAt: '2024-01-01',
}

function baseData(): AssetData {
  const assetEntries: AssetEntry[] = [
    { id: 'bank-open', assetId: 'bank', date: '2024-01-01', kind: 'OPENING_BALANCE', amountMinor: 1_000 },
    { id: 'wallet-open', assetId: 'wallet', date: '2024-01-01', kind: 'OPENING_BALANCE', amountMinor: 200 },
    { id: 'deposit', assetId: 'bank', date: '2024-01-10', kind: 'CREDIT', amountMinor: 150 },
    { id: 'purchase', assetId: 'bank', date: '2024-01-12', kind: 'DEBIT', amountMinor: 50 },
    { id: 'transfer-out', assetId: 'bank', date: '2024-01-14', kind: 'TRANSFER_OUT', amountMinor: 100, transferId: 'move-1' },
    { id: 'transfer-in', assetId: 'wallet', date: '2024-01-14', kind: 'TRANSFER_IN', amountMinor: 100, transferId: 'move-1' },
  ]
  const valuations: AssetValuation[] = [
    { id: 'fund-open', assetId: 'fund', asOfDate: '2024-01-01', nativeAmountMinor: 300, nativeCurrency: 'IDR', exchangeRate: '1', rateDate: '2024-01-01', valueIdr: 300, source: 'MANUAL', recordedAt: 1 },
    { id: 'fund-current', assetId: 'fund', asOfDate: '2024-01-08', nativeAmountMinor: 400, nativeCurrency: 'IDR', exchangeRate: '1', rateDate: '2024-01-08', valueIdr: 400, source: 'MANUAL', recordedAt: 2 },
    { id: 'fund-future', assetId: 'fund', asOfDate: '2024-02-01', nativeAmountMinor: 900, nativeCurrency: 'IDR', exchangeRate: '1', rateDate: '2024-02-01', valueIdr: 900, source: 'MANUAL', recordedAt: 3 },
  ]
  return { assets: [bank, wallet, fund], assetEntries, valuations, liabilities: [], liabilityEntries: [] }
}

describe('automatic gold snapshots', () => {
  const gold: AssetAccount = {
    ...fund, id: 'gold', type: 'GOLD',
    goldPricing: { source: 'logammulia', materialType: 'Emas Batangan', weightGrams: '5', lineKey: '', units: '2', revision: 'one' },
  }
  const quote = { source: 'logammulia' as const, materialType: 'Emas Batangan', weightGrams: '5', lineKey: '', displayName: 'Antam', sellPrice: 12_600_000, recordedDate: '2024-01-15' }
  it('uses exact package arithmetic and rejects unsafe or ambiguous decimals', () => {
    expect(calculateGoldValueIdr('2', 12_600_000)).toBe(25_200_000)
    expect(calculateGoldValueIdr('0.5', 101)).toBe(51)
    expect(calculateGoldValueIdr('0', 101)).toBe(0)
    expect(normalizeGoldDecimal('0002.5000')).toBe('2.5')
    for (const invalid of ['-1', '1e2', '1,000', '0.000000001', ' 2']) {
      expect(() => normalizeGoldDecimal(invalid)).toThrow()
    }
    expect(() => calculateGoldValueIdr('9007199254740992', 1)).toThrow(/safely/)
  })
  it('freezes provenance, preserves earlier manual history and validates only gold math', () => {
    const manual: AssetValuation = { id: 'old', assetId: gold.id, asOfDate: '2024-01-01', nativeAmountMinor: 100, nativeCurrency: 'IDR', exchangeRate: '1', rateDate: '2024-01-01', valueIdr: 100, quantity: '7', unitPrice: '3', source: 'MANUAL', recordedAt: 1 }
    const imported = createGoldValuation(gold, quote, '2024-01-16', 2, 'new')
    const data: AssetData = { assets: [gold], valuations: [manual, imported], assetEntries: [], liabilities: [], liabilityEntries: [] }
    validateAssetData(data)
    expect(imported.valueIdr).toBe(25_200_000)
    expect(deriveAssetValue(gold, data, '2024-01-15')).toBe(100)
    expect(deriveAssetValue(gold, data, '2024-01-16')).toBe(25_200_000)
    expect(() => validateAssetData({ ...data, valuations: [{ ...imported, quantity: '3' }] })).toThrow(/gold value/)
    validateAssetData({ ...data, assets: [{ ...gold, goldPricing: undefined, type: 'OTHER' }] })
    expect(() => createGoldValuation(gold, { ...quote, weightGrams: '1' }, '2024-01-16', 3, 'bad')).toThrow(/match/)
    expect(() => createGoldValuation(gold, quote, '2024-01-14', 3, 'bad')).toThrow(/dated/)
  })
})

describe('asset domain calculations', () => {
  it('derives cash balances from dated entries and ignores future valuations', () => {
    const data = baseData()
    expect(deriveAssetValue(bank, data, '2024-01-13')).toBe(1_100)
    expect(deriveAssetValue(fund, data, '2024-01-31')).toBe(400)
    expect(deriveAssetValue(fund, data, '2024-02-01')).toBe(900)
  })

  it('keeps total assets unchanged for paired tracked-account transfers', () => {
    const data = baseData()
    validateAssetData(data)
    expect(calculateFinancialPosition(data, '2024-01-13').totalAssets).toBe(1_700)
    expect(calculateFinancialPosition(data, '2024-01-14').totalAssets).toBe(1_700)
    const oneSided = { ...data, assetEntries: data.assetEntries.filter((entry) => entry.id !== 'transfer-in') }
    expect(() => validateAssetData(oneSided)).toThrow(/transfer/i)
  })

  it('settles a liability from cash without changing net worth or creating budget spending', () => {
    const data = baseData()
    const liability: LiabilityAccount = {
      id: 'card', name: 'Card bill', type: 'CREDIT_CARD', institution: 'BCA', nativeCurrency: 'IDR', createdAt: '2024-01-01',
    }
    data.liabilities.push(liability)
    data.liabilityEntries.push({ id: 'card-open', liabilityId: 'card', date: '2024-01-01', kind: 'OPENING_BALANCE', amountMinor: 250 })
    data.assetEntries.push({ id: 'cash-payment', assetId: 'bank', date: '2024-01-15', kind: 'DEBIT', amountMinor: 50, liabilityEntryId: 'card-payment' })
    data.liabilityEntries.push({ id: 'card-payment', liabilityId: 'card', date: '2024-01-15', kind: 'PAYMENT', amountMinor: 50, assetEntryId: 'cash-payment' })
    validateAssetData(data)
    const position = calculateFinancialPosition(data, '2024-01-15')
    expect(position.totalAssets).toBe(1_650)
    expect(position.totalLiabilities).toBe(200)
    expect(position.netWorth).toBe(1_450)
  })

  it('compares explicit dates and separates external flows from internal transfers', () => {
    const comparison = calculateAssetPeriodComparison(baseData(), '2024-01-10', '2024-01-31')
    expect(comparison).toMatchObject({
      startDate: '2024-01-09', endDate: '2024-01-31', startValue: 1_600, endValue: 1_700,
      change: 100, contributions: 150, withdrawals: 50, adjustments: 0,
    })
    expect(comparison.changePercent).toBeCloseTo(6.25)
    expect(calculateAssetPeriodComparison(baseData(), '2024-01-01', '2024-01-09').changePercent).toBeNull()
  })

  it('converts native minor units with exact decimal arithmetic and whole-rupiah rounding', () => {
    expect(parseAmountToMinorUnits('123.45', 'USD')).toBe(12_345)
    expect(convertMinorUnitsToIdr(12_345, 'USD', '15000.125')).toBe(1_851_765)
    expect(convertMinorUnitsToIdr(1, 'USD', '150')).toBe(2)
    expect(parseAmountToMinorUnits('1.234', 'KWD')).toBe(1_234)
    expect(() => parseAmountToMinorUnits('1.001', 'IDR')).toThrow(/decimal place/i)
    expect(() => parseAmountToMinorUnits('10', 'ZZZ')).toThrow(/unsupported currency/i)
    expect(() => parseAmountToMinorUnits('9007199254740992', 'IDR')).toThrow(/safely/i)
    expect(() => convertMinorUnitsToIdr(100, 'USD', '0')).toThrow(/greater than zero/i)
  })

  it('validates reproducible valuation values and date-only stale age', () => {
    const data = baseData()
    data.valuations[1]!.valueIdr = 401
    expect(() => validateAssetData(data)).toThrow(/does not match/i)
    expect(daysSince('2024-02-01', '2024-01-01')).toBe(31)
  })
})
