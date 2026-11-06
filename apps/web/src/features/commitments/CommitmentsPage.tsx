import { Stack } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { useState } from 'react'
import type { PlannedExpense, PlannedOccurrence } from '@kinsen/budget-domain'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'
import { LoadErrorState, PageHeader } from '../../shared/components/Primitives'
import { PageSkeleton } from '../../shared/components/PageSkeleton'
import { useBudgetStore } from '../../shared/state/budget-store'
import { PlannedExpenseForm } from './PlannedExpenseForm'
import { CommitmentCard } from './CommitmentCard'
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog'
import { TransactionForm } from '../transactions/TransactionForm'

export function CommitmentsPage() {
  const status = useBudgetStore((state) => state.status)
  const initialize = useBudgetStore((state) => state.initialize)
  const snapshot = useBudgetStore((state) => state.snapshot)
  const overview = useBudgetStore((state) => state.overview)
  const runMutation = useBudgetStore((state) => state.runMutation)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PlannedExpense | null>(null)
  const [payingOccurrence, setPayingOccurrence] = useState<PlannedOccurrence | null>(null)
  const [confirmingExpense, setConfirmingExpense] = useState<PlannedExpense | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (status === 'loading') return <PageSkeleton variant="list" label="Loading your commitments" />
  if (status === 'error' || !snapshot || !overview) return <LoadErrorState onRetry={() => void initialize()} />
  const outstandingRows = overview.occurrences.filter((occurrence) => occurrence.outstandingAmount > 0)
  const overdueCount = outstandingRows.filter((occurrence) => occurrence.dueDate < overview.today).length
  const paidThisPeriod = overview.occurrences.reduce((sum, occurrence) => sum + occurrence.fulfilledAmount, 0)

  async function deleteExpense(expense: PlannedExpense) {
    setError(null)
    try {
      await runMutation((useCases) => useCases.deletePlannedExpense(expense.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Commitment could not be deleted.')
    }
  }

  return (
    <Stack gap={0}>
      <PageHeader eyebrow="LOOKING AHEAD" title="Commitments" description="Bills, planned purchases, and recurring expenses — before they leave your account." actions={<Button label="New commitment" className="button button-primary" variant="primary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }} icon={<Icon name="plus" size={18} />}></Button>} />
      <Stack className="stat-grid three-stats">
        <article className="stat-card"><Text type="inherit" className="stat-label">Outstanding commitments</Text><strong>{formatIdr(overview.outstandingCommitments)}</strong><Text type="inherit" className="stat-detail">Still reserved from this period</Text></article>
        <article className={`stat-card${overdueCount ? ' stat-card-warning' : ''}`}><Text type="inherit" className="stat-label">Past due</Text><strong>{overdueCount}</strong><Text type="inherit" className="stat-detail">Unpaid commitments stay visible</Text></article>
        <article className="stat-card"><Text type="inherit" className="stat-label">Fulfilled so far</Text><strong>{formatIdr(paidThisPeriod)}</strong><Text type="inherit" className="stat-detail">Actual payments linked to plans</Text></article>
      </Stack>
      {error && <p className="inline-alert" role="alert"><Icon name="warning" size={17} />{error}</p>}
      <section className="section-block commitments-section">
        <Stack direction="horizontal" className="section-heading"><Stack gap={0}><p className="eyebrow">THIS BUDGET PERIOD</p><h2>Planned expenses</h2></Stack><Text type="inherit" className="count-pill">{overview.occurrences.length} occurrences</Text></Stack>
        {overview.occurrences.length === 0 ? <EmptyState className="empty-state" icon={<Text type="inherit" className="empty-icon"><Icon name="commitments" size={23} /></Text>} title="Nothing planned yet" description="Add a bill or future purchase so Kinsen can reserve only what is still unpaid." actions={<Button label="Plan a commitment" className="button button-secondary" variant="secondary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }} icon={<Icon name="plus" size={17} />}></Button>} /> : <Stack as="ul" className="commitment-list">
          {overview.occurrences.map((occurrence) => {
            const expense = snapshot.plannedExpenses.find((item) => item.id === occurrence.plannedExpenseId) ?? null
            return <li key={occurrence.id}><CommitmentCard occurrence={occurrence} today={overview.today} categoryName={snapshot.categories.find((category) => category.id === occurrence.categoryId)?.name ?? 'Category'} onFulfill={setPayingOccurrence} onEdit={() => { setEditing(expense); setFormOpen(true) }} onDelete={() => setConfirmingExpense(expense)} /></li>
          })}
        </Stack>}
      </section>
      <PlannedExpenseForm open={formOpen} initial={editing} onClose={() => { setFormOpen(false); setEditing(null) }} />
      <TransactionForm open={Boolean(payingOccurrence)} linkedOccurrence={payingOccurrence ? { plannedExpenseId: payingOccurrence.plannedExpenseId, dueDate: payingOccurrence.dueDate } : null} onClose={() => setPayingOccurrence(null)} />
      <ConfirmationDialog
        open={confirmingExpense !== null}
        title={confirmingExpense ? `Delete “${confirmingExpense.name}”?` : 'Delete commitment?'}
        description={confirmingExpense && snapshot.transactions.some((transaction) => transaction.plannedExpenseId === confirmingExpense.id)
          ? 'Recorded transactions will stay, but their commitment links will be removed.'
          : 'This removes its future commitment occurrences.'}
        confirmLabel="Delete commitment"
        onClose={() => setConfirmingExpense(null)}
        onConfirm={() => {
          if (!confirmingExpense) return
          const expense = confirmingExpense
          setConfirmingExpense(null)
          void deleteExpense(expense)
        }}
      />
    </Stack>
  )
}
