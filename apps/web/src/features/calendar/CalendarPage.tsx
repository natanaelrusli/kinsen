import { Button } from '@astryxdesign/core/Button'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Spinner } from '@astryxdesign/core/Spinner'
import { useMemo, useState } from 'react'
import { Link } from '@astryxdesign/core/Link'
import type { DateOnly } from '@kinsen/budget-domain'
import { addDays, addMonths, parseDateOnly, weekday } from '@kinsen/budget-domain/date-only'
import { formatDate, formatMonth, localToday } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'
import { LoadErrorState, PageHeader } from '../../shared/components/Primitives'
import { useBudgetStore } from '../../shared/state/budget-store'
import { TransactionForm } from '../transactions/TransactionForm'
import { useSettingsStore } from '../../shared/state/settings-store'

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function monthStart(date: DateOnly): DateOnly {
  const { year, month } = parseDateOnly(date)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
}


export function CalendarPage() {
  const status = useBudgetStore((state) => state.status)
  const initialize = useBudgetStore((state) => state.initialize)
  const snapshot = useBudgetStore((state) => state.snapshot)
  const overview = useBudgetStore((state) => state.overview)
  const weekStartsOn = useSettingsStore((state) => state.weekStartsOn)
  const [month, setMonth] = useState<DateOnly>(() => monthStart(localToday()))
  const [selectedDate, setSelectedDate] = useState<DateOnly>(() => localToday())
  const [expenseDate, setExpenseDate] = useState<DateOnly | null>(null)

  const monthLabel = formatMonth(month)
  const monthPrefix = month.slice(0, 7)
  const period = snapshot?.period ?? null
  const actualByDate = useMemo(() => {
    const totals = new Map<DateOnly, number>()
    for (const transaction of snapshot?.transactions ?? []) {
      if (!transaction.date.startsWith(monthPrefix) || (period && (transaction.date < period.startDate || transaction.date > period.endDate))) continue
      totals.set(transaction.date, (totals.get(transaction.date) ?? 0) + transaction.amount)
    }
    return totals
  }, [snapshot?.transactions, monthPrefix, period?.startDate, period?.endDate])
  const plannedByDate = useMemo(() => {
    const totals = new Map<DateOnly, number>()
    for (const occurrence of overview?.occurrences ?? []) {
      if (!occurrence.dueDate.startsWith(monthPrefix)) continue
      totals.set(occurrence.dueDate, (totals.get(occurrence.dueDate) ?? 0) + occurrence.outstandingAmount)
    }
    return totals
  }, [overview?.occurrences, monthPrefix])
  const cells = useMemo(() => {
    const first = monthStart(month)
    const firstWeekday = weekStartsOn === 'sunday' ? 0 : 1
    const weekdayOffset = (weekday(first) - firstWeekday + 7) % 7
    const start = addDays(first, -weekdayOffset)
    return Array.from({ length: 42 }, (_, index) => addDays(start, index))
  }, [month, weekStartsOn])
  const monthActual = Array.from(actualByDate.values()).reduce((sum, amount) => sum + amount, 0)
  const monthPlanned = Array.from(plannedByDate.values()).reduce((sum, amount) => sum + amount, 0)
  const selectedTransactions = (snapshot?.transactions ?? []).filter((transaction) => transaction.date === selectedDate && (!period || (transaction.date >= period.startDate && transaction.date <= period.endDate)))
  const selectedOccurrences = (overview?.occurrences ?? []).filter((occurrence) => occurrence.dueDate === selectedDate)
  const selectedActual = selectedTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
  const selectedPlanned = selectedOccurrences.reduce((sum, occurrence) => sum + occurrence.outstandingAmount, 0)
  const today = overview?.today ?? localToday()
  const selectedInBudget = Boolean(period && selectedDate >= period.startDate && selectedDate <= period.endDate)
  const weekdays = weekStartsOn === 'sunday' ? weekdayLabels : [...weekdayLabels.slice(1), weekdayLabels[0]]

  if (status === 'loading') return <Spinner className="loading-state" label="Loading your calendar" size="md" />
  if (status === 'error' || !snapshot || !overview) return <LoadErrorState onRetry={() => void initialize()} />

  const inBudgetMonth = Boolean(period && monthPrefix >= period.startDate.slice(0, 7) && monthPrefix <= period.endDate.slice(0, 7))


  return (
    <div>
      <PageHeader eyebrow="SEE THE SHAPE OF YOUR MONTH" title="Calendar" description="Actual spending beside the commitments still waiting to be paid." actions={<div className="calendar-month-actions"><Button label="Previous month" variant="ghost" className="icon-button" type="button" aria-label="Previous month" onClick={() => { const previous = addMonths(month, -1); setMonth(monthStart(previous)) }} icon={<Icon name="arrow-left"  />} isIconOnly /><strong>{monthLabel}</strong><Button label="Next month" variant="ghost" className="icon-button" type="button" aria-label="Next month" onClick={() => { const next = addMonths(month, 1); setMonth(monthStart(next)) }} icon={<Icon name="arrow-right"  />} isIconOnly /><Button label="Today" variant="ghost" className="button button-quiet today-button" type="button" onClick={() => { setMonth(monthStart(today)); setSelectedDate(today) }}>Today</Button></div>} />
      {!inBudgetMonth && <div className="calendar-outside-note"><Icon name="warning" size={17} />This month is outside the saved budget period. No budget totals are included.</div>}
      <div className="calendar-month-summary"><div><span>Actual this month</span><strong>{formatIdr(monthActual)}</strong></div><div><span>Planned still outstanding</span><strong>{formatIdr(monthPlanned)}</strong></div><p><span className="legend-dot actual-dot" />Actual <span className="legend-dot planned-dot" />Unpaid commitments</p></div>
      <div className="calendar-layout">
        <section className="calendar-panel" aria-label={`${monthLabel} spending calendar`}>
          <div className="calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="calendar-grid">
            {cells.map((date) => {
              const totals = { actual: actualByDate.get(date) ?? 0, planned: plannedByDate.get(date) ?? 0 }
              const isCurrentMonth = date.startsWith(monthPrefix)
              const inBudget = Boolean(period && date >= period.startDate && date <= period.endDate)
              const isToday = date === today
              const isSelected = date === selectedDate
              const label = `${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}. Actual ${formatIdr(totals.actual)}. Planned ${formatIdr(totals.planned)}.`
              return <Button key={date} label={label} variant="ghost" type="button" className={`calendar-day${!isCurrentMonth ? ' outside-month' : ''}${!inBudget ? ' outside-budget' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`} aria-label={label} aria-pressed={isSelected} onClick={() => setSelectedDate(date)}>
                <span className="calendar-day-number">{parseDateOnly(date).day}</span>
                {inBudget && <span className="calendar-day-totals">{totals.actual > 0 && <span className="calendar-actual">{formatIdr(totals.actual)}</span>}{totals.planned > 0 && <span className="calendar-planned">{formatIdr(totals.planned)} planned</span>}</span>}
              </Button>
            })}
          </div>
        </section>
        <aside className="day-detail-panel" aria-label={`Details for ${formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}`}>
          <div className="day-detail-heading"><div><p className="eyebrow">DAY DETAIL</p><h2>{formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div><Button label="Add expense on this date" variant="ghost" className="icon-button" type="button" aria-label="Add expense on this date" isDisabled={!selectedInBudget} onClick={() => setExpenseDate(selectedDate)} icon={<Icon name="plus" size={18} />} isIconOnly /></div>
          <div className="day-detail-totals"><div><span>Actual</span><strong>{formatIdr(selectedActual)}</strong></div><div><span>Planned left</span><strong>{formatIdr(selectedPlanned)}</strong></div></div>
          {!selectedInBudget && <p className="field-hint">This date is outside the budget period.</p>}
          {selectedTransactions.length > 0 && <div className="day-detail-group"><h3>Actual spending</h3>{selectedTransactions.map((transaction) => <div className="day-entry" key={transaction.id}><div><strong>{transaction.description}</strong><span>{snapshot.categories.find((category) => category.id === transaction.categoryId)?.name ?? 'Category'}</span></div><b>−{formatIdr(transaction.amount)}</b></div>)}</div>}
          {selectedOccurrences.length > 0 && <div className="day-detail-group"><h3>Planned commitments</h3>{selectedOccurrences.map((occurrence) => <div className="day-entry" key={occurrence.id}><div><strong>{occurrence.name}</strong><span>{occurrence.outstandingAmount === 0 ? 'Paid' : `${formatIdr(occurrence.outstandingAmount)} unpaid`}</span></div><b>{formatIdr(occurrence.amount)}</b></div>)}</div>}
          {selectedTransactions.length === 0 && selectedOccurrences.length === 0 && <EmptyState className="empty-state" title="A clear day" icon={<span className="empty-icon"><Icon name="receipt" size={23} /></span>} description="No recorded spending or commitments due." />}
          {selectedOccurrences.length > 0 && <p className="day-detail-footnote">Planned totals show only the unpaid remainder.</p>}
          <Link className="text-link" color="inherit" href="/commitments">View all commitments <Icon name="arrow" size={15} /></Link>
        </aside>
      </div>
      <TransactionForm open={expenseDate !== null} initialDate={expenseDate ?? undefined} onClose={() => setExpenseDate(null)} />
    </div>
  )
}
