import userEvent from '@testing-library/user-event'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Link as RouterLink, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { defaultPreferences, useSettingsStore } from '../state/settings-store'

const { getToken, initializeAssets, initializeBudget } = vi.hoisted(() => ({
  getToken: vi.fn().mockResolvedValue(null),
  initializeAssets: vi.fn().mockResolvedValue(undefined),
  initializeBudget: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@clerk/react', () => ({
  UserButton: () => null,
  useAuth: () => ({ getToken }),
}))

vi.mock('../state/budget-store', () => ({
  useBudgetStore: (selector: (state: { initialize: typeof initializeBudget; error: null; syncStatus: 'LOCAL' }) => unknown) =>
    selector({ initialize: initializeBudget, error: null, syncStatus: 'LOCAL' }),
}))

vi.mock('../state/asset-store', () => ({
  useAssetStore: (selector: (state: { initialize: typeof initializeAssets }) => unknown) =>
    selector({ initialize: initializeAssets }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useSettingsStore.setState(defaultPreferences)
})

describe('AppShell navigation', () => {
  it('marks the active destination and preserves access while the sidebar collapses', () => {
    render(
      <MemoryRouter initialEntries={['/assets']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="assets" element={<h1>Assets page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const navigation = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Assets page' }))
    expect(navigation.querySelector('li[role="treeitem"][aria-selected="true"]')).toHaveAttribute('data-tree-id', 'assets')

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' }).querySelector('[aria-current="page"]')).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(screen.getByRole('navigation', { name: 'Primary navigation' }).querySelector('li[role="treeitem"][aria-selected="true"]')).toHaveAttribute('data-tree-id', 'assets')
  })

  it('navigates to secondary destinations and closes More without losing the current location', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/assets/example']}>
        <LinkProvider component={RouterLink}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="assets/:assetId" element={<h1>Asset detail</h1>} />
              <Route path="settings" element={<h1>Preferences</h1>} />
            </Route>
          </Routes>
        </LinkProvider>
      </MemoryRouter>,
    )

    const navigation = within(screen.getByRole('navigation', { name: 'Mobile navigation' }))
    expect(navigation.getByRole('link', { name: 'Assets' })).toHaveAttribute('aria-current', 'page')
    const more = navigation.getByRole('button', { name: 'More' })
    await user.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    await user.click(navigation.getByRole('link', { name: 'Settings' }))

    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument()
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(more).toHaveAttribute('data-active', 'true')
    expect(navigation.getByRole('link', { name: 'Assets' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('main')).toHaveFocus()

    await user.click(more)
    expect(navigation.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    await user.keyboard('{Escape}')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(more).toHaveFocus()
  })
  it('offers the PLN tracker in More and marks its status as local-only', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/assets']}>
        <LinkProvider component={RouterLink}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="assets" element={<h1>Assets page</h1>} />
              <Route path="electricity" element={<h1>PLN Token Tracker page</h1>} />
            </Route>
          </Routes>
        </LinkProvider>
      </MemoryRouter>,
    )

    const navigation = within(screen.getByRole('navigation', { name: 'Mobile navigation' }))
    const more = navigation.getByRole('button', { name: 'More' })
    await user.click(more)
    const tracker = navigation.getByRole('link', { name: 'PLN Token Tracker' })
    expect(tracker).toHaveAttribute('href', '/electricity')
    await user.click(tracker)

    expect(screen.getByRole('heading', { name: 'PLN Token Tracker page' })).toBeInTheDocument()
    expect(document.querySelector('.topbar-status')).toHaveTextContent('Local only')
    expect(more).toHaveAttribute('data-active', 'true')
  })
})

describe('AppShell command search', () => {
  it('closes the palette after restoring focus to its trigger', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/assets']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="assets" element={<h1>Assets page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const searchTrigger = document.querySelector<HTMLButtonElement>('.app-command-search-desktop')
    if (!searchTrigger) throw new Error('Desktop search trigger is missing')
    expect(searchTrigger).toHaveAccessibleName('Search pages and commands')
    await user.click(searchTrigger)
    expect(screen.getByRole('dialog', { name: 'Search pages and commands' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'Search pages and commands' })).not.toBeInTheDocument()
    expect(searchTrigger).toHaveFocus()

    await user.keyboard('{Enter}')
    expect(screen.getByRole('dialog', { name: 'Search pages and commands' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.queryByRole('dialog', { name: 'Search pages and commands' })).not.toBeInTheDocument()
    expect(searchTrigger).toHaveFocus()
  })
})

