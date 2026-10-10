import { useRouteSkeleton } from '../useRouteSkeleton'
import { PageSkeleton } from './PageSkeleton'

/**
 * Router-level fallback: renders the skeleton that matches the route being
 * loaded, so navigation keeps the destination's layout while its chunk arrives.
 * Must render inside a Router. Pages rendering their own loading state use
 * `PageSkeleton` with an explicit variant instead.
 */
export function RouteSkeleton() {
  const { variant, label } = useRouteSkeleton()
  return <PageSkeleton variant={variant} label={label} />
}