import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { ClerkProvider } from '@clerk/react'
import { resolveThemeTokens, Theme } from '@astryxdesign/core/theme'
import { createAppearanceTheme } from '../theme'
import { useSettingsStore } from '../state/settings-store'

const systemColorScheme = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

function syncRootAppearance(mode: 'light' | 'dark', themeName: string) {
  document.documentElement.style.colorScheme = mode
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.colorMode = mode
  document.documentElement.dataset.astryxTheme = themeName
}

// Apply saved preferences before React paints; Theme injects its palette during mount.
export function initializeAppTheme() {
  const preferences = useSettingsStore.getState()
  syncRootAppearance(preferences.colorMode === 'system' ? (systemColorScheme?.matches ? 'dark' : 'light') : preferences.colorMode, createAppearanceTheme(preferences).name)
}

export function AppTheme({ children, withAuth = false }: { children: ReactNode; withAuth?: boolean }) {
  const colorMode = useSettingsStore((state) => state.colorMode)
  const themeColor = useSettingsStore((state) => state.themeColor)
  const surfaceStyle = useSettingsStore((state) => state.surfaceStyle)
  const cornerStyle = useSettingsStore((state) => state.cornerStyle)
  const headingStyle = useSettingsStore((state) => state.headingStyle)
  const theme = useMemo(() => createAppearanceTheme({ themeColor, surfaceStyle, cornerStyle, headingStyle }), [themeColor, surfaceStyle, cornerStyle, headingStyle])
  const subscribe = useCallback((onChange: () => void) => {
    if (colorMode !== 'system' || !systemColorScheme) return () => {}
    systemColorScheme.addEventListener('change', onChange)
    return () => systemColorScheme.removeEventListener('change', onChange)
  }, [colorMode])
  const getSnapshot = useCallback(() => colorMode === 'system' ? (systemColorScheme?.matches ? 'dark' : 'light') : colorMode, [colorMode])
  const mode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useLayoutEffect(() => {
    syncRootAppearance(mode, theme.name)
  }, [mode, theme])

  const appearance = useMemo(() => {
    const tokens = resolveThemeTokens(theme, { mode })
    return {
      variables: {
        colorPrimary: tokens['--color-accent'],
        colorPrimaryForeground: tokens['--color-on-accent'],
        colorNeutral: tokens['--color-text-primary'],
        colorForeground: tokens['--color-text-primary'],
        colorMutedForeground: tokens['--color-text-secondary'],
        colorBackground: tokens['--color-background-surface'],
        colorMuted: tokens['--color-background-muted'],
        colorInput: tokens['--color-background-surface'],
        colorInputForeground: tokens['--color-text-primary'],
        colorBorder: tokens['--color-border'],
        colorRing: tokens['--color-accent'],
      },
    }
  }, [theme, mode])

  return (
    <Theme theme={theme} mode={mode}>
      {withAuth
        ? <ClerkProvider afterSignOutUrl="/" appearance={appearance}>{children}</ClerkProvider>
        : children}
    </Theme>
  )
}
