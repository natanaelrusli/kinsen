import type { DateOnly } from '@kinsen/budget-domain'
import type { AssetAccount, AssetData, AssetEntry, AssetValuation, LiabilityAccount, LiabilityEntry } from '@kinsen/budget-domain'

export type AssetOpeningRecord = { entry: AssetEntry } | { valuation: AssetValuation }

export interface AssetRepository {
  getAssetData(): Promise<AssetData>
  createAsset(asset: AssetAccount, openingRecord: AssetOpeningRecord): Promise<void>
  saveAsset(asset: AssetAccount, valuation?: AssetValuation): Promise<void>
  saveAssetEntry(entry: AssetEntry): Promise<void>
  deleteAssetEntry(id: string): Promise<void>
  saveAssetValuation(valuation: AssetValuation): Promise<void>
  transferAssets(sourceEntry: AssetEntry, destinationEntry: AssetEntry): Promise<void>
  archiveAsset(id: string, date: DateOnly): Promise<void>
  createLiability(liability: LiabilityAccount, openingEntry: LiabilityEntry): Promise<void>
  saveLiability(liability: LiabilityAccount): Promise<void>
  saveLiabilityEntry(entry: LiabilityEntry): Promise<void>
  deleteLiabilityEntry(id: string): Promise<void>
  recordLiabilityPayment(assetEntry: AssetEntry, liabilityEntry: LiabilityEntry): Promise<void>
  archiveLiability(id: string, date: DateOnly): Promise<void>
}

/** Obsolete asynchronous imports must not recreate or overwrite a changed holding. */
export function matchesCurrentGoldHolding(asset: AssetAccount | undefined, valuation: AssetValuation, today: DateOnly): boolean {
  const pricing = asset?.goldPricing
  const quote = valuation.goldQuote
  return Boolean(asset && pricing && quote && valuation.assetId === asset.id && asset.type === 'GOLD' && asset.balanceMode === 'VALUATION' &&
    asset.nativeCurrency === 'IDR' && asset.createdAt <= today && (!asset.archivedAt || asset.archivedAt > today) &&
    pricing.source === quote.source && pricing.materialType === quote.materialType &&
    pricing.weightGrams === quote.weightGrams && pricing.lineKey === quote.lineKey &&
    pricing.units === valuation.quantity && pricing.revision === quote.holdingRevision)
}

export function goldHoldingChanged(current: AssetAccount, updated: AssetAccount): boolean {
  const before = current.goldPricing
  const after = updated.goldPricing
  return Boolean(after && (!before || before.source !== after.source || before.materialType !== after.materialType ||
    before.weightGrams !== after.weightGrams || before.lineKey !== after.lineKey ||
    before.units !== after.units || before.revision !== after.revision))
}
