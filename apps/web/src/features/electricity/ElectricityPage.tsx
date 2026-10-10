import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { DateInput } from '@astryxdesign/core/DateInput'
import type { ISODateString } from '@astryxdesign/core/Calendar'
import { Grid } from '@astryxdesign/core/Grid'
import { Heading } from '@astryxdesign/core/Text'
import { IconButton } from '@astryxdesign/core/IconButton'
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Table, proportional } from '@astryxdesign/core/Table'
import type { TableColumn } from '@astryxdesign/core/Table'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useEffect, useMemo, useState } from 'react'
import type { DateOnly, ElectricityWarning, RefillSource, TokenObservation } from '@kinsen/budget-domain'
import { calculateLifetimeMetrics, calculateMonthMetrics, parseIdrAmount, parseKwhToMilliKwh, sortElectricityHistory, validateElectricityHistory } from '@kinsen/budget-domain'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'
import { formatDate, formatMonth, localToday } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { useElectricityStore } from '../../shared/state/electricity-store'
import { PageHeader } from '../../shared/components/Primitives'
import { PageSkeleton } from '../../shared/components/PageSkeleton'
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog'
import { DialogForm, DialogFormSection, type FormErrorIssue } from '../../shared/components/DialogForm'
import { RecordPagination, RECORD_PAGE_SIZE } from '../../shared/components/RecordPagination'
import { Icon } from '../../shared/components/Icon'
import { newId } from '../../shared/format/id'
import { BalanceChart } from './BalanceChart'

type ReadingDraft = {
  date: DateOnly
  remainingKwh: number | null
  refillKwh: number | null
  refillCostIdr: number | null
  refillSource: RefillSource
  note: string
  sameDayOrder: number
}

type ReadingFieldErrors = Partial<Record<'date' | 'remainingKwh' | 'refillKwh' | 'refillCostIdr', string>>

const READING_FIELDS: ReadonlyArray<{ name: keyof ReadingFieldErrors; label: string }> = [
  { name: 'date', label: 'Reading date' },
  { name: 'remainingKwh', label: 'Remaining credit' },
  { name: 'refillKwh', label: 'Credited refill' },
  { name: 'refillCostIdr', label: 'Purchase amount' },
]

type ReadingRow = Record<string, unknown> & {
  id: string
  date: DateOnly
  sequence: number
  remainingMilliKwh: number
  refillMilliKwh: number | null
  refillCostIdr: number | null
  refillSource: RefillSource
  note?: string
}

const refillOptions = [
  { value: 'none', label: 'No refill on this reading', description: 'Record the remaining meter credit only.' },
  { value: 'entered', label: 'Actual credited kWh', description: 'Use the kWh amount shown on the PLN purchase.' },
  { value: 'inferred_balance_difference', label: 'Estimate from balance difference', description: 'Provisional; assumes no usage between readings.' },
  { value: 'unknown', label: 'Refill happened, kWh unknown', description: 'Keeps the record but blocks affected usage estimates.' },
]

const kwhNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 })
const metricNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

function formatKwh(value: number | null, unit = 'kWh'): string {
  return value === null ? 'Not enough data' : `${metricNumber.format(value)} ${unit}`
}

function formatBalance(value: number): string {
  return `${kwhNumber.format(value / 1000)} kWh`
}

function refillLabel(source: RefillSource): string {
  if (source === 'entered') return 'Actual'
  if (source === 'inferred_balance_difference') return 'Inferred estimate'
  if (source === 'unknown') return 'Unknown credit'
  return 'No refill'
}

function initialDraft(observation: TokenObservation | null, observations: readonly TokenObservation[], today: DateOnly): ReadingDraft {
  const peers = observation
    ? observations.filter((item) => item.date === observation.date && item.id !== observation.id)
    : []
  const sameDayOrder = observation
    ? peers.filter((item) => item.sequence < observation.sequence).length + 1
    : 1
  return observation
    ? {
        date: observation.date,
        remainingKwh: observation.remainingMilliKwh / 1000,
        refillKwh: observation.refillMilliKwh === null ? null : observation.refillMilliKwh / 1000,
        refillCostIdr: observation.refillCostIdr,
        refillSource: observation.refillSource,
        note: observation.note ?? '',
        sameDayOrder,
      }
    : { date: today, remainingKwh: null, refillKwh: null, refillCostIdr: null, refillSource: 'none', note: '', sameDayOrder: 1 }
}

function MetricCard({ label, value, detail, status }: { label: string; value: string; detail: string; status?: 'warning' | 'error' }) {
  return (
    <Card className="electricity-metric-card">
      <Stack gap={1}>
        <Text type="label">{label}</Text>
        <Heading level={3} className="electricity-metric-value">{value}</Heading>
        <Text type="supporting">{detail}</Text>
        {status && <StatusDot variant={status} label={status === 'warning' ? 'Estimate warning' : 'Data needs attention'} />}
      </Stack>
    </Card>
  )
}

/** Compact label/value row, used where a full card would outweigh the value it carries. */
function MetricRow({ label, value, status }: { label: string; value: string; status?: 'warning' | 'error' }) {
  return (
    <MetadataListItem label={label}>
      <Stack direction="horizontal" gap={2} vAlign="center">
        <Text weight="semibold" hasTabularNumbers>{value}</Text>
        {status && <StatusDot variant={status} label={status === 'warning' ? 'Estimate warning' : 'Data needs attention'} />}
      </Stack>
    </MetadataListItem>
  )
}

function WarningList({ warnings, errors, onReview }: { warnings: ElectricityWarning[]; errors: Array<{ message: string; recordIds: string[] }>; onReview: (id: string) => void }) {
  if (!warnings.length && !errors.length) return null
  return (
    <Stack as="section" className="electricity-quality" gap={2} aria-labelledby="electricity-quality-heading">
      <Heading level={2} id="electricity-quality-heading">Data quality</Heading>
      {errors.map((item, index) => (
        <Stack key={`${item.message}-${index}`} className="electricity-quality-item is-error" direction="horizontal" gap={2} role="alert">
          <StatusDot variant="error" label="Calculation needs correction" />
          <Text>{item.message}</Text>
          {item.recordIds.map((id) => <a key={id} href={`#reading-${id}`} onClick={(event) => { event.preventDefault(); onReview(id) }}>Review reading</a>)}
        </Stack>
      ))}
      {warnings.map((item, index) => (
        <Stack key={`${item.code}-${item.recordIds.join('-')}-${index}`} className="electricity-quality-item" direction="horizontal" gap={2} role="status">
          <StatusDot variant="warning" label="Estimate or data warning" />
          <Text>{item.message}</Text>
          {item.recordIds.map((id) => <a key={id} href={`#reading-${id}`} onClick={(event) => { event.preventDefault(); onReview(id) }}>Review reading</a>)}
        </Stack>
      ))}
    </Stack>
  )
}

function ReadingForm({
  open,
  initial,
  observations,
  today,
  saving,
  onClose,
  onSave,
}: {
  open: boolean
  initial: TokenObservation | null
  observations: readonly TokenObservation[]
  today: DateOnly
  saving: boolean
  onClose: () => void
  onSave: (observation: TokenObservation, position: number, replacingId?: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<ReadingDraft>(() => initialDraft(initial, observations, today))
  const [fieldErrors, setFieldErrors] = useState<ReadingFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setDraft(initialDraft(initial, observations, today))
      setFieldErrors({})
      setFormError(null)
    }
  }, [open, initial, observations, today])

  const peers = observations.filter((item) => item.date === draft.date && item.id !== initial?.id)
  const maxOrder = peers.length + 1
  const refillNeedsAmount = draft.refillSource === 'entered' || draft.refillSource === 'inferred_balance_difference'
  const errorEntries: FormErrorIssue[] = READING_FIELDS.flatMap(({ name, label }) => {
    const message = fieldErrors[name]
    return message ? [{ name, label, message }] : []
  })

  function changeDate(value: string | undefined) {
    if (!value || value === draft.date) return
    const nextPeers = observations.filter((item) => item.date === value && item.id !== initial?.id)
    setDraft((current) => ({ ...current, date: value as DateOnly, sameDayOrder: nextPeers.length + 1 }))
    setFieldErrors((current) => ({ ...current, date: undefined }))
  }

  async function submit() {
    setFormError(null)
    const errors: ReadingFieldErrors = {}
    try {
      parseDateOnly(draft.date)
    } catch {
      errors.date = 'Enter a valid calendar date.'
    }
    if (draft.date > today) errors.date = 'A meter reading cannot be dated in the future.'

    let remainingMilliKwh: number | null = null
    if (draft.remainingKwh === null || !Number.isFinite(draft.remainingKwh)) {
      errors.remainingKwh = 'Enter the remaining meter balance in kWh.'
    } else {
      try {
        remainingMilliKwh = parseKwhToMilliKwh(String(draft.remainingKwh))
      } catch (error) {
        errors.remainingKwh = error instanceof Error ? error.message : 'Enter the remaining meter balance in kWh.'
      }
    }

    let refillMilliKwh: number | null = null
    let refillCostIdr: number | null = null
    if (refillNeedsAmount) {
      if (draft.refillKwh === null) {
        errors.refillKwh = 'Enter the credited refill amount in kWh.'
      } else {
        try {
          refillMilliKwh = parseKwhToMilliKwh(String(draft.refillKwh))
        } catch (error) {
          errors.refillKwh = error instanceof Error ? error.message : 'Enter the credited refill amount in kWh.'
        }
      }
    }
    if (draft.refillSource !== 'none' && draft.refillCostIdr !== null) {
      try {
        refillCostIdr = parseIdrAmount(String(draft.refillCostIdr))
      } catch (error) {
        errors.refillCostIdr = error instanceof Error ? error.message : 'Enter the purchase amount in whole rupiah.'
      }
    }

    if (Object.values(errors).some(Boolean) || remainingMilliKwh === null) {
      setFieldErrors(errors)
      return
    }

    try {
      const observation: TokenObservation = {
        id: initial?.id ?? newId('electricity-reading'),
        date: draft.date,
        sequence: 0,
        remainingMilliKwh,
        refillMilliKwh,
        refillCostIdr,
        refillSource: draft.refillSource,
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
        ...(initial?.sourceReference ? { sourceReference: initial.sourceReference } : {}),
      }
      await onSave(observation, Math.min(Math.max(draft.sameDayOrder - 1, 0), peers.length), initial?.id)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'This meter reading could not be saved.')
    }
  }

  return (
    <DialogForm
      open={open}
      title={initial ? 'Edit meter reading' : 'Add meter reading'}
      description="Remaining credit is the balance shown after any refill attached to this reading."
      className="form-stack electricity-form"
      errorIssues={errorEntries}
      submitError={formError}
      onClose={onClose}
      onSubmit={() => void submit()}
      saving={saving}
      submitLabel={initial ? 'Save changes' : 'Save reading'}
    >
      <DialogFormSection
        title="Reading details"
        description="When you read the meter, and where it sits among same-day readings."
        lead={(
          <NumberInput
            className="field dialog-form-amount-control"
            label="Remaining credit"
            value={draft.remainingKwh}
            onChange={(value) => { setDraft((current) => ({ ...current, remainingKwh: value })); setFieldErrors((current) => ({ ...current, remainingKwh: undefined })) }}
            min={0}
            step={0.001}
            units="kWh"
            description="Meter balance after any top-up on this row."
            status={fieldErrors.remainingKwh ? { type: 'error', message: fieldErrors.remainingKwh } : undefined}
            statusVariant="detached"
            isWheelEnabled={false}
            hasAutoFocus
            isRequired
          />
        )}
      >
        <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
          <DateInput
            label="Reading date"
            value={draft.date as ISODateString}
            onChange={changeDate}
            max={today as ISODateString}
            presentation="native"
            format="system_date"
            status={fieldErrors.date ? { type: 'error', message: fieldErrors.date } : undefined}
            statusVariant="detached"
            isRequired
          />
          {peers.length > 0 && (
            <NumberInput
              label="Order on this date"
              value={draft.sameDayOrder}
              onChange={(value) => setDraft((current) => ({ ...current, sameDayOrder: Math.min(Math.max(Math.trunc(value), 1), maxOrder) }))}
              min={1}
              max={maxOrder}
              isIntegerOnly
              isWheelEnabled={false}
              description={`Position ${draft.sameDayOrder} of ${maxOrder} readings for this date.`}
            />
          )}
        </Grid>
      </DialogFormSection>

      <DialogFormSection title="Top-up and note" description="Record credit added on this date, plus any context worth keeping.">
        <Selector
          label="Refill record"
          options={refillOptions}
          value={draft.refillSource}
          onChange={(value) => {
            setDraft((current) => ({
              ...current,
              refillSource: value as RefillSource,
              // Leave the amount empty rather than prefilling 0, so a refill is never
              // recorded as zero credit by a user who skips the field.
              refillKwh: value === 'none' || value === 'unknown' ? null : current.refillKwh,
              refillCostIdr: value === 'none' ? null : current.refillCostIdr,
            }))
            setFieldErrors((current) => ({ ...current, refillKwh: undefined }))
          }}
          description="Use actual credited kWh when available; estimates are labeled."
          presentation="adaptive"
          width="100%"
        />
        {refillNeedsAmount && (
          <NumberInput
            label="Credited refill"
            value={draft.refillKwh}
            onChange={(value) => { setDraft((current) => ({ ...current, refillKwh: value })); setFieldErrors((current) => ({ ...current, refillKwh: undefined })) }}
            min={0}
            step={0.001}
            units="kWh"
            isWheelEnabled={false}
            status={fieldErrors.refillKwh ? { type: 'error', message: fieldErrors.refillKwh } : undefined}
            statusVariant="detached"
            description={draft.refillSource === 'entered' ? 'The kWh credited by the PLN purchase.' : 'Estimated from the balance difference between readings.'}
            isRequired
          />
        )}
        {draft.refillSource !== 'none' && (
          <NumberInput
            label="Purchase amount"
            value={draft.refillCostIdr}
            onChange={(value) => { setDraft((current) => ({ ...current, refillCostIdr: value })); setFieldErrors((current) => ({ ...current, refillCostIdr: undefined })) }}
            min={0}
            isIntegerOnly
            units="IDR"
            isWheelEnabled={false}
            status={fieldErrors.refillCostIdr ? { type: 'error', message: fieldErrors.refillCostIdr } : undefined}
            statusVariant="detached"
            description="Cash paid for the top-up, used for spending totals."
            isOptional
          />
        )}
        {draft.refillSource === 'unknown' && (
          <p className="field-hint electricity-refill-hint">The reading is kept, but usage across it cannot be reconciled until you record the credited amount.</p>
        )}
        {draft.refillSource === 'inferred_balance_difference' && (
          <p className="field-hint electricity-refill-hint">Provisional estimate: balance differences assume no electricity was consumed between the readings.</p>
        )}
        <TextInput
          label="Note"
          value={draft.note}
          onChange={(note) => setDraft((current) => ({ ...current, note }))}
          isOptional
          description="Optional purchase or meter context."
        />
      </DialogFormSection>
    </DialogForm>
  )
}

export function ElectricityPage() {
  const status = useElectricityStore((state) => state.status)
  const observations = useElectricityStore((state) => state.observations)
  const error = useElectricityStore((state) => state.error)
  const saving = useElectricityStore((state) => state.saving)
  const initialize = useElectricityStore((state) => state.initialize)
  const runMutation = useElectricityStore((state) => state.runMutation)
  const today = localToday()
  const ordered = useMemo(() => sortElectricityHistory(observations), [observations])
  const metrics = useMemo(() => calculateLifetimeMetrics(ordered, today), [ordered, today])
  const months = useMemo(() => [...new Set(ordered.map((item) => item.date.slice(0, 7)))].sort(), [ordered])
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7))
  const month = useMemo(() => calculateMonthMetrics(ordered, months.includes(selectedMonth) ? selectedMonth : today.slice(0, 7), today), [ordered, months, selectedMonth, today])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<TokenObservation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TokenObservation | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [reviewTargetId, setReviewTargetId] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  useEffect(() => { void initialize() }, [initialize])
  useEffect(() => {
    if (months.length && !months.includes(selectedMonth)) setSelectedMonth(months[months.length - 1]!)
    if (!months.length && selectedMonth !== today.slice(0, 7)) setSelectedMonth(today.slice(0, 7))
  }, [months, selectedMonth, today])
  useEffect(() => { setHistoryPage(1) }, [observations])
  useEffect(() => {
    if (!reviewTargetId) return
    const target = document.getElementById(`reading-${reviewTargetId}`)
    if (!target) return
    target.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    target.focus()
    setReviewTargetId(null)
  }, [historyPage, observations, reviewTargetId])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(observation: TokenObservation) {
    setEditing(observation)
    setFormOpen(true)
  }

  async function saveObservation(observation: TokenObservation, position: number, replacingId?: string) {
    setPageError(null)
    await runMutation((useCases) => useCases.saveObservation(observation, position, today, replacingId))
    setFormOpen(false)
    setEditing(null)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      setPageError(null)
      await runMutation((useCases) => useCases.deleteObservation(deleteTarget.id, today))
      setDeleteTarget(null)
    } catch (deleteError) {
      setPageError(deleteError instanceof Error ? deleteError.message : 'This reading could not be deleted.')
      setDeleteTarget(null)
    }
  }

  if (status === 'idle' || status === 'loading') return <PageSkeleton variant="meter" label="Loading meter readings saved on this device" />
  if (status === 'error') return <Stack className="load-error-state" role="alert" gap={3}><Heading level={2}>PLN readings could not be loaded</Heading><Text>{error ?? 'Local browser storage is unavailable.'}</Text><Button label="Try again" className="button button-secondary" variant="secondary" type="button" onClick={() => void initialize()} /></Stack>

  const descending = [...ordered].reverse()
  const pageCount = Math.max(1, Math.ceil(descending.length / RECORD_PAGE_SIZE))
  const page = Math.min(historyPage, pageCount)
  const pageRows = descending.slice((page - 1) * RECORD_PAGE_SIZE, page * RECORD_PAGE_SIZE) as ReadingRow[]
  const tableColumns: TableColumn<ReadingRow>[] = [
    {
      key: 'date', header: 'Date and order', width: proportional(1),
      renderCell: (item) => <Stack id={`reading-${item.id}`} tabIndex={-1} className="electricity-history-date" gap={0.5}><Text>{formatDate(item.date)}</Text>{ordered.filter((entry) => entry.date === item.date).length > 1 && <Text type="supporting">Reading {item.sequence + 1} that day</Text>}</Stack>,
    },
    { key: 'remainingMilliKwh', header: 'Remaining', width: proportional(1), renderCell: (item) => formatBalance(item.remainingMilliKwh) },
    {
      key: 'refillMilliKwh', header: 'Credited refill', width: proportional(1),
      renderCell: (item) => item.refillSource === 'unknown' ? 'Unknown' : item.refillMilliKwh === null ? '—' : `${formatBalance(item.refillMilliKwh)} · ${refillLabel(item.refillSource)}`,
    },
    { key: 'refillCostIdr', header: 'Purchase', width: proportional(1), renderCell: (item) => item.refillCostIdr === null ? 'Not recorded' : formatIdr(item.refillCostIdr) },
    {
      key: 'refillSource', header: 'Record quality', width: proportional(1),
      renderCell: (item) => <Stack gap={0.5}><Text>{refillLabel(item.refillSource)}</Text>{item.note && <Text type="supporting">{item.note}</Text>}</Stack>,
    },
    {
      key: 'actions', header: 'Actions', width: proportional(1),
      renderCell: (item) => <Stack direction="horizontal" gap={1} className="electricity-row-actions">
        <IconButton label={`Edit reading from ${formatDate(item.date)}`} tooltip="Edit reading" variant="ghost" icon={<Icon name="edit" size={17} />} onClick={() => openEdit(item)} />
        <IconButton label={`Delete reading from ${formatDate(item.date)}`} tooltip="Delete reading" variant="ghost" icon={<Icon name="trash" size={17} />} onClick={() => setDeleteTarget(item)} />
      </Stack>,
    },
  ]
  function reviewReading(id: string) {
    const index = descending.findIndex((item) => item.id === id)
    if (index < 0) return
    setReviewTargetId(id)
    setHistoryPage(Math.floor(index / RECORD_PAGE_SIZE) + 1)
  }
  const deleteIssues = deleteTarget
    ? validateElectricityHistory(ordered.filter((item) => item.id !== deleteTarget.id), today).errors
    : []
  const deletionBlocked = deleteIssues.length > 0

  const forecastDetail = metrics.forecastStatus === 'forecast' && metrics.predictedDepletionDate
    ? metrics.predictedDepletionDate < today
      ? `Estimate from ${metrics.asOfDate ? formatDate(metrics.asOfDate) : 'the last reading'} has passed. Record a fresh reading — this does not confirm the meter is empty.`
      : `From the ${metrics.asOfDate ? formatDate(metrics.asOfDate) : 'latest'} reading, at unchanged usage.`
    : metrics.forecastStatus === 'indefinite'
      ? 'No finite estimate at the measured zero-usage rate.'
      : metrics.forecastStatus === 'empty'
        ? `Empty at the last measured reading${metrics.asOfDate ? ` on ${formatDate(metrics.asOfDate)}` : ''}.`
        : metrics.forecastStatus === 'beyond_date_range'
          ? 'The calculated date is outside the supported calendar range.'
          : 'Needs two readings on different dates with reconciled refill credit.'
  const forecastValue = metrics.forecastStatus === 'forecast'
    ? metrics.estimatedDaysToDepletion === null ? 'Estimate unavailable' : `${metricNumber.format(metrics.estimatedDaysToDepletion)} days`
    : metrics.forecastStatus === 'indefinite' ? 'No finite estimate'
      : metrics.forecastStatus === 'empty' ? 'Empty at last reading'
        : metrics.forecastStatus === 'invalid_input' ? 'Check reading history'
          : metrics.forecastStatus === 'beyond_date_range' ? 'Date out of range' : 'Insufficient data'
  const inferredForecast = ordered.slice(1).some((item) => item.refillSource === 'inferred_balance_difference') && metrics.forecastStatus === 'forecast'
  const lifetimeHasRecordedPurchase = ordered.some((item) => item.refillCostIdr !== null)
  const monthHasRecordedPurchase = ordered.some((item) => item.date.startsWith(month.month) && item.refillCostIdr !== null)
  // The detail line below carries the explanation, so the value itself stays a
// placeholder rather than a sentence. Never fall back to a zero total.
const lifetimeSpendingValue = lifetimeHasRecordedPurchase && metrics.totalRecordedRefillSpendingIdr !== null
    ? formatIdr(metrics.totalRecordedRefillSpendingIdr)
    : '—'
  const lifetimeSpendingDetail = ordered.length === 0
    ? 'No refill purchases recorded yet.'
    : !lifetimeHasRecordedPurchase
      ? metrics.spendingComplete ? 'No refill purchase amounts recorded.' : 'No purchase amounts recorded; some refill costs are unknown.'
      : `${metrics.average30DayRefillSpendingIdr === null ? 'No elapsed period for a normalized rate.' : `${formatIdr(metrics.average30DayRefillSpendingIdr)} per 30 days`}${metrics.spendingComplete ? ' · cash paid, not energy cost.' : ' · some refill costs are not recorded.'}`
  const monthSpendingValue = monthHasRecordedPurchase && month.recordedRefillSpendingIdr !== null
    ? formatIdr(month.recordedRefillSpendingIdr)
    : '—'
  const monthSpendingDetail = !monthHasRecordedPurchase
    ? month.spendingComplete ? 'No purchase amounts recorded in this observed period.' : 'No purchase amounts recorded in this observed period; some refill costs are unknown.'
    : month.spendingComplete ? 'Purchase amounts recorded for this observed period.' : 'Known amounts only; some refill costs are not recorded.'

  return (
    <Stack className="electricity-page" gap={6}>
      <PageHeader
        eyebrow="PREPAID ELECTRICITY"
        title="PLN Token Tracker"
        description="Track the remaining kWh on your prepaid meter, reconcile top-ups, and estimate how long the balance may last."
        actions={<Button label="Add reading" className="button button-primary" variant="primary" type="button" icon={<Icon name="plus" size={17} />} onClick={openCreate} />}
      />
      <Stack as="aside" className="electricity-local-note" direction="horizontal" gap={2} role="note">
        <StatusDot variant="neutral" label="Saved only on this device" />
        <Text>Saved on this device · not synced to your Kinsen account or other devices.</Text>
      </Stack>
      {(pageError || error) && <Text className="inline-alert" role="alert">{pageError ?? error}</Text>}

      <Grid columns={4} gap={3} className="electricity-metric-grid">
        <MetricCard
          label="Latest balance"
          value={metrics.latestBalanceKwh === null ? 'No reading yet' : formatKwh(metrics.latestBalanceKwh)}
          detail={metrics.asOfDate ? `As of ${formatDate(metrics.asOfDate)}${metrics.readingAgeDays ? ` · ${metrics.readingAgeDays} days old` : ''}` : 'Add an opening reading.'}
        />
        <MetricCard
          label="Daily usage"
          value={formatKwh(metrics.averageDailyKwh, 'kWh/day')}
          detail={metrics.startDate && metrics.asOfDate && metrics.elapsedDays !== null
            ? `${formatDate(metrics.startDate, { day: 'numeric', month: 'short' })} – ${formatDate(metrics.asOfDate, { day: 'numeric', month: 'short' })} · ${metrics.elapsedDays} days`
            : 'Needs readings on different dates.'}
          status={metrics.status === 'invalid_input' ? 'error' : metrics.status === 'insufficient_data' ? 'warning' : undefined}
        />
        <MetricCard
          label={inferredForecast ? 'Provisional estimate' : 'Estimated time remaining'}
          value={forecastValue}
          detail={forecastDetail}
          status={inferredForecast || metrics.forecastStatus === 'insufficient_data' ? 'warning' : metrics.forecastStatus === 'invalid_input' ? 'error' : undefined}
        />
        <MetricCard
          label="Refill spending"
          value={lifetimeSpendingValue}
          detail={lifetimeSpendingDetail}
          status={ordered.length > 0 && !metrics.spendingComplete ? 'warning' : undefined}
        />
      </Grid>

      <Stack as="section" className="electricity-month-section" gap={3} aria-labelledby="electricity-month-heading">
        <Stack direction="horizontal" hAlign="between" vAlign="center" gap={3} className="electricity-section-heading">
          <Heading level={2} id="electricity-month-heading">This month</Heading>
          {months.length > 0 && <Selector
            className="electricity-month-selector"
            label="Usage month"
            value={months.includes(selectedMonth) ? selectedMonth : months[months.length - 1]!}
            options={months.map((value) => ({ value, label: formatMonth(`${value}-01` as DateOnly) }))}
            onChange={setSelectedMonth}
            presentation="adaptive"
          />}
        </Stack>
        {months.length ? (
          <Card className="electricity-month-card">
            <MetadataList columns="multi">
              <MetricRow
                label="Observed consumption"
                value={formatKwh(month.observedKwh)}
                status={month.status === 'invalid_input' ? 'error' : month.status === 'insufficient_data' ? 'warning' : undefined}
              />
              <MetricRow label="Daily usage" value={formatKwh(month.averageDailyKwh, 'kWh/day')} />
              <MetricRow label="30-day equivalent" value={formatKwh(month.thirtyDayEquivalentKwh, 'kWh/30 days')} />
              <MetricRow label="Refill spending" value={monthSpendingValue} status={!month.spendingComplete ? 'warning' : undefined} />
            </MetadataList>
            <Text type="supporting" className="electricity-month-note">
              {month.startDate && month.endDate
                ? `Observed ${formatDate(month.startDate, { day: 'numeric', month: 'short' })} – ${formatDate(month.endDate, { day: 'numeric', month: 'short' })}, ${month.elapsedDays} days${month.partialMonth ? ' · partial month' : ''}. ${monthSpendingDetail}`
                : 'This month needs readings on different dates.'}
            </Text>
          </Card>
        ) : <Text type="supporting">Add readings to see monthly observed usage.</Text>}
      </Stack>

      <BalanceChart observations={ordered} />
      <WarningList warnings={metrics.warnings} errors={metrics.errors} onReview={reviewReading} />
      <Stack as="section" className="electricity-history-section" gap={3} aria-labelledby="electricity-history-heading">
        <Stack direction="horizontal" hAlign="between" vAlign="center" gap={3} className="electricity-section-heading">
          <Heading level={2} id="electricity-history-heading">Reading history</Heading>
          <Text type="supporting">Consumption is inferred between readings; this is not a live meter feed.</Text>
        </Stack>
        {ordered.length ? <>
          <Table<ReadingRow>
            data={pageRows}
            columns={tableColumns}
            idKey="id"
            rowCount={ordered.length}
            rowIndexStart={(page - 1) * RECORD_PAGE_SIZE + 1}
            density="compact"
            dividers="rows"
            hasHover
            textOverflow="wrap"
          />
          <RecordPagination count={ordered.length} page={page} onPageChange={setHistoryPage} />
        </> : <Text type="supporting">No readings yet. Add the first remaining-balance reading to begin tracking.</Text>}
      </Stack>

      <ReadingForm
        key={editing?.id ?? 'new-reading'}
        open={formOpen}
        initial={editing}
        observations={ordered}
        today={today}
        saving={saving}
        onClose={() => { setFormOpen(false); setEditing(null) }}
        onSave={saveObservation}
      />
      <ConfirmationDialog
        open={deleteTarget !== null}
        title="Delete this meter reading?"
        description={deletionBlocked
          ? `Deleting this reading would make the remaining history inconsistent: ${deleteIssues[0]!.message} Correct the affected readings or mark uncertain refill credit unknown before deleting.`
          : 'Deleting it recalculates neighboring intervals and all usage estimates. If known refill credit no longer reconciles, correct that record or mark the refill unknown before deleting.'}
        confirmLabel="Delete reading"
        isConfirmDisabled={deletionBlocked}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </Stack>
  )
}
