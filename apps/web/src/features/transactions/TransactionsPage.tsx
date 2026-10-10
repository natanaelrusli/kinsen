import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { TextInput } from '@astryxdesign/core/TextInput'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigationType, useSearchParams } from 'react-router-dom'
import type { Transaction } from '@kinsen/budget-domain'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'
import { LoadErrorState, PageHeader } from '../../shared/components/Primitives'
import { PageSkeleton } from '../../shared/components/PageSkeleton'
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog'
import { useBudgetStore } from '../../shared/state/budget-store'
import { TransactionForm } from './TransactionForm'
import { TransactionRow } from './TransactionRow'
import { useUndoableTransactionDelete } from './useUndoableTransactionDelete'
import { RECORD_PAGE_SIZE, RecordPagination } from '../../shared/components/RecordPagination'

// Activity-only positions are keyed to router entries so Back/Forward can restore without shell-wide scroll state.

const activityScrollPositions = new Map<string, number>()

export function TransactionsPage() {
  const status = useBudgetStore((state) => state.status)
  const initialize = useBudgetStore((state) => state.initialize)
  const snapshot = useBudgetStore((state) => state.snapshot)
  const overview = useBudgetStore((state) => state.overview)
  const runMutation = useBudgetStore((state) => state.runMutation)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [page, setPage] = useState(1)
  const [searchParams, setSearchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const location = useLocation()
  const navigationType = useNavigationType()
  const previousLocation = useRef(location)
  const initializedScroll = useRef(false)
  const [confirmingTransaction, setConfirmingTransaction] = useState<Transaction | null>(null)
  useEffect(() => setPage(1), [query])
  useLayoutEffect(() => {
    const previous = previousLocation.current
    const main = document.querySelector<HTMLElement>('.app-frame [role="main"]')
    if (!initializedScroll.current) {
      const restore = navigationType === 'POP' ? activityScrollPositions.get(location.key) : undefined
      const scrollTop = restore ?? 0
      if (main) main.scrollTop = scrollTop
      activityScrollPositions.set(location.key, scrollTop)
      initializedScroll.current = true
    } else if (previous.pathname === location.pathname && previous.key !== location.key) {
      if (navigationType === 'POP') {
        const scrollTop = activityScrollPositions.get(location.key) ?? 0
        if (main) main.scrollTop = scrollTop
      } else if (navigationType === 'REPLACE') {
        const scrollTop = main?.scrollTop ?? activityScrollPositions.get(previous.key) ?? 0
        activityScrollPositions.delete(previous.key)
        activityScrollPositions.set(location.key, scrollTop)
      } else {
        if (main) main.scrollTop = 0
        activityScrollPositions.set(location.key, 0)
      }
    }
    previousLocation.current = location
  }, [location, navigationType])

  useLayoutEffect(() => {
    const main = document.querySelector<HTMLElement>('.app-frame [role="main"]')
    if (!main) return
    const saveScrollPosition = () => activityScrollPositions.set(location.key, main.scrollTop)
    main.addEventListener('scroll', saveScrollPosition, { passive: true })
    return () => {
      saveScrollPosition()
      main.removeEventListener('scroll', saveScrollPosition)
    }
  }, [location.key])
  const { error, message: deleteMessage, undoTransaction, deleting, deleteTransaction, undoDelete } = useUndoableTransactionDelete(runMutation)

  const transactions = useMemo(() => (snapshot?.transactions ?? []).slice().sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id)), [snapshot?.transactions])
  const categoryNames = useMemo(() => new Map((snapshot?.categories ?? []).map((category) => [category.id, category.name])), [snapshot?.categories])
  const searchableTransactions = useMemo(() => transactions.map((transaction) => ({
    transaction,
    text: `${transaction.description} ${categoryNames.get(transaction.categoryId) ?? ''}`.toLowerCase(),
  })), [transactions, categoryNames])
  const normalizedQuery = query.trim().toLowerCase()
  const matchingTransactions = useMemo(() => searchableTransactions
    .filter(({ text }) => text.includes(normalizedQuery))
    .map(({ transaction }) => transaction), [searchableTransactions, normalizedQuery])
  const pageCount = Math.max(1, Math.ceil(matchingTransactions.length / RECORD_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleTransactions = matchingTransactions.slice((currentPage - 1) * RECORD_PAGE_SIZE, currentPage * RECORD_PAGE_SIZE)
  if (status === 'loading') return <PageSkeleton variant="list" label="Loading your activity" />
  if (status === 'error' || !snapshot || !overview) return <LoadErrorState onRetry={() => void initialize()} />


  return (
    <>
      <PageHeader eyebrow="WHAT YOU SPENT" title="Activity" description="Every recorded expense, with the actuals that shape today's number." actions={<Button label="New expense" className="button button-primary" variant="primary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }} icon={<Icon name="plus" size={18} />}></Button>} />
      <div className="activity-summary-row"><div><span className="stat-label">Spent this period</span><strong>{formatIdr(overview.actualSpent)}</strong></div><div className="activity-summary-caption"><Icon name="receipt" size={18} /><span>{transactions.length} recorded {transactions.length === 1 ? 'expense' : 'expenses'}</span></div></div>
      <section className="section-block activity-section">
        <div className="section-heading"><div><p className="eyebrow">TRANSACTION HISTORY</p><h2>Recent activity</h2></div><TextInput label="Search activity" isLabelHidden className="search-field" startIcon={<Icon name="activity" size={17} />} placeholder="Search activity" value={query} onChange={(value) => {
          const nextParams = new URLSearchParams(searchParams)
          if (value) nextParams.set('q', value)
          else nextParams.delete('q')
          setSearchParams(nextParams, { replace: true })
        }} /></div>
        {error && <p className="inline-alert" role="alert"><Icon name="warning" size={17} />{error}</p>}
        {deleteMessage && <div className="undo-notice"><span role="status">{deleteMessage}</span>{undoTransaction && <Button label="Undo" className="button button-small button-quiet" variant="ghost" type="button" onClick={() => void undoDelete()} isDisabled={deleting} />}</div>}
        {transactions.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="receipt" size={23} /></span>} title="No expenses recorded" description="Add an actual expense when money leaves your account. Safe to spend recalculates as soon as it is saved." actions={<Button label="Add an expense" className="button button-secondary" variant="secondary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }} icon={<Icon name="plus" size={17} />}></Button>} /> : matchingTransactions.length === 0 ? <EmptyState className="empty-state" icon={<span className="empty-icon"><Icon name="activity" size={23} /></span>} title="No matches" description="Try another description or category." /> : <div className="transaction-list">
          {visibleTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} categoryName={categoryNames.get(transaction.categoryId) ?? 'Uncategorized'} onEdit={(item) => { setEditing(item); setFormOpen(true) }} onDelete={setConfirmingTransaction} deleteDisabled={deleting || Boolean(undoTransaction)} />)}
        </div>}
        <RecordPagination count={matchingTransactions.length} page={currentPage} onPageChange={setPage} />
      </section>
      <TransactionForm open={formOpen} initial={editing} onClose={() => { setFormOpen(false); setEditing(null) }} />
      <ConfirmationDialog
        open={confirmingTransaction !== null}
        title={confirmingTransaction ? `Delete “${confirmingTransaction.description}”?` : 'Delete expense?'}
        description="You can undo this deletion for 10 seconds."
        confirmLabel="Delete expense"
        onClose={() => setConfirmingTransaction(null)}
        onConfirm={() => {
          if (!confirmingTransaction) return
          const transaction = confirmingTransaction
          setConfirmingTransaction(null)
          void deleteTransaction(transaction)
        }}
      />
    </>
  )
}
