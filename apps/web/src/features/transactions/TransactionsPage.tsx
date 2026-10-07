import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Spinner } from '@astryxdesign/core/Spinner'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useMemo, useState } from 'react'
import type { Transaction } from '@kinsen/budget-domain'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'
import { LoadErrorState, PageHeader } from '../../shared/components/Primitives'
import { useBudgetStore } from '../../shared/state/budget-store'
import { TransactionForm } from './TransactionForm'
import { TransactionRow } from './TransactionRow'
import { useUndoableTransactionDelete } from './useUndoableTransactionDelete'

export function TransactionsPage() {
  const status = useBudgetStore((state) => state.status)
  const initialize = useBudgetStore((state) => state.initialize)
  const snapshot = useBudgetStore((state) => state.snapshot)
  const overview = useBudgetStore((state) => state.overview)
  const runMutation = useBudgetStore((state) => state.runMutation)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [query, setQuery] = useState('')
  const { error, message: deleteMessage, undoTransaction, deleting, deleteTransaction, undoDelete } = useUndoableTransactionDelete(runMutation)

  const transactions = useMemo(() => (snapshot?.transactions ?? []).slice().sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id)), [snapshot?.transactions])
  const matchingTransactions = transactions.filter((transaction) => {
    const category = snapshot?.categories.find((item) => item.id === transaction.categoryId)?.name ?? ''
    return `${transaction.description} ${category}`.toLowerCase().includes(query.trim().toLowerCase())
  })
  if (status === 'loading') return <Spinner className="loading-state" label="Loading your activity" size="md" />
  if (status === 'error' || !snapshot || !overview) return <LoadErrorState onRetry={() => void initialize()} />


  return (
    <div>
      <PageHeader eyebrow="WHAT YOU SPENT" title="Activity" description="Every recorded expense, with the actuals that shape today's number." actions={<Button label="New expense" className="button button-primary" variant="primary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }} icon={<Icon name="plus" size={18} />}></Button>} />
      <div className="activity-summary-row"><div><span className="stat-label">Spent this period</span><strong>{formatIdr(overview.actualSpent)}</strong></div><div className="activity-summary-caption"><Icon name="receipt" size={18} /><span>{transactions.length} recorded {transactions.length === 1 ? 'expense' : 'expenses'}</span></div></div>
      <section className="section-block activity-section">
        <div className="section-heading"><div><p className="eyebrow">TRANSACTION HISTORY</p><h2>Recent activity</h2></div><TextInput label="Search activity" isLabelHidden className="search-field" startIcon={<Icon name="activity" size={17} />} placeholder="Search activity" value={query} onChange={setQuery} /></div>
        {error && <p className="inline-alert" role="alert"><Icon name="warning" size={17} />{error}</p>}
        {deleteMessage && <div className="undo-notice"><span role="status">{deleteMessage}</span>{undoTransaction && <Button label="Undo" className="button button-small button-quiet" variant="ghost" type="button" onClick={() => void undoDelete()} isDisabled={deleting} />}</div>}
        {transactions.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="receipt" size={23} /></span>} title="No expenses recorded" description="Add an actual expense when money leaves your account. Safe to spend recalculates as soon as it is saved." actions={<Button label="Add an expense" className="button button-secondary" variant="secondary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }} icon={<Icon name="plus" size={17} />}></Button>} /> : matchingTransactions.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="activity" size={23} /></span>} title="No matches" description="Try another description or category." /> : <div className="transaction-list">
          {matchingTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} categoryName={snapshot.categories.find((category) => category.id === transaction.categoryId)?.name ?? 'Uncategorized'} onEdit={(item) => { setEditing(item); setFormOpen(true) }} onDelete={(item) => void deleteTransaction(item)} deleteDisabled={deleting || Boolean(undoTransaction)} />)}
        </div>}
      </section>
      <TransactionForm open={formOpen} initial={editing} onClose={() => { setFormOpen(false); setEditing(null) }} />
    </div>
  )
}
