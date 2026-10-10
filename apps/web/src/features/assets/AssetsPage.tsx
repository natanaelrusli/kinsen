import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { useEffect, useMemo, useState } from 'react'
import type { AssetAccount, AssetData, AssetEntry, AssetValuation, DateOnly } from '@kinsen/budget-domain'
import { calculateFinancialPosition, compareDates, deriveAssetValues } from '@kinsen/budget-domain'
import { useAssetStore } from '../../shared/state/asset-store'
import { localToday } from '../../shared/format/date'
import { Icon } from '../../shared/components/Icon'
import { PageHeader } from '../../shared/components/Primitives'
import { PageSkeleton } from '../../shared/components/PageSkeleton'
import { AssetForm, AssetValuationForm, TransferForm } from './AssetForms'
import { ArchivedAccountsSection } from './ArchivedAccountsSection'
import { AssetBreakdowns } from './AssetBreakdowns'
import { AssetHistorySection } from './AssetHistorySection'
import { AssetHoldingsSection } from './AssetHoldingsSection'
import { AssetLiabilitiesSection } from './AssetLiabilitiesSection'
import { AssetPositionSummary } from './AssetPositionSummary'
import { valuationOrder } from './GoldValueDetails'
import { useGoldPriceRefresh } from './useGoldPriceRefresh'

function latestValuations(data: AssetData, onOrBefore?: DateOnly): Map<string, AssetValuation> {
  const latest = new Map<string, AssetValuation>()
  for (const valuation of data.valuations) {
    if (onOrBefore && compareDates(valuation.asOfDate, onOrBefore) > 0) continue
    const current = latest.get(valuation.assetId)
    if (!current || valuationOrder(valuation, current) > 0) latest.set(valuation.assetId, valuation)
  }
  return latest
}

export function AssetsPage() {
  const status = useAssetStore((state) => state.status)
  const data = useAssetStore((state) => state.data)
  const error = useAssetStore((state) => state.error)
  const saving = useAssetStore((state) => state.saving)
  const initialize = useAssetStore((state) => state.initialize)
  const runMutation = useAssetStore((state) => state.runMutation)
  const { online } = useGoldPriceRefresh()
  const refreshGoldPrices = useAssetStore(state => state.refreshGoldPrices)
  const goldRefreshing = useAssetStore(state => state.goldRefreshing)
  useEffect(() => { void initialize() }, [initialize])
  const today = localToday()
  const [assetDialog, setAssetDialog] = useState(false)
  const [valuationAsset, setValuationAsset] = useState<AssetAccount | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const position = useMemo(() => calculateFinancialPosition(data, today), [data, today])
  const values = useMemo(() => deriveAssetValues(data, today), [data, today])
  const activeAssets = useMemo(() => data.assets.filter((asset) => !asset.archivedAt), [data.assets])
  const valuationAssets = useMemo(() => activeAssets.filter((asset) => asset.balanceMode === 'VALUATION' && !asset.goldPricing), [activeAssets])
  const cashAssets = useMemo(() => activeAssets.filter((asset) => asset.balanceMode === 'LEDGER'), [activeAssets])
  const assetBalances = useMemo(() => Object.fromEntries(cashAssets.map((asset) => [asset.id, values.get(asset.id) ?? 0])), [cashAssets, values])
  const currentValuations = useMemo(() => latestValuations(data, today), [data, today])
  const valuationDialogAsset = valuationAsset ?? (pickerOpen ? valuationAssets[0] ?? null : null)

  async function saveAsset(asset: AssetAccount, openingRecord?: { entry: AssetEntry } | { valuation: AssetValuation }) {
    setPageError(null)
    await runMutation((useCases) => openingRecord ? useCases.createAsset(asset, openingRecord) : Promise.reject(new Error('An opening balance or valuation is required.')))
    setAssetDialog(false)
  }

  if (status === 'idle' || status === 'loading') return <PageSkeleton variant="assets" label="Loading assets saved on this device" />
  if (status === 'error') return <Stack className="asset-load-error" role="alert" style={{ display: 'block' }}><h2>Assets could not be loaded</h2><p>{error ?? 'Local storage is unavailable.'}</p><Button label="Try again" className="button button-secondary" variant="secondary" type="button" onClick={() => void initialize()} /></Stack>

  return <Stack as="section" className="assets-page" direction="vertical" gap={4}>
    <PageHeader eyebrow="FINANCIAL POSITION" title="Assets" description="See what you own, where it is held, and when each value was last updated. Asset values never increase Safe to Spend Today." actions={<>
      {activeAssets.some(asset => asset.goldPricing && asset.createdAt <= today) && <Button label="Refresh gold prices" className="button button-secondary" variant="secondary" isDisabled={goldRefreshing || !online} onClick={() => void refreshGoldPrices(true)} />}
      <Button label="Update value" className="button button-outline" variant="secondary" type="button" onClick={() => setPickerOpen(true)} isDisabled={!valuationAssets.length} icon={<Icon name="edit" size={17} />}></Button>
      <Button label="Add asset" className="button button-primary" variant="primary" type="button" onClick={() => setAssetDialog(true)} icon={<Icon name="plus" size={17} />} />
    </>} />
    <p className="asset-local-note">Saved locally on this device · manual estimates and opt-in automatic gold prices</p>
    {(pageError || error) && <p className="inline-alert" role="alert"><Icon name="warning" size={17} />{pageError ?? error}</p>}
    <AssetPositionSummary position={position} hasLiabilities={data.liabilities.some(liability => !liability.archivedAt)} />
    <AssetHistorySection data={data} today={today} />
    <AssetBreakdowns position={position} />
    <AssetHoldingsSection
      assets={activeAssets}
      values={values}
      valuations={currentValuations}
      entries={data.assetEntries}
      today={today}
      online={online}
      cashAccountCount={cashAssets.length}
      onAddAsset={() => setAssetDialog(true)}
      onTransfer={() => setTransferOpen(true)}
      onUpdateValue={(asset) => { if (asset.goldPricing) void refreshGoldPrices(true); else setValuationAsset(asset) }}
    />
    <AssetLiabilitiesSection data={data} today={today} cashAssets={cashAssets} assetBalances={assetBalances} onError={setPageError} />
    <ArchivedAccountsSection assets={data.assets} liabilities={data.liabilities} />

    <AssetForm open={assetDialog} initial={null} today={today} saving={saving} onClose={() => setAssetDialog(false)} onSave={saveAsset} />

    {valuationDialogAsset && !valuationDialogAsset.goldPricing && <AssetValuationForm open asset={valuationDialogAsset} latest={currentValuations.get(valuationDialogAsset.id) ?? null} selectableAssets={pickerOpen ? valuationAssets : undefined} latestForAsset={(assetId) => currentValuations.get(assetId) ?? null} today={today} saving={saving} onClose={() => { setValuationAsset(null); setPickerOpen(false) }} onSave={(valuation) => runMutation((useCases) => useCases.saveValuation(valuation))} />}
    <TransferForm open={transferOpen} accounts={cashAssets} today={today} saving={saving} onClose={() => setTransferOpen(false)} onSave={(input) => runMutation((useCases) => useCases.transfer(input))} />
  </Stack>
}
