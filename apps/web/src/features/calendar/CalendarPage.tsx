import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Spinner } from '@astryxdesign/core/Spinner'
import { Grid } from '@astryxdesign/core/Grid'
import { Stack } from '@astryxdesign/core/Stack'
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@astryxdesign/core/Link'
import type { DateOnly } from '@kinsen/budget-domain'
import { addDays, addMonths, daysInMonth, parseDateOnly, weekday } from '@kinsen/budget-domain/date-only'
import { formatDate, formatMonth, localToday } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { Icon } from '../../shared/components/Icon'
import { LoadErrorState, PageHeader } from '../../shared/components/Primitives'
import { useBudgetStore } from '../../shared/state/budget-store'
import { TransactionForm } from '../transactions/TransactionForm'
import { useSettingsStore } from '../../shared/state/settings-store'

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const MOBILE_CALENDAR_QUERY = '(max-width: 640px)'

function monthStart(date: DateOnly): DateOnly {
  const { year, month } = parseDateOnly(date)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`
}

function dateInMonth(month: DateOnly, day: number): DateOnly {
  const first = monthStart(month)
  const { year, month: monthNumber } = parseDateOnly(first)
  return addDays(first, Math.min(day, daysInMonth(year, monthNumber)) - 1)
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
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [pendingExpenseDate, setPendingExpenseDate] = useState<DateOnly | null>(null)

  useEffect(() => {
    if (mobileDetailsOpen || pendingExpenseDate === null) return
    setExpenseDate(pendingExpenseDate)
    setPendingExpenseDate(null)
  }, [mobileDetailsOpen, pendingExpenseDate])

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
  const navigateMonth = (offset: number) => {
    const nextMonth = monthStart(addMonths(month, offset))
    setMonth(nextMonth)
    setSelectedDate(dateInMonth(nextMonth, parseDateOnly(selectedDate).day))
  }

  if (status === 'loading') return <Spinner className="loading-state" label="Loading your calendar" size="md" />
  if (status === 'error' || !snapshot || !overview) return <LoadErrorState onRetry={() => void initialize()} />

  const inBudgetMonth = Boolean(period && monthPrefix >= period.startDate.slice(0, 7) && monthPrefix <= period.endDate.slice(0, 7))

  const selectedDateLabel = formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })
  const handleSelectDate = (date: DateOnly) => {
    setSelectedDate(date)
    if (window.matchMedia?.(MOBILE_CALENDAR_QUERY).matches) setMobileDetailsOpen(true)
  }
  const handleAddExpense = () => {
    if (mobileDetailsOpen) {
      setPendingExpenseDate(selectedDate)
      setMobileDetailsOpen(false)
      return
    }
    setExpenseDate(selectedDate)
  }
  const renderDayDetails = () => (
    <>
      <Grid columns={2} gap={3} className="day-detail-totals">
        <Stack gap={0.5}><span>Actual</span><strong>{formatIdr(selectedActual)}</strong></Stack>
        <Stack gap={0.5}><span>Still to pay</span><strong>{formatIdr(selectedPlanned)}</strong></Stack>
      </Grid>
      {!selectedInBudget && <p className="field-hint">This date is outside the budget period.</p>}
      {selectedTransactions.length > 0 && <section className="day-detail-group">
        <h3>Actual spending</h3>
        <ul className="day-detail-list">
          {selectedTransactions.map((transaction) => <li className="day-entry" key={transaction.id}>
            <Stack gap={0.5} className="day-entry-copy">
              <strong>{transaction.description}</strong>
              <span>{snapshot.categories.find((category) => category.id === transaction.categoryId)?.name ?? 'Category'}</span>
            </Stack>
            <b>−{formatIdr(transaction.amount)}</b>
          </li>)}
        </ul>
      </section>}
      {selectedOccurrences.length > 0 && <section className="day-detail-group">
        <h3>Planned commitments</h3>
        <ul className="day-detail-list">
          {selectedOccurrences.map((occurrence) => <li className="day-entry" key={occurrence.id}>
            <Stack gap={0.5} className="day-entry-copy">
              <strong>{occurrence.name}</strong>
              <span>{occurrence.outstandingAmount === 0 ? 'Paid' : `${formatIdr(occurrence.outstandingAmount)} unpaid`}</span>
            </Stack>
            <b>{formatIdr(occurrence.amount)}</b>
          </li>)}
        </ul>
      </section>}
      {selectedTransactions.length === 0 && selectedOccurrences.length === 0 && <EmptyState className="empty-state" title="A clear day" description="No recorded spending or commitments due." />}
      {selectedOccurrences.length > 0 && <p className="day-detail-footnote">Planned totals show only the unpaid remainder.</p>}
      <Link className="text-link" color="inherit" href="/commitments">View all commitments <Icon name="arrow" size={15} /></Link>
    </>
  )


  return (
    <Stack className="calendar-page" gap={5}>
      <PageHeader
        eyebrow="YOUR MONTH, AT A GLANCE"
        title="Calendar"
        description="Review spending and unpaid plans by date."
        actions={
          <Stack direction="horizontal" align="center" gap={1} className="calendar-month-actions">
            <Button label="Previous month" variant="ghost" className="icon-button" type="button" aria-label="Previous month" onClick={() => navigateMonth(-1)} icon={<Icon name="arrow-left" />} isIconOnly />
            <strong aria-live="polite">{monthLabel}</strong>
            <Button label="Next month" variant="ghost" className="icon-button" type="button" aria-label="Next month" onClick={() => navigateMonth(1)} icon={<Icon name="arrow-right" />} isIconOnly />
            <Button label="Today" variant="ghost" className="button button-quiet today-button" type="button" onClick={() => { setMonth(monthStart(today)); setSelectedDate(today) }}>Today</Button>
          </Stack>
        }
      />
      {!inBudgetMonth && <p className="calendar-outside-note"><Icon name="warning" size={17} />This month is outside the saved budget period. No budget totals are included.</p>}
      <Grid columns={{ minWidth: 140, max: 3 }} gap={4} align="center" className="calendar-month-summary" role="group" aria-label="Month totals">
        <Stack gap={0.5} className="calendar-month-metric">
          <span>Actual this month</span>
          <strong>{formatIdr(monthActual)}</strong>
        </Stack>
        <Stack gap={0.5} className="calendar-month-metric">
          <span>Still to pay</span>
          <strong>{formatIdr(monthPlanned)}</strong>
        </Stack>
        <Stack direction="horizontal" align="center" gap={2} className="calendar-month-legend" role="group" aria-label="Calendar key">
          <span><span className="legend-dot actual-dot" aria-hidden="true" />Actual</span>
          <span><span className="legend-dot planned-dot" aria-hidden="true" />Unpaid</span>
        </Stack>
      </Grid>
      <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="start" className="calendar-layout">
        <section className="calendar-panel" aria-label={`${monthLabel} spending calendar`}>
          <Grid columns={7} gap={0} className="calendar-weekdays" aria-hidden="true">
            {weekdays.map((day) => <span key={day}>{day}</span>)}
          </Grid>
          <Grid columns={7} gap={0} columnGap={2} rowGap={2} className="calendar-grid">
            {cells.map((date) => {
              const totals = { actual: actualByDate.get(date) ?? 0, planned: plannedByDate.get(date) ?? 0 }
              const isCurrentMonth = date.startsWith(monthPrefix)
              const inBudget = Boolean(period && date >= period.startDate && date <= period.endDate)
              const isToday = date === today
              const isSelected = date === selectedDate
              const label = `${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}. Actual ${formatIdr(totals.actual)}. Planned ${formatIdr(totals.planned)}.`
              return <Button key={date} label={label} variant="ghost" type="button" className={`calendar-day${!isCurrentMonth ? ' outside-month' : ''}${!inBudget ? ' outside-budget' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`} aria-label={label} aria-pressed={isSelected} onClick={() => handleSelectDate(date)}>
                <span className="calendar-day-number">{parseDateOnly(date).day}</span>
                {inBudget && <span className="calendar-day-totals">{totals.actual > 0 && <span className="calendar-actual">{formatIdr(totals.actual)}</span>}{totals.planned > 0 && <span className="calendar-planned">{formatIdr(totals.planned)} planned</span>}</span>}
              </Button>
            })}
          </Grid>
        </section>
        <aside className="day-detail-panel" aria-label={`Details for ${selectedDateLabel}`}>
          <Stack gap={4}>
            <header className="day-detail-heading">
              <Stack gap={0.5}>
                <p className="eyebrow">SELECTED DAY</p>
                <h2>{selectedDateLabel}</h2>
              </Stack>
              <Button label="Add expense on this date" variant="ghost" className="icon-button" type="button" aria-label="Add expense on this date" isDisabled={!selectedInBudget} onClick={handleAddExpense} icon={<Icon name="plus" size={18} />} isIconOnly />
            </header>
            {renderDayDetails()}
          </Stack>
        </aside>
      </Grid>
      <Dialog
        isOpen={mobileDetailsOpen}
        onOpenChange={setMobileDetailsOpen}
        purpose="info"
        maxHeight="90dvh"
      >
        <DialogHeader
          title={selectedDateLabel}
          subtitle="Actual spending and unpaid commitments for this date."
          onOpenChange={setMobileDetailsOpen}
        />
        <Stack gap={4} className="day-detail-dialog-content">
          <Stack direction="horizontal" justify="end">
            <Button label="Add expense on this date" variant="ghost" className="icon-button" type="button" aria-label="Add expense on this date" isDisabled={!selectedInBudget} onClick={handleAddExpense} icon={<Icon name="plus" size={18} />} isIconOnly />
          </Stack>
          {renderDayDetails()}
        </Stack>
      </Dialog>
      <TransactionForm open={expenseDate !== null} initialDate={expenseDate ?? undefined} onClose={() => setExpenseDate(null)} />
    </Stack>
  )
}
