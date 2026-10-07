import type { DateOnly } from './model.js'
import { addDays, compareDates, daysBetween, parseDateOnly } from './date-only.js'

export type AssetType =
  | 'CASH'
  | 'BANK_ACCOUNT'
  | 'E_WALLET'
  | 'DEPOSIT'
  | 'MUTUAL_FUND'
  | 'STOCK_ETF'
  | 'GOLD'
  | 'FOREIGN_CURRENCY'
  | 'OTHER'
export type AssetPurpose = 'DAILY_CASH' | 'PROTECTED_SAVINGS' | 'INVESTMENT' | 'OTHER'
export type AssetBalanceMode = 'LEDGER' | 'VALUATION'
export type AssetEntryKind = 'OPENING_BALANCE' | 'CREDIT' | 'DEBIT' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'CORRECTION'
export type LiabilityType = 'CREDIT_CARD' | 'PAY_LATER' | 'INSTALLMENT' | 'LOAN' | 'OTHER'
export type LiabilityEntryKind = 'OPENING_BALANCE' | 'CHARGE' | 'PAYMENT' | 'INTEREST_OR_FEE' | 'CORRECTION'

export interface AssetAccount {
  id: string
  name: string
  type: AssetType
  institution: string
  purpose?: AssetPurpose
  nativeCurrency: string
  balanceMode: AssetBalanceMode
  notes?: string
  createdAt: DateOnly
  archivedAt?: DateOnly
}

export interface AssetEntry {
  id: string
  assetId: string
  date: DateOnly
  kind: AssetEntryKind
  /** Positive for normal entries; signed only for CORRECTION. */
  amountMinor: number
  transferId?: string
  budgetTransactionId?: string
  liabilityEntryId?: string
  note?: string
}

export interface AssetValuation {
  id: string
  assetId: string
  asOfDate: DateOnly
  nativeAmountMinor: number
  nativeCurrency: string
  /** Exact positive decimal string, in IDR per native currency unit. */
  exchangeRate: string
  rateDate: DateOnly
  valueIdr: number
  quantity?: string
  unitPrice?: string
  source: 'MANUAL' | 'IMPORTED'
  note?: string
  /** Stable latest-record ordering for multiple valuations on the same date. */
  recordedAt: number
}

export interface LiabilityAccount {
  id: string
  name: string
  type: LiabilityType
  institution: string
  nativeCurrency: string
  notes?: string
  createdAt: DateOnly
  archivedAt?: DateOnly
}

export interface LiabilityEntry {
  id: string
  liabilityId: string
  date: DateOnly
  kind: LiabilityEntryKind
  /** Positive for normal entries; signed only for CORRECTION. */
  amountMinor: number
  assetEntryId?: string
  budgetTransactionId?: string
  note?: string
}

export interface AssetData {
  assets: AssetAccount[]
  assetEntries: AssetEntry[]
  valuations: AssetValuation[]
  liabilities: LiabilityAccount[]
  liabilityEntries: LiabilityEntry[]
}

export interface FinancialPosition {
  asOfDate: DateOnly
  totalAssets: number
  dailyUseCash: number
  protectedSavings: number
  investmentValue: number
  totalLiabilities: number
  netWorth: number | null
  byType: Partial<Record<AssetType, number>>
  byPurpose: Partial<Record<AssetPurpose | 'UNASSIGNED', number>>
  byInstitution: Record<string, number>
}

export interface AssetPeriodComparison {
  rangeStart: DateOnly
  rangeEnd: DateOnly
  /** Value at the close of the day immediately before rangeStart. */
  startDate: DateOnly
  endDate: DateOnly
  startValue: number
  endValue: number
  change: number
  changePercent: number | null
  contributions: number
  withdrawals: number
  adjustments: number
}

const currencyFractionDigits: Readonly<Record<string, number>> = {
  IDR: 0, USD: 2, SGD: 2, JPY: 0, EUR: 2, MYR: 2, GBP: 2, AUD: 2, CAD: 2,
  CNY: 2, KRW: 0, THB: 2, PHP: 2, INR: 2, CHF: 2, NZD: 2, HKD: 2, TWD: 2,
  VND: 0, AED: 2, SAR: 2, BND: 2, SEK: 2, NOK: 2, DKK: 2, ZAR: 2, RUB: 2,
  KWD: 3, BHD: 3,
}

const ledgerAssetTypes = new Set<AssetType>(['CASH', 'BANK_ACCOUNT', 'E_WALLET', 'DEPOSIT'])
const investmentAssetTypes = new Set<AssetType>(['MUTUAL_FUND', 'STOCK_ETF', 'GOLD', 'FOREIGN_CURRENCY'])

export const assetTypeLabels: Readonly<Record<AssetType, string>> = {
  CASH: 'Cash',
  BANK_ACCOUNT: 'Bank account',
  E_WALLET: 'E-wallet',
  DEPOSIT: 'Deposit',
  MUTUAL_FUND: 'Mutual fund',
  STOCK_ETF: 'Stock / ETF',
  GOLD: 'Gold / precious metal',
  FOREIGN_CURRENCY: 'Foreign currency',
  OTHER: 'Other asset',
}

export const liabilityTypeLabels: Readonly<Record<LiabilityType, string>> = {
  CREDIT_CARD: 'Credit card',
  PAY_LATER: 'Paylater',
  INSTALLMENT: 'Installment',
  LOAN: 'Loan',
  OTHER: 'Other liability',
}

export function assetBalanceMode(type: AssetType): AssetBalanceMode {
  return ledgerAssetTypes.has(type) ? 'LEDGER' : 'VALUATION'
}

export function supportedAssetCurrencies(): string[] {
  return Object.keys(currencyFractionDigits)
}

export function currencyDigits(currency: string): number {
  const digits = currencyFractionDigits[currency]
  if (digits === undefined) throw new Error(`Unsupported currency code: ${currency || '(empty)'}.`)
  return digits
}

/** Parses a decimal major-unit amount without passing through binary floating point. */
export function parseAmountToMinorUnits(value: string, currency: string, allowNegative = false): number {
  const digits = currencyDigits(currency)
  const normalized = value.trim()
  const match = normalized.match(allowNegative ? /^(-?)(\d+)(?:\.(\d+))?$/ : /^(\d+)(?:\.(\d+))?$/)
  if (!match) throw new Error('Enter a valid amount using digits and a decimal point only.')
  const sign = allowNegative && match[1] === '-' ? -1n : 1n
  const wholeText = allowNegative ? match[2]! : match[1]!
  const fractionText = allowNegative ? match[3] ?? '' : match[2] ?? ''
  if (fractionText.length > digits) throw new Error(`${currency} supports at most ${digits} decimal place${digits === 1 ? '' : 's'}.`)
  const scale = 10n ** BigInt(digits)
  const fraction = digits === 0 ? 0n : BigInt(fractionText.padEnd(digits, '0') || '0')
  const valueMinor = (BigInt(wholeText) * scale + fraction) * sign
  if (valueMinor > BigInt(Number.MAX_SAFE_INTEGER) || valueMinor < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('Amount is too large to store safely.')
  }
  return Number(valueMinor)
}

/** Converts native minor units to whole IDR, rounding half up with integer arithmetic. */
export function convertMinorUnitsToIdr(nativeAmountMinor: number, currency: string, exchangeRate: string): number {
  assertSafeInteger(nativeAmountMinor, 'Native amount')
  if (nativeAmountMinor < 0) throw new Error('Native amount cannot be negative.')
  const digits = currencyDigits(currency)
  const rateMatch = exchangeRate.match(/^(\d+)(?:\.(\d{1,8}))?$/)
  if (!rateMatch) throw new Error('Exchange rate must be a positive decimal with up to 8 decimal places.')
  const rateScale = rateMatch[2]?.length ?? 0
  const scale = 10n ** BigInt(rateScale)
  const rateNumerator = BigInt(rateMatch[1]!) * scale + BigInt(rateMatch[2] ?? '0')
  if (rateNumerator <= 0n) throw new Error('Exchange rate must be greater than zero.')
  const denominator = 10n ** BigInt(digits + rateScale)
  const numerator = BigInt(nativeAmountMinor) * rateNumerator
  const rounded = (numerator * 2n + denominator) / (denominator * 2n)
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('IDR value is too large to store safely.')
  return Number(rounded)
}

export function deriveLedgerBalance(entries: readonly AssetEntry[], asOfDate: DateOnly): number {
  parseDateOnly(asOfDate)
  let balance = 0n
  for (const entry of entries) {
    if (compareDates(entry.date, asOfDate) > 0) continue
    const amount = BigInt(entry.amountMinor)
    switch (entry.kind) {
      case 'OPENING_BALANCE':
      case 'CREDIT':
      case 'TRANSFER_IN':
        balance += amount
        break
      case 'DEBIT':
      case 'TRANSFER_OUT':
        balance -= amount
        break
      case 'CORRECTION':
        balance += amount
        break
    }
  }
  if (balance > BigInt(Number.MAX_SAFE_INTEGER) || balance < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Asset balance exceeds the safe integer range.')
  return Number(balance)
}

export function deriveAssetValue(asset: AssetAccount, data: Pick<AssetData, 'assetEntries' | 'valuations'>, asOfDate: DateOnly): number {
  parseDateOnly(asOfDate)
  if (!isAssetActiveOn(asset, asOfDate)) return 0
  if (asset.balanceMode === 'LEDGER') {
    return deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === asset.id), asOfDate)
  }
  const latest = data.valuations
    .filter((valuation) => valuation.assetId === asset.id && compareDates(valuation.asOfDate, asOfDate) <= 0)
    .sort((left, right) => compareDates(right.asOfDate, left.asOfDate) || right.recordedAt - left.recordedAt || right.id.localeCompare(left.id))[0]
  return latest?.valueIdr ?? 0
}

export function deriveLiabilityBalance(entries: readonly LiabilityEntry[], asOfDate: DateOnly): number {
  parseDateOnly(asOfDate)
  let balance = 0n
  for (const entry of entries) {
    if (compareDates(entry.date, asOfDate) > 0) continue
    const amount = BigInt(entry.amountMinor)
    switch (entry.kind) {
      case 'OPENING_BALANCE':
      case 'CHARGE':
      case 'INTEREST_OR_FEE':
        balance += amount
        break
      case 'PAYMENT':
        balance -= amount
        break
      case 'CORRECTION':
        balance += amount
        break
    }
  }
  if (balance > BigInt(Number.MAX_SAFE_INTEGER) || balance < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error('Liability balance exceeds the safe integer range.')
  return Number(balance)
}

export function deriveAssetValues(data: AssetData, asOfDate: DateOnly): Map<string, number> {
  parseDateOnly(asOfDate)
  const entriesByAsset = groupBy(data.assetEntries, (entry) => entry.assetId)
  const valuationsByAsset = groupBy(data.valuations, (valuation) => valuation.assetId)
  const values = new Map<string, number>()
  for (const asset of data.assets) {
    if (!isAssetActiveOn(asset, asOfDate)) continue
    values.set(asset.id, deriveAssetValueFromRecords(asset, entriesByAsset.get(asset.id) ?? [], valuationsByAsset.get(asset.id) ?? [], asOfDate))
  }
  return values
}

export function calculateFinancialPosition(data: AssetData, asOfDate: DateOnly): FinancialPosition {
  parseDateOnly(asOfDate)
  const position: FinancialPosition = {
    asOfDate,
    totalAssets: 0,
    dailyUseCash: 0,
    protectedSavings: 0,
    investmentValue: 0,
    totalLiabilities: 0,
    netWorth: null,
    byType: {},
    byPurpose: {},
    byInstitution: {},
  }
  const assetValues = deriveAssetValues(data, asOfDate)
  const entriesByLiability = groupBy(data.liabilityEntries, (entry) => entry.liabilityId)
  let hasPositionData = false
  for (const asset of data.assets) {
    if (!isAssetActiveOn(asset, asOfDate)) continue
    hasPositionData = true
    const value = assetValues.get(asset.id) ?? 0
    position.totalAssets = safeAdd(position.totalAssets, value)
    position.byType[asset.type] = safeAdd(position.byType[asset.type] ?? 0, value)
    const purpose = asset.purpose ?? 'UNASSIGNED'
    position.byPurpose[purpose] = safeAdd(position.byPurpose[purpose] ?? 0, value)
    position.byInstitution[asset.institution] = safeAdd(position.byInstitution[asset.institution] ?? 0, value)
    if (asset.purpose === 'DAILY_CASH') position.dailyUseCash = safeAdd(position.dailyUseCash, value)
    if (asset.purpose === 'PROTECTED_SAVINGS') position.protectedSavings = safeAdd(position.protectedSavings, value)
    if (asset.purpose === 'INVESTMENT' || investmentAssetTypes.has(asset.type)) position.investmentValue = safeAdd(position.investmentValue, value)
  }
  for (const liability of data.liabilities) {
    if (!isLiabilityActiveOn(liability, asOfDate)) continue
    hasPositionData = true
    const balance = deriveLiabilityBalance(entriesByLiability.get(liability.id) ?? [], asOfDate)
    position.totalLiabilities = safeAdd(position.totalLiabilities, balance)
  }
  if (hasPositionData) position.netWorth = position.totalAssets - position.totalLiabilities
  return position
}

function deriveAssetValueFromRecords(asset: AssetAccount, entries: readonly AssetEntry[], valuations: readonly AssetValuation[], asOfDate: DateOnly): number {
  if (asset.balanceMode === 'LEDGER') return deriveLedgerBalance(entries, asOfDate)
  let latest: AssetValuation | undefined
  for (const valuation of valuations) {
    if (compareDates(valuation.asOfDate, asOfDate) > 0) continue
    if (!latest || compareDates(valuation.asOfDate, latest.asOfDate) > 0
      || (valuation.asOfDate === latest.asOfDate && (valuation.recordedAt > latest.recordedAt
        || (valuation.recordedAt === latest.recordedAt && valuation.id.localeCompare(latest.id) > 0)))) latest = valuation
  }
  return latest?.valueIdr ?? 0
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}

export function calculateAssetPeriodComparison(data: AssetData, rangeStart: DateOnly, rangeEnd: DateOnly): AssetPeriodComparison {
  parseDateOnly(rangeStart)
  parseDateOnly(rangeEnd)
  if (compareDates(rangeStart, rangeEnd) > 0) throw new Error('The start date must be on or before the end date.')
  const startDate = addDays(rangeStart, -1)
  const startValue = calculateFinancialPosition(data, startDate).totalAssets
  const endValue = calculateFinancialPosition(data, rangeEnd).totalAssets
  let contributions = 0
  let withdrawals = 0
  let adjustments = 0
  for (const entry of data.assetEntries) {
    if (compareDates(entry.date, rangeStart) < 0 || compareDates(entry.date, rangeEnd) > 0) continue
    if (entry.kind === 'CREDIT') contributions = safeAdd(contributions, entry.amountMinor)
    if (entry.kind === 'DEBIT') withdrawals = safeAdd(withdrawals, entry.amountMinor)
    if (entry.kind === 'CORRECTION') adjustments = safeAdd(adjustments, entry.amountMinor)
  }
  const change = endValue - startValue
  return {
    rangeStart,
    rangeEnd,
    startDate,
    endDate: rangeEnd,
    startValue,
    endValue,
    change,
    changePercent: startValue > 0 ? change / startValue * 100 : null,
    contributions,
    withdrawals,
    adjustments,
  }
}

export function validateAssetData(data: AssetData): void {
  const assets = uniqueById(data.assets, 'asset')
  const liabilities = uniqueById(data.liabilities, 'liability')
  uniqueById(data.assetEntries, 'asset activity')
  uniqueById(data.valuations, 'valuation')
  uniqueById(data.liabilityEntries, 'liability activity')

  const openingAssets = new Set<string>()
  const openingLiabilities = new Set<string>()
  const budgetLinks = new Set<string>()
  const transfers = new Map<string, AssetEntry[]>()
  for (const asset of data.assets) validateAssetAccount(asset)
  for (const liability of data.liabilities) validateLiabilityAccount(liability)

  for (const entry of data.assetEntries) {
    const asset = assets.get(entry.assetId)
    if (!asset) throw new Error('Asset activity refers to an unknown account.')
    parseDateOnly(entry.date)
    if (compareDates(entry.date, asset.createdAt) < 0) throw new Error('Asset activity cannot be dated before the account existed.')
    if (!['OPENING_BALANCE', 'CREDIT', 'DEBIT', 'TRANSFER_IN', 'TRANSFER_OUT', 'CORRECTION'].includes(entry.kind)) throw new Error('Unsupported asset activity type.')
    assertSafeInteger(entry.amountMinor, 'Asset activity amount')
    if (entry.kind !== 'CORRECTION' && entry.amountMinor < 0) throw new Error('Asset activity amounts must be non-negative.')
    if (entry.kind === 'CORRECTION' && entry.amountMinor === 0) throw new Error('A correction must change the balance.')
    if (entry.kind !== 'CORRECTION' && entry.kind !== 'OPENING_BALANCE' && entry.amountMinor === 0) throw new Error('Activity amount must be greater than zero.')
    if (asset.balanceMode !== 'LEDGER') throw new Error('Valuation-mode assets cannot have ledger activity.')
    if (entry.kind === 'OPENING_BALANCE') {
      if (openingAssets.has(entry.assetId)) throw new Error('An asset can have only one opening balance.')
      openingAssets.add(entry.assetId)
    }
    if (entry.kind === 'TRANSFER_IN' || entry.kind === 'TRANSFER_OUT') {
      if (!entry.transferId) throw new Error('Both sides of a transfer must share a transfer ID.')
      const pair = transfers.get(entry.transferId) ?? []
      pair.push(entry)
      transfers.set(entry.transferId, pair)
      if (entry.budgetTransactionId || entry.liabilityEntryId) throw new Error('Transfers cannot be linked to expenses or liabilities.')
    } else if (entry.transferId) {
      throw new Error('Only transfer activity may have a transfer ID.')
    }
    if (entry.budgetTransactionId) {
      if (entry.kind !== 'DEBIT' || budgetLinks.has(entry.budgetTransactionId)) throw new Error('A budget expense can link to only one asset debit.')
      budgetLinks.add(entry.budgetTransactionId)
    }
    if (entry.budgetTransactionId && entry.liabilityEntryId) throw new Error('An asset debit cannot be both a budget expense and a liability settlement.')
    if (entry.liabilityEntryId && entry.kind !== 'DEBIT') throw new Error('A liability settlement must debit a cash-like asset.')
    if (entry.kind === 'CORRECTION' && !entry.note?.trim()) throw new Error('A correction needs a reason.')
    if (entry.note !== undefined && entry.note.length > 500) throw new Error('Activity notes must be 500 characters or fewer.')
  }
  for (const [transferId, pair] of transfers) {
    if (pair.length !== 2 || pair[0]!.kind === pair[1]!.kind || pair[0]!.amountMinor !== pair[1]!.amountMinor || pair[0]!.assetId === pair[1]!.assetId || pair[0]!.date !== pair[1]!.date) {
      throw new Error(`Transfer ${transferId} must contain equal, same-date entries between two different assets.`)
    }
  }

  for (const asset of data.assets) {
    const entries = data.assetEntries.filter((entry) => entry.assetId === asset.id)
    if (asset.balanceMode === 'LEDGER') {
      if (asset.nativeCurrency !== 'IDR') throw new Error('Cash-like ledger accounts must use IDR; use a foreign-currency valuation for other currencies.')
      validateNonnegativeHistory(entries, (entry) => entry.kind === 'CORRECTION' ? entry.amountMinor : entry.kind === 'DEBIT' || entry.kind === 'TRANSFER_OUT' ? -entry.amountMinor : entry.amountMinor)
    }
  }

  for (const valuation of data.valuations) {
    const asset = assets.get(valuation.assetId)
    if (!asset) throw new Error('Valuation refers to an unknown asset.')
    if (asset.balanceMode !== 'VALUATION') throw new Error('Ledger-mode assets cannot have valuation snapshots.')
    parseDateOnly(valuation.asOfDate)
    if (compareDates(valuation.asOfDate, asset.createdAt) < 0) throw new Error('Valuation cannot be dated before the asset existed.')
    parseDateOnly(valuation.rateDate)
    if (compareDates(valuation.rateDate, valuation.asOfDate) > 0) throw new Error('The FX rate date cannot be after the valuation date.')
    if (valuation.nativeCurrency !== asset.nativeCurrency) throw new Error('Valuation currency must match the asset currency.')
    assertSafeInteger(valuation.nativeAmountMinor, 'Native valuation amount')
    assertSafeInteger(valuation.valueIdr, 'IDR valuation')
    assertSafeInteger(valuation.recordedAt, 'Valuation record time')
    if (valuation.nativeAmountMinor < 0 || valuation.valueIdr < 0) throw new Error('Valuation amounts cannot be negative.')
    if (convertMinorUnitsToIdr(valuation.nativeAmountMinor, valuation.nativeCurrency, valuation.exchangeRate) !== valuation.valueIdr) {
      throw new Error('The saved IDR value does not match its native amount and exchange rate.')
    }
    validateOptionalDecimal(valuation.quantity, 'Quantity')
    validateOptionalDecimal(valuation.unitPrice, 'Unit price')
    if (valuation.note !== undefined && valuation.note.length > 500) throw new Error('Valuation notes must be 500 characters or fewer.')
  }

  const liabilityLinks = new Map<string, LiabilityEntry>()
  for (const entry of data.liabilityEntries) {
    const liability = liabilities.get(entry.liabilityId)
    if (!liability) throw new Error('Liability activity refers to an unknown account.')
    parseDateOnly(entry.date)
    if (compareDates(entry.date, liability.createdAt) < 0) throw new Error('Liability activity cannot be dated before the account existed.')
    assertSafeInteger(entry.amountMinor, 'Liability activity amount')
    if (entry.kind !== 'CORRECTION' && entry.amountMinor < 0) throw new Error('Liability activity amounts must be non-negative.')
    if (entry.kind === 'CORRECTION' && entry.amountMinor === 0) throw new Error('A correction must change the balance.')
    if (entry.kind !== 'CORRECTION' && entry.kind !== 'OPENING_BALANCE' && entry.amountMinor === 0) throw new Error('Activity amount must be greater than zero.')
    if (!['OPENING_BALANCE', 'CHARGE', 'PAYMENT', 'INTEREST_OR_FEE', 'CORRECTION'].includes(entry.kind)) throw new Error('Unsupported liability activity type.')
    if (entry.kind === 'OPENING_BALANCE') {
      if (openingLiabilities.has(entry.liabilityId)) throw new Error('A liability can have only one opening balance.')
      openingLiabilities.add(entry.liabilityId)
    }
    if (entry.assetEntryId) {
      if (entry.kind !== 'PAYMENT') throw new Error('Only a liability payment can settle from an asset account.')
      if (liabilityLinks.has(entry.assetEntryId)) throw new Error('An asset debit can settle only one liability payment.')
      liabilityLinks.set(entry.assetEntryId, entry)
    } else if (entry.kind === 'PAYMENT') {
      throw new Error('A liability payment must link to the cash asset debit that settled it.')
    }
    if (liability.nativeCurrency !== 'IDR') throw new Error('Liability accounts must use IDR for reproducible net-worth totals.')
    if (entry.note !== undefined && entry.note.length > 500) throw new Error('Liability notes must be 500 characters or fewer.')
    if (entry.kind === 'CORRECTION' && !entry.note?.trim()) throw new Error('A liability correction needs a reason.')
  }
  for (const entry of data.assetEntries) {
    if (entry.liabilityEntryId) {
      const linked = data.liabilityEntries.find((item) => item.id === entry.liabilityEntryId)
      if (entry.kind !== 'DEBIT' || linked?.assetEntryId !== entry.id || linked.amountMinor !== entry.amountMinor || linked.date !== entry.date) {
        throw new Error('Asset and liability settlement entries must be paired and equal.')
      }
    }
  }
  for (const [assetEntryId, entry] of liabilityLinks) {
    const assetEntry = data.assetEntries.find((item) => item.id === assetEntryId)
    if (!assetEntry || assetEntry.liabilityEntryId !== entry.id || assetEntry.amountMinor !== entry.amountMinor || assetEntry.date !== entry.date) {
      throw new Error('Asset and liability settlement entries must be paired and equal.')
    }
  }
  for (const liability of data.liabilities) {
    const entries = data.liabilityEntries.filter((entry) => entry.liabilityId === liability.id)
    validateNonnegativeHistory(entries, (entry) => entry.kind === 'CORRECTION' ? entry.amountMinor : entry.kind === 'PAYMENT' ? -entry.amountMinor : entry.amountMinor)
  }
}

export function validateAssetAccount(asset: AssetAccount): void {
  requireText(asset.id, 'Asset ID')
  requireText(asset.name, 'Asset name')
  requireText(asset.institution, 'Holding place')
  if (!Object.hasOwn(assetTypeLabels, asset.type)) throw new Error('Choose a supported asset type.')
  if (asset.balanceMode !== assetBalanceMode(asset.type)) throw new Error('The balance method does not match the asset type.')
  currencyDigits(asset.nativeCurrency)
  if (asset.balanceMode === 'LEDGER' && asset.nativeCurrency !== 'IDR') throw new Error('Cash-like ledger accounts must use IDR.')
  if (asset.purpose !== undefined && !['DAILY_CASH', 'PROTECTED_SAVINGS', 'INVESTMENT', 'OTHER'].includes(asset.purpose)) throw new Error('Choose a supported asset purpose.')
  if (asset.notes !== undefined && asset.notes.length > 1000) throw new Error('Asset notes must be 1,000 characters or fewer.')
  parseDateOnly(asset.createdAt)
  if (asset.archivedAt) {
    parseDateOnly(asset.archivedAt)
    if (compareDates(asset.archivedAt, asset.createdAt) < 0) throw new Error('Archive date cannot be before the asset was created.')
  }
}

export function validateLiabilityAccount(liability: LiabilityAccount): void {
  requireText(liability.id, 'Liability ID')
  requireText(liability.name, 'Liability name')
  requireText(liability.institution, 'Holding place')
  if (!Object.hasOwn(liabilityTypeLabels, liability.type)) throw new Error('Choose a supported liability type.')
  currencyDigits(liability.nativeCurrency)
  if (liability.nativeCurrency !== 'IDR') throw new Error('Liability accounts must use IDR for reproducible net-worth totals.')
  if (liability.notes !== undefined && liability.notes.length > 1000) throw new Error('Liability notes must be 1,000 characters or fewer.')
  parseDateOnly(liability.createdAt)
  if (liability.archivedAt) {
    parseDateOnly(liability.archivedAt)
    if (compareDates(liability.archivedAt, liability.createdAt) < 0) throw new Error('Archive date cannot be before the liability was created.')
  }
}

export function isAssetActiveOn(asset: AssetAccount, asOfDate: DateOnly): boolean {
  return compareDates(asOfDate, asset.createdAt) >= 0 && (!asset.archivedAt || compareDates(asOfDate, asset.archivedAt) < 0)
}

export function isLiabilityActiveOn(liability: LiabilityAccount, asOfDate: DateOnly): boolean {
  return compareDates(asOfDate, liability.createdAt) >= 0 && (!liability.archivedAt || compareDates(asOfDate, liability.archivedAt) < 0)
}

export function daysSince(asOfDate: DateOnly, previousDate: DateOnly): number {
  return daysBetween(previousDate, asOfDate)
}

function validateNonnegativeHistory<T extends { date: DateOnly }>(entries: readonly T[], effect: (entry: T) => number): void {
  const changesByDate = new Map<DateOnly, bigint>()
  for (const entry of entries) changesByDate.set(entry.date, (changesByDate.get(entry.date) ?? 0n) + BigInt(effect(entry)))
  let balance = 0n
  for (const [date, change] of [...changesByDate].sort(([left], [right]) => compareDates(left, right))) {
    balance += change
    if (balance < 0n) throw new Error(`Activity on ${date} would make the balance negative.`)
    if (balance > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Activity on ${date} exceeds the safe integer range.`)
  }


}
function uniqueById<T extends { id: string }>(items: readonly T[], label: string): Map<string, T> {
  const map = new Map<string, T>()
  for (const item of items) {
    if (!item.id || map.has(item.id)) throw new Error(`Every ${label} needs a unique ID.`)
    map.set(item.id, item)
  }
  return map
}

function validateOptionalDecimal(value: string | undefined, label: string): void {
  if (value === undefined) return
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value)) throw new Error(`${label} must be a positive decimal string with up to 8 decimal places.`)
}

function requireText(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error(`${label} is required and must be 200 characters or fewer.`)
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer.`)
}

function safeAdd(left: number, right: number): number {
  const sum = left + right
  if (!Number.isSafeInteger(sum)) throw new Error('Financial total exceeds the safe integer range.')
  return sum
}
