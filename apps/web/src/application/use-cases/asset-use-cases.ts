import type { AssetAccount, AssetData, AssetEntry, AssetValuation, DateOnly, LiabilityAccount, LiabilityEntry } from '@kinsen/budget-domain'
import { validateAssetData } from '@kinsen/budget-domain'
import type { AssetRepository, AssetOpeningRecord } from '../../infrastructure/repositories/asset-repository'
import { matchesCurrentGoldHolding } from '../../infrastructure/repositories/asset-repository'
import { localToday } from '../../shared/format/date'

export class AssetUseCases {
  constructor(private readonly repository: AssetRepository) {}

  getData(): Promise<AssetData> {
    return this.repository.getAssetData()
  }

  async createAsset(asset: AssetAccount, openingRecord: AssetOpeningRecord): Promise<void> {
    const data = await this.getData()
    const next: AssetData = { ...data, assets: [...data.assets, asset] }
    if ('entry' in openingRecord) next.assetEntries = [...data.assetEntries, openingRecord.entry]
    else next.valuations = [...data.valuations, openingRecord.valuation]
    validateAssetData(next)
    await this.repository.createAsset(asset, openingRecord)
  }

  async saveAsset(asset: AssetAccount, valuation?: AssetValuation): Promise<void> {
    const data = await this.getData()
    validateAssetData({
      ...data,
      assets: data.assets.map((item) => item.id === asset.id ? asset : item),
      valuations: valuation ? [...data.valuations, valuation] : data.valuations,
    })
    await this.repository.saveAsset(asset, valuation)
  }

  async saveActivity(entry: AssetEntry): Promise<void> {
    const data = await this.getData()
    validateAssetData({ ...data, assetEntries: [...data.assetEntries.filter((item) => item.id !== entry.id), entry] })
    await this.repository.saveAssetEntry(entry)
  }

  deleteActivity(id: string): Promise<void> {
    return this.repository.deleteAssetEntry(id)
  }

  async saveValuation(valuation: AssetValuation): Promise<void> {
    const data = await this.getData()
    const asset = data.assets.find((item) => item.id === valuation.assetId)
    if (valuation.goldQuote && !matchesCurrentGoldHolding(asset, valuation, localToday())) return
    if (!valuation.goldQuote && asset?.goldPricing) throw new Error('Disable automatic gold pricing before recording a manual value.')
    validateAssetData({ ...data, valuations: [...data.valuations.filter((item) => item.id !== valuation.id), valuation] })
    await this.repository.saveAssetValuation(valuation)
  }

  async transfer(input: { sourceAssetId: string; destinationAssetId: string; amountMinor: number; date: DateOnly; note?: string }): Promise<void> {
    if (input.sourceAssetId === input.destinationAssetId) throw new Error('Choose two different accounts for a transfer.')
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('Transfer amount must be a positive whole-rupiah value.')
    const data = await this.getData()
    const transferId = `transfer-${crypto.randomUUID()}`
    const sourceEntry: AssetEntry = {
      id: `asset-entry-${crypto.randomUUID()}`,
      assetId: input.sourceAssetId,
      date: input.date,
      kind: 'TRANSFER_OUT',
      amountMinor: input.amountMinor,
      transferId,
      ...(input.note ? { note: input.note } : {}),
    }
    const destinationEntry: AssetEntry = {
      id: `asset-entry-${crypto.randomUUID()}`,
      assetId: input.destinationAssetId,
      date: input.date,
      kind: 'TRANSFER_IN',
      amountMinor: input.amountMinor,
      transferId,
      ...(input.note ? { note: input.note } : {}),
    }
    validateAssetData({ ...data, assetEntries: [...data.assetEntries, sourceEntry, destinationEntry] })
    await this.repository.transferAssets(sourceEntry, destinationEntry)
  }

  archiveAsset(id: string, date: DateOnly): Promise<void> {
    return this.repository.archiveAsset(id, date)
  }

  async createLiability(liability: LiabilityAccount, openingEntry: LiabilityEntry): Promise<void> {
    const data = await this.getData()
    validateAssetData({ ...data, liabilities: [...data.liabilities, liability], liabilityEntries: [...data.liabilityEntries, openingEntry] })
    await this.repository.createLiability(liability, openingEntry)
  }

  async saveLiability(liability: LiabilityAccount): Promise<void> {
    const data = await this.getData()
    validateAssetData({ ...data, liabilities: data.liabilities.map((item) => item.id === liability.id ? liability : item) })
    await this.repository.saveLiability(liability)
  }

  async saveLiabilityActivity(entry: LiabilityEntry): Promise<void> {
    const data = await this.getData()
    validateAssetData({ ...data, liabilityEntries: [...data.liabilityEntries.filter((item) => item.id !== entry.id), entry] })
    await this.repository.saveLiabilityEntry(entry)
  }

  deleteLiabilityActivity(id: string): Promise<void> {
    return this.repository.deleteLiabilityEntry(id)
  }

  async payLiability(input: { liabilityId: string; assetId: string; amountMinor: number; date: DateOnly; note?: string }): Promise<void> {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error('Payment amount must be a positive whole-rupiah value.')
    const data = await this.getData()
    const assetEntryId = `asset-entry-${crypto.randomUUID()}`
    const liabilityEntryId = `liability-entry-${crypto.randomUUID()}`
    const assetEntry: AssetEntry = {
      id: assetEntryId,
      assetId: input.assetId,
      date: input.date,
      kind: 'DEBIT',
      amountMinor: input.amountMinor,
      liabilityEntryId,
      ...(input.note ? { note: input.note } : {}),
    }
    const liabilityEntry: LiabilityEntry = {
      id: liabilityEntryId,
      liabilityId: input.liabilityId,
      date: input.date,
      kind: 'PAYMENT',
      amountMinor: input.amountMinor,
      assetEntryId,
      ...(input.note ? { note: input.note } : {}),
    }
    validateAssetData({
      ...data,
      assetEntries: [...data.assetEntries, assetEntry],
      liabilityEntries: [...data.liabilityEntries, liabilityEntry],
    })
    await this.repository.recordLiabilityPayment(assetEntry, liabilityEntry)
  }

  archiveLiability(id: string, date: DateOnly): Promise<void> {
    return this.repository.archiveLiability(id, date)
  }
}
