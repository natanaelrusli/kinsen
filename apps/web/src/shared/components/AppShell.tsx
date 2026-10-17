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
import { UserButton, useAuth } from '@clerk/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { matchPath, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useBudgetStore } from '../state/budget-store'
import { useAssetStore } from '../state/asset-store'
import type { SyncStatus } from '../../infrastructure/repositories/api-budget-repository'
import { budgetRepository } from '../../infrastructure/repositories/api-budget-repository'
import { setClerkTokenProvider } from '../../infrastructure/api/clerk-token-provider'
import { Icon, type IconName } from './Icon'
import { Celebration } from './Celebration'
import { SyncConflictBanner } from './SyncConflictBanner'
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
  { id: 'electricity', to: '/electricity', label: 'PLN Token Tracker', icon: 'electricity', keywords: ['pln', 'token', 'electricity', 'meter', 'kwh'] },
  { id: 'budget', to: '/budget', label: 'Budget settings', icon: 'wallet', keywords: ['budget', 'categories']},
  { id: 'settings', to: '/settings', label: 'Settings', icon: 'settings', keywords: ['preferences', 'appearance'] },
  { id: 'account', to: '/account', label: 'Account settings', icon: 'wallet', keywords: ['profile', 'account'] },
]

const destinationsById = new Map(destinations.map((destination) => [destination.id, destination]))

type RouteCommand = {
  id: string
  label: string
  icon: IconName
  auxiliaryData: { group: string; to: string; keywords: string[] }
}

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
  if (status === 'NEEDS_DECISION') return 'Needs decision'
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
  if (status === 'NEEDS_DECISION') return 'Sync needs your decision · nothing changed yet'
  if (status === 'ERROR') return 'Sync failed · local copy saved'
  return 'Saved on this device'
}

function routeMatches(pathname: string, to: string, end = false): boolean {
  return matchPath({ path: to, end }, pathname) !== null
}

type SidebarSection = {
  id: string
  title: string
  subtitle: string
  icon: IconName
  destinationIds: string[]
}

/**
 * Two-level navigation. The rail on the left is always collapsed and switches
 * sections; the pane beside it lists that section's destinations. Rows stay one
 * level deep: a section is a label plus sibling links, never a collapsible
 * parent with nested children.
 */
const sidebarSections: [SidebarSection, ...SidebarSection[]] = [
  { id: 'overview', title: 'Overview', subtitle: 'Daily plan and review', icon: 'overview', destinationIds: ['overview', 'calendar', 'commitments', 'activity'] },
  { id: 'portfolio', title: 'Portfolio', subtitle: 'Accounts and token tracking', icon: 'assets', destinationIds: ['assets', 'electricity'] },
  { id: 'manage', title: 'Manage', subtitle: 'Preferences and settings', icon: 'settings', destinationIds: ['settings'] },
]

function sidebarSectionDestinations(section: SidebarSection): Destination[] {
  return section.destinationIds.map((destinationId) => {
    const destination = destinationsById.get(destinationId)
    if (!destination) throw new Error(`Unknown shell navigation destination: ${destinationId}`)
    return destination
  })
}

/** The section that owns the current route, or undefined when nothing matches. */
function sidebarSectionForPathname(pathname: string): SidebarSection | undefined {
  return sidebarSections.find((section) =>
    sidebarSectionDestinations(section).some((destination) =>
      routeMatches(pathname, destination.to, destination.to === '/'),
    ),
  )
}

const otherPagesGroup = 'Other pages'

// Sidebar sections order the palette groups so results read like the nav; destinations
// no section lists (Budget settings, Account settings) close the list under one heading.
const sectionDestinationIds = new Set(sidebarSections.flatMap((section) => section.destinationIds))
const routeCommands: RouteCommand[] = [
  ...sidebarSections.flatMap((section) => sidebarSectionDestinations(section).map((destination) => ({ destination, group: section.title }))),
  ...destinations
    .filter((destination) => !sectionDestinationIds.has(destination.id))
    .map((destination) => ({ destination, group: otherPagesGroup })),
].map(({ destination: { id, label, icon, to, keywords }, group }) => ({
  id,
  label,
  icon,
  auxiliaryData: { group, to, keywords },
}))

const routeCommandSource = createStaticSource(routeCommands, {
  keywords: (command) => command.auxiliaryData.keywords,
})
const routeByCommandId = new Map(routeCommands.map((command) => [command.id, command.auxiliaryData.to]))

function AppNavRail({
  activeSectionId,
  onSelect,
}: {
  activeSectionId: string
  onSelect: (sectionId: string) => void
}) {
  return (
    <Stack as="nav" className="app-nav-rail" gap={2} aria-label="Sections">
      {sidebarSections.map((section) => {
        const isActive = section.id === activeSectionId
        return (
          <button
            key={section.id}
            type="button"
            className="app-nav-rail-item"
            aria-current={isActive ? 'true' : undefined}
            data-active={isActive ? 'true' : undefined}
            onClick={() => onSelect(section.id)}>
            <Stack direction="vertical" hAlign="center" gap={1} className="app-nav-rail-item-content">
              <Icon name={section.icon} size={18} aria-hidden="true" />
              <Text type="supporting" className="app-nav-rail-label">{section.title}</Text>
            </Stack>
          </button>
        )
      })}
    </Stack>
  )
}

const paneCollapsedStorageKey = 'kinsen-shell-nav-pane-collapsed'

/**
 * Collapse state is owned here, so the pane can restyle itself and drop its
 * heading while collapsed; Astryx persists the pane width under `autoSaveId`.
 */
function readPaneCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(paneCollapsedStorageKey) === 'true'
  } catch {
    return false
  }
}

function savePaneCollapsed(isCollapsed: boolean) {
  try {
    window.localStorage.setItem(paneCollapsedStorageKey, String(isCollapsed))
  } catch {
    // Storage can be unavailable (private mode, quota): collapse stays session-only.
  }
}

function AppSidebarPane({ section }: { section: SidebarSection }) {
  const location = useLocation()
  const [paneCollapsed, setPaneCollapsed] = useState(readPaneCollapsed)

  function handleCollapseChange(nextCollapsed: boolean) {
    setPaneCollapsed(nextCollapsed)
    savePaneCollapsed(nextCollapsed)
  }

  return (
    <SideNav
      aria-label="Primary navigation"
      className="app-side-nav"
      data-sidebar-collapsed={paneCollapsed ? 'true' : 'false'}
      resizable={{
        defaultWidth: 260,
        minWidth: 200,
        maxWidth: 400,
        autoSaveId: 'kinsen-shell-nav-pane',
        isCollapsed: paneCollapsed,
        onCollapseChange: handleCollapseChange,
      }}
      topContent={paneCollapsed ? undefined : (
        <Stack gap={0} className="app-side-nav-heading">
          <Text type="large" weight="semibold" display="block">{section.title}</Text>
          <Text type="supporting" display="block">{section.subtitle}</Text>
        </Stack>
      )}>
      <SideNavSection className="app-side-nav-section" title={section.title} isHeaderHidden>
        {sidebarSectionDestinations(section).map((destination) => (
          <SideNavItem
            key={destination.id}
            href={destination.to}
            label={destination.label}
            icon={<Icon name={destination.icon} size={19} />}
            isSelected={routeMatches(location.pathname, destination.to, destination.to === '/')}
          />
        ))}
      </SideNavSection>
    </SideNav>
  )
}

export function AppSidebar() {
  const location = useLocation()
  const routedSectionId = sidebarSectionForPathname(location.pathname)?.id
  const [activeSectionId, setActiveSectionId] = useState(routedSectionId ?? sidebarSections[0].id)
  const activeSection = sidebarSections.find((section) => section.id === activeSectionId) ?? sidebarSections[0]

  // The route owns the pane: any route change re-derives it, so a rail click only
  // moves the pane until the next navigation. Keyed on the pathname, not on the
  // derived id, so returning to an earlier section still pulls the pane back.
  useEffect(() => {
    if (routedSectionId) setActiveSectionId(routedSectionId)
  }, [location.pathname, routedSectionId])

  return (
    <Stack direction="horizontal" gap={0} className="app-nav-split">
      <AppNavRail activeSectionId={activeSection.id} onSelect={setActiveSectionId} />
      <AppSidebarPane section={activeSection} />
    </Stack>
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
  backdropStyle = 'plain',
  online,
  syncStatus,
  error,
  onRetry,
  accountControl,
  children,
}: {
  layoutDensity: string
  playfulMotion: boolean
  backdropStyle?: string
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
  const hasSyncProblem = syncStatus === 'CONFLICT' || syncStatus === 'NEEDS_DECISION' || syncStatus === 'ERROR' || syncStatus === 'ACCOUNT_MISMATCH'
  const electricityLocalOnly = routeMatches(pathname, '/electricity')
  const displayedSyncLabel = electricityLocalOnly ? 'Electricity readings saved on this device; not synced' : syncLabel(syncStatus, online)
  const displayedSyncSummary = electricityLocalOnly ? 'Local only' : syncSummary(syncStatus, online)
  const displayedSyncVariant = electricityLocalOnly ? 'neutral' : hasSyncProblem ? 'error' : !online || syncStatus === 'PENDING' || syncStatus === 'SYNCING' ? 'warning' : 'success'
  const previousPathname = useRef(pathname)
  const appShellRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const shell = appShellRef.current
    if (!shell) return

    // Astryx places its resize separator beside SideNav's <nav>; name their shared panel
    // without enclosing the shell's top-level banner or main landmark.
    const nameSidebarPanel = () => {
      const panel = shell.querySelector<HTMLElement>('.astryx-app-shell-sidenav')
      if (!panel) return

      if (!panel.hasAttribute('role')) panel.setAttribute('role', 'complementary')
      const role = panel.getAttribute('role')
      if ((role === 'complementary' || role === 'region') && !panel.hasAttribute('aria-label')) {
        panel.setAttribute('aria-label', 'Workspace navigation')
      }
    }

    nameSidebarPanel()
    const observer = new MutationObserver(nameSidebarPanel)
    observer.observe(shell, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])


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
      <Stack className="app-workspace" gap={0}>
        <AstryxAppShell
          ref={appShellRef}
          className={`app-frame${layoutDensity === 'compact' ? ' is-compact' : ''}${playfulMotion ? '' : ' is-motion-reduced'}`}
          data-backdrop={backdropStyle === 'plain' ? undefined : backdropStyle}
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
                    <StatusDot label={displayedSyncLabel} variant={displayedSyncVariant} />
                    <Text type="supporting" className="topbar-status-copy" aria-hidden="true">{displayedSyncSummary}</Text>
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
          <SyncConflictBanner />
          {children}
        </AstryxAppShell>
        <MobileNavigation />
      </Stack>
      <Celebration />
      <CommandPalette
        isOpen={isPaletteOpen}
        onOpenChange={setIsPaletteOpen}
        input={
          <CommandPaletteInput
            placeholder="Search pages…"
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
        renderItem={(command) => {
          const isCurrent = routeMatches(pathname, command.auxiliaryData.to, command.auxiliaryData.to === '/')
          return (
            <Stack direction="horizontal" vAlign="center" gap={3} className="command-palette-page">
              <Icon name={command.icon} size={18} aria-hidden="true" />
              <Text className="command-palette-page-label">{command.label}</Text>
              {isCurrent && <Text type="supporting" className="command-palette-page-current">Current page</Text>}
            </Stack>
          )
        }}
        emptySearchText={
          <Stack gap={1} hAlign="center">
            <Text weight="semibold">No matching pages</Text>
            <Text type="supporting">Try a page name, such as Activity or Assets.</Text>
          </Stack>
        }
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
  const { pathname } = useLocation()
  // Settings manages two independent scroll columns instead of scrolling as one page.
  const isSettingsRoute = routeMatches(pathname, '/settings')
  const initialize = useBudgetStore((state) => state.initialize)
  const initializeAssets = useAssetStore((state) => state.initialize)
  const error = useBudgetStore((state) => state.error)
  const syncStatus = useBudgetStore((state) => state.syncStatus)
  const { getToken } = useAuth()
  const [online, setOnline] = useState(() => navigator.onLine)
  const layoutDensity = useSettingsStore((state) => state.layoutDensity)
  const playfulMotion = useSettingsStore((state) => state.playfulMotion)
  const backdropStyle = useSettingsStore((state) => state.backdropStyle)

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
      backdropStyle={backdropStyle}
      online={online}
      syncStatus={syncStatus}
      error={error}
      onRetry={() => void initialize()}
      accountControl={<UserButton />}>
      <Stack className="page-content" data-scroll-panels={isSettingsRoute ? 'true' : undefined}><Outlet /></Stack>
    </AppShellChrome>
  )
}
