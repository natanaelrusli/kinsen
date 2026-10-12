import { matchPath, useLocation } from 'react-router-dom'
import { PageSkeleton, type PageSkeletonVariant } from '../components/PageSkeleton'

type SkeletonRoute = {
  path: string
  variant: PageSkeletonVariant
  label: string
  end?: boolean
}

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

const fallbackRoute: SkeletonRoute = { path: '*', variant: 'overview', label: 'Loading page' }

/**
 * Resolves the active route to the skeleton layout that matches that page's
 * shape, so each page keeps its own structure while loading.
 */
export function useRouteSkeleton() {
  const { pathname } = useLocation()
  const route = skeletonRoutes.find((candidate) => matchPath({ path: candidate.path, end: candidate.end }, pathname) !== null) ?? fallbackRoute
  return route
}

export function RouteSkeleton() {
  const { variant, label } = useRouteSkeleton()
  return <PageSkeleton variant={variant} label={label} />
}