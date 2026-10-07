import { create } from 'zustand'

export const themeColorOptions = [
  { value: 'evergreen', label: 'Evergreen', swatch: '#245443' },
  { value: 'ocean', label: 'Ocean', swatch: '#326781' },
  { value: 'lilac', label: 'Lilac', swatch: '#725582' },
  { value: 'terracotta', label: 'Terracotta', swatch: '#95553c' },
  { value: 'marigold', label: 'Marigold', swatch: '#746115' },
] as const

export type ThemeColor = (typeof themeColorOptions)[number]['value']
type WeekStartsOn = 'sunday' | 'monday'
type LayoutDensity = 'comfortable' | 'compact'

export type AppPreferences = {
  themeColor: ThemeColor
  weekStartsOn: WeekStartsOn
  layoutDensity: LayoutDensity
  playfulMotion: boolean
}

type SettingsState = AppPreferences & {
  setThemeColor: (themeColor: ThemeColor) => void
  setWeekStartsOn: (weekStartsOn: WeekStartsOn) => void
  setLayoutDensity: (layoutDensity: LayoutDensity) => void
  setPlayfulMotion: (playfulMotion: boolean) => void
}

export const defaultPreferences: AppPreferences = {
  themeColor: 'evergreen',
  weekStartsOn: 'sunday',
  layoutDensity: 'comfortable',
  playfulMotion: true,
}

const preferencesStorageKey = 'kinsen-preferences'

function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && themeColorOptions.some((option) => option.value === value)
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
      themeColor: isThemeColor(value.themeColor) ? value.themeColor : defaultPreferences.themeColor,
      weekStartsOn: value.weekStartsOn === 'monday' ? 'monday' : defaultPreferences.weekStartsOn,
      layoutDensity: value.layoutDensity === 'compact' ? 'compact' : defaultPreferences.layoutDensity,
      playfulMotion: typeof value.playfulMotion === 'boolean' ? value.playfulMotion : defaultPreferences.playfulMotion,
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
      themeColor: changes.themeColor ?? current.themeColor,
      weekStartsOn: changes.weekStartsOn ?? current.weekStartsOn,
      layoutDensity: changes.layoutDensity ?? current.layoutDensity,
      playfulMotion: changes.playfulMotion ?? current.playfulMotion,
    }
    savePreferences(preferences)
    set(changes)
  }

  return {
    ...readPreferences(),
    setThemeColor: (themeColor) => update({ themeColor }),
    setWeekStartsOn: (weekStartsOn) => update({ weekStartsOn }),
    setLayoutDensity: (layoutDensity) => update({ layoutDensity }),
    setPlayfulMotion: (playfulMotion) => update({ playfulMotion }),
  }
})
