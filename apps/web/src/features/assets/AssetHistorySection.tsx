import type { ISODateString } from '@astryxdesign/core/Calendar'
import { DateInput } from '@astryxdesign/core/DateInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Stack } from '@astryxdesign/core/Stack'
import type { AssetData, AssetPeriodComparison, DateOnly } from '@kinsen/budget-domain'
import { calculateAssetPeriodComparison, calculateFinancialPosition, compareDates } from '@kinsen/budget-domain'
import { addDays, addMonths, parseDateOnly } from '@kinsen/budget-domain/date-only'
import { useMemo, useState } from 'react'
import { formatDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { AssetLineChart } from './AssetLineChart'

type RangeKind = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM'
const CUSTOM_RANGE_ERROR = 'Choose valid dates with the start on or before the end.'

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

function AmountChange({ amount, percent }: { amount: number; percent: number | null }) {
  return <Stack as="span" direction="horizontal" className={amount < 0 ? 'asset-change is-negative' : 'asset-change'}>{amount > 0 ? '+' : ''}{formatIdr(amount)}{percent !== null && <small>{percent > 0 ? '+' : ''}{percent.toFixed(1)}%</small>}</Stack>
}

function AssetPeriodSummary({ comparison }: { comparison: AssetPeriodComparison }) {
  return <Stack className="asset-period-summary">
    <Stack><span>Start value · {formatDate(comparison.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span><strong>{formatIdr(comparison.startValue)}</strong></Stack>
    <Stack><span>End value · {formatDate(comparison.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}</span><strong>{formatIdr(comparison.endValue)}</strong></Stack>
    <Stack><span>Net change</span><AmountChange amount={comparison.change} percent={comparison.changePercent} /></Stack>
    <Stack className="asset-period-flows"><span>Contributions</span><strong>+{formatIdr(comparison.contributions)}</strong><span>Withdrawals</span><strong>−{formatIdr(comparison.withdrawals)}</strong>{comparison.adjustments !== 0 && <><span>Corrections</span><strong>{formatIdr(comparison.adjustments)}</strong></>}</Stack>
    <small>Internal tracked-account transfers are excluded from contributions and withdrawals. Change is descriptive, not investment return.</small>
  </Stack>
}

export function AssetHistorySection({ data, today }: { data: AssetData; today: DateOnly }) {
  const [range, setRange] = useState<RangeKind>('MONTH')
  const [customStart, setCustomStart] = useState<ISODateString | ''>(firstOfMonth(today) as ISODateString)
  const [customEnd, setCustomEnd] = useState<ISODateString | ''>(today as ISODateString)
  const start = range === 'CUSTOM' ? customStart : rangeStart(today, range)
  const end = range === 'CUSTOM' ? customEnd : today
  const validRange = useMemo(() => {
    try { parseDateOnly(start); parseDateOnly(end); return compareDates(start, end) <= 0 } catch { return false }
  }, [start, end])
  const comparison: AssetPeriodComparison | null = useMemo(() => validRange ? calculateAssetPeriodComparison(data, start, end) : null, [data, start, end, validRange])
  const points = useMemo(() => validRange ? historyPoints(data, start, end, range) : [], [data, start, end, range, validRange])

  return <section className="section-block asset-history-section" aria-labelledby="asset-history-title">
    <Stack direction="horizontal" className="section-heading"><Stack style={{ display: 'block' }}><p className="eyebrow">VALUE OVER TIME</p><h2 id="asset-history-title">Asset history</h2></Stack>
      <Selector className="asset-range-select" label="History range" isLabelHidden value={range} options={[{ value: 'MONTH', label: 'This month' }, { value: 'QUARTER', label: 'This quarter' }, { value: 'YEAR', label: 'This year' }, { value: 'CUSTOM', label: 'Custom dates' }]} onChange={(value) => setRange(value as RangeKind)} />
    </Stack>
    {range === 'CUSTOM' && (
      <Stack className="asset-custom-range">
        <DateInput className="asset-range-date" label="From" value={customStart || undefined} presentation="native" format="system_date" status={!validRange ? { type: 'error', message: CUSTOM_RANGE_ERROR } : undefined} onChange={(value) => setCustomStart(value ?? '')} />
        <DateInput className="asset-range-date" label="To" value={customEnd || undefined} presentation="native" format="system_date" status={!validRange ? { type: 'error', message: CUSTOM_RANGE_ERROR } : undefined} onChange={(value) => setCustomEnd(value ?? '')} />
      </Stack>
    )}
    {validRange && <>
      <AssetLineChart points={points} description="Total asset value" />
      {comparison && <AssetPeriodSummary comparison={comparison} />}
    </>}
  </section>
}
