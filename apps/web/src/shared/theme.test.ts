import { describe, expect, it } from 'vitest'
import { createAppearanceTheme } from './theme'
import { headingStyleOptions, surfaceStyleOptions, type HeadingStyle, type SurfaceStyle } from './state/settings-store'

const base = { themeColor: 'evergreen', cornerStyle: 'rounded' } as const

const fontsFor = (headingStyle: HeadingStyle) => {
  const tokens = createAppearanceTheme({ ...base, surfaceStyle: 'warm', headingStyle }).tokens ?? {}
  return { heading: tokens['--font-family-heading'], body: tokens['--font-family-body'] }
}

describe('createAppearanceTheme', () => {
  it('applies every surface palette to the background and text tokens', () => {
    for (const surfaceStyle of surfaceStyleOptions.map((option) => option.value)) {
      const tokens = createAppearanceTheme({ ...base, surfaceStyle, headingStyle: 'modern' }).tokens ?? {}
      expect(tokens['--color-background-body'], `palette ${surfaceStyle} background`).toBeDefined()
      expect(tokens['--color-text-primary'], `palette ${surfaceStyle} text`).toBeDefined()
    }
  })

  it('gives each non-warm palette distinct background and text colors', () => {
    const seen = surfaceStyleOptions
      .filter((option) => option.value !== 'warm')
      .map((option) => {
        const tokens = createAppearanceTheme({ ...base, surfaceStyle: option.value, headingStyle: 'modern' }).tokens ?? {}
        return JSON.stringify([tokens['--color-background-body'], tokens['--color-text-primary']])
      })
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('sets a heading and body family for every typography pairing', () => {
    for (const option of headingStyleOptions) {
      const fonts = fontsFor(option.value)
      expect(fonts.heading, `heading family for ${option.value}`).toBeTruthy()
      expect(fonts.body, `body family for ${option.value}`).toBeTruthy()
    }
  })

  it('uses the expected primary face for each typography pairing', () => {
    expect(fontsFor('editorial').heading).toContain('Georgia')
    expect(fontsFor('modern').heading).toContain('ui-sans-serif')
    expect(fontsFor('grotesk').heading).toContain('Helvetica Neue')
    expect(fontsFor('humanist').heading).toContain('Optima')
    expect(fontsFor('rounded').heading).toContain('ui-rounded')
    expect(fontsFor('ledger').heading).toContain('ui-monospace')
  })

  it('gives each typography pairing a distinct font pairing', () => {
    const pairings = headingStyleOptions.map((option) => {
      const fonts = fontsFor(option.value)
      return `${fonts.heading}|${fonts.body}`
    })
    expect(new Set(pairings).size).toBe(pairings.length)
  })

  it('varies the theme name so each combination is distinguishable', () => {
    const seen = new Set<string>()
    for (const surfaceStyle of surfaceStyleOptions.map((option) => option.value)) {
      for (const headingStyle of headingStyleOptions.map((option) => option.value)) {
        seen.add(createAppearanceTheme({ ...base, surfaceStyle, headingStyle }).name)
      }
    }
    expect(seen.size).toBe(surfaceStyleOptions.length * headingStyleOptions.length)
  })

  it('keeps crisp corners square while rounded corners stay rounded', () => {
    const crisp = createAppearanceTheme({ ...base, surfaceStyle: 'warm', headingStyle: 'modern', cornerStyle: 'crisp' })
    const rounded = createAppearanceTheme({ ...base, surfaceStyle: 'warm', headingStyle: 'modern', cornerStyle: 'rounded' })
    expect(crisp.localTokens?.['--radius-md']).toBe('var(--radius-none)')
    expect(rounded.localTokens?.['--radius-md']).toBe('var(--spacing-4)')
  })
})

// Compile-time guard: the option lists and the theme builder must agree.
const _surface: SurfaceStyle = 'paper'
const _heading: HeadingStyle = 'ledger'
void _surface
void _heading
