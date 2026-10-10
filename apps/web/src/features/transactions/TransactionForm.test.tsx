import userEvent from '@testing-library/user-event'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

// The real toast renders into an async fallback root, so assert on the call instead.
const toastCalls: Array<{ body?: string; uniqueID?: string }> = []
vi.mock('@astryxdesign/core/Toast', () => ({
  useToast: () => (options: { body?: string; uniqueID?: string }) => { toastCalls.push(options) },
}))
import { calculateOverview, createSampleSnapshot } from '@kinsen/budget-domain'
import type { DateOnly, Transaction } from '@kinsen/budget-domain'
import type { BudgetUseCases } from '../../application/use-cases/budget-use-cases'
import { useAssetStore } from '../../shared/state/asset-store'
import { useBudgetStore } from '../../shared/state/budget-store'
import { defaultPreferences, useSettingsStore } from '../../shared/state/settings-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionForm } from './TransactionForm'

const today = '2026-10-08' as DateOnly
const originalTransaction: Transaction = {
  id: 'transaction-rent',
  description: 'Rent payment',
  categoryId: 'home',
  amount: 750_000,
  date: today,
  plannedExpenseId: 'rent',
  plannedOccurrenceDate: '2026-10-01' as DateOnly,
}

const saveTransactionCalls: Array<{ transaction: Transaction; paidFromAssetId: string | null | undefined }> = []

async function saveTransaction(transaction: Transaction, paidFromAssetId?: string | null) {
  saveTransactionCalls.push({ transaction, paidFromAssetId })
}

beforeEach(() => {
  const snapshot = createSampleSnapshot(today)
  snapshot.transactions.push(originalTransaction)
  saveTransactionCalls.length = 0
  toastCalls.length = 0
  const runMutation = vi.fn(async (operation: (useCases: BudgetUseCases) => Promise<void>) =>
    operation({ saveTransaction } as unknown as BudgetUseCases))
  useBudgetStore.setState({
    status: 'ready',
    snapshot,
    overview: calculateOverview(snapshot, today),
    runMutation,
  })
  useAssetStore.setState({
    status: 'ready',
    data: { assets: [], assetEntries: [], valuations: [], liabilities: [], liabilityEntries: [] },
  })
})

afterEach(() => {
  cleanup()
  useBudgetStore.setState(useBudgetStore.getInitialState(), true)
  useAssetStore.setState(useAssetStore.getInitialState(), true)
  useSettingsStore.setState(defaultPreferences)
})

describe('TransactionForm behavior', () => {
  it('allows pointer and keyboard unlinking without changing the transaction', async () => {
    const user = userEvent.setup()
    render(<TransactionForm open initial={originalTransaction} onClose={vi.fn()} />)
    const commitment = screen.getByRole('combobox', { name: /^Link to a commitment/ })

    commitment.focus()
    await user.keyboard('{Enter}{Home}{Enter}')
    expect(commitment).toHaveTextContent('Not linked')

    await user.click(commitment)
    await user.click(screen.getByRole('option', { name: /Rent/ }))
    expect(commitment).toHaveTextContent('Rent')

    await user.click(commitment)
    await user.click(screen.getByRole('option', { name: 'Not linked' }))
    expect(commitment).toHaveTextContent('Not linked')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(saveTransactionCalls).toHaveLength(1))
    expect(saveTransactionCalls).toEqual([{
      transaction: {
        id: originalTransaction.id,
        description: originalTransaction.description,
        categoryId: originalTransaction.categoryId,
        amount: originalTransaction.amount,
        date: originalTransaction.date,
      },
      paidFromAssetId: null,
    }])
  })
  it('announces the save for the celebration instead of showing the toast when a celebration will be visible', async () => {
    const user = userEvent.setup()
    const saved = vi.fn()
    window.addEventListener('kinsen:expense-saved', saved)
    render(<TransactionForm open onClose={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Kopi')
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '25000')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(saveTransactionCalls).toHaveLength(1))
    expect(saved).toHaveBeenCalledTimes(1)
    expect(toastCalls).toEqual([])
    window.removeEventListener('kinsen:expense-saved', saved)
  })

  it('falls back to the toast when the celebration would be silent', async () => {
    useSettingsStore.setState({ ...defaultPreferences, cheerTone: 'off', playfulMotion: false })
    const user = userEvent.setup()
    render(<TransactionForm open onClose={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Kopi')
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '25000')
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(saveTransactionCalls).toHaveLength(1))
    // The event still fires so the celebration stays in sync; the toast covers the silent case.
    expect(toastCalls).toEqual([{ body: 'Expense added', uniqueID: 'expense-added' }])
  })

  it.each([
    { value: '-500', error: 'Amount must be greater than zero.' },
    { value: '0.5', error: 'Use whole rupiah only.' },
    { value: '0', error: 'Amount must be greater than zero.' },
  ])('keeps invalid amount $value visible and blocks saving', async ({ value, error }) => {
    const user = userEvent.setup()
    render(<TransactionForm open initial={originalTransaction} onClose={vi.fn()} />)
    const amount = screen.getByRole('textbox', { name: 'Amount' })

    await user.clear(amount)
    await user.type(amount, value)
    await user.tab()
    expect(amount).toHaveValue(value)
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(screen.getAllByText(error).length).toBeGreaterThan(0))
    expect(amount).toHaveValue(value)
    expect(saveTransactionCalls).toHaveLength(0)
  })
})
