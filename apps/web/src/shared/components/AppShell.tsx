import { AppShell as AstryxAppShell } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette'
import { Divider } from '@astryxdesign/core/Divider'
import { DropdownMenu, DropdownMenuItem } from '@astryxdesign/core/DropdownMenu'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Kbd } from '@astryxdesign/core/Kbd'
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { Stack } from '@astryxdesign/core/Stack'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { createStaticSource } from '@astryxdesign/core/Typeahead'
import { TreeList, type TreeListItemData } from '@astryxdesign/core/TreeList'
import { UserButton, useAuth } from '@clerk/react'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useBudgetStore } from '../state/budget-store'
import { useAssetStore } from '../state/asset-store'
import { formatLongDate, localToday } from '../format/date'
import type { SyncStatus } from '../../infrastructure/repositories/api-budget-repository'
import { setClerkTokenProvider } from '../../infrastructure/api/clerk-token-provider'
import { Icon, type IconName } from './Icon'
import { useSettingsStore } from '../state/settings-store'

type Destination = {
  id: string
  to: string
  label: string
  icon: IconName
  keywords: string[]
}

const destinations: Destination[] = [
  { id: 'overview', to: '/', label: 'Overview', icon: 'overview', keywords: ['home', 'dashboard'] },
  { id: 'calendar', to: '/calendar', label: 'Calendar', icon: 'calendar', keywords: ['schedule', 'month'] },
  { id: 'commitments', to: '/commitments', label: 'Commitments', icon: 'commitments', keywords: ['bills', 'recurring'] },
  { id: 'activity', to: '/activity', label: 'Activity', icon: 'activity', keywords: ['transactions', 'spending'] },
  { id: 'assets', to: '/assets', label: 'Assets', icon: 'assets', keywords: ['accounts', 'net worth'] },
  { id: 'budget', to: '/budget', label: 'Budget settings', icon: 'wallet', keywords: ['budget', 'categories'] },
  { id: 'settings', to: '/settings', label: 'Settings', icon: 'settings', keywords: ['preferences', 'appearance'] },
  { id: 'account', to: '/account', label: 'Account settings', icon: 'settings', keywords: ['profile', 'account'] },
]

const destinationsById = new Map(destinations.map((destination) => [destination.id, destination]))

type RouteCommand = {
  id: string
  label: string
  auxiliaryData: { group: string; to: string; keywords: string[] }
}

const routeCommands: RouteCommand[] = destinations.map(({ id, label, to, keywords }) => ({
  id,
  label,
  auxiliaryData: { group: 'Pages', to, keywords },
}))

const routeCommandSource = createStaticSource(routeCommands, {
  keywords: (command) => command.auxiliaryData.keywords,
})
const routeByCommandId = new Map(routeCommands.map((command) => [command.id, command.auxiliaryData.to]))

type TopMenuItem =
  | { label: string; to: string; shortcut?: string }
  | { label: string; action: 'search'; shortcut?: string }

const topMenus: Array<{ label: string; groups: TopMenuItem[][] }> = [
  {
    label: 'Plan',
    groups: [
      [{ label: 'Overview', to: '/' }, { label: 'Calendar', to: '/calendar' }],
      [{ label: 'Commitments', to: '/commitments' }],
    ],
  },
  {
    label: 'Track',
    groups: [[{ label: 'Activity', to: '/activity' }, { label: 'Assets', to: '/assets' }]],
  },
  {
    label: 'Manage',
    groups: [
      [{ label: 'Budget settings', to: '/budget' }],
      [{ label: 'Settings', to: '/settings' }, { label: 'Account settings', to: '/account' }],
    ],
  },
  {
    label: 'Tools',
    groups: [[{ label: 'Search pages and commands', action: 'search', shortcut: '⌘K' }]],
  },
]

const MENU_WIDTH = 280

function SearchGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  )
}

function syncLabel(status: SyncStatus, online: boolean): string {
  if (status === 'ACCOUNT_MISMATCH') return 'Budget linked to another account'
  if (!online) return status === 'PENDING' ? 'Offline · changes queued on this device' : 'Offline · saved on this device'
  if (status === 'SYNCED') return 'Saved and synced'
  if (status === 'PENDING') return 'Saved here · waiting to sync'
  if (status === 'CONFLICT') return 'Sync paused · local copy kept'
  if (status === 'ERROR') return 'Sync failed · local copy saved'
  return 'Saved on this device'
}

function routeMatches(pathname: string, to: string, end = false): boolean {
  return matchPath({ path: to, end }, pathname) !== null
}

function createRouteTreeItem(destination: Destination, pathname: string): TreeListItemData {
  return {
    id: destination.id,
    label: destination.label,
    href: destination.to,
    startContent: <Icon name={destination.icon} size={18} />,
    isSelected: routeMatches(pathname, destination.to, destination.to === '/'),
  }
}

function createNavigationTree(pathname: string): TreeListItemData[] {
  const item = (id: string) => {
    const destination = destinationsById.get(id)
    if (!destination) throw new Error(`Unknown shell navigation destination: ${id}`)
    return createRouteTreeItem(destination, pathname)
  }

  return [
    item('overview'),
    {
      id: 'planning',
      label: 'Planning',
      startContent: <Icon name="calendar" size={18} />,
      isExpanded: true,
      children: [item('calendar'), item('commitments')],
    },
    item('activity'),
    item('assets'),
    {
      id: 'manage',
      label: 'Manage',
      startContent: <Icon name="settings" size={18} />,
      isExpanded: true,
      children: [item('budget'), item('settings'), item('account')],
    },
  ]
}

export function AppSidebar() {
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const navigationTree = useMemo(
    () => createNavigationTree(location.pathname),
    [location.pathname],
  )

  return (
    <SideNav
      aria-label="Primary navigation"
      className="app-side-nav"
      data-sidebar-collapsed={sidebarCollapsed ? 'true' : 'false'}
      resizable={{
        defaultWidth: 256,
        minWidth: 180,
        maxWidth: 400,
        isCollapsed: sidebarCollapsed,
        onCollapseChange: setSidebarCollapsed,
      }}
      footer={
        <Stack className="app-nav-footer" gap={3}>
          <Stack direction="horizontal" gap={2} className={`local-storage-note${sidebarCollapsed ? ' is-collapsed' : ''}`}>
            <span className="storage-dot" aria-hidden="true" />
            <span className={sidebarCollapsed ? 'sr-only' : undefined}>Saved on this device<br /><small>Syncs when available</small></span>
          </Stack>
        </Stack>
      }>
      {sidebarCollapsed ? (
        <SideNavSection className="app-side-nav-section" title="Your money">
          {destinations.map((destination) => (
            <SideNavItem
              key={destination.id}
              href={destination.to}
              label={destination.label}
              icon={<Icon name={destination.icon} size={19} />}
              isSelected={routeMatches(location.pathname, destination.to, destination.to === '/')}
            />
          ))}
        </SideNavSection>
      ) : (
        <TreeList
          items={navigationTree}
          density="compact"
          header={<span className="app-nav-section-label">Your money</span>}
        />
      )}
    </SideNav>
  )
}

export function AppShellChrome({
  themeColor,
  layoutDensity,
  playfulMotion,
  online,
  syncStatus,
  error,
  onRetry,
  accountControl,
  children,
}: {
  themeColor: string
  layoutDensity: string
  playfulMotion: boolean
  online: boolean
  syncStatus: SyncStatus
  error: string | null
  onRetry: () => void
  accountControl: ReactNode
  children: ReactNode
}) {
  const navigate = useNavigate()
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const today = localToday()
  const openCommandPalette = () => setIsPaletteOpen(true)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <>
      <AstryxAppShell
        className={`app-frame${layoutDensity === 'compact' ? ' is-compact' : ''}${playfulMotion ? '' : ' is-motion-reduced'}`}
        data-theme={themeColor}
        height="fill"
        variant="elevated"
        contentPadding={0}
        banner={error && <Stack direction="horizontal" gap={3} className="global-error" role="alert"><Icon name="warning" size={18} /><span>{error}</span><Button label="Retry" variant="secondary" type="button" onClick={onRetry} /></Stack>}
        topNav={
          <TopNav
            label="Application menu bar"
            className="app-top-nav"
            heading={<TopNavHeading heading="kinsen." headingHref="/" logo={<span className="brand-mark" aria-hidden="true"><span>K</span><i /></span>} />}
            startContent={
              <Stack direction="horizontal" gap={1} className="app-top-menus">
                {topMenus.map((menu) => (
                  <DropdownMenu
                    key={menu.label}
                    button={{ label: menu.label, variant: 'ghost', size: 'sm' }}
                    hasChevron={false}
                    menuWidth={MENU_WIDTH}>
                    {menu.groups.map((group, groupIndex) => (
                      <Fragment key={`${menu.label}-${groupIndex}`}>
                        {groupIndex > 0 && <Divider />}
                        {group.map((item) => (
                          <DropdownMenuItem
                            key={item.label}
                            label={item.label}
                            onClick={() => ('to' in item ? navigate(item.to) : openCommandPalette())}
                            endContent={item.shortcut ? <Kbd keys={item.shortcut} /> : undefined}
                          />
                        ))}
                      </Fragment>
                    ))}
                  </DropdownMenu>
                ))}
              </Stack>
            }
            endContent={
              <Stack direction="horizontal" gap={2} vAlign="center" className="app-topbar-controls">
                <time className="topbar-date" dateTime={today} aria-label={formatLongDate(today)} title={formatLongDate(today)}>
                  <span className="date-indicator" aria-hidden="true" />
                  <span className="topbar-date-copy">{formatLongDate(today)}</span>
                </time>
                <Stack direction="horizontal" gap={2} vAlign="center" className="topbar-status" role="status" aria-live="polite">
                  <span className={`connection-dot${!online || syncStatus === 'CONFLICT' || syncStatus === 'ERROR' || syncStatus === 'ACCOUNT_MISMATCH' ? ' is-offline' : syncStatus === 'PENDING' ? ' is-pending' : ''}`} aria-hidden="true" />
                  <span className="topbar-status-copy">{syncLabel(syncStatus, online)}</span>
                </Stack>
                <Stack direction="horizontal" vAlign="center" className="app-command-search">
                  <Button
                    className="app-command-search-desktop"
                    label="Search pages and commands"
                    size="sm"
                    variant="ghost"
                    width={256}
                    icon={<SearchGlyph size={17} />}
                    onClick={openCommandPalette}>
                    Search pages and commands…
                  </Button>
                  <IconButton
                    className="app-command-search-mobile"
                    label="Search pages and commands"
                    tooltip="Search pages and commands"
                    variant="ghost"
                    icon={<SearchGlyph />}
                    onClick={openCommandPalette}
                  />
                </Stack>
                <Stack direction="horizontal" vAlign="center" className="topbar-account">{accountControl}</Stack>
              </Stack>
            }
          />
        }
        sideNav={<AppSidebar />}>
        {children}
      </AstryxAppShell>
      <CommandPalette
        isOpen={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        input={
          <CommandPaletteInput
            endContent={
              <IconButton
                className="command-palette-close"
                label="Close search"
                tooltip="Close search"
                variant="ghost"
                icon={<Icon name="close" size={18} />}
                onClick={() => setIsPaletteOpen(false)}
              />
            }
          />
        }
        searchSource={routeCommandSource}
        label="Search pages and commands"
        onValueChange={(commandId) => {
          const destination = routeByCommandId.get(commandId)
          if (destination) navigate(destination)
        }}
      />
    </>
  )
}

export function AppShell() {
  const initialize = useBudgetStore((state) => state.initialize)
  const initializeAssets = useAssetStore((state) => state.initialize)
  const error = useBudgetStore((state) => state.error)
  const syncStatus = useBudgetStore((state) => state.syncStatus)
  const { getToken } = useAuth()
  const [online, setOnline] = useState(() => navigator.onLine)
  const themeColor = useSettingsStore((state) => state.themeColor)
  const layoutDensity = useSettingsStore((state) => state.layoutDensity)
  const playfulMotion = useSettingsStore((state) => state.playfulMotion)

  useEffect(() => {
    setClerkTokenProvider(getToken)
    void (async () => {
      await initialize()
      await initializeAssets()
    })()
    const setConnection = () => setOnline(navigator.onLine)
    window.addEventListener('online', setConnection)
    window.addEventListener('offline', setConnection)
    return () => {
      setClerkTokenProvider(null)
      window.removeEventListener('online', setConnection)
      window.removeEventListener('offline', setConnection)
    }
  }, [getToken, initialize, initializeAssets])

  return (
    <AppShellChrome
      themeColor={themeColor}
      layoutDensity={layoutDensity}
      playfulMotion={playfulMotion}
      online={online}
      syncStatus={syncStatus}
      error={error}
      onRetry={() => void initialize()}
      accountControl={<UserButton />}>
      <Stack className="page-content"><Outlet /></Stack>
    </AppShellChrome>
  )
}
