import { calculateFinancialPosition, calculateOverview, createGoldValuation, type AssetAccount, type AssetValuation } from '@kinsen/budget-domain'
import { parseToolCall } from '@kinsen/mcp-contract'
import { budgetRepository } from '../../infrastructure/repositories/api-budget-repository'
import { assetRepository, electricityRepository } from '../../infrastructure/repositories/dexie-budget-repository'
import { useBudgetStore } from '../../shared/state/budget-store'
import { useAssetStore } from '../../shared/state/asset-store'
import { useElectricityStore } from '../../shared/state/electricity-store'
import { localToday } from '../../shared/format/date'

// Only provider responses can create automatic gold provenance; tool input cannot forge it.
async function quotedValuation(asset: AssetAccount): Promise<AssetValuation> {
  const holding = asset.goldPricing
  if (!holding) throw new Error('Automatic gold pricing is not configured.')
  const catalog = await useAssetStore.getState().loadGoldPrices(holding.source, true)
  const quote = catalog.quotes.find(item => item.source === holding.source && item.materialType === holding.materialType &&
    item.weightGrams === holding.weightGrams && item.lineKey === holding.lineKey)
  if (!quote) throw new Error('The selected gold product is unavailable. No holding was saved.')
  return createGoldValuation(asset, quote, localToday(), Date.now(), `valuation-${crypto.randomUUID()}`)
}

/** Runs only inside the explicitly paired, signed-in app; preserves existing use-case invariants and outbox. */
export async function executeMcpTool(name: string, args: unknown, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted()
  const call = parseToolCall(name, args)
  const budget = useBudgetStore.getState()
  const assets = useAssetStore.getState()
  const electricity = useElectricityStore.getState()
  const today = localToday()
  // A different API owner must not gain access via a locally signed-in browser.
  if (budgetRepository.getSyncStatus() === 'ACCOUNT_MISMATCH') throw new Error('This API budget belongs to another account. Agent access is unavailable.')

  switch (call.name) {
    case 'kinsen_get_data': {
      const result: Record<string, unknown> = { today, storage: { budget: 'browser with API outbox', assets: 'this browser only', electricity: 'this browser only' } }
      const scope = call.arguments.scope
      if (scope === 'all' || scope === 'budget') {
        const snapshot = await budgetRepository.getSnapshot()
        result.budget = { snapshot, overview: calculateOverview(snapshot, today), syncStatus: budgetRepository.getSyncStatus() }
      }
      if (scope === 'all' || scope === 'assets') {
        const data = await assetRepository.getAssetData()
        result.assets = { data, position: calculateFinancialPosition(data, today) }
      }
      if (scope === 'all' || scope === 'electricity') result.electricity = { observations: await electricityRepository.getObservations() }
      return result
    }
    case 'kinsen_save_budget':
      await budget.runMutation(uc => uc.saveBudget(call.arguments.period, call.arguments.categories))
      break
    case 'kinsen_save_transaction':
      await budget.runMutation(uc => uc.saveTransaction(call.arguments.transaction, call.arguments.paidFromAssetId))
      await assets.refresh()
      break
    case 'kinsen_delete_transaction':
      await budget.runMutation(uc => uc.deleteTransaction(call.arguments.id))
      await assets.refresh()
      break
    case 'kinsen_save_commitment':
      await budget.runMutation(uc => uc.savePlannedExpense(call.arguments.expense))
      break
    case 'kinsen_delete_commitment':
      await budget.runMutation(uc => uc.deletePlannedExpense(call.arguments.id))
      break
    case 'kinsen_create_asset': {
      const { asset, openingRecord } = call.arguments
      if (asset.archivedAt) throw new Error('Create an active asset; archive it separately.')
      if ('entry' in openingRecord) {
        if (asset.balanceMode !== 'LEDGER' || openingRecord.entry.assetId !== asset.id) throw new Error('The opening entry must belong to this ledger asset.')
      } else if (asset.balanceMode !== 'VALUATION' || openingRecord.valuation.assetId !== asset.id) {
        throw new Error('The opening valuation must belong to this valuation-mode asset.')
      }
      if (asset.goldPricing && !('valuation' in openingRecord)) throw new Error('Automatic gold requires a valuation-mode opening record.')
      const opening = asset.goldPricing ? { valuation: await quotedValuation(asset) } : openingRecord
      signal?.throwIfAborted()
      await assets.runMutation(uc => uc.createAsset(asset, opening))
      break
    }
    case 'kinsen_save_asset': {
      const { asset } = call.arguments
      const data = await assetRepository.getAssetData()
      const current = data.assets.find(item => item.id === asset.id)
      if (!current) throw new Error('Asset not found; use kinsen_create_asset for a new account.')
      const holding = asset.goldPricing
      const previous = current.goldPricing
      const holdingChanged = holding && (!previous || holding.source !== previous.source ||
        holding.materialType !== previous.materialType || holding.weightGrams !== previous.weightGrams ||
        holding.lineKey !== previous.lineKey || holding.units !== previous.units || holding.revision !== previous.revision)
      const valuation = holdingChanged ? await quotedValuation(asset) : undefined
      signal?.throwIfAborted()
      await assets.runMutation(uc => uc.saveAsset(asset, valuation))
      break
    }
    case 'kinsen_archive_asset':
      await assets.runMutation(uc => uc.archiveAsset(call.arguments.id, call.arguments.date))
      break
    case 'kinsen_save_asset_activity': {
      const data = await assetRepository.getAssetData()
      const current = data.assetEntries.find(item => item.id === call.arguments.entry.id)
      if (current && (current.kind === 'OPENING_BALANCE' || current.transferId || current.budgetTransactionId || current.liabilityEntryId)) {
        throw new Error('This activity is linked or establishes an opening balance. Change it through its source action.')
      }
      signal?.throwIfAborted()
      await assets.runMutation(uc => uc.saveActivity(call.arguments.entry))
      break
    }
    case 'kinsen_delete_asset_activity':
      await assets.runMutation(uc => uc.deleteActivity(call.arguments.id))
      break
    case 'kinsen_save_valuation':
      await assets.runMutation(uc => uc.saveValuation(call.arguments.valuation))
      break
    case 'kinsen_transfer_assets':
      await assets.runMutation(uc => uc.transfer(call.arguments))
      break
    case 'kinsen_create_liability':
      if (call.arguments.liability.archivedAt) throw new Error('Create an active liability; archive it separately.')
      if (call.arguments.openingEntry.liabilityId !== call.arguments.liability.id) throw new Error('The opening debt must belong to this liability.')
      await assets.runMutation(uc => uc.createLiability(call.arguments.liability, call.arguments.openingEntry))
      break
    case 'kinsen_save_liability':
      await assets.runMutation(uc => uc.saveLiability(call.arguments.liability))
      break
    case 'kinsen_archive_liability':
      await assets.runMutation(uc => uc.archiveLiability(call.arguments.id, call.arguments.date))
      break
    case 'kinsen_save_liability_activity': {
      const data = await assetRepository.getAssetData()
      const current = data.liabilityEntries.find(item => item.id === call.arguments.entry.id)
      if (current && (current.kind === 'OPENING_BALANCE' || current.kind === 'PAYMENT' || current.assetEntryId)) {
        throw new Error('Opening balances and settlements must be changed through their source action.')
      }
      signal?.throwIfAborted()
      await assets.runMutation(uc => uc.saveLiabilityActivity(call.arguments.entry))
      break
    }
    case 'kinsen_delete_liability_activity':
      await assets.runMutation(uc => uc.deleteLiabilityActivity(call.arguments.id))
      break
    case 'kinsen_pay_liability':
      await assets.runMutation(uc => uc.payLiability(call.arguments))
      break
    case 'kinsen_save_electricity_reading': {
      const { observation, position, replacingId } = call.arguments
      if (replacingId && replacingId !== observation.id) throw new Error('Keep the same reading ID when editing.')
      await electricity.runMutation(uc => uc.saveObservation(observation, position, today, replacingId))
      break
    }
    case 'kinsen_delete_electricity_reading':
      await electricity.runMutation(uc => uc.deleteObservation(call.arguments.id, today))
      break
    case 'kinsen_get_gold_prices':
      return assets.loadGoldPrices(call.arguments.source, true)
    case 'kinsen_refresh_gold_prices':
      await assets.refresh()
      signal?.throwIfAborted()
      await useAssetStore.getState().refreshGoldPrices(true)
      return { savedLocally: true, goldErrors: useAssetStore.getState().goldErrors }
    default: {
      const exhaustive: never = call
      throw new Error(`Unsupported tool: ${exhaustive}`)
    }
  }
  return { savedLocally: true, syncStatus: budgetRepository.getSyncStatus(), message: 'Saved in the paired browser. Budget sync is separate; assets and electricity stay on this device.' }
}
