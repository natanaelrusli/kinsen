import { AppShell as AstryxAppShell } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette'
import { DropdownMenu, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@astryxdesign/core/DropdownMenu'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Kbd } from '@astryxdesign/core/Kbd'
import { Link } from '@astryxdesign/core/Link'
import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import { Stack } from '@astryxdesign/core/Stack'
import { StatusDot } from '@astryxdesign/core/StatusDot'
import { Text } from '@astryxdesign/core/Text'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { createStaticSource } from '@astryxdesign/core/Typeahead'
import { TreeList, type TreeListItemData } from '@astryxdesign/core/TreeList'
import { UserButton, useAuth } from '@clerk/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { matchPath, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useBudgetStore } from '../state/budget-store'
import { useAssetStore } from '../state/asset-store'
import type { SyncStatus } from '../../infrastructure/repositories/api-budget-repository'
import { budgetRepository } from '../../infrastructure/repositories/api-budget-repository'
import { setClerkTokenProvider } from '../../infrastructure/api/clerk-token-provider'
import { Icon, type IconName } from './Icon'
import { colorModeOptions, useSettingsStore, type ColorMode } from '../state/settings-store'

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

function SearchGlyph() {
  return <Icon name="search" style={{ width: 'var(--spacing-4)', height: 'var(--spacing-4)' }} />
}

function AppearanceGlyph() {
  return <Icon name="appearance" style={{ width: 'var(--spacing-5)', height: 'var(--spacing-5)' }} />
}

function syncSummary(status: SyncStatus, online: boolean): string {
  if (status === 'ACCOUNT_MISMATCH') return 'Account mismatch'
  if (!online) return 'Offline'
  if (status === 'SYNCING') return 'Syncing'
  if (status === 'PENDING') return 'Sync pending'
  if (status === 'CONFLICT') return 'Sync paused'
  if (status === 'ERROR') return 'Sync failed'
  return status === 'SYNCED' ? 'Synced' : 'Saved locally'
}

function syncLabel(status: SyncStatus, online: boolean): string {
  if (status === 'ACCOUNT_MISMATCH') return 'Budget linked to another account'
  if (!online) return status === 'PENDING' ? 'Offline · changes queued on this device' : 'Offline · saved on this device'
  if (status === 'SYNCING') return 'Checking for updates'
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

const mobilePrimaryIds: Record<string, true | undefined> = { overview: true, calendar: true, activity: true, assets: true }
const mobilePrimaryDestinations = destinations.filter((destination) => mobilePrimaryIds[destination.id])
const mobileSecondaryDestinations = destinations.filter((destination) => !mobilePrimaryIds[destination.id])

function MobileNavigation() {
  const { pathname } = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const navigationRef = useRef<HTMLElement>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const secondaryActive = mobileSecondaryDestinations.some((destination) => routeMatches(pathname, destination.to))

  useEffect(() => {
    setMoreOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!moreOpen) return
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) setMoreOpen(false)
    }
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMoreOpen(false)
      moreButtonRef.current?.focus()
    }
    const widerScreen = window.matchMedia('(min-width: 1024px)')
    const dismissOnResize = () => {
      if (widerScreen.matches) setMoreOpen(false)
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('keydown', dismissOnEscape)
    widerScreen.addEventListener('change', dismissOnResize)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('keydown', dismissOnEscape)
      widerScreen.removeEventListener('change', dismissOnResize)
    }
  }, [moreOpen])

  return (
    <Stack as="nav" ref={navigationRef} className="mobile-navigation" aria-label="Mobile navigation" gap={0}>
      {moreOpen && (
        <Stack as="section" id="mobile-more-navigation" className="mobile-more-navigation" gap={2} aria-label="More destinations">
          {mobileSecondaryDestinations.map((destination) => (
            <Link
              key={destination.id}
              href={destination.to}
              className="mobile-more-link"
              aria-current={routeMatches(pathname, destination.to) ? 'page' : undefined}>
              <Icon name={destination.icon} aria-hidden="true" />
              <Text>{destination.label}</Text>
            </Link>
          ))}
        </Stack>
      )}
      <Stack direction="horizontal" className="mobile-navigation-bar" gap={2}>
        {mobilePrimaryDestinations.map((destination) => (
          <Link
            key={destination.id}
            href={destination.to}
            className="mobile-navigation-item"
            aria-current={routeMatches(pathname, destination.to, destination.to === '/') ? 'page' : undefined}>
            <Icon name={destination.icon} aria-hidden="true" />
            <Text type="supporting">{destination.label}</Text>
          </Link>
        ))}
        <Button
          ref={moreButtonRef}
          label="More"
          variant="ghost"
          className="mobile-navigation-item mobile-navigation-more"
          icon={<Icon name="more" aria-hidden="true" />}
          aria-expanded={moreOpen}
          aria-controls={moreOpen ? 'mobile-more-navigation' : undefined}
          data-active={secondaryActive ? 'true' : undefined}
          onClick={() => setMoreOpen((open) => !open)}>
          More
        </Button>
      </Stack>
    </Stack>
  )
}

export function AppShellChrome({
  layoutDensity,
  playfulMotion,
  online,
  syncStatus,
  error,
  onRetry,
  accountControl,
  children,
}: {
  layoutDensity: string
  playfulMotion: boolean
  online: boolean
  syncStatus: SyncStatus
  error: string | null
  onRetry: () => void
  accountControl: ReactNode
  children: ReactNode
}) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const navigationType = useNavigationType()
  const colorMode = useSettingsStore((state) => state.colorMode)
  const setColorMode = useSettingsStore((state) => state.setColorMode)
  const currentPage = destinations.find((destination) => routeMatches(pathname, destination.to, destination.to === '/'))?.label
  const hasSyncProblem = syncStatus === 'CONFLICT' || syncStatus === 'ERROR' || syncStatus === 'ACCOUNT_MISMATCH'
  const previousPathname = useRef(pathname)

  useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    const main = document.querySelector<HTMLElement>('.app-frame [role="main"]')
    if (!main) return
    if (pathname !== '/activity' || navigationType !== 'POP') main.scrollTop = 0
    main.focus({ preventScroll: true })
  }, [pathname, navigationType])
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
      <Stack as="section" className="app-workspace" gap={0}>
      <AstryxAppShell
        className={`app-frame${layoutDensity === 'compact' ? ' is-compact' : ''}${playfulMotion ? '' : ' is-motion-reduced'}`}
        height="fill"
        variant="elevated"
        contentPadding={0}
        mobileNav={{ hasToggle: false, breakpoint: 'lg' }}
        banner={error && <Stack direction="horizontal" gap={3} className="global-error" role="alert"><Icon name="warning" size={18} /><span>{error}</span><Button label="Retry" variant="secondary" type="button" onClick={onRetry} /></Stack>}
        topNav={
          <TopNav
            label="Application top bar"
            className="app-top-nav"
            heading={<TopNavHeading heading="kinsen." headingHref="/" logo={<span className="brand-mark" aria-hidden="true"><span>K</span><i /></span>} />}
            startContent={<Text type="label" className="topbar-page-title">{currentPage}</Text>}
            endContent={
              <Stack direction="horizontal" gap={2} vAlign="center" className="app-topbar-controls">
                <Stack direction="horizontal" gap={2} vAlign="center" className="topbar-status" role="status" aria-live="polite">
                  <StatusDot label={syncLabel(syncStatus, online)} variant={hasSyncProblem ? 'error' : !online || syncStatus === 'PENDING' || syncStatus === 'SYNCING' ? 'warning' : 'success'} />
                  <Text type="supporting" className="topbar-status-copy" aria-hidden="true">{syncSummary(syncStatus, online)}</Text>
                </Stack>
                <Stack direction="horizontal" vAlign="center" className="app-command-search">
                  <Button
                    className="app-command-search-desktop"
                    label="Search pages and commands"
                    size="sm"
                    variant="ghost"
                    icon={<SearchGlyph />}
                    endContent={<Kbd keys="mod+k" />}
                    onClick={openCommandPalette}>
                    Search
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
                <DropdownMenu
                  button={{ label: 'Appearance', tooltip: `Appearance: ${colorMode}`, variant: 'ghost', size: 'md', isIconOnly: true, icon: <AppearanceGlyph />, className: 'topbar-appearance' }}
                  hasChevron={false}
                  menuWidth="max-content"
                  alignment="end">
                  <DropdownMenuRadioGroup label="Color mode" value={colorMode} onChange={(value) => setColorMode(value as ColorMode)}>
                    {colorModeOptions.map((option) => <DropdownMenuRadioItem key={option.value} value={option.value} label={option.label} />)}
                  </DropdownMenuRadioGroup>
                </DropdownMenu>
                <Stack direction="horizontal" vAlign="center" className="topbar-account">{accountControl}</Stack>
              </Stack>
            }
          />
        }
        sideNav={<AppSidebar />}>
        {children}
      </AstryxAppShell>
        <MobileNavigation />
      </Stack>
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
  useEffect(() => budgetRepository.subscribeAccountDataChanges(() => {
    void useBudgetStore.getState().refresh().catch(() => undefined)
    void useAssetStore.getState().refresh().catch(() => undefined)
  }), [])

  return (
    <AppShellChrome
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
