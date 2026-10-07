import { useId } from 'react'
import type { DateOnly } from '@kinsen/budget-domain'
import { formatDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'

export function AssetLineChart({ points, description = 'Asset value history' }: { points: Array<{ date: DateOnly; value: number }>; description?: string }) {
  const titleId = useId()
  const descriptionId = useId()
  if (!points.length) return <div className="asset-chart-empty">Add an opening balance or valuation to build a history chart.</div>
  const width = 640
  const height = 180
  const insetX = 14
  const insetY = 16
  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const spread = max - min || 1
  const coordinates = points.map((point, index) => ({
    x: insetX + (points.length === 1 ? (width - insetX * 2) / 2 : index / (points.length - 1) * (width - insetX * 2)),
    y: height - insetY - (point.value - min) / spread * (height - insetY * 2),
  }))
  const linePoints = coordinates.map(({ x, y }) => `${x},${y}`).join(' ')
  return <figure className="asset-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId} aria-describedby={descriptionId} preserveAspectRatio="none">
      <title id={titleId}>{`${description}, ${formatDate(points[0]!.date)} to ${formatDate(points[points.length - 1]!.date)}`}</title>
      <line x1={insetX} x2={width - insetX} y1={height - insetY} y2={height - insetY} className="asset-chart-axis" />
      <line x1={insetX} x2={width - insetX} y1={height / 2} y2={height / 2} className="asset-chart-grid" />
      <polyline points={linePoints} className="asset-chart-line" />
      {points.map((point, index) => index === 0 || index === points.length - 1 ? <circle key={`${point.date}-${index}`} cx={coordinates[index]!.x} cy={coordinates[index]!.y} r="4" className="asset-chart-point" /> : null)}
    </svg>
    <p id={descriptionId} className="sr-only" aria-live="polite" aria-atomic="true">
      {`${description} ranges from ${formatIdr(min)} to ${formatIdr(max)}. It starts at ${formatIdr(points[0]!.value)} on ${formatDate(points[0]!.date, { day: 'numeric', month: 'long', year: 'numeric' })} and ends at ${formatIdr(points[points.length - 1]!.value)} on ${formatDate(points[points.length - 1]!.date, { day: 'numeric', month: 'long', year: 'numeric' })}.`}
    </p>
    <figcaption><span>{formatDate(points[0]!.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span><span>{formatDate(points[points.length - 1]!.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span></figcaption>
  </figure>
}
