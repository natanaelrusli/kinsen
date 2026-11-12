import { useMemo, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Stack } from '@astryxdesign/core/Stack'
import { recurrenceDates, type DateOnly, type Subscription } from '@kinsen/budget-domain'
import { addDays, daysBetween } from '@kinsen/budget-domain/date-only'
import { formatIdr } from '../../shared/format/money'
import { formatDate, localToday } from '../../shared/format/date'
import { Icon } from '../../shared/components/Icon'
import { LoadErrorState, PageHeader } from '../../shared/components/Primitives'
import { PageSkeleton } from '../../shared/components/PageSkeleton'
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog'
import { useBudgetStore } from '../../shared/state/budget-store'
import { SubscriptionForm } from './SubscriptionForm'

const storageKey = 'kinsen-subscriptions-v1'
const cadenceLabels = { WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly' } as const
const cyclesPerYear = { WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, YEARLY: 1 } as const

function readSubscriptions(): Subscription[] {
  try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Subscription[] } catch { return [] }
}

/** First renewal on or after today; the stored due date is only the schedule's anchor. */
function nextRenewal(subscription: Subscription, today: DateOnly): DateOnly | null {
  const segment = subscription.segments.at(-1)
  if (!segment) return null
  try { return recurrenceDates(segment.dueDate, segment.cadence, today, addDays(today, 400))[0] ?? null } catch { return null }
}

function relativeDays(today: DateOnly, date: DateOnly) {
  const days = daysBetween(today, date)
  return days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
}

export function SubscriptionsPage() {
  const status = useBudgetStore((state) => state.status)
  const initialize = useBudgetStore((state) => state.initialize)
  const refresh = useBudgetStore((state) => state.refresh)
  const [subscriptions, setSubscriptions] = useState(readSubscriptions)
  const [formOpen, setFormOpen] = useState(false)
  const [confirming, setConfirming] = useState<Subscription | null>(null)
  const today = localToday()
  const rows = useMemo(() => subscriptions
    .map((subscription) => ({ subscription, segment: subscription.segments.at(-1), paused: subscription.status !== 'ACTIVE', renewsOn: nextRenewal(subscription, today) }))
    .sort((left, right) => Number(left.paused) - Number(right.paused) || (left.renewsOn ?? '9999').localeCompare(right.renewsOn ?? '9999')), [subscriptions, today])
  const active = rows.filter((row) => !row.paused)
  const yearlyTotal = active.reduce((sum, { segment }) => segment ? sum + segment.myShareIdr * cyclesPerYear[segment.cadence] : sum, 0)
  const upcoming = active.find((row) => row.renewsOn)

  if (status === 'loading') return <PageSkeleton variant="list" label="Loading your subscriptions" />
  if (status === 'error') return <LoadErrorState onRetry={() => void initialize()} />

  function persist(next: Subscription[]) {
    setSubscriptions(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
    void refresh()
  }

  const openForm = () => setFormOpen(true)

  return (
    <Stack as="div" gap={0}>
      <PageHeader eyebrow="RECURRING PLANS" title="Subscriptions" description="Streaming, cloud, and app plans — what renews next and what they cost you each year." actions={<Button label="New subscription" className="button button-primary" variant="primary" type="button" onClick={openForm} icon={<Icon name="plus" size={18} />} />} />
      <Stack as="div" className="stat-grid three-stats">
        <article className="stat-card"><span className="stat-label">Monthly equivalent</span><strong>{formatIdr(Math.round(yearlyTotal / 12))}</strong><span className="stat-detail">{active.length} active {active.length === 1 ? 'plan' : 'plans'}{rows.length > active.length ? ` · ${rows.length - active.length} paused` : ''}</span></article>
        <article className="stat-card"><span className="stat-label">Yearly cost</span><strong>{formatIdr(yearlyTotal)}</strong><span className="stat-detail">Based on your share</span></article>
        <article className="stat-card"><span className="stat-label">Next renewal</span><strong className="subscription-next-name">{upcoming ? upcoming.subscription.name : '—'}</strong><span className="stat-detail">{upcoming?.renewsOn ? `${formatDate(upcoming.renewsOn, { day: 'numeric', month: 'short' })}, ${relativeDays(today, upcoming.renewsOn)} · ${formatIdr(upcoming.segment?.myShareIdr ?? 0)}` : 'Nothing due soon'}</span></article>
      </Stack>
      <section className="section-block subscriptions-section">
        <Stack as="div" direction="horizontal" className="section-heading"><Stack as="div" style={{ display: 'block' }}><p className="eyebrow">RENEWAL SCHEDULE</p><h2>Your subscriptions</h2></Stack><span className="count-pill">{rows.length} {rows.length === 1 ? 'plan' : 'plans'}</span></Stack>
        {rows.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="clock" size={23} /></span>} title="No subscriptions tracked" description="Add a plan like Netflix or iCloud to see when it renews and what it costs you each year." actions={<Button label="Add a subscription" className="button button-secondary" variant="secondary" type="button" onClick={openForm} icon={<Icon name="plus" size={17} />} />} /> : <Stack as="div" className="transaction-list" gap={0}>
          {rows.map(({ subscription, segment, paused, renewsOn }) => <article key={subscription.id} className={`transaction-row${paused ? ' is-paused' : ''}`}>
            <span className="transaction-icon subscription-monogram" aria-hidden="true">{subscription.name.trim().charAt(0).toUpperCase()}</span>
            <Stack as="div" className="transaction-main">
              <strong>{subscription.name}</strong>
              <span>{segment ? cadenceLabels[segment.cadence] : 'No schedule'} <i aria-hidden="true">·</i> {paused ? 'Paused' : renewsOn ? `Renews ${formatDate(renewsOn, { day: 'numeric', month: 'short' })}, ${relativeDays(today, renewsOn)}` : 'No upcoming renewal'}</span>
            </Stack>
            <strong className="transaction-amount">{formatIdr(segment?.myShareIdr ?? 0)}</strong>
            <Stack as="div" direction="horizontal" className="row-actions" gap={1}>
              <Button label={`${paused ? 'Resume' : 'Pause'} ${subscription.name}`} aria-label={`${paused ? 'Resume' : 'Pause'} ${subscription.name}`} className="icon-button" variant="ghost" type="button" icon={<Icon name={paused ? 'play' : 'pause'} size={17} />} isIconOnly onClick={() => persist(subscriptions.map((item) => item.id === subscription.id ? { ...item, status: paused ? 'ACTIVE' : 'PAUSED' } : item))} />
              <Button label={`Delete ${subscription.name}`} className="icon-button danger-icon" variant="destructive" type="button" aria-label={`Delete ${subscription.name}`} onClick={() => setConfirming(subscription)} icon={<Icon name="trash" size={17} />} isIconOnly />
            </Stack>
          </article>)}
        </Stack>}
      </section>
      <SubscriptionForm open={formOpen} onClose={() => setFormOpen(false)} onSave={(subscription) => persist([...subscriptions, subscription])} />
      <ConfirmationDialog
        open={confirming !== null}
        title={confirming ? `Delete “${confirming.name}”?` : 'Delete subscription?'}
        description="It is removed from your list. This cannot be undone."
        confirmLabel="Delete subscription"
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming) persist(subscriptions.filter((item) => item.id !== confirming.id))
          setConfirming(null)
        }}
      />
    </Stack>
  )
}
