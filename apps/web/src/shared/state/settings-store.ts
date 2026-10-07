import { create } from 'zustand'

export const colorModeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const

export type ColorMode = (typeof colorModeOptions)[number]['value']

export const themeColorOptions = [
  { value: 'evergreen', label: 'Evergreen', swatch: 'var(--color-swatch-evergreen)' },
  { value: 'ocean', label: 'Ocean', swatch: 'var(--color-swatch-ocean)' },
  { value: 'lilac', label: 'Lilac', swatch: 'var(--color-swatch-lilac)' },
  { value: 'terracotta', label: 'Terracotta', swatch: 'var(--color-swatch-terracotta)' },
  { value: 'marigold', label: 'Marigold', swatch: 'var(--color-swatch-marigold)' },
  { value: 'rose', label: 'Rose', swatch: 'var(--color-swatch-rose)' },
  { value: 'slate', label: 'Slate', swatch: 'var(--color-swatch-slate)' },
  { value: 'indigo', label: 'Indigo', swatch: 'var(--color-swatch-indigo)' },
] as const

export type ThemeColor = (typeof themeColorOptions)[number]['value']
type WeekStartsOn = 'sunday' | 'monday'
type LayoutDensity = 'comfortable' | 'compact'

export const surfaceStyleOptions = [
  { value: 'warm', label: 'Warm · soft ivory' },
  { value: 'cool', label: 'Cool · blue gray' },
  { value: 'neutral', label: 'Neutral · clean gray' },
] as const
export const cornerStyleOptions = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'crisp', label: 'Crisp' },
] as const
export const headingStyleOptions = [
  { value: 'editorial', label: 'Editorial · serif' },
  { value: 'modern', label: 'Modern · sans serif' },
] as const
type SurfaceStyle = (typeof surfaceStyleOptions)[number]['value']
type CornerStyle = (typeof cornerStyleOptions)[number]['value']
type HeadingStyle = (typeof headingStyleOptions)[number]['value']

export const dashboardSectionOptions = [
  { value: 'summary', label: 'Budget summary', description: 'Actual spending, outstanding commitments, and protected reserve.' },
  { value: 'assets', label: 'Your assets', description: 'Your financial position, separate from daily spending.' },
  { value: 'categories', label: 'Category pulse', description: 'Spending progress across your budget categories.' },
  { value: 'commitments', label: 'Still to pay', description: 'Upcoming and overdue planned expenses.' },
  { value: 'activity', label: 'Recent activity', description: 'Your latest expenses with edit and delete actions.' },
] as const

type DashboardSection = (typeof dashboardSectionOptions)[number]['value']
type DashboardSections = Record<DashboardSection, boolean>

export type AppPreferences = {
  colorMode: ColorMode
  themeColor: ThemeColor
  surfaceStyle: SurfaceStyle
  cornerStyle: CornerStyle
  headingStyle: HeadingStyle
  weekStartsOn: WeekStartsOn
  layoutDensity: LayoutDensity
  playfulMotion: boolean
  dashboardSections: DashboardSections
}

type SettingsState = AppPreferences & {
  setColorMode: (colorMode: ColorMode) => void
  setThemeColor: (themeColor: ThemeColor) => void
  setSurfaceStyle: (surfaceStyle: SurfaceStyle) => void
  setCornerStyle: (cornerStyle: CornerStyle) => void
  setHeadingStyle: (headingStyle: HeadingStyle) => void
  setWeekStartsOn: (weekStartsOn: WeekStartsOn) => void
  setLayoutDensity: (layoutDensity: LayoutDensity) => void
  setPlayfulMotion: (playfulMotion: boolean) => void
  setDashboardSection: (section: DashboardSection, visible: boolean) => void
}

export const defaultPreferences: AppPreferences = {
  colorMode: 'system',
  themeColor: 'evergreen',
  surfaceStyle: 'warm',
  cornerStyle: 'rounded',
  headingStyle: 'editorial',
  weekStartsOn: 'sunday',
  layoutDensity: 'comfortable',
  playfulMotion: true,
  dashboardSections: { summary: true, assets: true, categories: true, commitments: true, activity: true },
}

const preferencesStorageKey = 'kinsen-preferences'

function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && themeColorOptions.some((option) => option.value === value)
}

function isColorMode(value: unknown): value is ColorMode {
  return typeof value === 'string' && colorModeOptions.some((option) => option.value === value)
}

function readDashboardSections(value: unknown): DashboardSections {
  const sections = { ...defaultPreferences.dashboardSections }
  if (value !== null && typeof value === 'object') {
    const stored = value as Record<string, unknown>
    for (const { value: section } of dashboardSectionOptions) {
      if (typeof stored[section] === 'boolean') sections[section] = stored[section]
    }
  }
  return sections
}

function readPreferences(): AppPreferences {
  if (typeof window === 'undefined') return defaultPreferences
  try {
    const stored = window.localStorage.getItem(preferencesStorageKey)
    if (!stored) return defaultPreferences
    const parsed: unknown = JSON.parse(stored)
    if (parsed === null || typeof parsed !== 'object') return defaultPreferences
    const value = parsed as Record<string, unknown>
    return {
      colorMode: isColorMode(value.colorMode) ? value.colorMode : defaultPreferences.colorMode,
      themeColor: isThemeColor(value.themeColor) ? value.themeColor : defaultPreferences.themeColor,
      surfaceStyle: value.surfaceStyle === 'cool' || value.surfaceStyle === 'neutral' ? value.surfaceStyle : defaultPreferences.surfaceStyle,
      cornerStyle: value.cornerStyle === 'crisp' ? 'crisp' : defaultPreferences.cornerStyle,
      headingStyle: value.headingStyle === 'modern' ? 'modern' : defaultPreferences.headingStyle,
      weekStartsOn: value.weekStartsOn === 'monday' ? 'monday' : defaultPreferences.weekStartsOn,
      layoutDensity: value.layoutDensity === 'compact' ? 'compact' : defaultPreferences.layoutDensity,
      playfulMotion: typeof value.playfulMotion === 'boolean' ? value.playfulMotion : defaultPreferences.playfulMotion,
      dashboardSections: readDashboardSections(value.dashboardSections),
    }
  } catch {
    return defaultPreferences
  }
}

function savePreferences(preferences: AppPreferences) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(preferencesStorageKey, JSON.stringify(preferences))
  } catch {
    // Keep the in-memory preference usable when browser storage is unavailable.
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => {
  function update(changes: Partial<AppPreferences>) {
    const current = get()
    const preferences: AppPreferences = {
      colorMode: changes.colorMode ?? current.colorMode,
      themeColor: changes.themeColor ?? current.themeColor,
      surfaceStyle: changes.surfaceStyle ?? current.surfaceStyle,
      cornerStyle: changes.cornerStyle ?? current.cornerStyle,
      headingStyle: changes.headingStyle ?? current.headingStyle,
      weekStartsOn: changes.weekStartsOn ?? current.weekStartsOn,
      layoutDensity: changes.layoutDensity ?? current.layoutDensity,
      playfulMotion: changes.playfulMotion ?? current.playfulMotion,
      dashboardSections: changes.dashboardSections ?? current.dashboardSections,
    }
    savePreferences(preferences)
    set(changes)
  }

  return {
    ...readPreferences(),
    setColorMode: (colorMode) => update({ colorMode }),
    setThemeColor: (themeColor) => update({ themeColor }),
    setSurfaceStyle: (surfaceStyle) => update({ surfaceStyle }),
    setCornerStyle: (cornerStyle) => update({ cornerStyle }),
    setHeadingStyle: (headingStyle) => update({ headingStyle }),
    setWeekStartsOn: (weekStartsOn) => update({ weekStartsOn }),
    setLayoutDensity: (layoutDensity) => update({ layoutDensity }),
    setPlayfulMotion: (playfulMotion) => update({ playfulMotion }),
    setDashboardSection: (section, visible) => update({ dashboardSections: { ...get().dashboardSections, [section]: visible } }),
  }
})
