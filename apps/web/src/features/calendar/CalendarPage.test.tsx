import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarPage } from './CalendarPage'
import { defaultPreferences, useSettingsStore } from '../../shared/state/settings-store'
import { useBudgetStore } from '../../shared/state/budget-store'

vi.mock('../transactions/TransactionForm', () => ({ TransactionForm: () => null }))

const emptySnapshot = { period: null, transactions: [], categories: [] } as never
const emptyOverview = { occurrences: [], today: '2026-10-06' } as never

function firstDayButton() {
  return screen.getAllByRole('button').find((button) => button.classList.contains('calendar-day'))
}

describe('CalendarPage', () => {
  beforeEach(() => {
    useSettingsStore.setState(defaultPreferences)
    useBudgetStore.setState({ status: 'ready', snapshot: emptySnapshot, overview: emptyOverview })
  })

  afterEach(() => {
    cleanup()
    useSettingsStore.setState(defaultPreferences)
    vi.useRealTimers()
    vi.unstubAllGlobals()
    useBudgetStore.setState({ status: 'loading', snapshot: null, overview: null })
  })

  it('starts its calendar grid and weekday labels on the saved preference', () => {
    useSettingsStore.getState().setWeekStartsOn('monday')
    render(<MemoryRouter><CalendarPage /></MemoryRouter>)

    expect(document.querySelector('.calendar-weekdays')?.textContent).toBe('MonTueWedThuFriSatSun')
    expect(firstDayButton()).toHaveAccessibleName(/^Monday,/)
  })

  it('moves the selected date with the month and clamps it to the destination month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 31, 12))
    useBudgetStore.setState({
      status: 'ready',
      snapshot: emptySnapshot,
      overview: { occurrences: [], today: '2026-01-31' } as never,
    })
    render(<MemoryRouter><CalendarPage /></MemoryRouter>)

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))

    const grid = document.querySelector<HTMLElement>('.calendar-grid')
    const selectedDay = within(grid!).getByRole('button', { name: /^Saturday, 28 February\./ })
    expect(selectedDay).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Saturday, 28 February')
  })

  it('keeps the mobile calendar grid and opens selected-day details in a dialog', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 6, 12))
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(max-width: 640px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
    useBudgetStore.setState({
      status: 'ready',
      snapshot: {
        period: { startDate: '2026-10-01', endDate: '2026-10-31' },
        transactions: [{ id: 'tx-1', date: '2026-10-08', description: 'Market purchase', categoryId: 'food', amount: 25_000 }],
        categories: [{ id: 'food', name: 'Food' }],
      } as never,
      overview: { occurrences: [], today: '2026-10-06' } as never,
    })
    render(<MemoryRouter><CalendarPage /></MemoryRouter>)

    const grid = document.querySelector<HTMLElement>('.calendar-grid')
    expect(grid).toBeInTheDocument()
    expect(document.querySelector('.calendar-agenda')).not.toBeInTheDocument()
    const selectedDay = within(grid!).getByRole('button', { name: /^Thursday, 8 October/ })
    fireEvent.click(selectedDay)

    const dialog = screen.getByRole('dialog', { name: /Thursday, 8 October/ })
    expect(within(dialog).getByText('Market purchase')).toBeInTheDocument()
    expect(within(dialog).getByText('Food')).toBeInTheDocument()
    expect(selectedDay).toHaveAttribute('aria-pressed', 'true')
  })
})
