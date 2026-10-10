import { useId, useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import type { XAxisTickContentProps } from 'recharts/types/util/types'
import { Heading } from '@astryxdesign/core/Text'
import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import type { RefillSource, TokenObservation } from '@kinsen/budget-domain'
import { sortElectricityHistory } from '@kinsen/budget-domain'
import { daysBetween } from '@kinsen/budget-domain/date-only'
import { formatDate } from '../../shared/format/date'

const CHART_HEIGHT = 268
const CHART_MARGIN = { top: 24, right: 30, bottom: 4, left: 62 }
/** Room for the x-axis date labels below the plot, including their tick margin. */
const X_AXIS_HEIGHT = 30
/** Widest a single date label can render before it crowds its neighbour. */
const AXIS_LABEL_WIDTH = 96
/**
 * Recharts anchors a y-axis label to the axis midpoint; lift it to sit above the
 * highest tick, level with the top of the plot.
 */
const PLOT_HEIGHT = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom - X_AXIS_HEIGHT
const axisTitleOffset = -(PLOT_HEIGHT / 2 + CHART_MARGIN.top - 10)

const metricNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
const kwhNumber = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 })

function formatKwh(value: number): string {
  return `${metricNumber.format(value)} kWh`
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

/** Rounds an axis step up to the nearest 1, 2, 5 or 10 times a power of ten. */
function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(rawStep))
  const fraction = rawStep / 10 ** exponent
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * 10 ** exponent
}

/**
 * Expands the data range to round tick values so the axis reads in whole,
 * human-sized steps instead of arbitrary decimals.
 */
function niceScale(min: number, max: number, tickCount = 4): { min: number; max: number; ticks: number[] } | null {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  const step = niceStep((high - low || high * 0.1 || 1) / tickCount)
  const niceMin = Math.floor(low / step) * step
  let niceMax = Math.ceil(high / step) * step
  if (niceMax === niceMin) niceMax = niceMin + step
  const ticks: number[] = []
  for (let index = 0; index * step <= niceMax - niceMin + step / 2; index += 1) {
    ticks.push(Number((niceMin + index * step).toPrecision(12)))
  }
  return { min: niceMin, max: niceMax, ticks }
}

type BalancePoint = {
  id: string
  date: string
  /** Days since the first reading, so a gap between readings reads as a gap in time. */
  offset: number
  remainingKwh: number
  refillSource: RefillSource
  refillMilliKwh: number | null
}

type BalanceChartModel = {
  points: BalancePoint[]
  xDomain: [number, number]
  yDomain: [number, number]
  yTicks: number[]
  /** Candidate ticks in ascending order, thinned once the rendered width is known. */
  offsets: number[]
  dateLabels: Map<number, string>
}

function buildModel(observations: readonly TokenObservation[]): BalanceChartModel | null {
  const ordered = sortElectricityHistory(observations)
  if (!ordered.length) return null

  const firstDate = ordered[0]!.date
  const lastDate = ordered[ordered.length - 1]!.date
  let spanDays = 0
  try { spanDays = Math.max(0, daysBetween(firstDate, lastDate)) } catch { spanDays = 0 }

  const points = ordered.map((item, index) => {
    let offset = index
    try { offset = Math.max(0, daysBetween(firstDate, item.date)) } catch { offset = index }
    return {
      id: item.id,
      date: item.date,
      offset,
      remainingKwh: item.remainingMilliKwh / 1000,
      refillSource: item.refillSource,
      refillMilliKwh: item.refillMilliKwh,
    }
  })

  const values = points.map((point) => point.remainingKwh)
  const scale = niceScale(Math.min(...values), Math.max(...values))
  if (!scale) return null

  // A single reading, or several on one day, leaves no span to divide by; widen the
  // domain so those points still land on the canvas instead of at an undefined x.
  const xDomain: [number, number] = spanDays > 0 ? [0, spanDays] : [0, 1]
  // Same-day readings share one offset, and a short history can make the chosen
  // midpoint coincide with an endpoint, so key labels by offset to keep ticks unique.
  const candidates = new Map<number, string>()
  for (const point of [points[0]!, points[Math.floor((points.length - 1) / 2)]!, points[points.length - 1]!]) {
    candidates.set(point.offset, formatDate(point.date, { day: 'numeric', month: 'short', year: 'numeric' }))
  }
  const offsets = [...candidates.keys()].sort((a, b) => a - b)
  const dateLabels = new Map(offsets.map((offset) => [offset, candidates.get(offset)!]))

  return { points, xDomain, offsets, yDomain: [scale.min, scale.max], yTicks: scale.ticks, dateLabels }
}

export function BalanceChart({ observations }: { observations: readonly TokenObservation[] }) {
  const titleId = useId()
  const descriptionId = useId()
  const gradientId = useId()
  const model = useMemo(() => buildModel(observations), [observations])
  const points = model?.points ?? []
  const first = points[0]
  const last = points[points.length - 1]
  // Rebuilt on every render; Recharts draws ticks left to right, so each label can be
  // tested against those already placed.
  const placedLabelRanges: Array<[number, number]> = []

  /**
   * Recharts hands us each tick's real x position, so drop a label only when it
   * genuinely overlaps one already placed, rather than guessing from a nominal width.
   */
  function renderDateTick({ x, y, payload, index, visibleTicksCount }: XAxisTickContentProps) {
    const offset = payload?.value
    if (typeof x !== 'number' || typeof y !== 'number' || typeof offset !== 'number') return null
    const label = model?.dateLabels.get(offset)
    if (!label) return null
    const anchor = index === 0 ? 'start' : index === visibleTicksCount - 1 ? 'end' : 'middle'
    const start = anchor === 'start' ? x : anchor === 'end' ? x - AXIS_LABEL_WIDTH : x - AXIS_LABEL_WIDTH / 2
    const end = start + AXIS_LABEL_WIDTH
    // Interior labels are the only ones that can be sacrificed; the endpoints anchor the scale.
    if (anchor === 'middle' && placedLabelRanges.some(([from, to]) => start < to && end > from)) return null
    placedLabelRanges.push([start, end])
    return (
      <text key={offset} x={x} y={y} className="electricity-chart-axis-label" textAnchor={anchor}>
        {label}
      </text>
    )
  }

  return (
    <Stack as="section" className="electricity-chart-section" gap={3} aria-labelledby="electricity-chart-heading">
      <Stack direction="horizontal" hAlign="between" vAlign="center" gap={3} className="electricity-section-heading">
        <Heading level={2} id="electricity-chart-heading">Remaining token balance</Heading>
        {model ? (
          <Stack direction="horizontal" gap={4} aria-label="Chart legend">
            <Text type="supporting"><i className="electricity-legend-line" aria-hidden="true" />Balance</Text>
            <Text type="supporting"><i className="electricity-legend-refill" aria-hidden="true" />Refill</Text>
          </Stack>
        ) : <Text type="supporting">Balance, not consumption</Text>}
      </Stack>
      {model ? (
        <div className="electricity-chart-frame" role="img" aria-labelledby={titleId} aria-describedby={descriptionId}>
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            <AreaChart data={points} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-text-accent)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-text-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} className="electricity-chart-gridline" />
              <XAxis
                dataKey="offset"
                type="number"
                domain={model.xDomain}
                ticks={model.offsets}
                tickFormatter={(offset: number) => model.dateLabels.get(offset) ?? ''}
                height={X_AXIS_HEIGHT}
                interval={0}
                tickMargin={12}
                tick={renderDateTick}
                stroke="var(--color-border)"
                tickLine={false}
                minTickGap={0}
              />
              <YAxis
                dataKey="remainingKwh"
                domain={model.yDomain}
                ticks={model.yTicks}
                width={CHART_MARGIN.left - 12}
                tickFormatter={(value: number) => metricNumber.format(value)}
                tickMargin={8}
                tick={{ className: 'electricity-chart-axis-label' }}
                stroke="var(--color-border)"
                tickLine={false}
                axisLine={false}
                label={{ value: 'kWh', className: 'electricity-chart-axis-title', textAnchor: 'end', dy: axisTitleOffset }}
              />
              <Area
                type="linear"
                dataKey="remainingKwh"
                stroke="var(--color-text-accent)"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                activeDot={false}
                dot={renderDot}
              />
            </AreaChart>
          </ResponsiveContainer>
          <span id={titleId} className="sr-only">Remaining PLN token balance across recorded readings</span>
          <span id={descriptionId} className="sr-only">
            The line shows remaining kWh, not electricity consumption. Refill markers indicate readings with entered, inferred, or unknown refill credit. The reading history table below provides the values.
          </span>
        </div>
      ) : (
        <Stack className="electricity-chart-empty" gap={2}>
          <Text>No balance history yet</Text>
          <Text type="supporting">Add a meter reading and the remaining kWh trend will appear here.</Text>
        </Stack>
      )}
      {model && last && first && (
        <Text type="supporting" className="electricity-chart-summary">
          {first.id === last.id
            ? `One reading · ${formatKwh(last.remainingKwh)} on ${formatDate(last.date)}`
            : `${metricNumber.format(first.remainingKwh - last.remainingKwh)} kWh used across ${formatDate(first.date, { day: 'numeric', month: 'short' })} – ${formatDate(last.date, { day: 'numeric', month: 'short' })} · balance, not consumption`}
        </Text>
      )}
    </Stack>
  )
}

function renderDot(props: unknown) {
  const { cx, cy, payload } = props as { cx?: number; cy?: number; payload?: BalancePoint }
  if (typeof cx !== 'number' || typeof cy !== 'number' || !payload) return null
  const isRefill = payload.refillSource !== 'none'
  return (
    <circle
      key={payload.id}
      cx={cx}
      cy={cy}
      r={isRefill ? 5.5 : 3.5}
      className={isRefill ? 'electricity-chart-refill' : 'electricity-chart-point'}
    >
      {isRefill ? (
        <title>{`${refillLabel(payload.refillSource)} · ${formatDate(payload.date)}${payload.refillMilliKwh === null ? '' : ` · ${formatBalance(payload.refillMilliKwh)}`}`}</title>
      ) : null}
    </circle>
  )
}