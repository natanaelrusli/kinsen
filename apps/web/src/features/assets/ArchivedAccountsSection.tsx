import { Link } from '@astryxdesign/core/Link'
import { Stack } from '@astryxdesign/core/Stack'
import type { AssetAccount, LiabilityAccount } from '@kinsen/budget-domain'
import { assetTypeLabels, liabilityTypeLabels } from '@kinsen/budget-domain'
import { Icon } from '../../shared/components/Icon'
import { formatDate } from '../../shared/format/date'

type ArchivedAccountsSectionProps = {
  assets: AssetAccount[]
  liabilities: LiabilityAccount[]
}

export function ArchivedAccountsSection({ assets, liabilities }: ArchivedAccountsSectionProps) {
  const archivedAssets = assets.filter(asset => asset.archivedAt)
  const archivedLiabilities = liabilities.filter(liability => liability.archivedAt)

  return <>
    {archivedAssets.length > 0 && <section className="section-block archived-assets-section" aria-labelledby="archived-assets-title">
      <Stack direction="horizontal" className="section-heading">
        <Stack style={{ display: 'block' }}><p className="eyebrow">HISTORY</p><h2 id="archived-assets-title">Archived assets</h2></Stack>
      </Stack>
      <Stack className="archived-asset-list">{archivedAssets.map(asset => <Link key={asset.id} color="inherit" href={`/assets/${encodeURIComponent(asset.id)}`}>
        <Stack as="span">{asset.name}<small>{assetTypeLabels[asset.type]} · {asset.institution}</small></Stack>
        <span>Archived {formatDate(asset.archivedAt!, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <Icon name="chevron" size={16} />
      </Link>)}</Stack>
    </section>}
    {archivedLiabilities.length > 0 && <section className="section-block archived-assets-section" aria-label="Archived liabilities">
      <p className="eyebrow">ARCHIVED LIABILITIES</p>
      <Stack className="archived-asset-list">{archivedLiabilities.map(liability => <Stack direction="horizontal" key={liability.id}>
        <Stack as="span">{liability.name}<small>{liabilityTypeLabels[liability.type]} · {liability.institution}</small></Stack>
        <span>Archived {formatDate(liability.archivedAt!, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </Stack>)}</Stack>
    </section>}
  </>
}
