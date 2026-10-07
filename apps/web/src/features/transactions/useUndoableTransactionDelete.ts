import { useEffect, useRef, useState } from 'react'
import type { Transaction } from '@kinsen/budget-domain'
import type { BudgetUseCases } from '../../application/use-cases/budget-use-cases'
import { useAssetStore } from '../../shared/state/asset-store'

type RunMutation = (operation: (useCases: BudgetUseCases) => Promise<void>) => Promise<void>
const undoDurationMs = 10_000

export function useUndoableTransactionDelete(runMutation: RunMutation) {
  const [undoTransaction, setUndoTransaction] = useState<Transaction | null>(null)
  const [undoPaidFromAssetId, setUndoPaidFromAssetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const timeout = useRef<number | null>(null)
  const initializeAssets = useAssetStore((state) => state.initialize)

  useEffect(() => () => { window.clearTimeout(timeout.current ?? undefined) }, [])

  async function deleteTransaction(transaction: Transaction) {
    if (deleting || undoTransaction) return
    setDeleting(true)
    setError(null)
    setMessage(null)
    try {
      await initializeAssets()
      const assetState = useAssetStore.getState()
      if (assetState.status !== 'ready') throw new Error(assetState.error ?? 'The linked cash account could not be loaded.')
      const paidFromAssetId = assetState.data.assetEntries.find((entry) => entry.budgetTransactionId === transaction.id && entry.kind === 'DEBIT')?.assetId ?? null
      await runMutation((useCases) => useCases.deleteTransaction(transaction.id))
      setUndoTransaction(transaction)
      setUndoPaidFromAssetId(paidFromAssetId)
      if (paidFromAssetId) void useAssetStore.getState().refresh().catch(() => undefined)
      setMessage(`Deleted “${transaction.description}”. Undo is available for 10 seconds.`)
      timeout.current = window.setTimeout(() => {
        setUndoTransaction(null)
        setUndoPaidFromAssetId(null)
        setMessage(null)
        timeout.current = null
      }, undoDurationMs)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Expense could not be deleted.')
    } finally {
      setDeleting(false)
    }
  }

  async function undoDelete() {
    const transaction = undoTransaction
    if (!transaction || deleting) return
    setDeleting(true)
    setError(null)
    try {
      await runMutation((useCases) => undoPaidFromAssetId
        ? useCases.saveTransaction(transaction, undoPaidFromAssetId)
        : useCases.saveTransaction(transaction))
      setUndoTransaction(null)
      if (undoPaidFromAssetId) void useAssetStore.getState().refresh().catch(() => undefined)
      setUndoPaidFromAssetId(null)
      window.clearTimeout(timeout.current ?? undefined)
      timeout.current = null
      setMessage(`Restored “${transaction.description}”.`)
      timeout.current = window.setTimeout(() => {
        setMessage(null)
        timeout.current = null
      }, 4_000)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Expense could not be restored.')
    } finally {
      setDeleting(false)
    }
  }

  return { undoTransaction, deleting, error, message, deleteTransaction, undoDelete }
}
