import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
  })

  it('saves appearance and calendar preferences as the controls change', () => {
    renderSettingsPage()

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Ocean' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Compact layout' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Motion effects' }))
    const weekStartsOn = screen.getByRole('combobox', { name: 'Week starts on' })
    fireEvent.click(weekStartsOn)
    fireEvent.click(screen.getByRole('option', { name: 'Monday' }))

    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Ocean' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Compact layout' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Motion effects' })).not.toBeChecked()
    expect(screen.getByRole('combobox', { name: 'Week starts on' })).toHaveTextContent('Monday')
    expect(JSON.parse(window.localStorage.getItem('kinsen-preferences') ?? 'null')).toMatchObject({
      colorMode: 'dark',
      themeColor: 'ocean',
      weekStartsOn: 'monday',
      layoutDensity: 'compact',
      playfulMotion: false,
    })
  })
})
