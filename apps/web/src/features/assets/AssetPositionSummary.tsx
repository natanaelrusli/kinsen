import { Stack } from '@astryxdesign/core/Stack'
import type { FinancialPosition } from '@kinsen/budget-domain'
import { formatIdr } from '../../shared/format/money'

type AssetPositionSummaryProps = {
  position: FinancialPosition
  hasLiabilities: boolean
}

export function AssetPositionSummary({ position, hasLiabilities }: AssetPositionSummaryProps) {
  return <section aria-label="Current financial position">
    <dl className="asset-summary-grid">
      <Stack className="asset-total-card"><dt>Total assets</dt><dd><strong>{formatIdr(position.totalAssets)}</strong><small>Active assets · IDR</small></dd></Stack>
      {hasLiabilities && <Stack className="asset-stat-card"><dt>Net worth</dt><dd><strong>{formatIdr(position.netWorth ?? 0)}</strong><small>Total assets minus liabilities</small></dd></Stack>}
      <Stack className="asset-stat-card"><dt>Daily-use cash</dt><dd><strong>{formatIdr(position.dailyUseCash)}</strong><small>Purpose-tagged for everyday use</small></dd></Stack>
      <Stack className="asset-stat-card"><dt>Protected savings</dt><dd><strong>{formatIdr(position.protectedSavings)}</strong><small>Kept separate from spending money</small></dd></Stack>
      <Stack className="asset-stat-card"><dt>Investments</dt><dd><strong>{formatIdr(position.investmentValue)}</strong><small>Saved valuations, including opted-in gold prices</small></dd></Stack>
    </dl>
  </section>
}
