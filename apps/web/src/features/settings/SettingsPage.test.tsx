import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
