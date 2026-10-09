import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Stack } from '@astryxdesign/core/Stack'
import { useMemo, useState } from 'react'
import type { AssetAccount, AssetData, DateOnly, LiabilityAccount, LiabilityEntry } from '@kinsen/budget-domain'
import { deriveLiabilityBalance, liabilityTypeLabels } from '@kinsen/budget-domain'
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog'
import { Icon } from '../../shared/components/Icon'
import { RECORD_PAGE_SIZE, RecordPagination } from '../../shared/components/RecordPagination'
import { formatDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { useAssetStore } from '../../shared/state/asset-store'
import { LiabilityActivityForm, LiabilityForm, LiabilityPaymentForm } from './AssetForms'

type AssetLiabilitiesSectionProps = {
  data: AssetData
  today: DateOnly
  cashAssets: AssetAccount[]
  assetBalances: Record<string, number>
  onError: (message: string | null) => void
}

type LiabilityRowProps = {
  liability: LiabilityAccount
  balance: number
  latestEntry: LiabilityEntry | undefined
  hasCashAssets: boolean
  onEdit: (liability: LiabilityAccount) => void
  onPayment: (liability: LiabilityAccount) => void
  onAddActivity: (liability: LiabilityAccount) => void
  onArchive: (liability: LiabilityAccount) => void
}

function LiabilityRow({ liability, balance, latestEntry, hasCashAssets, onEdit, onPayment, onAddActivity, onArchive }: LiabilityRowProps) {
  return <article className="liability-row">
    <Stack className="liability-row-main">
      <strong>{liability.name}</strong>
      <span>{liability.institution}{latestEntry ? ` · updated ${formatDate(latestEntry.date, { day: 'numeric', month: 'short' })}` : ''}</span>
    </Stack>
    <strong className="liability-row-value">{formatIdr(balance)}</strong>
    <Stack direction="horizontal" className="asset-row-actions">
      <Button label={`Edit ${liability.name}`} className="icon-button" variant="ghost" type="button" aria-label={`Edit ${liability.name}`} onClick={() => onEdit(liability)} icon={<Icon name="edit" size={16} />} isIconOnly />
      <Button label={`Record payment for ${liability.name}`} className="icon-button" variant="ghost" type="button" aria-label={`Record payment for ${liability.name}`} isDisabled={balance <= 0 || !hasCashAssets} onClick={() => onPayment(liability)} icon={<Icon name="arrow-right" size={16} />} isIconOnly />
      <Button label={`Add balance change for ${liability.name}`} className="icon-button" variant="ghost" type="button" aria-label={`Add balance change for ${liability.name}`} onClick={() => onAddActivity(liability)} icon={<Icon name="plus" size={16} />} isIconOnly />
      <Button label={`Archive ${liability.name}`} className="icon-button danger-icon" variant="destructive" type="button" aria-label={`Archive ${liability.name}`} onClick={() => onArchive(liability)} icon={<Icon name="trash" size={16} />} isIconOnly />
    </Stack>
  </article>
}

type LiabilityHistoryProps = {
  liability: LiabilityAccount
  entries: LiabilityEntry[]
  expanded: boolean
  page: number
  onToggle: () => void
  onPageChange: (page: number) => void
  onEditActivity: (liability: LiabilityAccount, entry: LiabilityEntry) => void
  onDeleteActivity: (entry: LiabilityEntry) => void
}

function LiabilityHistory({ liability, entries, expanded, page: rememberedPage, onToggle, onPageChange, onEditActivity, onDeleteActivity }: LiabilityHistoryProps) {
  if (entries.length === 0) return null
  const pageCount = Math.max(1, Math.ceil(entries.length / RECORD_PAGE_SIZE))
  const page = Math.min(rememberedPage, pageCount)
  const visibleEntries = entries.slice((page - 1) * RECORD_PAGE_SIZE, page * RECORD_PAGE_SIZE)

  return <Stack className="liability-history" style={{ display: 'block' }}>
    <Button label={`${expanded ? 'Hide' : 'View'} ${entries.length} activity record${entries.length === 1 ? '' : 's'} · ${liability.name}`} className="button button-quiet liability-history-toggle" variant="ghost" type="button" aria-expanded={expanded} onClick={onToggle}>{expanded ? 'Hide' : 'View'} {entries.length} activity record{entries.length === 1 ? '' : 's'} · {liability.name}</Button>
    {expanded && <>
      <Stack className="liability-activity-list">{visibleEntries.map((entry) => {
        const impact = entry.kind === 'PAYMENT' ? -entry.amountMinor : entry.amountMinor
        const editable = entry.kind === 'CHARGE' || entry.kind === 'INTEREST_OR_FEE' || entry.kind === 'CORRECTION'
        const label = entry.kind === 'OPENING_BALANCE' ? 'Opening balance' : entry.kind === 'INTEREST_OR_FEE' ? 'Interest or fee' : entry.kind === 'PAYMENT' ? 'Payment' : entry.kind === 'CHARGE' ? 'Charge' : 'Correction'
        return <article className="liability-activity-row" key={entry.id}>
          <Stack>
            <strong>{label}</strong>
            <span>{formatDate(entry.date, { day: 'numeric', month: 'short', year: 'numeric' })}{entry.assetEntryId ? ' · paid from a tracked asset' : ''}</span>
            {entry.note && <small>{entry.note}</small>}
          </Stack>
          <strong className={impact < 0 ? 'asset-change is-negative' : 'asset-change'}>{impact > 0 ? '+' : impact < 0 ? '−' : ''}{formatIdr(Math.abs(impact))}</strong>
          {entry.kind !== 'OPENING_BALANCE' && entry.kind !== 'PAYMENT' && <Stack direction="horizontal" className="asset-row-actions">
            {editable && <Button label={`Edit ${label.toLowerCase()} on ${entry.date}`} className="icon-button" variant="ghost" type="button" aria-label={`Edit ${label.toLowerCase()} on ${entry.date}`} onClick={() => onEditActivity(liability, entry)} icon={<Icon name="edit" size={15} />} isIconOnly />}
            <Button label={`Delete ${label.toLowerCase()} on ${entry.date}`} className="icon-button danger-icon" variant="destructive" type="button" aria-label={`Delete ${label.toLowerCase()} on ${entry.date}`} onClick={() => onDeleteActivity(entry)} icon={<Icon name="trash" size={15} />} isIconOnly />
          </Stack>}
        </article>
      })}</Stack>
      <RecordPagination count={entries.length} page={page} onPageChange={onPageChange} />
    </>}
  </Stack>
}

export function AssetLiabilitiesSection({ data, today, cashAssets, assetBalances, onError }: AssetLiabilitiesSectionProps) {
  const saving = useAssetStore((state) => state.saving)
  const runMutation = useAssetStore((state) => state.runMutation)
  const [liabilityDialog, setLiabilityDialog] = useState(false)
  const [editingLiability, setEditingLiability] = useState<LiabilityAccount | null>(null)
  const [liabilityActivity, setLiabilityActivity] = useState<LiabilityAccount | null>(null)
  const [paymentLiability, setPaymentLiability] = useState<LiabilityAccount | null>(null)
  const [selectedLiabilityActivity, setSelectedLiabilityActivity] = useState<LiabilityEntry | null>(null)
  const [expandedLiabilityId, setExpandedLiabilityId] = useState<string | null>(null)
  const [liabilityHistoryPages, setLiabilityHistoryPages] = useState<Record<string, number>>({})
  const [confirmingArchiveLiability, setConfirmingArchiveLiability] = useState<LiabilityAccount | null>(null)
  const [confirmingLiabilityActivity, setConfirmingLiabilityActivity] = useState<LiabilityEntry | null>(null)

  const activeLiabilities = useMemo(() => data.liabilities.filter((liability) => !liability.archivedAt), [data.liabilities])
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

  async function saveLiability(liability: LiabilityAccount, openingEntry?: LiabilityEntry) {
    onError(null)
    await runMutation((useCases) => editingLiability ? useCases.saveLiability(liability) : openingEntry ? useCases.createLiability(liability, openingEntry) : Promise.reject(new Error('An opening balance is required.')))
    setLiabilityDialog(false)
    setEditingLiability(null)
  }

  async function archiveLiability(liability: LiabilityAccount) {
    onError(null)
    try { await runMutation((useCases) => useCases.archiveLiability(liability.id, today)) }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'Liability could not be archived.') }
  }

  async function deleteLiabilityActivity(entry: LiabilityEntry) {
    onError(null)
    try { await runMutation((useCases) => useCases.deleteLiabilityActivity(entry.id)) }
    catch (reason) { onError(reason instanceof Error ? reason.message : 'Liability adjustment could not be deleted.') }
  }

  const confirmingLiabilityBalance = confirmingArchiveLiability ? liabilityBalances.get(confirmingArchiveLiability.id) ?? 0 : 0
  const confirmingLiabilityRecordCount = confirmingArchiveLiability ? liabilityEntriesByAccount.get(confirmingArchiveLiability.id)?.length ?? 0 : 0
  const confirmingArchiveDescription = [
    confirmingLiabilityBalance > 0 ? `Its outstanding ${formatIdr(confirmingLiabilityBalance)} balance will no longer be included in current net worth.` : null,
    confirmingLiabilityRecordCount > 0 ? `${confirmingLiabilityRecordCount} dated record${confirmingLiabilityRecordCount === 1 ? '' : 's'} will remain in history.` : null,
  ].filter((detail): detail is string => detail !== null).join(' ') || 'This liability will no longer be active.'

  function openLiabilityForm() {
    setEditingLiability(null)
    setLiabilityDialog(true)
  }

  return <>
    <section className="section-block liability-section" aria-labelledby="liabilities-title">
      <Stack direction="horizontal" className="section-title-row">
        <Stack style={{ display: 'block' }}><p className="eyebrow">DEBT AND SETTLEMENTS</p><h2 id="liabilities-title">Liabilities</h2></Stack>
        <Button label="Add liability" className="button button-small button-outline" variant="secondary" type="button" onClick={openLiabilityForm} icon={<Icon name="plus" size={15} />} />
      </Stack>
      {activeLiabilities.length === 0 ? <EmptyState className="empty-state" icon={<Stack as="span" className="empty-icon" aria-hidden="true"><Icon name="receipt" size={23} /></Stack>} title="No liabilities recorded" description="Add card, paylater, installment, or loan balances to include debt in your net-worth figure." actions={<Button label="Add a liability" className="button button-secondary" variant="secondary" type="button" onClick={openLiabilityForm} icon={<Icon name="plus" size={16} />} />} /> : liabilitiesByType.map(([type, accounts]) => <Stack className="liability-type-group" key={type}>
        <h3>{liabilityTypeLabels[type]}</h3>
        {accounts.map((liability) => <LiabilityRow
          key={liability.id}
          liability={liability}
          balance={liabilityBalances.get(liability.id) ?? 0}
          latestEntry={liabilityEntriesByAccount.get(liability.id)?.[0]}
          hasCashAssets={cashAssets.length > 0}
          onEdit={(item) => { setEditingLiability(item); setLiabilityDialog(true) }}
          onPayment={setPaymentLiability}
          onAddActivity={(item) => { setLiabilityActivity(item); setSelectedLiabilityActivity(null) }}
          onArchive={setConfirmingArchiveLiability}
        />)}
      </Stack>)}
      {activeLiabilities.map((liability) => <LiabilityHistory
        key={liability.id}
        liability={liability}
        entries={liabilityEntriesByAccount.get(liability.id) ?? []}
        expanded={expandedLiabilityId === liability.id}
        page={liabilityHistoryPages[liability.id] ?? 1}
        onToggle={() => setExpandedLiabilityId(expandedLiabilityId === liability.id ? null : liability.id)}
        onPageChange={(nextPage) => setLiabilityHistoryPages((current) => ({ ...current, [liability.id]: nextPage }))}
        onEditActivity={(item, entry) => { setLiabilityActivity(item); setSelectedLiabilityActivity(entry) }}
        onDeleteActivity={setConfirmingLiabilityActivity}
      />)}
    </section>
    <LiabilityForm open={liabilityDialog} initial={editingLiability} today={today} saving={saving} onClose={() => { setLiabilityDialog(false); setEditingLiability(null) }} onSave={saveLiability} />
    {liabilityActivity && <LiabilityActivityForm open liability={liabilityActivity} initial={selectedLiabilityActivity} today={today} saving={saving} onClose={() => { setLiabilityActivity(null); setSelectedLiabilityActivity(null) }} onSave={(entry) => runMutation((useCases) => useCases.saveLiabilityActivity(entry))} />}
    {paymentLiability && <LiabilityPaymentForm open liability={paymentLiability} accounts={cashAssets} assetBalances={assetBalances} maxLiabilityBalance={liabilityBalances.get(paymentLiability.id) ?? 0} today={today} saving={saving} onClose={() => setPaymentLiability(null)} onSave={(input) => runMutation((useCases) => useCases.payLiability({ liabilityId: paymentLiability.id, ...input }))} />}
    <ConfirmationDialog
      open={confirmingLiabilityActivity !== null}
      title={confirmingLiabilityActivity ? `Delete liability adjustment on ${formatDate(confirmingLiabilityActivity.date, { day: 'numeric', month: 'short', year: 'numeric' })}?` : 'Delete liability adjustment?'}
      description={confirmingLiabilityActivity?.assetEntryId
        ? 'Its paired cash-account debit will also be removed. The balance and net worth will be recalculated.'
        : 'The balance and net worth will be recalculated.'}
      confirmLabel="Delete adjustment"
      onClose={() => setConfirmingLiabilityActivity(null)}
      onConfirm={() => {
        if (!confirmingLiabilityActivity) return
        const entry = confirmingLiabilityActivity
        setConfirmingLiabilityActivity(null)
        void deleteLiabilityActivity(entry)
      }}
    />
    <ConfirmationDialog
      open={confirmingArchiveLiability !== null}
      title={confirmingArchiveLiability ? `Archive “${confirmingArchiveLiability.name}”?` : 'Archive liability?'}
      description={confirmingArchiveDescription}
      confirmLabel="Archive liability"
      onClose={() => setConfirmingArchiveLiability(null)}
      onConfirm={() => {
        if (!confirmingArchiveLiability) return
        const liability = confirmingArchiveLiability
        setConfirmingArchiveLiability(null)
        void archiveLiability(liability)
      }}
    />
  </>
}
