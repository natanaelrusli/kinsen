import { Stack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { daysSince, type AssetValuation, type GoldProduct } from '@kinsen/budget-domain'
import { formatIdr } from '../../shared/format/money'
import { formatDate } from '../../shared/format/date'

export const goldProductKey = (product: GoldProduct) => JSON.stringify([product.source, product.materialType, product.weightGrams, product.lineKey])
export const goldProductLabel = (product: GoldProduct) => `${product.materialType} · ${product.weightGrams} g${product.lineKey ? ` · ${product.lineKey}` : ''}`
export function valuationOrder(left: AssetValuation, right: AssetValuation): number {
  return left.asOfDate.localeCompare(right.asOfDate) || left.recordedAt - right.recordedAt || left.id.localeCompare(right.id)
}
export function GoldValueDetails({ valuation, compact = false }: { valuation: AssetValuation; compact?: boolean }) {
  const quote = valuation.goldQuote
  if (!quote) return null
  if (compact) return <Stack direction="vertical" gap={1} className="gold-row-details">
    <Text type="supporting" color="inherit">{quote.source} · {goldProductLabel(quote)} · {valuation.quantity} packages</Text>
    <Text type="supporting" color="inherit">{formatIdr(Number(valuation.unitPrice))} per package · Quote {formatDate(quote.recordedDate, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
    <Text type="supporting" color="inherit">Retail estimate · Not a buyback value</Text>
  </Stack>
  return <Stack direction="vertical" gap={1}>
    <Text color="inherit">Automatic gold price · Retail purchase estimate</Text>
    <Text type="supporting" color="inherit">{quote.source} · {goldProductLabel(quote)} · {valuation.quantity} packages</Text>
    <Text type="supporting" color="inherit">Package price {formatIdr(Number(valuation.unitPrice))}</Text>
    <Text type="supporting" color="inherit">Quote date {formatDate(quote.recordedDate, { day: 'numeric', month: 'short', year: 'numeric' })} · Observed {formatDate(valuation.asOfDate, { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
    <Text type="supporting" color="inherit">Retail purchase estimate — not a buyback value.</Text>
  </Stack>
}
export function GoldValueStatus({ valuation, today, online, error }: { valuation?: AssetValuation | null; today: string; online: boolean; error?: string }) {
  const stale = valuation?.goldQuote && daysSince(today, valuation.goldQuote.recordedDate) > 1
  return <Stack direction="vertical" gap={1} role="status">
    {!online && <Stack direction="horizontal" gap={1} align="center"><StatusDot variant="warning" label="Offline" /><Text type="supporting" color="inherit">Offline — showing last saved gold value.</Text></Stack>}
    {error && <Stack direction="horizontal" gap={1} align="center"><StatusDot variant="error" label="Price unavailable" /><Text type="supporting" color="inherit">{error}</Text></Stack>}
    {stale && <Stack direction="horizontal" gap={1} align="center"><StatusDot variant="warning" label="Stale price" /><Text type="supporting" color="inherit">Stale gold price</Text></Stack>}
  </Stack>
}
