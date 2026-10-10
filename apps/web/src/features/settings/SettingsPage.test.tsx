import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultPreferences, useSettingsStore } from '../../shared/state/settings-store'
import { SettingsPage } from './SettingsPage'

function renderSettingsPage() {
  return render(<MemoryRouter><SettingsPage /></MemoryRouter>)
}

describe('SettingsPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useSettingsStore.setState(defaultPreferences)
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    useSettingsStore.setState(defaultPreferences)
    window.history.replaceState(null, '', '/')
  })

  it('saves appearance and calendar preferences as the controls change', () => {
    renderSettingsPage()

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Ocean' }))
    fireEvent.click(screen.getByRole('button', { name: 'Layout & motion' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Compact layout' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Motion effects' }))
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    const weekStartsOn = screen.getByRole('combobox', { name: 'Week starts on' })
    fireEvent.click(weekStartsOn)
    fireEvent.click(screen.getByRole('option', { name: 'Monday' }))

    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Ocean' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Layout & motion' }))
    expect(screen.getByRole('switch', { name: 'Compact layout' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Motion effects' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    expect(screen.getByRole('combobox', { name: 'Week starts on' })).toHaveTextContent('Monday')
    expect(JSON.parse(window.localStorage.getItem('kinsen-preferences') ?? 'null')).toMatchObject({
      colorMode: 'dark',
      themeColor: 'ocean',
      weekStartsOn: 'monday',
      layoutDensity: 'compact',
      playfulMotion: false,
    })
  })

  it('keeps the fun appearance controls inside the Appearance category', () => {
    renderSettingsPage()

    fireEvent.click(screen.getByRole('radio', { name: /Compact · Rp 1,3 jt/ }))
    fireEvent.click(screen.getByRole('button', { name: /Notebook grid/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Celebrate saved expenses' }))

    const cheerTone = screen.getByRole('combobox', { name: 'Cheerful messages' })
    fireEvent.click(cheerTone)
    fireEvent.click(screen.getByRole('option', { name: 'Playful' }))

    expect(screen.getByRole('radio', { name: /Compact · Rp 1,3 jt/ })).toBeChecked()
    expect(screen.getByRole('button', { name: /Notebook grid/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('switch', { name: 'Celebrate saved expenses' })).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Cheerful messages' })).toHaveTextContent('Playful')
    expect(JSON.parse(window.localStorage.getItem('kinsen-preferences') ?? 'null')).toMatchObject({
      moneyStyle: 'compact',
      backdropStyle: 'grid',
      celebrateOnSave: false,
      cheerTone: 'playful',
    })
  })

  it('does not offer a separate fun category', () => {
    renderSettingsPage()

    expect(screen.queryByRole('button', { name: 'Fun stuff' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Appearance' })).toBeVisible()
  })

  it('applies a surface palette and typography pairing chosen from the visual pickers', () => {
    renderSettingsPage()

    fireEvent.click(screen.getByRole('radio', { name: /Sand · toasty beige/ }))
    fireEvent.click(screen.getByRole('radio', { name: /Ledger · monospaced/ }))

    expect(screen.getByRole('radio', { name: /Sand · toasty beige/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Editorial · serif/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Ledger · monospaced/ })).toBeChecked()
    expect(JSON.parse(window.localStorage.getItem('kinsen-preferences') ?? 'null')).toMatchObject({
      surfaceStyle: 'sand',
      headingStyle: 'ledger',
    })
  })

  it('offers every surface palette and typography pairing', () => {
    renderSettingsPage()

    const palettes = screen.getByRole('radiogroup', { name: 'Surface palette' })
    for (const label of ['Warm · soft ivory', 'Cool · blue gray', 'Neutral · clean gray', 'Sand · toasty beige', 'Mint · soft green', 'Dusk · twilight violet', 'Paper · crisp white']) {
      expect(within(palettes).getByRole('radio', { name: label }), label).toBeVisible()
    }

    const fonts = screen.getByRole('radiogroup', { name: 'Heading style' })
    for (const label of ['Editorial · serif', 'Modern · sans serif', 'Grotesk · tight & plain', 'Humanist · warm & open', 'Rounded · soft & friendly', 'Ledger · monospaced']) {
      expect(within(fonts).getByRole('radio', { name: label }), label).toBeVisible()
    }
  })

  it('offers every accent color and marks exactly one as selected', () => {
    renderSettingsPage()

    const accents = screen.getByRole('radiogroup', { name: 'Accent color' })
    for (const label of ['Evergreen', 'Ocean', 'Lilac', 'Terracotta', 'Marigold', 'Rose', 'Slate', 'Indigo']) {
      expect(within(accents).getByRole('radio', { name: label }), label).toBeVisible()
    }
    expect(within(accents).getAllByRole('radio').filter((option) => option.getAttribute('aria-checked') === 'true')).toHaveLength(1)

    fireEvent.click(within(accents).getByRole('radio', { name: 'Ocean' }))
    expect(within(accents).getByRole('radio', { name: 'Ocean' })).toBeChecked()
    expect(within(accents).getByRole('radio', { name: 'Evergreen' })).not.toBeChecked()
  })

  it('reflects the current appearance choices in the live preview', () => {
    renderSettingsPage()

    const preview = screen.getByText('Live preview').closest('.settings-preview-card')!
    expect(preview).toHaveTextContent('Evergreen')
    expect(preview).toHaveTextContent('Warm · soft ivory')

    fireEvent.click(screen.getByRole('radio', { name: 'Dusk · twilight violet' }))
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Accent color' })).getByRole('radio', { name: 'Indigo' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))

    expect(preview).toHaveTextContent('Indigo')
    expect(preview).toHaveTextContent('Dusk · twilight violet')
    expect(preview).toHaveTextContent('Dark')
  })

  it('keeps the visual pickers reachable by keyboard', () => {    renderSettingsPage()

    const dusk = screen.getByRole('radio', { name: /Dusk · twilight violet/ })
    dusk.focus()
    expect(dusk).toHaveFocus()
    // The swatches are real buttons, so a click (and Enter/Space) activates them directly.
    fireEvent.click(dusk)
    expect(dusk).toBeChecked()
  })

  it('opens a linked category and restores it with browser back without losing preferences', async () => {
    window.history.replaceState(null, '', '/settings?section=calendar')
    render(<BrowserRouter><SettingsPage /></BrowserRouter>)
    expect(screen.getByRole('combobox', { name: 'Week starts on' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(window.location.search).toBe('?section=dashboard')
    fireEvent.click(screen.getByRole('switch', { name: 'Recent activity' }))
    window.history.back()

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Calendar', level: 2 })).toBeVisible())
    expect(window.location.search).toBe('?section=calendar')
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }))
    expect(screen.getByRole('switch', { name: 'Recent activity' })).not.toBeChecked()
  })
})
