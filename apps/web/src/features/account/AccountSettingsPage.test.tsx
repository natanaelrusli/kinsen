import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBudgetStore } from '../../shared/state/budget-store'
import { AccountSettingsPage } from './AccountSettingsPage'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ signOut: vi.fn() }),
}))

describe('AccountSettingsPage', () => {
  beforeEach(() => useBudgetStore.setState({ syncStatus: 'ACCOUNT_MISMATCH' }))
  afterEach(() => {
    cleanup()
    useBudgetStore.setState({ syncStatus: 'LOCAL' })
  })

  it('blocks reset when the API budget belongs to another Clerk account', () => {
    render(<MemoryRouter><AccountSettingsPage /></MemoryRouter>)

    const resetButton = screen.getByRole('button', { name: 'Reset all data' })
    expect(screen.getByRole('alert')).toHaveTextContent('linked to a different Clerk account')
    expect(resetButton).toBeDisabled()

    fireEvent.click(resetButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('allows reset after sync confirms API ownership', () => {
    useBudgetStore.setState({ syncStatus: 'SYNCED' })
    render(<MemoryRouter><AccountSettingsPage /></MemoryRouter>)

    const resetButton = screen.getByRole('button', { name: 'Reset all data' })
    expect(resetButton).toBeEnabled()
    expect(screen.getByText(/assets, liabilities and PLN Token Tracker readings are stored only on this device/)).toBeInTheDocument()

    fireEvent.click(resetButton)
    expect(screen.getByRole('dialog', { name: 'Reset all account data?' })).toBeInTheDocument()
    expect(screen.getByText(/assets, liabilities, and PLN Token Tracker readings saved on this device/)).toBeInTheDocument()
  })
})
