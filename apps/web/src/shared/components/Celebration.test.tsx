import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPreferences, useSettingsStore } from '../state/settings-store'
import { Celebration, announceExpenseSaved } from './Celebration'

describe('Celebration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useSettingsStore.setState(defaultPreferences)
  })

  afterEach(() => {
    cleanup()
    window.localStorage.clear()
    useSettingsStore.setState(defaultPreferences)
  })

  it('shows a cheer after an expense is saved', () => {
    render(<Celebration />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    act(() => announceExpenseSaved())
    expect(screen.getByRole('status')).toHaveTextContent(/Logged\. Nicely done\.|That one is on the record\.|Saved for your future self\./)
  })

  it('stays silent when celebrations are turned off', () => {
    useSettingsStore.setState({ ...defaultPreferences, celebrateOnSave: false })
    render(<Celebration />)

    act(() => announceExpenseSaved())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('drops the cheer message when the tone is off', () => {
    useSettingsStore.setState({ ...defaultPreferences, cheerTone: 'off' })
    const { container } = render(<Celebration />)

    act(() => announceExpenseSaved())
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // The burst still plays, so the save is still acknowledged.
    expect(container.querySelector('.celebration-burst')).toBeInTheDocument()
  })

  it('shows nothing at all when the tone is off and motion is disabled', () => {
    useSettingsStore.setState({ ...defaultPreferences, cheerTone: 'off', playfulMotion: false })
    const { container } = render(<Celebration />)

    act(() => announceExpenseSaved())
    expect(container.querySelector('.celebration')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('skips the burst when motion effects are disabled', () => {
    useSettingsStore.setState({ ...defaultPreferences, playfulMotion: false })
    const { container } = render(<Celebration />)

    act(() => announceExpenseSaved())
    expect(container.querySelector('.celebration-burst')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toBeVisible()
  })

  it('clears the cheer message on its own', () => {
    vi.useFakeTimers()
    try {
      render(<Celebration />)
      act(() => announceExpenseSaved())
      expect(screen.getByRole('status')).toBeVisible()

      act(() => { vi.advanceTimersByTime(2800) })
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
