import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { celebrationShowsFeedback, defaultPreferences } from './settings-store'

const storageKey = 'kinsen-preferences'

/** Re-imports the store so it re-reads localStorage, the way a page reload would. */
async function reloadFromStorage() {
  vi.resetModules()
  const module = await import('./settings-store')
  return { state: module.useSettingsStore.getState(), store: module.useSettingsStore, defaults: module.defaultPreferences }
}

async function storeWith(overrides: Record<string, unknown>) {
  window.localStorage.setItem(storageKey, JSON.stringify(overrides))
  return (await reloadFromStorage()).state
}

describe('settings preference loading', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => {
    window.localStorage.clear()
    vi.resetModules()
  })

  it('round-trips every surface palette through storage', async () => {
    for (const palette of ['warm', 'cool', 'neutral', 'sand', 'mint', 'dusk', 'paper'] as const) {
      const { store, defaults } = await reloadFromStorage()
      store.getState().setSurfaceStyle(palette)

      const reloaded = await reloadFromStorage()
      expect(reloaded.state.surfaceStyle, `palette ${palette}`).toBe(palette)
      expect(reloaded.defaults.surfaceStyle).toBe(defaults.surfaceStyle)
    }
  })

  it('round-trips every typography pairing through storage', async () => {
    for (const style of ['editorial', 'modern', 'grotesk', 'humanist', 'rounded', 'ledger'] as const) {
      const { store } = await reloadFromStorage()
      store.getState().setHeadingStyle(style)

      expect((await reloadFromStorage()).state.headingStyle, `heading style ${style}`).toBe(style)
    }
  })

  it('keeps previously stored palettes and heading styles loading', async () => {
    const preferences = await storeWith({ surfaceStyle: 'cool', headingStyle: 'modern' })
    expect(preferences.surfaceStyle).toBe('cool')
    expect(preferences.headingStyle).toBe('modern')
  })

  it('falls back to the default for unknown or malformed values', async () => {
    expect((await storeWith({ surfaceStyle: 'chartreuse' })).surfaceStyle).toBe(defaultPreferences.surfaceStyle)
    expect((await storeWith({ headingStyle: 'comic' })).headingStyle).toBe(defaultPreferences.headingStyle)
    expect((await storeWith({ surfaceStyle: 42, headingStyle: null })).surfaceStyle).toBe(defaultPreferences.surfaceStyle)
    expect((await storeWith({ headingStyle: ['rounded'] })).headingStyle).toBe(defaultPreferences.headingStyle)
  })

  it('leaves unrelated preferences untouched when one value is invalid', async () => {
    const preferences = await storeWith({ surfaceStyle: 'dusk', headingStyle: 'nope', cornerStyle: 'crisp' })
    expect(preferences.surfaceStyle).toBe('dusk')
    expect(preferences.headingStyle).toBe(defaultPreferences.headingStyle)
    expect(preferences.cornerStyle).toBe('crisp')
  })
})

describe('celebrationShowsFeedback', () => {
  const on = { celebrateOnSave: true, playfulMotion: true, cheerTone: 'gentle' } as const

  it('reports feedback for the default preferences', () => {
    expect(celebrationShowsFeedback(defaultPreferences)).toBe(true)
  })

  it('reports no feedback when celebrations are off, whatever else is set', () => {
    expect(celebrationShowsFeedback({ ...on, celebrateOnSave: false })).toBe(false)
  })

  it('counts the burst as feedback even with the tone off', () => {
    expect(celebrationShowsFeedback({ ...on, cheerTone: 'off' })).toBe(true)
  })

  it('counts the message as feedback even with motion off', () => {
    expect(celebrationShowsFeedback({ ...on, playfulMotion: false })).toBe(true)
  })

  it('reports no feedback when the tone is off and motion is off, so the toast stays', () => {
    expect(celebrationShowsFeedback({ ...on, cheerTone: 'off', playfulMotion: false })).toBe(false)
  })
})
