import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@astryxdesign/core/Link'
import { useParams } from 'react-router-dom'
import type { AssetAccount, AssetData, AssetEntry, AssetValuation, DateOnly } from '@kinsen/budget-domain'
import { assetTypeLabels, compareDates, currencyDigits, daysSince, deriveAssetValue, deriveAssetValues } from '@kinsen/budget-domain'
import { addDays, addMonths } from '@kinsen/budget-domain/date-only'
import { useAssetStore } from '../../shared/state/asset-store'
import { useBudgetStore } from '../../shared/state/budget-store'
import { formatDate, localToday } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'
import { PageHeader } from '../../shared/components/Primitives'
import { PageSkeleton } from '../../shared/components/PageSkeleton'
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog'
import { AssetLineChart } from './AssetLineChart'
import { AssetActivityForm, AssetForm, AssetValuationForm, TransferForm } from './AssetForms'
import { RECORD_PAGE_SIZE, RecordPagination } from '../../shared/components/RecordPagination'
import { Stack } from '@astryxdesign/core/Stack'

import type { AssetOpeningRecord } from '../../infrastructure/repositories/asset-repository'
import { GoldValueDetails, GoldValueStatus, valuationOrder } from './GoldValueDetails'
import { useGoldPriceRefresh } from './useGoldPriceRefresh'
const STALE_AFTER_DAYS = 30

function amountForEntry(entry: AssetEntry): number {
  if (entry.kind === 'DEBIT' || entry.kind === 'TRANSFER_OUT') return -entry.amountMinor
  return entry.amountMinor
}

function activityLabel(entry: AssetEntry): string {
  switch (entry.kind) {
    case 'OPENING_BALANCE': return 'Opening balance'
    case 'CREDIT': return 'Credit / deposit'
    case 'DEBIT': return 'Debit / withdrawal'
    case 'TRANSFER_IN': return 'Transfer in'
    case 'TRANSFER_OUT': return 'Transfer out'
    case 'CORRECTION': return 'Correction'
  }
}

function latestValuation(data: AssetData, assetId: string, today: DateOnly): AssetValuation | null {
  let latest: AssetValuation | null = null
  for (const valuation of data.valuations) {
    if (valuation.assetId !== assetId || valuation.asOfDate > today) continue
    if (!latest || valuationOrder(valuation, latest) > 0) latest = valuation
  }
  return latest
}

function makeHistory(data: AssetData, asset: AssetAccount, today: DateOnly): Array<{ date: DateOnly; value: number }> {
  const end = asset.archivedAt ? addDays(asset.archivedAt, -1) : today
  const yearAgo = addMonths(end, -11)
  const start = compareDates(asset.createdAt, yearAgo) > 0 ? asset.createdAt : `${yearAgo.slice(0, 7)}-01`
  if (compareDates(start, end) > 0) return []
  const monthlyDates = [start]
  let date = addMonths(`${start.slice(0, 7)}-01`, 1)
  while (compareDates(date, end) < 0 && monthlyDates.length < 12) {
    if (compareDates(date, start) > 0) monthlyDates.push(date)
    date = addMonths(date, 1)
  }
  if (monthlyDates[monthlyDates.length - 1] !== end) monthlyDates.push(end)

  const valuations = asset.balanceMode === 'VALUATION'
    ? data.valuations.filter((item) => item.assetId === asset.id && compareDates(item.asOfDate, start) >= 0 && compareDates(item.asOfDate, end) <= 0)
      .sort(valuationOrder)
    : []
  const valuationDates = new Set(valuations.map((item) => item.asOfDate))
  const points = [
    ...monthlyDates.filter((pointDate) => !valuationDates.has(pointDate)).map((pointDate) => ({
      date: pointDate,
      value: deriveAssetValue(asset, data, pointDate),
      order: 0,
    })),
    ...valuations.map((item) => ({ date: item.asOfDate, value: item.valueIdr, order: item.recordedAt })),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.order - right.order)
  const maxPoints = 120
  const sampled = points.length <= maxPoints
    ? points
    : Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * (points.length - 1) / (maxPoints - 1))]!)
  return sampled.map(({ date: pointDate, value }) => ({ date: pointDate, value }))
}

function nativeValue(valuation: AssetValuation): string {
  const digits = currencyDigits(valuation.nativeCurrency)
  return `${new Intl.NumberFormat('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(valuation.nativeAmountMinor / (10 ** digits))} ${valuation.nativeCurrency}`
}

export function AssetDetailPage() {
  const { assetId = '' } = useParams()
  const status = useAssetStore((state) => state.status)
  const data = useAssetStore((state) => state.data)
  const error = useAssetStore((state) => state.error)
  const saving = useAssetStore((state) => state.saving)
  const initialize = useAssetStore((state) => state.initialize)
  const runMutation = useAssetStore((state) => state.runMutation)
  const snapshot = useBudgetStore((state) => state.snapshot)
  const { online } = useGoldPriceRefresh()
  const goldErrors = useAssetStore(state => state.goldErrors)
  const goldRefreshing = useAssetStore(state => state.goldRefreshing)
  const refreshGoldPrices = useAssetStore(state => state.refreshGoldPrices)
  const today = localToday()
  const [assetDialog, setAssetDialog] = useState(false)
  const [activityDialog, setActivityDialog] = useState(false)
  const [editingEntry, setEditingEntry] = useState<AssetEntry | null>(null)
  const [valuationDialog, setValuationDialog] = useState(false)
  const [transferDialog, setTransferDialog] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)
  const [confirmingActivity, setConfirmingActivity] = useState<AssetEntry | null>(null)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [timelinePage, setTimelinePage] = useState(1)
  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => setTimelinePage(1), [assetId])

  const asset = data.assets.find((item) => item.id === assetId)
  const archived = Boolean(asset?.archivedAt)
  const asOfDate = asset?.archivedAt ? addDays(asset.archivedAt, -1) : today
  const activeAccounts = useMemo(() => data.assets.filter((item) => !item.archivedAt && item.balanceMode === 'LEDGER'), [data.assets])
  const values = useMemo(() => deriveAssetValues(data, asOfDate), [data, asOfDate])
  const history = useMemo(() => asset ? makeHistory(data, asset, today) : [], [data, asset, today])
  const valuation = asset?.balanceMode === 'VALUATION' ? latestValuation(data, asset.id, asOfDate) : null
  const assetEntries = useMemo(() => data.assetEntries.filter((entry) => entry.assetId === assetId).sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id)), [data.assetEntries, assetId])
  const assetValuations = useMemo(() => data.valuations.filter((item) => item.assetId === assetId).sort((left, right) => right.asOfDate.localeCompare(left.asOfDate) || right.recordedAt - left.recordedAt || right.id.localeCompare(left.id)), [data.valuations, assetId])
  const currentValuation = asset?.balanceMode === 'VALUATION' ? assetValuations.find((item) => compareDates(item.asOfDate, asOfDate) <= 0) ?? null : null
  const currentValuationIndex = currentValuation ? assetValuations.findIndex((item) => item.id === currentValuation.id) : -1
  const previousValuation = currentValuationIndex >= 0 ? assetValuations[currentValuationIndex + 1] ?? null : null
  const timeline = useMemo(() => [
    ...assetEntries.map((entry) => ({ kind: 'ACTIVITY' as const, date: entry.date, id: entry.id, entry })),
    ...assetValuations.map((valuation) => ({ kind: 'VALUATION' as const, date: valuation.asOfDate, id: valuation.id, valuation })),
  ].sort((left, right) => {
    const byDate = right.date.localeCompare(left.date)
    if (byDate) return byDate
    const leftRecordedAt = left.kind === 'VALUATION' ? left.valuation.recordedAt : 0
    const rightRecordedAt = right.kind === 'VALUATION' ? right.valuation.recordedAt : 0
    return rightRecordedAt - leftRecordedAt || right.id.localeCompare(left.id)
  }), [assetEntries, assetValuations])
  const timelinePageCount = Math.max(1, Math.ceil(timeline.length / RECORD_PAGE_SIZE))
  const currentTimelinePage = Math.min(timelinePage, timelinePageCount)
  const visibleTimeline = timeline.slice((currentTimelinePage - 1) * RECORD_PAGE_SIZE, currentTimelinePage * RECORD_PAGE_SIZE)
  const transactionsById = useMemo(() => new Map((snapshot?.transactions ?? []).map((item) => [item.id, item])), [snapshot?.transactions])
  const liabilityEntriesById = useMemo(() => new Map(data.liabilityEntries.map((item) => [item.id, item])), [data.liabilityEntries])
  const liabilitiesById = useMemo(() => new Map(data.liabilities.map((item) => [item.id, item])), [data.liabilities])
  const lastEntry = assetEntries.find((entry) => compareDates(entry.date, asOfDate) <= 0)
  const currentValue = asset ? values.get(asset.id) ?? 0 : 0
  const stale = Boolean(currentValuation && !currentValuation.goldQuote && daysSince(today, currentValuation.asOfDate) > STALE_AFTER_DAYS)

  async function saveAsset(updated: AssetAccount, record?: AssetOpeningRecord) {
    await runMutation((useCases) => useCases.saveAsset(updated, record && 'valuation' in record ? record.valuation : undefined))
    setAssetDialog(false)
  }
  async function saveActivity(entry: AssetEntry) {
    await runMutation((useCases) => useCases.saveActivity(entry))
    setActivityDialog(false)
    setEditingEntry(null)
  }
  async function deleteActivity(entry: AssetEntry) {
    setPageError(null)
    try { await runMutation((useCases) => useCases.deleteActivity(entry.id)) }
    catch (reason) { setPageError(reason instanceof Error ? reason.message : 'Activity could not be deleted.') }
  }
  async function archive() {
    if (!asset) return
    setPageError(null)
    try { await runMutation((useCases) => useCases.archiveAsset(asset.id, today)) }
    catch (reason) { setPageError(reason instanceof Error ? reason.message : 'Asset could not be archived.') }
  }

  if (status === 'idle' || status === 'loading') return <PageSkeleton variant="detail" label="Loading asset details" />
  if (!asset) return <div className="asset-load-error"><h2>Asset not found</h2><p>This asset may have been removed from this device.</p><Link className="button button-secondary" color="inherit" href="/assets">Return to Assets</Link></div>

  const valueDate = currentValuation?.asOfDate ?? lastEntry?.date ?? asset.createdAt
  const showNative = currentValuation !== null && !currentValuation.goldQuote
  const paidFromTransaction = (entry: AssetEntry) => entry.budgetTransactionId ? transactionsById.get(entry.budgetTransactionId) : undefined
  const canEditEntry = (entry: AssetEntry) => entry.kind !== 'OPENING_BALANCE' && entry.kind !== 'TRANSFER_IN' && entry.kind !== 'TRANSFER_OUT' && !entry.budgetTransactionId && !entry.liabilityEntryId
  const linkedRecordCount = assetEntries.length + assetValuations.length

  return <Stack as="section" className="asset-detail-page" direction="vertical" gap={4}>
    <Link className="asset-back-link" color="inherit" href="/assets"><Icon name="arrow-left" size={17} />All assets</Link>
    {error && <p className="inline-alert" role="alert"><Icon name="warning" size={17} />{error}</p>}
    {pageError && <p className="inline-alert" role="alert"><Icon name="warning" size={17} />{pageError}</p>}
    {archived && <div className="archived-banner" role="status">Archived {formatDate(asset.archivedAt!, { day: 'numeric', month: 'long', year: 'numeric' })} · shown for historical review only.</div>}
    <PageHeader eyebrow={`${assetTypeLabels[asset.type]} · ${asset.institution}`} title={asset.name} description={asset.notes ?? 'Saved asset valuations stay separate from Safe to Spend Today.'} actions={!archived ? <>
      <Button label="Edit details" icon={<Icon name="edit" size={17} />} className="button button-outline" variant="secondary" type="button" onClick={() => setAssetDialog(true)} />
      {asset.balanceMode === 'VALUATION' ? <Button label={asset.goldPricing ? 'Refresh price' : 'Update value'} icon={<Icon name="edit" size={17} />} className="button button-outline" variant="secondary" type="button" isDisabled={Boolean(asset.goldPricing) && (goldRefreshing || !online)} onClick={() => { if (asset.goldPricing) void refreshGoldPrices(true); else setValuationDialog(true) }} /> : <Button label="Add activity" icon={<Icon name="plus" size={17} />} className="button button-outline" variant="secondary" type="button" onClick={() => { setEditingEntry(null); setActivityDialog(true) }} />}
      {asset.balanceMode === 'LEDGER' && <Button label="Transfer" icon={<Icon name="arrow-right" size={17} />} className="button button-outline" variant="secondary" type="button" onClick={() => setTransferDialog(true)} isDisabled={activeAccounts.length < 2} />}
      <Button label="Archive" icon={<Icon name="trash" size={17} />} className="button button-quiet" variant="ghost" type="button" onClick={() => setConfirmingArchive(true)} />
    </> : undefined} />

    <section className="asset-detail-hero" aria-label="Current asset value">
      <Stack direction="vertical" gap={1}><small>{archived ? 'Value before archive' : 'Current value'}</small><strong>{formatIdr(currentValue)}</strong><small>{asset.balanceMode === 'VALUATION' ? `As of ${formatDate(valueDate, { day: 'numeric', month: 'short', year: 'numeric' })}${currentValuation?.goldQuote ? '' : ' · manual estimate'}` : `Ledger balance · activity through ${formatDate(valueDate, { day: 'numeric', month: 'short', year: 'numeric' })}`}</small>{currentValuation?.goldQuote && <GoldValueDetails valuation={currentValuation} />}{(asset.goldPricing || currentValuation?.goldQuote) && !archived && <GoldValueStatus valuation={currentValuation} today={today} online={online} error={goldErrors[asset.id]} />}{previousValuation && currentValuation && <small>Change since {formatDate(previousValuation.asOfDate, { day: 'numeric', month: 'short', year: 'numeric' })}: {currentValuation.valueIdr > previousValuation.valueIdr ? '+' : ''}{formatIdr(currentValuation.valueIdr - previousValuation.valueIdr)}</small>}</Stack>
      {showNative && currentValuation && <div className="asset-native-value"><span>Native value</span><strong>{nativeValue(currentValuation)}</strong><small>1 {currentValuation.nativeCurrency} = Rp {currentValuation.exchangeRate} · rate dated {formatDate(currentValuation.rateDate, { day: 'numeric', month: 'short', year: 'numeric' })}</small></div>}
      {stale && !archived && <span className="stale-badge">Stale manual estimate</span>}
    </section>

    <section className="section-block asset-detail-history" aria-labelledby="asset-detail-history-title"><div className="section-heading"><div><p className="eyebrow">VALUE HISTORY</p><h2 id="asset-detail-history-title">How the value changed</h2></div></div><AssetLineChart points={history} description={`${asset.name} value`} /></section>

    <section className="section-block asset-timeline-section" aria-labelledby="asset-timeline-title"><div className="section-heading"><div><p className="eyebrow">DATED RECORDS</p><h2 id="asset-timeline-title">Activity and valuations</h2></div><span className="asset-record-count">{timeline.length} records</span></div>
      {timeline.length === 0 ? <EmptyState className="empty-state" title="No dated records" icon={<span className="empty-icon"><Icon name="receipt" size={23} /></span>} description="Opening balances and manual valuations will appear here." /> : <div className="asset-timeline">
        {visibleTimeline.map((record) => {
          if (record.kind === 'ACTIVITY') {
            const entry = record.entry
            const linkedTransaction = paidFromTransaction(entry)
            const liabilityEntry = entry.liabilityEntryId ? liabilityEntriesById.get(entry.liabilityEntryId) : null
            const linkedLiability = liabilityEntry ? liabilitiesById.get(liabilityEntry.liabilityId) : null
            return <article className="asset-timeline-row" key={entry.id}>
              <span className={`asset-timeline-marker${amountForEntry(entry) < 0 ? ' is-outflow' : ''}`} aria-hidden="true"><Icon name={entry.kind === 'TRANSFER_IN' || entry.kind === 'TRANSFER_OUT' ? 'arrow-right' : 'receipt'} size={16} /></span>
              <div className="asset-timeline-main"><strong>{activityLabel(entry)}</strong><span>{formatDate(entry.date, { day: 'numeric', month: 'short', year: 'numeric' })}{entry.note ? ` · ${entry.note}` : ''}</span>{linkedTransaction && <small>Paid from · {linkedTransaction.description}</small>}{linkedLiability && <small>Liability settlement · {linkedLiability.name}; not a second expense</small>}{entry.transferId && <small>Internal transfer · paired record</small>}</div>
              <strong className={amountForEntry(entry) < 0 ? 'timeline-amount is-negative' : 'timeline-amount'}>{amountForEntry(entry) > 0 ? '+' : ''}{formatIdr(amountForEntry(entry))}</strong>
              {!archived && canEditEntry(entry) && <div className="row-actions"><Button label={`Edit ${activityLabel(entry)}`} icon={<Icon name="edit" size={16} />} isIconOnly className="icon-button" variant="ghost" type="button" onClick={() => { setEditingEntry(entry); setActivityDialog(true) }} /><Button label={`Delete ${activityLabel(entry)}`} icon={<Icon name="trash" size={16} />} isIconOnly className="icon-button danger-icon" variant="destructive" type="button" onClick={() => setConfirmingActivity(entry)} /></div>}
            </article>
          }
          const item = record.valuation
          return <article className="asset-timeline-row valuation-timeline-row" key={item.id}>
            <span className="asset-timeline-marker is-valuation" aria-hidden="true"><Icon name="assets" size={16} /></span>
            <Stack direction="vertical" gap={1} className="asset-timeline-main">{item.goldQuote ? <GoldValueDetails valuation={item} /> : <><strong>Manual valuation{item.source === 'IMPORTED' ? ' · imported' : ''}</strong><small>{formatDate(item.asOfDate, { day: 'numeric', month: 'short', year: 'numeric' })} · {nativeValue(item)}</small>{item.nativeCurrency !== 'IDR' && <small>Rate: 1 {item.nativeCurrency} = Rp {item.exchangeRate} · dated {formatDate(item.rateDate, { day: 'numeric', month: 'short', year: 'numeric' })}</small>}{item.quantity && <small>Quantity {item.quantity}{item.unitPrice ? ` · unit price ${item.unitPrice}` : ''}</small>}{item.note && <small>{item.note}</small>}</>}</Stack>
            <strong className="timeline-amount">{formatIdr(item.valueIdr)}</strong>
            {item.goldQuote ? <GoldValueStatus valuation={item} today={today} online={true} /> : !archived && item.asOfDate <= today && daysSince(today, item.asOfDate) > STALE_AFTER_DAYS && <small>Stale</small>}
          </article>
        })}
      </div>}
        <RecordPagination count={timeline.length} page={currentTimelinePage} onPageChange={setTimelinePage} />
    </section>

    <AssetForm open={assetDialog} initial={asset} today={today} saving={saving} onClose={() => setAssetDialog(false)} onSave={saveAsset} />
    {asset.balanceMode === 'LEDGER' && <AssetActivityForm open={activityDialog} asset={asset} initial={editingEntry} today={today} saving={saving} onClose={() => { setActivityDialog(false); setEditingEntry(null) }} onSave={saveActivity} />}
    {asset.balanceMode === 'VALUATION' && !asset.goldPricing && <AssetValuationForm open={valuationDialog} asset={asset} latest={valuation} today={today} saving={saving} onClose={() => setValuationDialog(false)} onSave={(value) => runMutation((useCases) => useCases.saveValuation(value))} />}
    {asset.balanceMode === 'LEDGER' && <TransferForm open={transferDialog} accounts={activeAccounts} sourceAssetId={asset.id} today={today} saving={saving} onClose={() => setTransferDialog(false)} onSave={(input) => runMutation((useCases) => useCases.transfer(input))} />}
    <ConfirmationDialog
      open={confirmingActivity !== null}
      title={confirmingActivity ? `Delete ${activityLabel(confirmingActivity).toLowerCase()}?` : 'Delete activity?'}
      description="The balance and history will be recalculated."
      confirmLabel="Delete activity"
      onClose={() => setConfirmingActivity(null)}
      onConfirm={() => {
        if (!confirmingActivity) return
        const entry = confirmingActivity
        setConfirmingActivity(null)
        void deleteActivity(entry)
      }}
    />
    <ConfirmationDialog
      open={confirmingArchive}
      title={`Archive “${asset.name}”?`}
      description={linkedRecordCount > 0
        ? `${linkedRecordCount} dated record${linkedRecordCount === 1 ? '' : 's'} will remain in historical reports.`
        : 'This asset will no longer appear among active holdings.'}
      confirmLabel="Archive asset"
      onClose={() => setConfirmingArchive(false)}
      onConfirm={() => {
        setConfirmingArchive(false)
        void archive()
      }}
    />
  </Stack>
}
