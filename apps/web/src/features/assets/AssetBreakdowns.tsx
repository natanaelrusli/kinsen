import { Stack } from '@astryxdesign/core/Stack'
import type { AssetType, FinancialPosition } from '@kinsen/budget-domain'
import { assetTypeLabels } from '@kinsen/budget-domain'
import { formatIdr } from '../../shared/format/money'

type BreakdownSectionProps = {
  id: string
  eyebrow: string
  title: string
  emptyMessage: string
  entries: Array<[string, number]>
}

function BreakdownSection({ id, eyebrow, title, emptyMessage, entries }: BreakdownSectionProps) {
  return <section className="section-block" aria-labelledby={id}>
    <Stack direction="horizontal" className="section-heading">
      <Stack style={{ display: 'block' }}><p className="eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2></Stack>
    </Stack>
    {entries.length === 0 ? <p className="asset-muted">{emptyMessage}</p> : <Stack className="asset-breakdown-list">
      {entries.map(([label, amount]) => <Stack direction="horizontal" className="asset-breakdown-row" key={label}><span>{label}</span><strong>{formatIdr(amount)}</strong></Stack>)}
    </Stack>}
  </section>
}

export function AssetBreakdowns({ position }: { position: FinancialPosition }) {
  return <Stack className="asset-breakdown-grid">
    <BreakdownSection
      id="asset-type-title"
      eyebrow="BY CLASS"
      title="Asset classes"
      emptyMessage="Add an asset to see the class breakdown."
      entries={Object.entries(position.byType)
        .sort(([left], [right]) => assetTypeLabels[left as AssetType].localeCompare(assetTypeLabels[right as AssetType]))
        .map(([type, amount]) => [assetTypeLabels[type as AssetType], amount])}
    />
    <BreakdownSection
      id="asset-purpose-title"
      eyebrow="BY PURPOSE"
      title="Money pools"
      emptyMessage="Use purpose tags to separate daily cash, protected savings, and investments."
      entries={Object.entries(position.byPurpose)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([purpose, amount]) => [purpose.replace('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase()), amount])}
    />
    <BreakdownSection
      id="asset-place-title"
      eyebrow="BY HOLDING PLACE"
      title="Where it is held"
      emptyMessage="Holding places will appear when assets are added."
      entries={Object.entries(position.byInstitution).sort(([left], [right]) => left.localeCompare(right))}
    />
  </Stack>
}
