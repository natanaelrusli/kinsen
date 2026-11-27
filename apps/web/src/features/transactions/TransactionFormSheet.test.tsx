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
import { useIsMobile } from '../../shared/hooks/use-is-mobile'

vi.mock('../../shared/hooks/use-is-mobile', () => ({ useIsMobile: vi.fn(() => true) }))

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

describe('TransactionForm on mobile', () => {
  it('renders the bottom sheet and saves with a tapped category and Yesterday shortcut', async () => {
    expect(useIsMobile()).toBe(true)
    const user = userEvent.setup()
    render(<TransactionForm open onClose={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Description' }), 'Kopi')
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '25000')
    const category = screen.getAllByRole('radio', { name: /./ }).find((el) => el.closest('[aria-label="Category"]'))!
    await user.click(category)
    await user.click(screen.getByRole('radio', { name: 'Yesterday' }))
    await user.click(screen.getByRole('button', { name: 'Save expense' }))

    await waitFor(() => expect(saveTransactionCalls).toHaveLength(1))
    const { transaction } = saveTransactionCalls[0]!
    expect(transaction).toMatchObject({ description: 'Kopi', amount: 25_000, date: '2026-10-07' })
  })
})
