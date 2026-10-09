import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Link } from '@astryxdesign/core/Link'
import { Stack } from '@astryxdesign/core/Stack'
import { useMemo } from 'react'
import type { AssetAccount, AssetEntry, AssetType, AssetValuation, DateOnly } from '@kinsen/budget-domain'
import { assetTypeLabels, compareDates, currencyDigits, daysSince } from '@kinsen/budget-domain'
import { Icon } from '../../shared/components/Icon'
import { formatDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { useAssetStore } from '../../shared/state/asset-store'
import { GoldValueDetails, GoldValueStatus } from './GoldValueDetails'

const STALE_AFTER_DAYS = 30

type AssetRowProps = {
  asset: AssetAccount
  value: number
  valuation: AssetValuation | null
  ledgerEntry: AssetEntry | null
  today: DateOnly
  online: boolean
  onUpdateValue: (asset: AssetAccount) => void
}

function nativeAmount(valueMinor: number, currency: string): string {
  const digits = currencyDigits(currency)
  return `${new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(valueMinor / (10 ** digits))} ${currency}`
}

function AssetRow({ asset, value, valuation, ledgerEntry, today, online, onUpdateValue }: AssetRowProps) {
  const updatedDate = valuation?.asOfDate ?? ledgerEntry?.date ?? asset.createdAt
  const goldErrors = useAssetStore(state => state.goldErrors)
  const goldRefreshing = useAssetStore(state => state.goldRefreshing)
  const stale = asset.balanceMode === 'VALUATION' && !valuation?.goldQuote && (!valuation || daysSince(today, valuation.asOfDate) > STALE_AFTER_DAYS)

  return <li className="asset-row">
    <Link className="asset-row-main" color="inherit" href={`/assets/${encodeURIComponent(asset.id)}`}>
      <Stack as="span" className="asset-row-mark"><Icon name={asset.balanceMode === 'LEDGER' ? 'wallet' : 'assets'} size={19} /></Stack>
      <Stack as="span" className="asset-row-name"><strong>{asset.name}</strong><small>{assetTypeLabels[asset.type]} · {asset.institution}</small></Stack>
      <Stack direction="vertical" gap={1} className="asset-row-value">
        <strong>{formatIdr(value)}</strong>
        {valuation?.goldQuote ? <GoldValueDetails valuation={valuation} compact /> : <small>{asset.balanceMode === 'LEDGER' ? `${formatIdr(value)} native` : valuation ? nativeAmount(valuation.nativeAmountMinor, valuation.nativeCurrency) : 'Native value not entered'}</small>}
      </Stack>
      <Stack direction="vertical" gap={1} className="asset-row-date">
        <small>As of {formatDate(updatedDate, { day: 'numeric', month: 'short', year: 'numeric' })}</small>
        {stale && <small>{valuation ? 'Stale estimate' : 'Value needed'}</small>}
        {valuation && !valuation.goldQuote && <small>Manual estimate</small>}
        {(asset.goldPricing || valuation?.goldQuote) && <GoldValueStatus valuation={valuation} today={today} online={online} error={goldErrors[asset.id]} />}
      </Stack>
    </Link>
    {asset.balanceMode === 'VALUATION' && <Button label={`${asset.goldPricing ? 'Refresh price' : 'Update value'} for ${asset.name}`} className="icon-button asset-row-update" variant="ghost" type="button" isDisabled={Boolean(asset.goldPricing) && (!online || goldRefreshing)} onClick={() => onUpdateValue(asset)} icon={<Icon name="edit" size={17} />} isIconOnly />}
  </li>
}

type AssetHoldingsSectionProps = {
  assets: AssetAccount[]
  values: Map<string, number>
  valuations: Map<string, AssetValuation>
  entries: AssetEntry[]
  today: DateOnly
  online: boolean
  cashAccountCount: number
  onAddAsset: () => void
  onTransfer: () => void
  onUpdateValue: (asset: AssetAccount) => void
}

export function AssetHoldingsSection({ assets, values, valuations, entries, today, online, cashAccountCount, onAddAsset, onTransfer, onUpdateValue }: AssetHoldingsSectionProps) {
  const byType = useMemo(() => {
    const groups = new Map<AssetType, AssetAccount[]>()
    for (const asset of assets) {
      const group = groups.get(asset.type) ?? []
      group.push(asset)
      groups.set(asset.type, group)
    }
    return [...groups.entries()].sort(([left], [right]) => assetTypeLabels[left].localeCompare(assetTypeLabels[right]))
  }, [assets])
  const latestEntries = useMemo(() => {
    const latest = new Map<string, AssetEntry>()
    for (const entry of entries) {
      if (compareDates(entry.date, today) > 0) continue
      const current = latest.get(entry.assetId)
      if (!current || compareDates(entry.date, current.date) > 0) latest.set(entry.assetId, entry)
    }
    return latest
  }, [entries, today])

  return <section className="section-block asset-list-section" aria-labelledby="asset-list-title">
    <Stack direction="horizontal" className="section-title-row">
      <Stack style={{ display: 'block' }}><p className="eyebrow">YOUR HOLDINGS</p><h2 id="asset-list-title">Accounts and assets</h2></Stack>
      <Stack direction="horizontal" className="asset-section-actions">
        <Button label="Record transfer" className="button button-small button-outline" variant="secondary" type="button" onClick={onTransfer} isDisabled={cashAccountCount < 2} icon={<Icon name="arrow-right" size={15} />} />
        <Button label="Add asset" className="button button-small button-primary" variant="primary" type="button" onClick={onAddAsset} icon={<Icon name="plus" size={15} />} />
      </Stack>
    </Stack>
    {assets.length === 0 ? <EmptyState className="empty-state" icon={<Stack as="span" className="empty-icon" aria-hidden="true"><Icon name="wallet" size={23} /></Stack>} title="No assets recorded" description="Start with an opening balance for a bank, e-wallet, savings pool, investment, or other asset. No sample balances are preloaded." actions={<Button label="Add an asset" className="button button-secondary" variant="secondary" type="button" onClick={onAddAsset} icon={<Icon name="plus" size={16} />} />} /> : byType.map(([type, accounts]) => <Stack className="asset-class-group" key={type}>
      <h3>{assetTypeLabels[type]} <small>{accounts.length}</small></h3>
      <ul className="asset-rows">{accounts.map(asset => <AssetRow key={asset.id} asset={asset} value={values.get(asset.id) ?? 0} valuation={valuations.get(asset.id) ?? null} ledgerEntry={latestEntries.get(asset.id) ?? null} today={today} online={online} onUpdateValue={onUpdateValue} />)}</ul>
    </Stack>)}
  </section>
}
