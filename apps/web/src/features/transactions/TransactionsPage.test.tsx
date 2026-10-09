import userEvent from '@testing-library/user-event'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { LinkProvider } from '@astryxdesign/core/Link'
import { calculateOverview, createSampleSnapshot, type DateOnly } from '@kinsen/budget-domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserRouter, Link as RouterLink, Outlet, Route, Routes } from 'react-router-dom'
import { AppShellChrome } from '../../shared/components/AppShell'
import { useBudgetStore } from '../../shared/state/budget-store'
import { TransactionsPage } from './TransactionsPage'

vi.mock('./TransactionForm', () => ({ TransactionForm: () => null }))

const today = '2026-10-08' as DateOnly

function ActivityRoutes() {
  return (
    <Routes>
      <Route element={<AppShellChrome layoutDensity="comfortable" playfulMotion online syncStatus="LOCAL" error={null} onRetry={() => undefined} accountControl={null}><Outlet /></AppShellChrome>}>
        <Route path="/" element={<h1>Overview page</h1>} />
        <Route path="/activity" element={<TransactionsPage />} />
      </Route>
    </Routes>
  )
}

beforeEach(() => {
  const snapshot = createSampleSnapshot(today)
  useBudgetStore.setState({ status: 'ready', snapshot, overview: calculateOverview(snapshot, today) })
  window.history.replaceState(null, '', '/activity?q=Weekly')
})

afterEach(() => {
  cleanup()
  useBudgetStore.setState(useBudgetStore.getInitialState(), true)
  window.history.replaceState(null, '', '/')
})

describe('Activity search and return navigation', () => {
  it('reads a deep-linked query and restores its filtered results and scroll on Back/Forward', async () => {
    const user = userEvent.setup()
    render(
      <BrowserRouter>
        <LinkProvider component={RouterLink}>
          <ActivityRoutes />
        </LinkProvider>
      </BrowserRouter>,
    )

    const search = screen.getByRole('textbox', { name: 'Search activity' })
    expect(search).toHaveValue('Weekly')
    expect(screen.getByText('Weekly groceries')).toBeInTheDocument()
    expect(screen.queryByText('Transit top-up')).not.toBeInTheDocument()

    const main = screen.getByRole('main')
    act(() => {
      main.scrollTop = 432
      fireEvent.scroll(main)
    })
    await user.clear(search)
    await user.type(search, 'Transit')
    await waitFor(() => expect(window.location.search).toBe('?q=Transit'))
    expect(screen.getByText('Transit top-up')).toBeInTheDocument()
    expect(screen.queryByText('Weekly groceries')).not.toBeInTheDocument()

    const primaryNavigation = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    await user.click(primaryNavigation.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('heading', { name: 'Overview page' })
    expect(main.scrollTop).toBe(0)

    act(() => window.history.back())
    await screen.findByRole('heading', { name: 'Activity' })
    await waitFor(() => expect(main.scrollTop).toBe(432))
    expect(main).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Search activity' })).toHaveValue('Transit')
    expect(screen.getByText('Transit top-up')).toBeInTheDocument()
    expect(screen.queryByText('Weekly groceries')).not.toBeInTheDocument()

    act(() => window.history.forward())
    await screen.findByRole('heading', { name: 'Overview page' })
    expect(main.scrollTop).toBe(0)

    act(() => window.history.back())
    await screen.findByRole('heading', { name: 'Activity' })
    await waitFor(() => expect(main.scrollTop).toBe(432))
    expect(screen.getByRole('textbox', { name: 'Search activity' })).toHaveValue('Transit')
    await user.click(primaryNavigation.getByRole('link', { name: 'Overview' }))
    await screen.findByRole('heading', { name: 'Overview page' })
    await user.click(primaryNavigation.getByRole('link', { name: 'Activity' }))
    await screen.findByRole('heading', { name: 'Activity' })
    expect(window.location.search).toBe('')
    expect(screen.getByRole('textbox', { name: 'Search activity' })).toHaveValue('')
    expect(main.scrollTop).toBe(0)
    expect(screen.getByText('Weekly groceries')).toBeInTheDocument()
    expect(screen.getByText('Transit top-up')).toBeInTheDocument()

    act(() => window.history.back())
    await screen.findByRole('heading', { name: 'Overview page' })
    act(() => window.history.forward())
    await screen.findByRole('heading', { name: 'Activity' })
    expect(window.location.search).toBe('')
    expect(screen.getByRole('textbox', { name: 'Search activity' })).toHaveValue('')
    expect(main.scrollTop).toBe(0)
  })

  it('rebuilds the filtered Activity view from the URL after a fresh mount', async () => {
    const user = userEvent.setup()
    const firstMount = render(
      <BrowserRouter>
        <LinkProvider component={RouterLink}>
          <ActivityRoutes />
        </LinkProvider>
      </BrowserRouter>,
    )
    const search = screen.getByRole('textbox', { name: 'Search activity' })
    await user.clear(search)
    await user.type(search, 'Transit')
    await waitFor(() => expect(window.location.search).toBe('?q=Transit'))

    firstMount.unmount()
    render(
      <BrowserRouter>
        <LinkProvider component={RouterLink}>
          <ActivityRoutes />
        </LinkProvider>
      </BrowserRouter>,
    )

    expect(screen.getByRole('textbox', { name: 'Search activity' })).toHaveValue('Transit')
    expect(screen.getByText('Transit top-up')).toBeInTheDocument()
    expect(screen.queryByText('Weekly groceries')).not.toBeInTheDocument()
  })
  it('paginates all matching Activity records in the existing newest-first order', async () => {
    const user = userEvent.setup()
    const base = createSampleSnapshot(today)
    const transactions = Array.from({ length: 101 }, (_, index) => {
      const suffix = String(index).padStart(3, '0')
      return {
        id: `history-${suffix}`,
        description: `Fixture record ${suffix}`,
        categoryId: base.categories[0]!.id,
        amount: 100,
        date: today,
      }
    })
    const snapshot = { ...base, transactions }
    useBudgetStore.setState({ status: 'ready', snapshot, overview: calculateOverview(snapshot, today) })
    window.history.replaceState(null, '', '/activity')

    render(
      <BrowserRouter>
        <LinkProvider component={RouterLink}>
          <ActivityRoutes />
        </LinkProvider>
      </BrowserRouter>,
    )

    expect(screen.getByText('Fixture record 100')).toBeInTheDocument()
    expect(screen.queryByText('Fixture record 050')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1–50 of 101')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next records' }))
    expect(screen.getByText('Fixture record 050')).toBeInTheDocument()
    expect(screen.queryByText('Fixture record 000')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next records' }))
    expect(screen.getByText('Fixture record 000')).toBeInTheDocument()
    expect(screen.getByText('Showing 101–101 of 101')).toBeInTheDocument()
  })
})
