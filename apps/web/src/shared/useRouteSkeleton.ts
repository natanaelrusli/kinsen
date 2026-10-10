import { matchPath, useLocation } from 'react-router-dom'
import type { PageSkeletonVariant } from './components/PageSkeleton'

export type RouteSkeletonConfig = {
  variant: PageSkeletonVariant
  label: string
}

type SkeletonRoute = RouteSkeletonConfig & { path: string; end?: boolean }

/**
 * Ordered most-specific first; the first match wins.
 */
const skeletonRoutes: SkeletonRoute[] = [
  { path: '/assets/:assetId', variant: 'detail', label: 'Loading asset details' },
  { path: '/', variant: 'overview', label: 'Loading your budget', end: true },
  { path: '/calendar', variant: 'calendar', label: 'Loading your calendar' },
  { path: '/commitments', variant: 'list', label: 'Loading your commitments' },
  { path: '/activity', variant: 'list', label: 'Loading your activity' },
  { path: '/assets', variant: 'assets', label: 'Loading assets saved on this device' },
  { path: '/electricity', variant: 'meter', label: 'Loading meter readings saved on this device' },
  { path: '/budget', variant: 'form', label: 'Loading your budget' },
  { path: '/settings', variant: 'settings', label: 'Loading your preferences' },
  { path: '/account', variant: 'form', label: 'Loading your account' },
]

/**
 * Resolves the active route to the skeleton layout that matches that page's
 * shape, so each page keeps its own structure while loading. Must be called
 * inside a Router; pages rendered standalone declare their variant directly.
 */
export function useRouteSkeleton(): RouteSkeletonConfig {
  const { pathname } = useLocation()
  return skeletonRoutes.find((route) => matchPath({ path: route.path, end: route.end }, pathname) !== null) ?? { variant: 'overview', label: 'Loading page' }
}