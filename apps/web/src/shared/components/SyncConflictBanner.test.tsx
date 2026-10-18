import userEvent from '@testing-library/user-event'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SyncStatus } from '../../infrastructure/repositories/api-budget-repository'
import { SyncConflictBanner } from './SyncConflictBanner'

const { getSyncConflict, resolveSyncConflict, refresh, state } = vi.hoisted(() => ({
  getSyncConflict: vi.fn(),
  resolveSyncConflict: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined),
  state: { syncStatus: 'NEEDS_DECISION' as SyncStatus },
}))

vi.mock('../../infrastructure/repositories/api-budget-repository', () => ({
  budgetRepository: { getSyncConflict, resolveSyncConflict },
}))

vi.mock('../state/budget-store', () => ({
  useBudgetStore: (selector: (value: { syncStatus: SyncStatus; refresh: typeof refresh }) => unknown) =>
    selector({ syncStatus: state.syncStatus, refresh }),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.syncStatus = 'NEEDS_DECISION'
})

describe('SyncConflictBanner', () => {
  it('stays hidden unless a sync conflict needs the user decision', () => {
    state.syncStatus = 'SYNCED'
    render(<SyncConflictBanner />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(getSyncConflict).not.toHaveBeenCalled()
  })

  it('explains that the local copy is sample data and offers both choices', async () => {
    getSyncConflict.mockResolvedValue({ localIsSample: true, explanation: 'This device has the sample budget, and the server already has a different budget.' })
    render(<SyncConflictBanner />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Sync needs your decision')
    expect(alert).toHaveTextContent('sample budget')
    expect(screen.getByRole('button', { name: 'Keep server copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: "Use this device's copy" })).toBeInTheDocument()
  })

  it('shows the repository explanation of what differs between the two copies', async () => {
    getSyncConflict.mockResolvedValue({ localIsSample: false, explanation: 'This device and the server have different budgets: budget period, transactions (device 2, server 3).' })
    render(<SyncConflictBanner />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('budget period, transactions (device 2, server 3).')
  })

  it('keeps the server copy without a confirmation step', async () => {
    getSyncConflict.mockResolvedValue({ localIsSample: false, explanation: 'This device and the server have different budgets.' })
    resolveSyncConflict.mockResolvedValue(undefined)
    render(<SyncConflictBanner />)

    await userEvent.click(await screen.findByRole('button', { name: 'Keep server copy' }))

    await waitFor(() => expect(resolveSyncConflict).toHaveBeenCalledWith('SERVER'))
    expect(refresh).toHaveBeenCalled()
  })

  it("replaces the server budget with this device's copy only after an explicit confirmation", async () => {
    getSyncConflict.mockResolvedValue({ localIsSample: false, explanation: 'This device and the server have different budgets.' })
    resolveSyncConflict.mockResolvedValue(undefined)
    render(<SyncConflictBanner />)

    await userEvent.click(await screen.findByRole('button', { name: "Use this device's copy" }))
    expect(resolveSyncConflict).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Replace the server budget?')

    await userEvent.click(screen.getByRole('button', { name: 'Replace server budget' }))
    await waitFor(() => expect(resolveSyncConflict).toHaveBeenCalledWith('DEVICE'))
  })

  it('shows the failure and keeps both choices available', async () => {
    getSyncConflict.mockResolvedValue({ localIsSample: true, explanation: 'This device has the sample budget, and the server already has a different budget.' })
    resolveSyncConflict.mockRejectedValue(new Error('Account data changed in another session.'))
    render(<SyncConflictBanner />)

    await userEvent.click(await screen.findByRole('button', { name: 'Keep server copy' }))

    expect(await screen.findByText('Account data changed in another session.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep server copy' })).toBeEnabled()
  })
})
