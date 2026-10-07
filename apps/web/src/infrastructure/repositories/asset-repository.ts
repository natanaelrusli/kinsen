import type { DateOnly } from '@kinsen/budget-domain'
import type { AssetAccount, AssetData, AssetEntry, AssetValuation, LiabilityAccount, LiabilityEntry } from '@kinsen/budget-domain'

export type AssetOpeningRecord = { entry: AssetEntry } | { valuation: AssetValuation }

export interface AssetRepository {
  getAssetData(): Promise<AssetData>
  createAsset(asset: AssetAccount, openingRecord: AssetOpeningRecord): Promise<void>
  saveAsset(asset: AssetAccount): Promise<void>
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
