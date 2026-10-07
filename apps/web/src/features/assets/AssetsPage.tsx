import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Spinner } from '@astryxdesign/core/Spinner'
import { DateInput } from '@astryxdesign/core/DateInput'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { Selector } from '@astryxdesign/core/Selector'
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@astryxdesign/core/Link'
import type { AssetAccount, AssetData, AssetEntry, AssetPeriodComparison, AssetType, AssetValuation, DateOnly, LiabilityAccount, LiabilityEntry } from '@kinsen/budget-domain'
import { assetTypeLabels, calculateAssetPeriodComparison, calculateFinancialPosition, compareDates, currencyDigits, daysSince, deriveAssetValues, deriveLiabilityBalance, liabilityTypeLabels } from '@kinsen/budget-domain'
import { addDays, addMonths, parseDateOnly } from '@kinsen/budget-domain/date-only'
import { useAssetStore } from '../../shared/state/asset-store'
import { formatDate, localToday } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'
import { PageHeader } from '../../shared/components/Primitives'
import { AssetLineChart } from './AssetLineChart'
import { AssetForm, AssetValuationForm, LiabilityActivityForm, LiabilityForm, LiabilityPaymentForm, TransferForm } from './AssetForms'

const STALE_AFTER_DAYS = 30
type RangeKind = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM'

function firstOfMonth(date: DateOnly): DateOnly {
  const { year, month } = parseDateOnly(date)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function rangeStart(date: DateOnly, range: Exclude<RangeKind, 'CUSTOM'>): DateOnly {
  const { year, month } = parseDateOnly(date)
  if (range === 'YEAR') return `${year}-01-01`
  if (range === 'QUARTER') return `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`
  return firstOfMonth(date)
}

function historyPoints(data: AssetData, start: DateOnly, end: DateOnly, range: RangeKind): Array<{ date: DateOnly; value: number }> {
  if (compareDates(start, end) > 0) return []
  const points: Array<{ date: DateOnly; value: number }> = []
  const addPoint = (date: DateOnly) => points.push({ date, value: calculateFinancialPosition(data, date).totalAssets })
  if (range === 'MONTH' && start.slice(0, 7) === end.slice(0, 7)) {
    for (let date = start; compareDates(date, end) <= 0; date = addDays(date, 1)) addPoint(date)
  } else {
    addPoint(start)
    let date = addMonths(firstOfMonth(start), 1)
    let count = 0
    while (compareDates(date, end) < 0 && count < 60) {
      if (compareDates(date, start) > 0) addPoint(date)
      date = addMonths(date, 1)
      count += 1
    }
    if (points[points.length - 1]?.date !== end) addPoint(end)
  }
  return points
}

function latestValuation(data: AssetData, assetId: string, onOrBefore?: DateOnly): AssetValuation | null {
  let latest: AssetValuation | null = null
  for (const valuation of data.valuations) {
    if (valuation.assetId !== assetId || (onOrBefore && compareDates(valuation.asOfDate, onOrBefore) > 0)) continue
    if (!latest || compareDates(valuation.asOfDate, latest.asOfDate) > 0 || (valuation.asOfDate === latest.asOfDate && valuation.recordedAt > latest.recordedAt)) latest = valuation
  }
  return latest
}

function latestValuations(data: AssetData, onOrBefore?: DateOnly): Map<string, AssetValuation> {
  const latest = new Map<string, AssetValuation>()
  for (const valuation of data.valuations) {
    if (onOrBefore && compareDates(valuation.asOfDate, onOrBefore) > 0) continue
    const current = latest.get(valuation.assetId)
    if (!current || compareDates(valuation.asOfDate, current.asOfDate) > 0 || (valuation.asOfDate === current.asOfDate && valuation.recordedAt > current.recordedAt)) latest.set(valuation.assetId, valuation)
  }
  return latest
}

function latestLedgerEntries(entries: AssetEntry[], today: DateOnly): Map<string, AssetEntry> {
  const latest = new Map<string, AssetEntry>()
  for (const entry of entries) {
    if (compareDates(entry.date, today) > 0) continue
    const current = latest.get(entry.assetId)
    if (!current || compareDates(entry.date, current.date) > 0) latest.set(entry.assetId, entry)
  }
  return latest
}

function AssetRow({ asset, value, valuation, ledgerEntry, today, onUpdateValue }: { asset: AssetAccount; value: number; valuation: AssetValuation | null; ledgerEntry: AssetEntry | null; today: DateOnly; onUpdateValue: (asset: AssetAccount) => void }) {
  const updatedDate = valuation?.asOfDate ?? ledgerEntry?.date ?? asset.createdAt
  const stale = asset.balanceMode === 'VALUATION' && (!valuation || daysSince(today, valuation.asOfDate) > STALE_AFTER_DAYS)
  return <article className="asset-row">
    <Link className="asset-row-main" color="inherit" href={`/assets/${encodeURIComponent(asset.id)}`}>
      <span className="asset-row-mark"><Icon name={asset.balanceMode === 'LEDGER' ? 'wallet' : 'assets'} size={19} /></span>
      <span className="asset-row-name"><strong>{asset.name}</strong><small>{assetTypeLabels[asset.type]} · {asset.institution}</small></span>
      <span className="asset-row-value"><strong>{formatIdr(value)}</strong><small>{asset.balanceMode === 'LEDGER' ? `${formatIdr(value)} native` : valuation ? nativeAmount(valuation.nativeAmountMinor, valuation.nativeCurrency) : 'Native value not entered'}</small></span>
      <span className="asset-row-date"><small>As of {formatDate(updatedDate, { day: 'numeric', month: 'short', year: 'numeric' })}</small>{stale && <span className="stale-badge">{valuation ? 'Stale estimate' : 'Value needed'}</span>}{valuation && <span className="manual-badge">Manual estimate</span>}</span>
    </Link>
    {asset.balanceMode === 'VALUATION' && <Button label={`Update value for ${asset.name}`} className="icon-button asset-row-update" variant="ghost" type="button" aria-label={`Update value for ${asset.name}`} onClick={() => onUpdateValue(asset)} icon={<Icon name="edit" size={17} />} isIconOnly />}
  </article>
}

function nativeAmount(valueMinor: number, currency: string): string {
  const digits = currencyDigits(currency)
  return `${new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(valueMinor / (10 ** digits))} ${currency}`
}

function AmountChange({ amount, percent }: { amount: number; percent: number | null }) {
  return <span className={amount < 0 ? 'asset-change is-negative' : 'asset-change'}>{amount > 0 ? '+' : ''}{formatIdr(amount)}{percent !== null && <small>{percent > 0 ? '+' : ''}{percent.toFixed(1)}%</small>}</span>
}



export function AssetsPage() {
  const status = useAssetStore((state) => state.status)
  const data = useAssetStore((state) => state.data)
  const error = useAssetStore((state) => state.error)
  const saving = useAssetStore((state) => state.saving)
  const initialize = useAssetStore((state) => state.initialize)
  const runMutation = useAssetStore((state) => state.runMutation)
  useEffect(() => { void initialize() }, [initialize])
  const today = localToday()
  const [range, setRange] = useState<RangeKind>('MONTH')
  const [customStart, setCustomStart] = useState<ISODateString | ''>(firstOfMonth(today) as ISODateString)
  const [customEnd, setCustomEnd] = useState<ISODateString | ''>(today as ISODateString)
  const [assetDialog, setAssetDialog] = useState(false)
  const [editingAsset, setEditingAsset] = useState<AssetAccount | null>(null)
  const [valuationAsset, setValuationAsset] = useState<AssetAccount | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [liabilityDialog, setLiabilityDialog] = useState(false)
  const [editingLiability, setEditingLiability] = useState<LiabilityAccount | null>(null)
  const [liabilityActivity, setLiabilityActivity] = useState<LiabilityAccount | null>(null)
  const [paymentLiability, setPaymentLiability] = useState<LiabilityAccount | null>(null)
  const [selectedLiabilityActivity, setSelectedLiabilityActivity] = useState<LiabilityEntry | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)
  const [expandedLiabilityId, setExpandedLiabilityId] = useState<string | null>(null)

  const start = range === 'CUSTOM' ? customStart : rangeStart(today, range)
  const end = range === 'CUSTOM' ? customEnd : today
  const validRange = useMemo(() => {
    try { parseDateOnly(start); parseDateOnly(end); return compareDates(start, end) <= 0 } catch { return false }
  }, [start, end])
  const position = useMemo(() => calculateFinancialPosition(data, today), [data, today])
  const values = useMemo(() => deriveAssetValues(data, today), [data, today])
  const activeAssets = useMemo(() => data.assets.filter((asset) => !asset.archivedAt), [data.assets])
  const valuationAssets = useMemo(() => activeAssets.filter((asset) => asset.balanceMode === 'VALUATION'), [activeAssets])
  const cashAssets = useMemo(() => activeAssets.filter((asset) => asset.balanceMode === 'LEDGER'), [activeAssets])
  const activeLiabilities = useMemo(() => data.liabilities.filter((liability) => !liability.archivedAt), [data.liabilities])
  const comparison: AssetPeriodComparison | null = useMemo(() => validRange ? calculateAssetPeriodComparison(data, start, end) : null, [data, start, end, validRange])
  const points = useMemo(() => validRange ? historyPoints(data, start, end, range) : [], [data, start, end, range, validRange])
  const byType = useMemo(() => {
    const groups = new Map<AssetType, AssetAccount[]>()
    for (const asset of activeAssets) {
      const group = groups.get(asset.type) ?? []
      group.push(asset)
      groups.set(asset.type, group)
    }
    return [...groups.entries()].sort(([left], [right]) => assetTypeLabels[left].localeCompare(assetTypeLabels[right]))
  }, [activeAssets])
  const assetBalances = useMemo(() => Object.fromEntries(cashAssets.map((asset) => [asset.id, values.get(asset.id) ?? 0])), [cashAssets, values])
  const currentValuations = useMemo(() => latestValuations(data, today), [data, today])
  const ledgerEntriesByAsset = useMemo(() => latestLedgerEntries(data.assetEntries, today), [data.assetEntries, today])
  const liabilityEntriesByAccount = useMemo(() => {
    const groups = new Map<string, LiabilityEntry[]>()
    for (const entry of data.liabilityEntries) {
      const group = groups.get(entry.liabilityId) ?? []
      group.push(entry)
      groups.set(entry.liabilityId, group)
    }
    for (const entries of groups.values()) entries.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
    return groups
  }, [data.liabilityEntries])
  const liabilityBalances = useMemo(() => new Map(data.liabilities.map((liability) => [
    liability.id,
    deriveLiabilityBalance(liabilityEntriesByAccount.get(liability.id) ?? [], today),
  ])), [data.liabilities, liabilityEntriesByAccount, today])
  const liabilitiesByType = useMemo(() => {
    const groups = new Map<LiabilityAccount['type'], LiabilityAccount[]>()
    for (const liability of activeLiabilities) {
      const group = groups.get(liability.type) ?? []
      group.push(liability)
      groups.set(liability.type, group)
    }
    return [...groups.entries()].sort(([left], [right]) => liabilityTypeLabels[left].localeCompare(liabilityTypeLabels[right]))
  }, [activeLiabilities])
  const valuationDialogAsset = valuationAsset ?? (pickerOpen ? valuationAssets[0] ?? null : null)

  async function saveAsset(asset: AssetAccount, openingRecord?: { entry: AssetEntry } | { valuation: AssetValuation }) {
    setPageError(null)
    await runMutation((useCases) => editingAsset ? useCases.saveAsset(asset) : openingRecord ? useCases.createAsset(asset, openingRecord) : Promise.reject(new Error('An opening balance or valuation is required.')))
    setAssetDialog(false)
    setEditingAsset(null)
  }


  async function saveLiability(liability: LiabilityAccount, openingEntry?: LiabilityEntry) {
    setPageError(null)
    await runMutation((useCases) => editingLiability ? useCases.saveLiability(liability) : openingEntry ? useCases.createLiability(liability, openingEntry) : Promise.reject(new Error('An opening balance is required.')))
    setLiabilityDialog(false)
    setEditingLiability(null)
  }

  async function archiveLiability(liability: LiabilityAccount) {
    const linkedRecords = data.liabilityEntries.filter((entry) => entry.liabilityId === liability.id).length
    const balance = liabilityBalances.get(liability.id) ?? 0
    const suffix = linkedRecords ? ` ${linkedRecords} dated record${linkedRecords === 1 ? '' : 's'} will remain in history.` : ''
    const outstanding = balance > 0 ? ` Its outstanding ${formatIdr(balance)} balance will no longer be included in current net worth.` : ''
    if (!window.confirm(`Archive “${liability.name}”?${outstanding}${suffix}`)) return
    setPageError(null)
    try { await runMutation((useCases) => useCases.archiveLiability(liability.id, today)) }
    catch (reason) { setPageError(reason instanceof Error ? reason.message : 'Liability could not be archived.') }
  }


  async function deleteLiabilityActivity(entry: LiabilityEntry) {
    const detail = entry.assetEntryId ? ' Its paired cash-account debit will also be removed.' : ''
    if (!window.confirm(`Delete this liability adjustment?${detail} The balance and net worth will be recalculated.`)) return
    setPageError(null)
    try { await runMutation((useCases) => useCases.deleteLiabilityActivity(entry.id)) }
    catch (reason) { setPageError(reason instanceof Error ? reason.message : 'Liability adjustment could not be deleted.') }
  }

  if (status === 'idle' || status === 'loading') return <Spinner className="loading-state" label="Loading assets saved on this device" size="md" />
  if (status === 'error') return <div className="asset-load-error" role="alert"><h2>Assets could not be loaded</h2><p>{error ?? 'Local storage is unavailable.'}</p><Button label="Try again" className="button button-secondary" variant="secondary" type="button" onClick={() => void initialize()} /></div>

  return <div className="assets-page">
    <PageHeader eyebrow="FINANCIAL POSITION" title="Assets" description="See what you own, where it is held, and when each value was last updated. Asset values never increase Safe to Spend Today." actions={<>
      <Button label="Update value" className="button button-outline" variant="secondary" type="button" onClick={() => setPickerOpen(true)} isDisabled={!valuationAssets.length} icon={<Icon name="edit" size={17} />}></Button>
      <Button label="Add asset" className="button button-primary" variant="primary" type="button" onClick={() => { setEditingAsset(null); setAssetDialog(true) }} icon={<Icon name="plus" size={17} />}></Button>
    </>} />
    <div className="asset-local-note" role="status"><span className="storage-dot" />Saved locally on this device · manual estimates only · no live pricing</div>
    {(pageError || error) && <p className="inline-alert" role="alert"><Icon name="warning" size={17} />{pageError ?? error}</p>}
    <section className="asset-summary-grid" aria-label="Current financial position">
      <article className="asset-total-card"><span>Total assets</span><strong>{formatIdr(position.totalAssets)}</strong><small>Active assets · IDR</small></article>
      {activeLiabilities.length > 0 && <article className="asset-stat-card"><span>Net worth</span><strong>{formatIdr(position.netWorth ?? 0)}</strong><small>Total assets minus liabilities</small></article>}
      <article className="asset-stat-card"><span>Daily-use cash</span><strong>{formatIdr(position.dailyUseCash)}</strong><small>Purpose-tagged for everyday use</small></article>
      <article className="asset-stat-card"><span>Protected savings</span><strong>{formatIdr(position.protectedSavings)}</strong><small>Kept separate from spending money</small></article>
      <article className="asset-stat-card"><span>Investments</span><strong>{formatIdr(position.investmentValue)}</strong><small>Manual values; not live market prices</small></article>
    </section>

    <section className="section-block asset-history-section" aria-labelledby="asset-history-title">
      <div className="section-heading"><div><p className="eyebrow">VALUE OVER TIME</p><h2 id="asset-history-title">Asset history</h2></div>
        <Selector className="asset-range-select" label="History range" isLabelHidden value={range} options={[{ value: 'MONTH', label: 'This month' }, { value: 'QUARTER', label: 'This quarter' }, { value: 'YEAR', label: 'This year' }, { value: 'CUSTOM', label: 'Custom dates' }]} onChange={(value) => setRange(value as RangeKind)} />
      </div>
      {range === 'CUSTOM' && (
        <div className="asset-custom-range">
          <DateInput className="asset-range-date" label="From" value={customStart || undefined} presentation="native" format="system_date" aria-invalid={!validRange} aria-describedby={!validRange ? 'asset-range-error' : undefined} onChange={(value) => setCustomStart(value ?? '')} />
          <DateInput className="asset-range-date" label="To" value={customEnd || undefined} presentation="native" format="system_date" aria-invalid={!validRange} aria-describedby={!validRange ? 'asset-range-error' : undefined} onChange={(value) => setCustomEnd(value ?? '')} />
        </div>
      )}
      {!validRange ? <p id="asset-range-error" className="form-error" role="alert">Choose valid dates with the start on or before the end.</p> : <>
        <AssetLineChart points={points} description="Total asset value" />
        {comparison && <div className="asset-period-summary">
          <div><span>Start value · {formatDate(comparison.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span><strong>{formatIdr(comparison.startValue)}</strong></div>
          <div><span>End value · {formatDate(comparison.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span><strong>{formatIdr(comparison.endValue)}</strong></div>
          <div><span>Net change</span><AmountChange amount={comparison.change} percent={comparison.changePercent} /></div>
          <div className="asset-period-flows"><span>Contributions</span><strong>+{formatIdr(comparison.contributions)}</strong><span>Withdrawals</span><strong>−{formatIdr(comparison.withdrawals)}</strong>{comparison.adjustments !== 0 && <><span>Corrections</span><strong>{formatIdr(comparison.adjustments)}</strong></>}</div>
          <small>Internal tracked-account transfers are excluded from contributions and withdrawals. Change is descriptive, not investment return.</small>
        </div>}
      </>}
    </section>

    <div className="asset-breakdown-grid">
      <section className="section-block" aria-labelledby="asset-type-title"><div className="section-heading"><div><p className="eyebrow">BY CLASS</p><h2 id="asset-type-title">Asset classes</h2></div></div>
        {Object.keys(position.byType).length === 0 ? <p className="asset-muted">Add an asset to see the class breakdown.</p> : <div className="asset-breakdown-list">{Object.entries(position.byType).sort(([a], [b]) => assetTypeLabels[a as AssetType].localeCompare(assetTypeLabels[b as AssetType])).map(([type, amount]) => <div className="asset-breakdown-row" key={type}><span>{assetTypeLabels[type as AssetType]}</span><strong>{formatIdr(amount)}</strong></div>)}</div>}
      </section>
      <section className="section-block" aria-labelledby="asset-purpose-title"><div className="section-heading"><div><p className="eyebrow">BY PURPOSE</p><h2 id="asset-purpose-title">Money pools</h2></div></div>
        {Object.keys(position.byPurpose).length === 0 ? <p className="asset-muted">Use purpose tags to separate daily cash, protected savings, and investments.</p> : <div className="asset-breakdown-list">{Object.entries(position.byPurpose).sort(([a], [b]) => a.localeCompare(b)).map(([purpose, amount]) => <div className="asset-breakdown-row" key={purpose}><span>{purpose.replace('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</span><strong>{formatIdr(amount)}</strong></div>)}</div>}
      </section>
      <section className="section-block" aria-labelledby="asset-place-title"><div className="section-heading"><div><p className="eyebrow">BY HOLDING PLACE</p><h2 id="asset-place-title">Where it is held</h2></div></div>
        {Object.keys(position.byInstitution).length === 0 ? <p className="asset-muted">Holding places will appear when assets are added.</p> : <div className="asset-breakdown-list">{Object.entries(position.byInstitution).sort(([a], [b]) => a.localeCompare(b)).map(([place, amount]) => <div className="asset-breakdown-row" key={place}><span>{place}</span><strong>{formatIdr(amount)}</strong></div>)}</div>}
      </section>
    </div>

    <section className="section-block asset-list-section" aria-labelledby="asset-list-title">
      <div className="section-title-row"><div><p className="eyebrow">YOUR HOLDINGS</p><h2 id="asset-list-title">Accounts and assets</h2></div><div className="asset-section-actions"><Button label="Record transfer" className="button button-small button-outline" variant="secondary" type="button" onClick={() => setTransferOpen(true)} isDisabled={cashAssets.length < 2} icon={<Icon name="arrow-right" size={15} />}></Button><Button label="Add asset" className="button button-small button-primary" variant="primary" type="button" onClick={() => { setEditingAsset(null); setAssetDialog(true) }} icon={<Icon name="plus" size={15} />}></Button></div></div>
      {activeAssets.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="wallet" size={23} /></span>} title="No assets recorded" description="Start with an opening balance for a bank, e-wallet, savings pool, investment, or other asset. No sample balances are preloaded." actions={<Button label="Add an asset" className="button button-secondary" variant="secondary" type="button" onClick={() => { setEditingAsset(null); setAssetDialog(true) }} icon={<Icon name="plus" size={16} />}></Button>} /> : byType.map(([type, accounts]) => <div className="asset-class-group" key={type}><h3>{assetTypeLabels[type]} <small>{accounts.length}</small></h3><div className="asset-rows">{accounts.map((asset) => <AssetRow key={asset.id} asset={asset} value={values.get(asset.id) ?? 0} valuation={currentValuations.get(asset.id) ?? null} ledgerEntry={ledgerEntriesByAsset.get(asset.id) ?? null} today={today} onUpdateValue={(item) => setValuationAsset(item)} />)}</div></div>)}
    </section>

    <section className="section-block liability-section" aria-labelledby="liabilities-title">
      <div className="section-title-row"><div><p className="eyebrow">DEBT AND SETTLEMENTS</p><h2 id="liabilities-title">Liabilities</h2></div><Button label="Add liability" className="button button-small button-outline" variant="secondary" type="button" onClick={() => { setEditingLiability(null); setLiabilityDialog(true) }} icon={<Icon name="plus" size={15} />}></Button></div>
      {activeLiabilities.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="receipt" size={23} /></span>} title="No liabilities recorded" description="Add card, paylater, installment, or loan balances to include debt in your net-worth figure." actions={<Button label="Add a liability" className="button button-secondary" variant="secondary" type="button" onClick={() => { setEditingLiability(null); setLiabilityDialog(true) }} icon={<Icon name="plus" size={16} />}></Button>} /> : liabilitiesByType.map(([type, accounts]) => <div className="liability-type-group" key={type}><h3>{liabilityTypeLabels[type]}</h3>{accounts.map((liability) => {
        const balance = liabilityBalances.get(liability.id) ?? 0
        const latestEntry = liabilityEntriesByAccount.get(liability.id)?.[0]
        return <article className="liability-row" key={liability.id}><div className="liability-row-main"><strong>{liability.name}</strong><span>{liability.institution}{latestEntry ? ` · updated ${formatDate(latestEntry.date, { day: 'numeric', month: 'short' })}` : ''}</span></div><strong className="liability-row-value">{formatIdr(balance)}</strong><div className="asset-row-actions"><Button label={`Edit ${liability.name}`} className="icon-button" variant="ghost" type="button" aria-label={`Edit ${liability.name}`} onClick={() => { setEditingLiability(liability); setLiabilityDialog(true) }} icon={<Icon name="edit" size={16} />} isIconOnly /><Button label={`Record payment for ${liability.name}`} className="icon-button" variant="ghost" type="button" aria-label={`Record payment for ${liability.name}`} isDisabled={balance <= 0 || cashAssets.length === 0} onClick={() => setPaymentLiability(liability)} icon={<Icon name="arrow-right" size={16} />} isIconOnly /><Button label={`Add balance change for ${liability.name}`} className="icon-button" variant="ghost" type="button" aria-label={`Add balance change for ${liability.name}`} onClick={() => { setLiabilityActivity(liability); setSelectedLiabilityActivity(null) }} icon={<Icon name="plus" size={16} />} isIconOnly /><Button label={`Archive ${liability.name}`} className="icon-button danger-icon" variant="destructive" type="button" aria-label={`Archive ${liability.name}`} onClick={() => void archiveLiability(liability)} icon={<Icon name="trash" size={16} />} isIconOnly /></div></article>
      })}</div>)}
      {activeLiabilities.map((liability) => {
        const entries = liabilityEntriesByAccount.get(liability.id) ?? []
        if (entries.length === 0) return null
        const expanded = expandedLiabilityId === liability.id
        return <div className="liability-history" key={liability.id}>
          <Button label={`${expanded ? 'Hide' : 'View'} ${entries.length} activity record${entries.length === 1 ? '' : 's'} · ${liability.name}`} className="button button-quiet liability-history-toggle" variant="ghost" type="button" aria-expanded={expanded} onClick={() => setExpandedLiabilityId(expanded ? null : liability.id)}>{expanded ? 'Hide' : 'View'} {entries.length} activity record{entries.length === 1 ? '' : 's'} · {liability.name}</Button>
          {expanded && <div className="liability-activity-list">{entries.map((entry) => {
            const impact = entry.kind === 'PAYMENT' ? -entry.amountMinor : entry.amountMinor
            const editable = entry.kind === 'CHARGE' || entry.kind === 'INTEREST_OR_FEE' || entry.kind === 'CORRECTION'
            const label = entry.kind === 'OPENING_BALANCE' ? 'Opening balance' : entry.kind === 'INTEREST_OR_FEE' ? 'Interest or fee' : entry.kind === 'PAYMENT' ? 'Payment' : entry.kind === 'CHARGE' ? 'Charge' : 'Correction'
            return <article className="liability-activity-row" key={entry.id}>
              <div><strong>{label}</strong><span>{formatDate(entry.date, { day: 'numeric', month: 'short', year: 'numeric' })}{entry.assetEntryId ? ' · paid from a tracked asset' : ''}</span>{entry.note && <small>{entry.note}</small>}</div>
              <strong className={impact < 0 ? 'asset-change is-negative' : 'asset-change'}>{impact > 0 ? '+' : impact < 0 ? '−' : ''}{formatIdr(Math.abs(impact))}</strong>
              {entry.kind !== 'OPENING_BALANCE' && entry.kind !== 'PAYMENT' && <div className="asset-row-actions">{editable && <Button label={`Edit ${label.toLowerCase()} on ${entry.date}`} className="icon-button" variant="ghost" type="button" aria-label={`Edit ${label.toLowerCase()} on ${entry.date}`} onClick={() => { setLiabilityActivity(liability); setSelectedLiabilityActivity(entry) }} icon={<Icon name="edit" size={15} />} isIconOnly />}<Button label={`Delete ${label.toLowerCase()} on ${entry.date}`} className="icon-button danger-icon" variant="destructive" type="button" aria-label={`Delete ${label.toLowerCase()} on ${entry.date}`} onClick={() => void deleteLiabilityActivity(entry)} icon={<Icon name="trash" size={15} />} isIconOnly /></div>}
            </article>
          })}</div>}
        </div>
      })}
    </section>

    {data.assets.some((asset) => asset.archivedAt) && <section className="section-block archived-assets-section" aria-labelledby="archived-assets-title"><div className="section-heading"><div><p className="eyebrow">HISTORY</p><h2 id="archived-assets-title">Archived assets</h2></div></div><div className="archived-asset-list">{data.assets.filter((asset) => asset.archivedAt).map((asset) => <Link key={asset.id} color="inherit" href={`/assets/${encodeURIComponent(asset.id)}`}><span>{asset.name}<small>{assetTypeLabels[asset.type]} · {asset.institution}</small></span><span>Archived {formatDate(asset.archivedAt!, { day: 'numeric', month: 'short', year: 'numeric' })}</span><Icon name="chevron" size={16} /></Link>)}</div></section>}
    {data.liabilities.some((liability) => liability.archivedAt) && <section className="section-block archived-assets-section" aria-label="Archived liabilities"><p className="eyebrow">ARCHIVED LIABILITIES</p><div className="archived-asset-list">{data.liabilities.filter((liability) => liability.archivedAt).map((liability) => <div key={liability.id}><span>{liability.name}<small>{liabilityTypeLabels[liability.type]} · {liability.institution}</small></span><span>Archived {formatDate(liability.archivedAt!, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>)}</div></section>}

    <AssetForm open={assetDialog} initial={editingAsset} today={today} saving={saving} onClose={() => { setAssetDialog(false); setEditingAsset(null) }} onSave={saveAsset} />

    {valuationDialogAsset && <AssetValuationForm open asset={valuationDialogAsset} latest={latestValuation(data, valuationDialogAsset.id)} selectableAssets={pickerOpen ? valuationAssets : undefined} latestForAsset={(assetId) => latestValuation(data, assetId)} today={today} saving={saving} onClose={() => { setValuationAsset(null); setPickerOpen(false) }} onSave={(valuation) => runMutation((useCases) => useCases.saveValuation(valuation))} />}
    <TransferForm open={transferOpen} accounts={cashAssets} today={today} saving={saving} onClose={() => setTransferOpen(false)} onSave={(input) => runMutation((useCases) => useCases.transfer(input))} />
    <LiabilityForm open={liabilityDialog} initial={editingLiability} today={today} saving={saving} onClose={() => { setLiabilityDialog(false); setEditingLiability(null) }} onSave={saveLiability} />
    {liabilityActivity && <LiabilityActivityForm open liability={liabilityActivity} initial={selectedLiabilityActivity} today={today} saving={saving} onClose={() => { setLiabilityActivity(null); setSelectedLiabilityActivity(null) }} onSave={(entry) => runMutation((useCases) => useCases.saveLiabilityActivity(entry))} />}
    {paymentLiability && <LiabilityPaymentForm open liability={paymentLiability} accounts={cashAssets} assetBalances={assetBalances} maxLiabilityBalance={liabilityBalances.get(paymentLiability.id) ?? 0} today={today} saving={saving} onClose={() => setPaymentLiability(null)} onSave={(input) => runMutation((useCases) => useCases.payLiability({ liabilityId: paymentLiability.id, ...input }))} />}
  </div>
}
