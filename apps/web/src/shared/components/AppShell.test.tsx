import userEvent from '@testing-library/user-event'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Link as RouterLink, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
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
  window.localStorage.clear()
})

describe('AppShell navigation', () => {
  it('marks the settings route as managing its own scroll columns', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="settings" element={<h1>Settings page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    // Settings needs two independently scrolling columns, so the page wrapper must fill the scrollport.
    expect(document.querySelector('.page-content')).toHaveAttribute('data-scroll-panels', 'true')
    unmount()

    render(
      <MemoryRouter initialEntries={['/assets']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="assets" element={<h1>Assets page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    // Other pages scroll as one document, so they must not opt into panel scrolling.
    expect(document.querySelector('.page-content')).not.toHaveAttribute('data-scroll-panels')
  })

  it('keeps a collapsed section rail beside a second pane that follows the route', () => {
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
    const sidebar = screen.getByRole('complementary', { name: 'Workspace navigation' })
    expect(sidebar).toContainElement(navigation)
    expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Assets page' }))
    expect(screen.queryByRole('region', { name: 'Budget workspace' })).not.toBeInTheDocument()

    // The rail is always collapsed: one button per section, never a destination list.
    const rail = within(screen.getByRole('navigation', { name: 'Sections' }))
    expect(rail.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Overview',
      'Portfolio',
      'Manage',
    ])

    // The route owns the pane, and its rows stay flat siblings within one section.
    const pane = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    expect(rail.getByRole('button', { name: 'Portfolio' })).toHaveAttribute('data-active', 'true')
    expect(pane.getByRole('link', { name: 'Assets' })).toHaveAttribute('aria-current', 'page')
    expect(pane.getAllByRole('link').map((link) => link.textContent)).toEqual(['Assets', 'PLN Token Tracker'])
    expect(screen.queryByRole('treeitem')).not.toBeInTheDocument()

    // A rail click moves the pane without navigating away from the current page.
    fireEvent.click(rail.getByRole('button', { name: 'Overview' }))
    expect(screen.getByRole('heading', { name: 'Assets page' })).toBeInTheDocument()
    expect(pane.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Overview',
      'Calendar',
      'Commitments',
      'Activity',
    ])
    expect(rail.getByRole('button', { name: 'Overview' })).toHaveAttribute('data-active', 'true')
  })

  it('collapses the second pane to an icon rail and expands it again', () => {
    render(
      <MemoryRouter initialEntries={['/assets']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="assets" element={<h1>Assets page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    // Collapsing remounts the SideNav root, so re-query rather than reuse the node.
    const paneNav = () => screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(paneNav()).toHaveAttribute('data-sidebar-collapsed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(paneNav()).toHaveAttribute('data-sidebar-collapsed', 'true')

    // Collapsing narrows the pane, not the rail, and destinations stay reachable by icon.
    const rail = within(screen.getByRole('navigation', { name: 'Sections' }))
    expect(rail.getByRole('button', { name: 'Portfolio' })).toHaveAttribute('data-active', 'true')
    expect(within(paneNav()).getByRole('link', { name: 'Assets' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(paneNav()).toHaveAttribute('data-sidebar-collapsed', 'false')
  })

  it('reopens the second pane collapsed from the previous session', () => {
    window.localStorage.setItem('kinsen-shell-nav-pane-collapsed', 'true')
    render(
      <MemoryRouter initialEntries={['/assets']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="assets" element={<h1>Assets page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toHaveAttribute('data-sidebar-collapsed', 'true')
  })

  it('re-derives the pane from the route after a rail click left another section open', () => {
    // Stands in for any in-app navigation to /activity (command palette, a link, a form).
    function OverviewPage() {
      const navigate = useNavigate()
      return (
        <>
          <h1>Overview page</h1>
          <button type="button" onClick={() => navigate('/activity')}>Jump to activity</button>
        </>
      )
    }

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="activity" element={<h1>Activity page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    const rail = within(screen.getByRole('navigation', { name: 'Sections' }))
    expect(rail.getByRole('button', { name: 'Overview' })).toHaveAttribute('data-active', 'true')

    fireEvent.click(rail.getByRole('button', { name: 'Manage' }))
    const pane = within(screen.getByRole('navigation', { name: 'Primary navigation' }))
    expect(pane.getAllByRole('link').map((link) => link.textContent)).toEqual(['Settings'])
    expect(screen.getByRole('heading', { name: 'Overview page' })).toBeInTheDocument()

    // A route that maps to Overview pulls the pane back from the manual Manage choice.
    fireEvent.click(screen.getByRole('button', { name: 'Jump to activity' }))
    expect(screen.getByRole('heading', { name: 'Activity page' })).toBeInTheDocument()
    expect(rail.getByRole('button', { name: 'Overview' })).toHaveAttribute('data-active', 'true')
    expect(pane.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Overview',
      'Calendar',
      'Commitments',
      'Activity',
    ])
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
  function openSearchTrigger() {
    const trigger = document.querySelector<HTMLButtonElement>('.app-command-search-desktop')
    if (!trigger) throw new Error('Desktop search trigger is missing')
    return trigger
  }

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

  it('groups results by sidebar section and marks the page the user is on', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="settings" element={<h1>Settings page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    await user.click(openSearchTrigger())
    const dialog = screen.getByRole('dialog', { name: 'Search pages and commands' })

    const headings = Array.from(dialog.querySelectorAll('.astryx-command-palette-group-heading'), (heading) => heading.textContent)
    expect(headings).toEqual(['Overview', 'Portfolio', 'Manage', 'Other pages'])
    expect(within(dialog).getByRole('option', { name: /^Settings/ })).toHaveTextContent('Current page')
    expect(within(dialog).getByRole('option', { name: /^Assets/ })).not.toHaveTextContent('Current page')
  })

  it('explains an empty result set and names the search field', async () => {
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

    await user.click(openSearchTrigger())
    const dialog = screen.getByRole('dialog', { name: 'Search pages and commands' })
    await user.type(within(dialog).getByPlaceholderText('Search pages…'), 'zzz')

    expect(within(dialog).getByText('No matching pages')).toBeInTheDocument()
    expect(within(dialog).queryByRole('option')).not.toBeInTheDocument()
  })
})

