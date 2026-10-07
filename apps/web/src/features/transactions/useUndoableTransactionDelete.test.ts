import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetData, Transaction } from '@kinsen/budget-domain'
import type { BudgetUseCases } from '../../application/use-cases/budget-use-cases'
import { useAssetStore } from '../../shared/state/asset-store'
import { useUndoableTransactionDelete } from './useUndoableTransactionDelete'

const transaction: Transaction = {
  id: 'expense-1',
  description: 'Weekly groceries',
  categoryId: 'food',
  amount: 425_000,
  date: '2026-10-06',
}
const emptyAssetData: AssetData = { assets: [], assetEntries: [], valuations: [], liabilities: [], liabilityEntries: [] }

describe('useUndoableTransactionDelete', () => {
  beforeEach(() => { useAssetStore.setState({ status: 'ready', data: emptyAssetData, error: null }) })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    useAssetStore.setState({ status: 'idle', data: emptyAssetData, error: null })
  })

  it('restores the exact transaction when undo is activated', async () => {
    const deleteTransaction = vi.fn(async () => {})
    const saveTransaction = vi.fn(async () => {})
    const useCases = { deleteTransaction, saveTransaction } as unknown as BudgetUseCases
    const runMutation = vi.fn(async (operation: (useCases: BudgetUseCases) => Promise<void>) => operation(useCases))
    const { result } = renderHook(() => useUndoableTransactionDelete(runMutation))

    await act(async () => { await result.current.deleteTransaction(transaction) })
    expect(deleteTransaction).toHaveBeenCalledWith(transaction.id)
    expect(result.current.undoTransaction).toEqual(transaction)
    expect(result.current.message).toContain('Undo is available for 10 seconds')

    await act(async () => { await result.current.undoDelete() })
    expect(saveTransaction).toHaveBeenCalledWith(transaction)
    expect(result.current.undoTransaction).toBeNull()
    expect(result.current.message).toBe('Restored “Weekly groceries”.')
  })
  it('restores the paid-from account link together with an expense', async () => {
    useAssetStore.setState({ status: 'ready', data: {
      assets: [{ id: 'cash-account', name: 'Daily cash', type: 'BANK_ACCOUNT', institution: 'Bank', nativeCurrency: 'IDR', balanceMode: 'LEDGER', createdAt: '2026-01-01' }],
      assetEntries: [{ id: 'debit-1', assetId: 'cash-account', date: transaction.date, kind: 'DEBIT', amountMinor: transaction.amount, budgetTransactionId: transaction.id }],
      valuations: [],
      liabilities: [],
      liabilityEntries: [],
    } })
    const deleteTransaction = vi.fn(async () => {})
    const saveTransaction = vi.fn(async () => {})
    const useCases = { deleteTransaction, saveTransaction } as unknown as BudgetUseCases
    const runMutation = vi.fn(async (operation: (useCases: BudgetUseCases) => Promise<void>) => operation(useCases))
    const { result } = renderHook(() => useUndoableTransactionDelete(runMutation))

    await act(async () => { await result.current.deleteTransaction(transaction) })
    await act(async () => { await result.current.undoDelete() })

    expect(saveTransaction).toHaveBeenCalledWith(transaction, 'cash-account')
  })

  it('expires the undo action after ten seconds', async () => {
    vi.useFakeTimers()
    const useCases = {
      deleteTransaction: vi.fn(async () => {}),
      saveTransaction: vi.fn(async () => {}),
    } as unknown as BudgetUseCases
    const runMutation = vi.fn(async (operation: (useCases: BudgetUseCases) => Promise<void>) => operation(useCases))
    const { result } = renderHook(() => useUndoableTransactionDelete(runMutation))

    await act(async () => { await result.current.deleteTransaction(transaction) })
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(result.current.undoTransaction).toBeNull()
    expect(result.current.message).toBeNull()
  })
})
