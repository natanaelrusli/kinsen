import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Spinner } from '@astryxdesign/core/Spinner'
import { useState } from 'react'
import type { PlannedExpense, PlannedOccurrence } from '@kinsen/budget-domain'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'
import { LoadErrorState, PageHeader } from '../../shared/components/Primitives'
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

  if (status === 'loading') return <Spinner className="loading-state" label="Loading your commitments" size="md" />
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
    <div>
      <PageHeader eyebrow="LOOKING AHEAD" title="Commitments" description="Bills, planned purchases, and recurring expenses — before they leave your account." actions={<Button label="New commitment" className="button button-primary" variant="primary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }} icon={<Icon name="plus" size={18} />}></Button>} />
      <div className="stat-grid three-stats">
        <article className="stat-card"><span className="stat-label">Outstanding commitments</span><strong>{formatIdr(overview.outstandingCommitments)}</strong><span className="stat-detail">Still reserved from this period</span></article>
        <article className={`stat-card${overdueCount ? ' stat-card-warning' : ''}`}><span className="stat-label">Past due</span><strong>{overdueCount}</strong><span className="stat-detail">Unpaid commitments stay visible</span></article>
        <article className="stat-card"><span className="stat-label">Fulfilled so far</span><strong>{formatIdr(paidThisPeriod)}</strong><span className="stat-detail">Actual payments linked to plans</span></article>
      </div>
      {error && <p className="inline-alert" role="alert"><Icon name="warning" size={17} />{error}</p>}
      <section className="section-block commitments-section">
        <div className="section-heading"><div><p className="eyebrow">THIS BUDGET PERIOD</p><h2>Planned expenses</h2></div><span className="count-pill">{overview.occurrences.length} occurrences</span></div>
        {overview.occurrences.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="commitments" size={23} /></span>} title="Nothing planned yet" description="Add a bill or future purchase so Kinsen can reserve only what is still unpaid." actions={<Button label="Plan a commitment" className="button button-secondary" variant="secondary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }} icon={<Icon name="plus" size={17} />}></Button>} /> : <div className="commitment-list">
          {overview.occurrences.map((occurrence) => {
            const expense = snapshot.plannedExpenses.find((item) => item.id === occurrence.plannedExpenseId) ?? null
            return <CommitmentCard key={occurrence.id} occurrence={occurrence} today={overview.today} categoryName={snapshot.categories.find((category) => category.id === occurrence.categoryId)?.name ?? 'Category'} onFulfill={setPayingOccurrence} onEdit={() => { setEditing(expense); setFormOpen(true) }} onDelete={() => setConfirmingExpense(expense)} />
          })}
        </div>}
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
    </div>
  )
}
