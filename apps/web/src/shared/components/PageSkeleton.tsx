import { Grid } from '@astryxdesign/core/Grid'
import { Skeleton, type SkeletonRadius } from '@astryxdesign/core/Skeleton'
import { Stack } from '@astryxdesign/core/Stack'
import type { ReactNode } from 'react'

/**
 * Skeleton layouts mirror the shape of the page they stand in for, so the
 * content that arrives later lands in roughly the same place.
 */
export type PageSkeletonVariant =
  | 'overview'
  | 'calendar'
  | 'list'
  | 'assets'
  | 'detail'
  | 'meter'
  | 'form'
  | 'settings'

type Stagger = () => number

function bar(stagger: Stagger, width: number | string, height = 12, radius: SkeletonRadius = 2) {
  return <Skeleton width={width} height={height} radius={radius} index={stagger()} />
}

function SkeletonHeader({ stagger, action = true }: { stagger: Stagger; action?: boolean }) {
  return (
    <Stack gap={2} className="page-heading" style={{ margin: 0 }}>
      <Stack gap={2} style={{ flex: 1 }}>
        {bar(stagger, 92, 10)}
        {bar(stagger, 'min(60%, 320px)', 30, 3)}
        {bar(stagger, 'min(80%, 420px)', 12)}
      </Stack>
      {action && <Stack direction="horizontal" gap={2}>{bar(stagger, 132, 38, 3)}{bar(stagger, 108, 38, 3)}</Stack>}
    </Stack>
  )
}

function SkeletonStatCards({ stagger, count = 3 }: { stagger: Stagger; count?: number }) {
  return (
    <Grid columns={{ minWidth: 210, max: count }} gap={3}>
      {Array.from({ length: count }, (_, card) => (
        <Stack key={card} gap={2} className="skeleton-card">
          {bar(stagger, 104, 10)}
          {bar(stagger, '70%', 26, 3)}
          {bar(stagger, '45%', 10)}
        </Stack>
      ))}
    </Grid>
  )
}

function SkeletonPanel({ stagger, rows = 4, tall = false }: { stagger: Stagger; rows?: number; tall?: boolean }) {
  return (
    <Stack gap={3} className="skeleton-card">
      {bar(stagger, 132, 14)}
      {tall && <Skeleton width="100%" height={132} radius={3} index={stagger()} />}
      {Array.from({ length: rows }, (_, row) => (
        <Stack key={row} direction="horizontal" gap={3} vAlign="center">
          <Skeleton width={34} height={34} radius="rounded" index={stagger()} />
          <Stack gap={1} style={{ flex: 1 }}>
            {bar(stagger, `${58 - row * 4}%`, 12)}
            {bar(stagger, `${34 - row * 3}%`, 10)}
          </Stack>
          {bar(stagger, 66, 12)}
        </Stack>
      ))}
    </Stack>
  )
}

function SkeletonListRows({ stagger, rows = 6 }: { stagger: Stagger; rows?: number }) {
  return (
    <Stack gap={2}>
      {Array.from({ length: rows }, (_, row) => (
        <Stack key={row} direction="horizontal" gap={3} vAlign="center" className="skeleton-row">
          <Skeleton width={38} height={38} radius="rounded" index={stagger()} />
          <Stack gap={1} style={{ flex: 1 }}>
            {bar(stagger, `${52 - (row % 3) * 6}%`, 12)}
            {bar(stagger, `${30 - (row % 3) * 4}%`, 10)}
          </Stack>
          {bar(stagger, 78, 12)}
        </Stack>
      ))}
    </Stack>
  )
}

function SkeletonFormGroup({ stagger, fields = 3 }: { stagger: Stagger; fields?: number }) {
  return (
    <Stack gap={3} className="skeleton-card">
      {bar(stagger, 116, 14)}
      {Array.from({ length: fields }, (_, field) => (
        <Stack key={field} gap={1}>
          {bar(stagger, 88, 10)}
          <Skeleton width="100%" height={40} radius={3} index={stagger()} />
        </Stack>
      ))}
    </Stack>
  )
}

function SkeletonCalendar({ stagger }: { stagger: Stagger }) {
  return (
    <Stack gap={3} className="skeleton-card">
      <Stack direction="horizontal" gap={2} vAlign="center">
        {bar(stagger, 168, 22, 3)}
        <Skeleton width="100%" height={22} index={stagger()} />
        <Stack direction="horizontal" gap={1}>
          {bar(stagger, 38, 38, 3)}
          {bar(stagger, 38, 38, 3)}
        </Stack>
      </Stack>
      <Grid columns={7} gap={1}>
        {Array.from({ length: 7 }, (_, day) => <Skeleton key={`d${day}`} width="100%" height={12} radius={1} index={stagger()} />)}
        {Array.from({ length: 35 }, (_, cell) => (
          <Skeleton key={cell} width="100%" height={54} radius={2} index={stagger()} />
        ))}
      </Grid>
    </Stack>
  )
}

function SkeletonSettings({ stagger }: { stagger: Stagger }) {
  return (
    <Stack className="skeleton-settings">
      <Stack as="nav" gap={2} className="skeleton-card">
        {bar(stagger, 84, 10)}
        {Array.from({ length: 5 }, (_, item) => (
          <Stack key={item} direction="horizontal" gap={2} vAlign="center">
            <Skeleton width={18} height={18} radius={2} index={stagger()} />
            {bar(stagger, `${64 - item * 5}%`, 12)}
          </Stack>
        ))}
      </Stack>
      <Stack gap={4} style={{ flex: 1 }}>
        <SkeletonFormGroup stagger={stagger} />
        <SkeletonFormGroup stagger={stagger} fields={2} />
      </Stack>
    </Stack>
  )
}

const skeletonLayouts: Record<PageSkeletonVariant, (stagger: Stagger) => ReactNode> = {
  overview: (stagger) => (
    <Stack gap={5} className="page-skeleton">
      <SkeletonHeader stagger={stagger} />
      <SkeletonStatCards stagger={stagger} />
      <SkeletonPanel stagger={stagger} rows={3} tall />
    </Stack>
  ),
  calendar: (stagger) => (
    <Stack gap={5} className="page-skeleton">
      <SkeletonHeader stagger={stagger} action={false} />
      <SkeletonCalendar stagger={stagger} />
    </Stack>
  ),
  list: (stagger) => (
    <Stack gap={5} className="page-skeleton">
      <SkeletonHeader stagger={stagger} />
      <Stack direction="horizontal" gap={3} vAlign="center">
        {bar(stagger, 196, 12)}
        <Skeleton width="100%" height={38} radius={3} index={stagger()} />
      </Stack>
      <SkeletonListRows stagger={stagger} />
    </Stack>
  ),
  assets: (stagger) => (
    <Stack gap={4} className="page-skeleton">
      <SkeletonHeader stagger={stagger} />
      <SkeletonStatCards stagger={stagger} count={4} />
      <Grid columns={{ minWidth: 300, max: 2 }} gap={3}>
        <SkeletonPanel stagger={stagger} rows={4} />
        <SkeletonPanel stagger={stagger} rows={4} />
      </Grid>
    </Stack>
  ),
  detail: (stagger) => (
    <Stack gap={4} className="page-skeleton">
      <Stack gap={2}>
        {bar(stagger, 64, 12)}
        {bar(stagger, 'min(50%, 280px)', 30, 3)}
      </Stack>
      <Skeleton width="100%" height={148} radius={3} index={stagger()} />
      <SkeletonStatCards stagger={stagger} />
      <SkeletonPanel stagger={stagger} rows={3} tall />
    </Stack>
  ),
  meter: (stagger) => (
    <Stack gap={4} className="page-skeleton">
      <SkeletonHeader stagger={stagger} />
      <SkeletonStatCards stagger={stagger} count={2} />
      <SkeletonPanel stagger={stagger} rows={3} tall />
      <SkeletonListRows stagger={stagger} rows={4} />
    </Stack>
  ),
  form: (stagger) => (
    <Stack gap={5} className="page-skeleton">
      <SkeletonHeader stagger={stagger} action={false} />
      <SkeletonFormGroup stagger={stagger} fields={4} />
      <SkeletonFormGroup stagger={stagger} fields={3} />
    </Stack>
  ),
  settings: (stagger) => (
    <Stack gap={5} className="page-skeleton">
      <SkeletonHeader stagger={stagger} action={false} />
      <SkeletonSettings stagger={stagger} />
    </Stack>
  ),
}

/**
 * Placeholder shaped like the page being loaded. Purely decorative: the
 * surrounding region carries the busy state and the accessible label.
 */
export function PageSkeleton({ variant = 'overview', label = 'Loading page' }: { variant?: PageSkeletonVariant; label?: string }) {
  let index = 0
  const stagger: Stagger = () => index++
  return (
    <section className="page-skeleton-region" role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      {skeletonLayouts[variant](stagger)}
    </section>
  )
}