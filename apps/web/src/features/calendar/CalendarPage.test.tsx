import { cleanup, render, screen } from '@testing-library/react'
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

describe('CalendarPage week start preference', () => {
  beforeEach(() => {
    useSettingsStore.setState(defaultPreferences)
    useBudgetStore.setState({ status: 'ready', snapshot: emptySnapshot, overview: emptyOverview })
  })

  afterEach(() => {
    cleanup()
    useSettingsStore.setState(defaultPreferences)
    useBudgetStore.setState({ status: 'loading', snapshot: null, overview: null })
  })

  it('starts its calendar grid and weekday labels on the saved preference', () => {
    useSettingsStore.getState().setWeekStartsOn('monday')
    render(<MemoryRouter><CalendarPage /></MemoryRouter>)

    expect(document.querySelector('.calendar-weekdays')?.textContent).toBe('MonTueWedThuFriSatSun')
    expect(firstDayButton()).toHaveAccessibleName(/^Monday,/)
  })
})
