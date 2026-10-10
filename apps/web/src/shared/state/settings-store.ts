import { create } from 'zustand'

export const colorModeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const

export type ColorMode = (typeof colorModeOptions)[number]['value']

export const themeColorOptions = [
  { value: 'evergreen', label: 'Evergreen', swatch: 'var(--color-swatch-evergreen)', highlight: 'var(--color-swatch-highlight-evergreen)' },
  { value: 'ocean', label: 'Ocean', swatch: 'var(--color-swatch-ocean)', highlight: 'var(--color-swatch-highlight-ocean)' },
  { value: 'lilac', label: 'Lilac', swatch: 'var(--color-swatch-lilac)', highlight: 'var(--color-swatch-highlight-lilac)' },
  { value: 'terracotta', label: 'Terracotta', swatch: 'var(--color-swatch-terracotta)', highlight: 'var(--color-swatch-highlight-terracotta)' },
  { value: 'marigold', label: 'Marigold', swatch: 'var(--color-swatch-marigold)', highlight: 'var(--color-swatch-highlight-marigold)' },
  { value: 'rose', label: 'Rose', swatch: 'var(--color-swatch-rose)', highlight: 'var(--color-swatch-highlight-rose)' },
  { value: 'slate', label: 'Slate', swatch: 'var(--color-swatch-slate)', highlight: 'var(--color-swatch-highlight-slate)' },
  { value: 'indigo', label: 'Indigo', swatch: 'var(--color-swatch-indigo)', highlight: 'var(--color-swatch-highlight-indigo)' },
] as const

export type ThemeColor = (typeof themeColorOptions)[number]['value']
type WeekStartsOn = 'sunday' | 'monday'
type LayoutDensity = 'comfortable' | 'compact'

export const surfaceStyleOptions = [
  { value: 'warm', label: 'Warm · soft ivory' },
  { value: 'cool', label: 'Cool · blue gray' },
  { value: 'neutral', label: 'Neutral · clean gray' },
  { value: 'sand', label: 'Sand · toasty beige' },
  { value: 'mint', label: 'Mint · soft green' },
  { value: 'dusk', label: 'Dusk · twilight violet' },
  { value: 'paper', label: 'Paper · crisp white' },
] as const
export const cornerStyleOptions = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'crisp', label: 'Crisp' },
] as const
// Each style pairs a heading face with a body face so the two always work together.
export const headingStyleOptions = [
  { value: 'editorial', label: 'Editorial · serif' },
  { value: 'modern', label: 'Modern · sans serif' },
  { value: 'grotesk', label: 'Grotesk · tight & plain' },
  { value: 'humanist', label: 'Humanist · warm & open' },
  { value: 'rounded', label: 'Rounded · soft & friendly' },
  { value: 'ledger', label: 'Ledger · monospaced' },
] as const
export type SurfaceStyle = (typeof surfaceStyleOptions)[number]['value']
type CornerStyle = (typeof cornerStyleOptions)[number]['value']
export type HeadingStyle = (typeof headingStyleOptions)[number]['value']

export const moneyStyleOptions = [
  { value: 'full', label: 'Full · Rp 1.250.000', hint: 'Every digit, grouped the Indonesian way.' },
  { value: 'compact', label: 'Compact · Rp 1,3 jt', hint: 'Shortens thousands and millions to rb and jt.' },
] as const

export const backdropStyleOptions = [
  { value: 'plain', label: 'Plain' },
  { value: 'dots', label: 'Polka dots' },
  { value: 'grid', label: 'Notebook grid' },
  { value: 'aurora', label: 'Soft aurora' },
] as const

export const cheerToneOptions = [
  { value: 'off', label: 'Off' },
  { value: 'gentle', label: 'Gentle' },
  { value: 'playful', label: 'Playful' },
] as const

/**
 * Whether a saved expense will actually produce visible celebration feedback.
 * A celebration needs the burst (motion on) or the message (tone not off); with both
 * suppressed the plain toast is the only confirmation, so it must stay.
 */
export function celebrationShowsFeedback(preferences: Pick<AppPreferences, 'celebrateOnSave' | 'playfulMotion' | 'cheerTone'>): boolean {
  return preferences.celebrateOnSave && (preferences.playfulMotion || preferences.cheerTone !== 'off')
}

type MoneyStyle = (typeof moneyStyleOptions)[number]['value']
type BackdropStyle = (typeof backdropStyleOptions)[number]['value']
type CheerTone = (typeof cheerToneOptions)[number]['value']

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
  moneyStyle: MoneyStyle
  backdropStyle: BackdropStyle
  cheerTone: CheerTone
  celebrateOnSave: boolean
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
  setMoneyStyle: (moneyStyle: MoneyStyle) => void
  setBackdropStyle: (backdropStyle: BackdropStyle) => void
  setCheerTone: (cheerTone: CheerTone) => void
  setCelebrateOnSave: (celebrateOnSave: boolean) => void
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
  moneyStyle: 'full',
  backdropStyle: 'plain',
  cheerTone: 'gentle',
  celebrateOnSave: true,
}

const preferencesStorageKey = 'kinsen-preferences'

function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && themeColorOptions.some((option) => option.value === value)
}

function isColorMode(value: unknown): value is ColorMode {
  return typeof value === 'string' && colorModeOptions.some((option) => option.value === value)
}

/** Keeps stored preferences inside the current option list, so removed options fall back to the default. */
function optionValue<T extends string>(value: unknown, options: readonly { value: T }[], fallback: T): T {
  return options.some((option) => option.value === value) ? value as T : fallback
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
      surfaceStyle: optionValue<SurfaceStyle>(value.surfaceStyle, surfaceStyleOptions, defaultPreferences.surfaceStyle),
      cornerStyle: optionValue<CornerStyle>(value.cornerStyle, cornerStyleOptions, defaultPreferences.cornerStyle),
      headingStyle: optionValue<HeadingStyle>(value.headingStyle, headingStyleOptions, defaultPreferences.headingStyle),
      weekStartsOn: value.weekStartsOn === 'monday' ? 'monday' : defaultPreferences.weekStartsOn,
      layoutDensity: value.layoutDensity === 'compact' ? 'compact' : defaultPreferences.layoutDensity,
      playfulMotion: typeof value.playfulMotion === 'boolean' ? value.playfulMotion : defaultPreferences.playfulMotion,
      dashboardSections: readDashboardSections(value.dashboardSections),
      moneyStyle: moneyStyleOptions.some((option) => option.value === value.moneyStyle) ? value.moneyStyle as MoneyStyle : defaultPreferences.moneyStyle,
      backdropStyle: backdropStyleOptions.some((option) => option.value === value.backdropStyle) ? value.backdropStyle as BackdropStyle : defaultPreferences.backdropStyle,
      cheerTone: cheerToneOptions.some((option) => option.value === value.cheerTone) ? value.cheerTone as CheerTone : defaultPreferences.cheerTone,
      celebrateOnSave: typeof value.celebrateOnSave === 'boolean' ? value.celebrateOnSave : defaultPreferences.celebrateOnSave,
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
      moneyStyle: changes.moneyStyle ?? current.moneyStyle,
      backdropStyle: changes.backdropStyle ?? current.backdropStyle,
      cheerTone: changes.cheerTone ?? current.cheerTone,
      celebrateOnSave: changes.celebrateOnSave ?? current.celebrateOnSave,
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
    setMoneyStyle: (moneyStyle) => update({ moneyStyle }),
    setBackdropStyle: (backdropStyle) => update({ backdropStyle }),
    setCheerTone: (cheerTone) => update({ cheerTone }),
    setCelebrateOnSave: (celebrateOnSave) => update({ celebrateOnSave }),
  }
})
