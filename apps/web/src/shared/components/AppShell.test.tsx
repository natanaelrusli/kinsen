import userEvent from '@testing-library/user-event'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell'
import { SettingsPage } from '../../features/settings/SettingsPage'
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



describe('AppShell appearance settings', () => {
  it('applies saved appearance and layout choices to the workspace', () => {
    useSettingsStore.setState(defaultPreferences)
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Ocean' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Compact layout' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Motion effects' }))

    expect(document.querySelector('.app-frame')).toHaveAttribute('data-theme', 'ocean')
    expect(document.querySelector('.app-frame')).toHaveClass('is-compact', 'is-motion-reduced')
  })
})
