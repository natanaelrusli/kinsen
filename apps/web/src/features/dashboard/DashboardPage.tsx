import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Stack } from '@astryxdesign/core/Stack'
import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from '@astryxdesign/core/Link'
import { useNavigate } from 'react-router-dom'
import type { Transaction } from '@kinsen/budget-domain'
import { formatDate, formatLongDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'
import { LoadErrorState, PageHeader } from '../../shared/components/Primitives'
import { TransactionForm } from '../transactions/TransactionForm'
import { TransactionRow } from '../transactions/TransactionRow'
import { useUndoableTransactionDelete } from '../transactions/useUndoableTransactionDelete'
import { useBudgetStore } from '../../shared/state/budget-store'
import { calculateFinancialPosition } from '@kinsen/budget-domain'
import { localToday } from '../../shared/format/date'
import { useAssetStore } from '../../shared/state/asset-store'
import { useSettingsStore } from '../../shared/state/settings-store'

const healthCopy = {
  ON_TRACK: { label: 'On track', detail: 'Your reserve and current plans fit inside this period.', icon: 'check' as const },
  AT_RISK: { label: 'Needs attention', detail: 'Spending and unpaid commitments are using protected room.', icon: 'warning' as const },
  OVER_BUDGET: { label: 'Over budget', detail: 'Actual or category spending has moved beyond its allocation.', icon: 'warning' as const },
  ENDED: { label: 'Period ended', detail: 'This budget period has passed. Start a new period to plan ahead.', icon: 'clock' as const },
  NOT_STARTED: { label: 'Starts soon', detail: 'Your plan is ready. Safe-to-spend uses the full period length.', icon: 'clock' as const },
}

export function DashboardPage() {
  const status = useBudgetStore((state) => state.status)
  const initialize = useBudgetStore((state) => state.initialize)
  const snapshot = useBudgetStore((state) => state.snapshot)
  const overview = useBudgetStore((state) => state.overview)
  const runMutation = useBudgetStore((state) => state.runMutation)
  const assetStatus = useAssetStore((state) => state.status)
  const assetData = useAssetStore((state) => state.data)
  const dashboardSections = useSettingsStore((state) => state.dashboardSections)
  const assetPosition = useMemo(() => calculateFinancialPosition(assetData, overview?.today ?? localToday()), [assetData, overview?.today])
  const hasActiveLiabilities = assetData.liabilities.some((liability) => !liability.archivedAt)
  const navigate = useNavigate()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const { error, message: deleteMessage, undoTransaction, deleting, deleteTransaction, undoDelete } = useUndoableTransactionDelete(runMutation)
  const recentTransactions = useMemo(() => (snapshot?.transactions ?? []).slice().sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id)).slice(0, 4), [snapshot?.transactions])
  if (status === 'loading') return <Spinner className="loading-state" label="Loading your budget" size="md" />
  if (status === 'error' || !snapshot || !overview) return <LoadErrorState onRetry={() => void initialize()} />

  const period = snapshot.period
  const health = healthCopy[overview.health]
  const remainingBudget = period ? Math.max(0, period.totalAmount - overview.actualSpent) : 0
  const upcoming = overview.upcomingCommitments.filter((item) => item.outstandingAmount > 0).slice(0, 3)


  return (
    <div className="dashboard-page">
      <PageHeader eyebrow="YOUR DAILY PLAN" title="Your money, in focus" description={`${formatLongDate(overview.today)} · one clear number for what you can spend today.`} actions={<><Button label="Budget settings" className="button button-outline" variant="secondary" type="button" aria-label="Budget settings" onClick={() => navigate('/budget')} icon={<Icon name="wallet" size={17} />}></Button><Button label="New expense" className="button button-primary" variant="primary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }} icon={<Icon name="plus" size={18} />}></Button></>} />
      <Stack direction="horizontal" justify="end" paddingBlockEnd={3}>
        <Button label="Customize dashboard" variant="ghost" href="/settings" icon={<Icon name="settings" />} />
      </Stack>
      {snapshot.period?.isSample && <div className="starter-ribbon"><span className="starter-spark"><Icon name="wallet" size={16} /></span><span><strong>Starter budget</strong> — replace these examples with your own plan when you’re ready.</span><Link color="inherit" href="/budget">Set up my budget <Icon name="arrow" size={15} /></Link></div>}
      {error && <p className="inline-alert" role="alert"><Icon name="warning" size={17} />{error}</p>}
      {deleteMessage && <div className="undo-notice"><span role="status">{deleteMessage}</span>{undoTransaction && <Button label="Undo" className="button button-small button-quiet" variant="ghost" type="button" onClick={() => void undoDelete()} isDisabled={deleting} />}</div>}
      <div className="dashboard-top-grid">
        <section className="safe-card" aria-labelledby="safe-title">
          <div className="safe-card-top"><span className="safe-kicker"><span className="safe-indicator" />Safe to spend today</span><Link color="inherit" href="/budget" aria-label="Review budget period"><Icon name="external" size={17} /></Link></div>
          <h2 id="safe-title">{formatIdr(overview.safeToSpendToday)}</h2>
          <p>Without touching your reserve or money already promised.</p>
          <div className="safe-card-bottom"><span><Icon name="calendar" size={15} />{overview.remainingDays} {overview.remainingDays === 1 ? 'day' : 'days'} left in this period</span><span>{period ? `${formatDate(period.startDate, { day: 'numeric', month: 'short' })} – ${formatDate(period.endDate, { day: 'numeric', month: 'short' })}` : 'Set a budget period'}</span></div>
        </section>
        <section className={`health-card health-${overview.health.toLowerCase().replace('_', '-')}`} aria-labelledby="health-title">
          <div className="health-icon"><Icon name={health.icon} size={19} /></div>
          <div><p className="eyebrow">BUDGET HEALTH</p><h2 id="health-title">{health.label}</h2><p>{health.detail}</p></div>
          <Link color="inherit" href="/budget" className="health-link">Review plan <Icon name="arrow" size={15} /></Link>
        </section>
      </div>

      {dashboardSections.summary && <section className="stat-grid three-stats dashboard-stats" aria-label="Budget summary">
        <article className="stat-card"><span className="stat-label">Actual spending</span><strong>{formatIdr(overview.actualSpent)}</strong><span className="stat-detail">{period ? `of ${formatIdr(period.totalAmount)} total` : 'This period'}</span><ProgressBar className="app-progress-bar" value={period ? overview.actualSpent / period.totalAmount * 100 : 0} label="Actual spending as a portion of total budget" style={{'--color-accent': 'var(--green)'} as CSSProperties} isLabelHidden /></article>
        <article className="stat-card"><span className="stat-label">Outstanding commitments</span><strong>{formatIdr(overview.outstandingCommitments)}</strong><span className="stat-detail">Only unpaid amounts are reserved</span><Link color="inherit" className="stat-link" href="/commitments">See what’s coming <Icon name="arrow" size={14} /></Link></article>
        <article className="stat-card"><span className="stat-label">Protected reserve</span><strong>{formatIdr(overview.protectedReserve)}</strong><span className="stat-detail">Kept out of today’s spending number</span><span className="reserve-status"><Icon name="check" size={14} />Protected</span></article>
      </section>}
      {dashboardSections.assets && assetStatus === 'ready' && <section className="section-block dashboard-assets-summary" aria-labelledby="dashboard-assets-title">
        <div className="section-heading"><div><p className="eyebrow">FINANCIAL POSITION</p><h2 id="dashboard-assets-title">Your assets</h2></div><Link className="text-link" color="inherit" href="/assets">View assets <Icon name="arrow" size={15} /></Link></div>
        <div className="dashboard-assets-metrics">
          <article><span>Total assets</span><strong>{formatIdr(assetPosition.totalAssets)}</strong></article>
          <article><span>Daily-use cash</span><strong>{formatIdr(assetPosition.dailyUseCash)}</strong></article>
          <article><span>Protected savings</span><strong>{formatIdr(assetPosition.protectedSavings)}</strong></article>
          <article><span>Investments</span><strong>{formatIdr(assetPosition.investmentValue)}</strong></article>
          {hasActiveLiabilities && assetPosition.netWorth !== null && <article><span>Net worth</span><strong>{formatIdr(assetPosition.netWorth)}</strong></article>}
        </div>
        {assetPosition.netWorth === null && assetPosition.totalAssets === 0 && <p className="dashboard-assets-empty">Add assets or liabilities for a financial-position summary. These figures never change Safe to Spend Today.</p>}
        <p className="dashboard-assets-note">Separate from Safe to Spend Today.</p>
      </section>}

      {(dashboardSections.categories || dashboardSections.commitments) && <Stack gap={0} className={dashboardSections.categories && dashboardSections.commitments ? 'dashboard-content-grid' : undefined}>
        {dashboardSections.categories && <section className="section-block category-section">
          <div className="section-heading"><div><p className="eyebrow">WHERE IT GOES</p><h2>Category pulse</h2></div><Link className="text-link" color="inherit" href="/budget">Edit allocations <Icon name="arrow" size={15} /></Link></div>
          {overview.categorySummaries.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="wallet" size={23} /></span>} title="Add your categories" description="Set flexible and planned categories to give your budget structure." actions={<Button label="Set up budget" className="button button-secondary" variant="secondary" href="/budget" />} /> : <div className="category-pulse-list">
            {overview.categorySummaries.map(({ category, spent, committed, remainingAllocation, overspent }) => <article className="category-pulse" key={category.id}>
              <div className="category-pulse-heading"><span className="category-color-chip" style={{ backgroundColor: category.color }} /><div><strong>{category.name}</strong><span>{category.mode === 'DAILY' ? 'Daily' : category.mode === 'PERIOD' ? 'Period' : 'Scheduled'} · {category.bucket.toLowerCase()}</span></div><strong className={overspent ? 'money-danger' : ''}>{formatIdr(spent)}</strong></div>
              <ProgressBar className="app-progress-bar" value={category.allocation ? spent / category.allocation * 100 : spent > 0 ? 100 : 0} label={`${category.name} allocation used`} style={{'--color-accent': overspent ? 'var(--rust)' : category.color} as CSSProperties} isLabelHidden />
              <div className="category-pulse-footer"><span>{overspent ? `Over allocation by ${formatIdr(-remainingAllocation)}` : `${formatIdr(Math.max(0, remainingAllocation))} allocation left`}</span>{committed > 0 && <span>{formatIdr(committed)} committed</span>}</div>
            </article>)}
          </div>}
        </section>}

        {dashboardSections.commitments && <section className="section-block commitments-preview">
          <div className="section-heading"><div><p className="eyebrow">COMING UP</p><h2>Still to pay</h2></div><Link className="text-link" color="inherit" href="/commitments">All commitments <Icon name="arrow" size={15} /></Link></div>
          {upcoming.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="check" size={23} /></span>} title="Nothing waiting" description="Your planned expenses will appear here, including overdue amounts." actions={<Link color="inherit" href="/commitments" className="text-link">Plan an expense <Icon name="arrow" size={15} /></Link>} /> : <div className="upcoming-list">
            {upcoming.map((occurrence) => <article className="upcoming-item" key={occurrence.id}><span className="upcoming-date"><strong>{formatDate(occurrence.dueDate, { day: 'numeric' })}</strong><small>{formatDate(occurrence.dueDate, { month: 'short' })}</small></span><div className="upcoming-main"><strong>{occurrence.name}</strong><span>{occurrence.dueDate < overview.today ? 'Overdue · still reserved' : `Due ${formatDate(occurrence.dueDate, { day: 'numeric', month: 'short' })}`}</span></div><strong className="upcoming-amount">{formatIdr(occurrence.outstandingAmount)}</strong></article>)}
          </div>}
          <div className="upcoming-footer"><span>Period budget left after actual spending<small>Before commitments and protected reserve</small></span><strong>{formatIdr(remainingBudget)}</strong></div>
        </section>}
      </Stack>}

      {dashboardSections.activity && <section className="section-block recent-section">
        <div className="section-heading"><div><p className="eyebrow">JUST RECORDED</p><h2>Recent activity</h2></div><Link className="text-link" color="inherit" href="/activity">View all activity <Icon name="arrow" size={15} /></Link></div>
        {recentTransactions.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="receipt" size={23} /></span>} title="No expenses yet" description="Add spending when it happens; the safe-to-spend number will update instantly." actions={<Button label="Add an expense" className="button button-secondary" variant="secondary" type="button" onClick={() => setFormOpen(true)} icon={<Icon name="plus" size={17} />}></Button>} /> : <div className="transaction-list dashboard-transactions">
          {recentTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} categoryName={snapshot.categories.find((category) => category.id === transaction.categoryId)?.name ?? 'Uncategorized'} onEdit={(item) => { setEditing(item); setFormOpen(true) }} onDelete={(item) => void deleteTransaction(item)} deleteDisabled={deleting || Boolean(undoTransaction)} />)}
        </div>}
      </section>}
      <TransactionForm open={formOpen} initial={editing} onClose={() => { setFormOpen(false); setEditing(null) }} />
    </div>
  )
}
