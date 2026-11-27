import { useSyncExternalStore } from 'react'

// Matches the shell's mobile-navigation breakpoint (Astryx `lg`).
const query = '(max-width: 1023.98px)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false)
}
