import { defineTheme, type DefinedTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral'
import type { AppPreferences, ThemeColor } from './state/settings-store'
import { lucideThemeIcons } from './components/Icon'

type AccentPalette = {
  light: string
  dark: string
  card: string
  soft: [string, string]
  highlight: string
  highlightText: [string, string]
}

const accents: Record<ThemeColor, AccentPalette> = {
  evergreen: { light: '#245443', dark: '#a9cfb9', card: '#193e32', soft: ['#e5ede7', '#2c4035'], highlight: '#d7eb83', highlightText: ['#94ac46', '#bfd779'] },
  ocean: { light: '#326781', dark: '#a2cede', card: '#204658', soft: ['#e6eff3', '#293f49'], highlight: '#b8e1e8', highlightText: ['#4187a0', '#a2cede'] },
  lilac: { light: '#725582', dark: '#d2b9e2', card: '#4e3a5c', soft: ['#efe9f3', '#403448'], highlight: '#d9c5e8', highlightText: ['#906aa7', '#d2b9e2'] },
  terracotta: { light: '#95553c', dark: '#e9b79f', card: '#613b2d', soft: ['#f4e9e2', '#49372f'], highlight: '#eeb99e', highlightText: ['#aa6345', '#e9b79f'] },
  marigold: { light: '#746115', dark: '#e5d181', card: '#4c410f', soft: ['#f3efd9', '#403b29'], highlight: '#ecd46b', highlightText: ['#9a811d', '#e5d181'] },
  rose: { light: '#98465e', dark: '#efb0c3', card: '#642b3d', soft: ['#f6e6ec', '#49303b'], highlight: '#f3bfd0', highlightText: ['#a04462', '#efb0c3'] },
  slate: { light: '#4b6072', dark: '#bacddd', card: '#2d3f4f', soft: ['#e8edf2', '#303e49'], highlight: '#c7d8e6', highlightText: ['#536d83', '#bacddd'] },
  indigo: { light: '#5359a0', dark: '#bcc1fa', card: '#343869', soft: ['#eaebf7', '#34364c'], highlight: '#cbd0fa', highlightText: ['#6269b2', '#bcc1fa'] },
}

function createKinsenTheme(name: ThemeColor): DefinedTheme {
  const accent = accents[name]

  return defineTheme({
    name: `kinsen-${name}`,
    extends: neutralTheme,
    color: { accent: [accent.light, accent.dark], neutralStyle: 'warm' },
    icons: lucideThemeIcons,
    tokens: {
      '--color-accent': [accent.light, accent.dark],
      '--color-accent-muted': accent.soft,
      '--color-on-accent': ['#fffefa', '#18201d'],
      '--color-text-accent': [accent.light, accent.dark],
      '--color-icon-accent': [accent.light, accent.dark],
      '--color-background-body': ['#f5f4ee', '#181f1b'],
      '--color-background-surface': ['#fffefa', '#222b25'],
      '--color-background-card': ['#fffefa', '#222b25'],
      '--color-background-popover': ['#fffefa', '#28322c'],
      '--color-background-muted': ['#f9f8f2', '#28322c'],
      '--color-text-primary': ['#1d322a', '#e8eee7'],
      '--color-text-secondary': ['#607067', '#aab9ad'],
      '--color-text-disabled': ['#7e8981', '#98a69a'],
      '--color-icon-primary': 'var(--color-text-primary)',
      '--color-icon-secondary': 'var(--color-text-secondary)',
      '--color-border': ['#e5e5dc', '#39453d'],
      '--color-border-emphasized': ['#d6d8ce', '#536258'],
      '--color-track': ['#e5e5dc', '#39453d'],
      '--color-overlay': ['rgba(24, 35, 28, .4)', 'rgba(0, 0, 0, .6)'],
      '--color-overlay-hover': ['rgba(29, 50, 42, .04)', 'rgba(232, 238, 231, .06)'],
      '--color-overlay-pressed': ['rgba(29, 50, 42, .08)', 'rgba(232, 238, 231, .1)'],
      '--color-shadow': ['rgba(28, 52, 41, .06)', 'rgba(0, 0, 0, .24)'],
      '--color-error': ['#a64f3e', '#e9a18d'],
      '--color-error-muted': ['#f6e8e3', '#432e28'],
      '--color-on-error': ['#fffefa', '#241814'],
      '--color-text-red': ['#944638', '#efb4a3'],
      '--color-icon-red': ['#a64f3e', '#e9a18d'],
      '--color-background-red': ['#f6e8e3', '#432e28'],
      '--color-border-red': ['#ebd3ca', '#765246'],
      '--color-text-yellow': ['#805a20', '#e5c282'],
      '--color-background-yellow': ['#fbf1dd', '#403729'],
      '--color-border-yellow': ['#eadfbf', '#706145'],
      '--color-icon-yellow': ['#d3ad55', '#e5c282'],
      '--color-success': ['#55705d', '#b5ce9c'],
      '--color-success-muted': ['#f3f7e3', '#303d29'],
      '--color-on-success': ['#fffefa', '#18201d'],
      '--color-text-green': ['#465b35', '#c4d9b2'],
      '--color-background-green': ['#f3f7e3', '#303d29'],
      '--color-border-green': ['#dce7c3', '#526449'],
    },
    localTokens: {
      '--color-text-strong': ['#142d24', '#f0f4ed'],
      '--color-background-highlight': ['#eeefe5', '#2b352d'],
      '--color-accent-card': accent.card,
      '--color-accent-highlight': accent.highlight,
      '--color-text-highlight': accent.highlightText,
      '--color-text-inverse': '#fbfff4',
      '--color-text-inverse-secondary': '#d5e2c9',
      '--color-text-inverse-muted': '#c6d3c6',
      '--color-border-inverse': 'rgba(236, 243, 228, .2)',
      '--color-overlay-inverse': 'rgba(255, 255, 255, .1)',
      '--color-background-success-emphasis': ['#e6edc9', '#3f5034'],
      '--color-background-danger-subtle': ['#fffaf7', '#302721'],
      '--color-sidebar-surface': ['#f3f2ef', '#1e2621'],
      '--color-sidebar-divider': ['#dfddd7', '#39453d'],
      '--color-sidebar-text': ['#292824', '#e8eee7'],
      '--color-sidebar-muted': 'var(--color-text-secondary)',
      '--color-sidebar-hover': ['#ebeae6', '#2d3830'],
      '--color-sidebar-selected': ['#ebeae6', '#344138'],
      '--color-sidebar-selected-hover': accent.soft,
      '--color-sidebar-accent-muted-hover': accent.soft,
      '--color-sidebar-note': ['rgba(255, 255, 255, .62)', '#28322c'],
      '--color-sidebar-accent': [accent.light, accent.dark],
      '--color-sidebar-accent-muted': accent.soft,
      '--color-swatch-evergreen': accents.evergreen.light,
      '--color-swatch-ocean': accents.ocean.light,
      '--color-swatch-lilac': accents.lilac.light,
      '--color-swatch-terracotta': accents.terracotta.light,
      '--color-swatch-marigold': accents.marigold.light,
      '--color-swatch-rose': accents.rose.light,
      '--color-swatch-slate': accents.slate.light,
      '--color-swatch-indigo': accents.indigo.light,
    },
  })
}

export const kinsenThemes: Record<ThemeColor, DefinedTheme> = {
  evergreen: createKinsenTheme('evergreen'),
  ocean: createKinsenTheme('ocean'),
  lilac: createKinsenTheme('lilac'),
  terracotta: createKinsenTheme('terracotta'),
  marigold: createKinsenTheme('marigold'),
  rose: createKinsenTheme('rose'),
  slate: createKinsenTheme('slate'),
  indigo: createKinsenTheme('indigo'),
}

const surfacePalettes = {
  cool: {
    body: ['#f1f4f8', '#171d26'],
    surface: ['#ffffff', '#222b37'],
    muted: ['#e9eef5', '#2c3644'],
    text: ['#243247', '#e7edf6'],
    secondary: ['#5c6d82', '#b0bfd2'],
    border: ['#dce3ed', '#3d4a5e'],
  },
  neutral: {
    body: ['#f4f4f4', '#1b1b1b'],
    surface: ['#ffffff', '#272727'],
    muted: ['#ededed', '#323232'],
    text: ['#292929', '#eeeeee'],
    secondary: ['#666666', '#b8b8b8'],
    border: ['#dedede', '#454545'],
  },
} satisfies Record<string, Record<string, [string, string]>>

export function createAppearanceTheme({ themeColor, surfaceStyle, cornerStyle, headingStyle }: Pick<AppPreferences, 'themeColor' | 'surfaceStyle' | 'cornerStyle' | 'headingStyle'>): DefinedTheme {
  const base = kinsenThemes[themeColor]
  const surface = surfaceStyle === 'warm' ? null : surfacePalettes[surfaceStyle]
  return defineTheme({
    name: `${base.name}-${surfaceStyle}-${cornerStyle}-${headingStyle}`,
    extends: base,
    radius: { base: 4, multiplier: cornerStyle === 'crisp' ? 0 : 1 },
    typography: {
      heading: headingStyle === 'editorial'
        ? { family: 'Georgia', fallbacks: '"Times New Roman", serif' }
        : { family: 'ui-sans-serif', fallbacks: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    },
    tokens: surface ? {
      '--color-background-body': surface.body,
      '--color-background-surface': surface.surface,
      '--color-background-card': surface.surface,
      '--color-background-popover': surface.surface,
      '--color-background-muted': surface.muted,
      '--color-text-primary': surface.text,
      '--color-text-secondary': surface.secondary,
      '--color-text-disabled': surface.secondary,
      '--color-border': surface.border,
      '--color-border-emphasized': surface.secondary,
      '--color-track': surface.border,
    } : {},
    localTokens: {
      '--radius-sm': cornerStyle === 'crisp' ? 'var(--radius-none)' : 'var(--radius-container)',
      '--radius-md': cornerStyle === 'crisp' ? 'var(--radius-none)' : 'var(--spacing-4)',
      '--radius-lg': cornerStyle === 'crisp' ? 'var(--radius-none)' : 'var(--spacing-6)',
      ...(surface ? {
        '--color-text-strong': surface.text,
        '--color-background-highlight': surface.muted,
        '--color-sidebar-surface': surface.body,
        '--color-sidebar-divider': surface.border,
        '--color-sidebar-text': surface.text,
        '--color-sidebar-muted': surface.secondary,
        '--color-sidebar-hover': surface.muted,
        '--color-sidebar-selected': surface.muted,
        '--color-sidebar-note': surface.surface,
      } : {}),
    },
  })
}
