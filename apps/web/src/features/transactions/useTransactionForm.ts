import { useLayoutEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useToast } from '@astryxdesign/core/Toast'
import type { DateOnly, Transaction } from '@kinsen/budget-domain'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'
import { newId } from '../../shared/format/id'
import { announceExpenseSaved } from '../../shared/components/Celebration'
import { useBudgetStore } from '../../shared/state/budget-store'
import { useAssetStore } from '../../shared/state/asset-store'
import { celebrationShowsFeedback, useSettingsStore } from '../../shared/state/settings-store'

export const transactionSchema = z.object({
  description: z.string().trim().min(1, 'Add a short description.').max(100, 'Keep the description under 100 characters.'),
  categoryId: z.string().min(1, 'Choose a category.'),
  amount: z.number().int('Use whole rupiah only.').safe('Amount is too large.').positive('Amount must be greater than zero.'),
  date: z.string().refine((value) => {
    try { parseDateOnly(value); return true } catch { return false }
  }, 'Enter a valid calendar date.'),
  commitmentKey: z.string().optional(),
  paidFromAssetId: z.string(),
})

export type TransactionFormValues = z.infer<typeof transactionSchema>
const TRANSACTION_FORM_FIELDS = [
  { name: 'description', label: 'Description' },
  { name: 'amount', label: 'Amount' },
  { name: 'categoryId', label: 'Category' },
  { name: 'date', label: 'Date' },
  { name: 'commitmentKey', label: 'Commitment' },
  { name: 'paidFromAssetId', label: 'Paid from' },
] as const

export type TransactionFormProps = {
  open: boolean
  initial?: Transaction | null
  initialDate?: DateOnly
  linkedOccurrence?: { plannedExpenseId: string; dueDate: DateOnly } | null
  onClose: () => void
}

export function useTransactionForm({ open, initial = null, initialDate, linkedOccurrence = null, onClose }: TransactionFormProps) {
  const snapshot = useBudgetStore((state) => state.snapshot)
  const overview = useBudgetStore((state) => state.overview)
  const runMutation = useBudgetStore((state) => state.runMutation)
  const toast = useToast()
  const saving = useBudgetStore((state) => state.saving)
  const assetData = useAssetStore((state) => state.data)
  const assetStatus = useAssetStore((state) => state.status)
  const initializeAssets = useAssetStore((state) => state.initialize)
  const linkedAssetEntry = initial ? assetData.assetEntries.find((entry) => entry.budgetTransactionId === initial.id && entry.kind === 'DEBIT') : undefined
  const paidFromAssets = assetData.assets.filter((asset) => asset.balanceMode === 'LEDGER' && (!asset.archivedAt || asset.id === linkedAssetEntry?.assetId))
  const paidFromAssetId = linkedAssetEntry?.assetId ?? ''
  useLayoutEffect(() => {
    if (open && assetStatus === 'idle') void initializeAssets()
  }, [open, assetStatus, initializeAssets])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [validationAttempt, setValidationAttempt] = useState(0)
  const period = snapshot?.period
  const occurrences = overview?.occurrences ?? []
  const today = overview?.today ?? period?.startDate ?? ''
  const matchingOccurrence = linkedOccurrence ? occurrences.find((item) => item.plannedExpenseId === linkedOccurrence.plannedExpenseId && item.dueDate === linkedOccurrence.dueDate) : undefined
  const defaultValues: TransactionFormValues = {
    description: initial?.description ?? '',
    categoryId: initial?.categoryId ?? matchingOccurrence?.categoryId ?? snapshot?.categories[0]?.id ?? '',
    amount: initial?.amount ?? matchingOccurrence?.outstandingAmount ?? 0,
    date: initial?.date ?? initialDate ?? today,
    commitmentKey: initial?.plannedExpenseId && initial.plannedOccurrenceDate
      ? `${initial.plannedExpenseId}|${initial.plannedOccurrenceDate}`
      : matchingOccurrence ? `${matchingOccurrence.plannedExpenseId}|${matchingOccurrence.dueDate}` : '',
    paidFromAssetId,
  }
  const { control, handleSubmit, reset, setValue, formState: { errors, isDirty } } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues,
    mode: 'onBlur',
    reValidateMode: 'onChange',
    shouldFocusError: false,
  })

  useLayoutEffect(() => {
    if (!open) return
    setSubmitError(null)
    setValidationAttempt(0)
    reset(defaultValues)
  }, [open, initial, initialDate, linkedOccurrence?.plannedExpenseId, linkedOccurrence?.dueDate, paidFromAssetId, reset])

  const validationIssues = TRANSACTION_FORM_FIELDS.flatMap(({ name, label }) => {
    const message = errors[name]?.message
    return typeof message === 'string' ? [{ name, label, message }] : []
  })

  const eligibleOccurrences = occurrences.filter((item) => item.outstandingAmount > 0 || (initial?.plannedExpenseId === item.plannedExpenseId && initial.plannedOccurrenceDate === item.dueDate))
  const categories = snapshot?.categories ?? []

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    setValidationAttempt(0)
    if (!period) return
    const [plannedExpenseId, plannedOccurrenceDate] = values.commitmentKey ? values.commitmentKey.split('|') : []
    const transaction: Transaction = {
      id: initial?.id ?? newId('transaction'),
      description: values.description.trim(),
      categoryId: values.categoryId,
      amount: values.amount,
      date: values.date,
      ...(plannedExpenseId && plannedOccurrenceDate ? { plannedExpenseId, plannedOccurrenceDate } : {}),
    }
    try {
      await runMutation((useCases) => useCases.saveTransaction(transaction, values.paidFromAssetId || null))
      if (linkedAssetEntry || values.paidFromAssetId) void useAssetStore.getState().refresh().catch(() => undefined)
      if (!initial) {
        // The celebration replaces the toast whenever it will actually be visible.
        if (!celebrationShowsFeedback(useSettingsStore.getState())) toast({ body: 'Expense added', uniqueID: 'expense-added' })
        announceExpenseSaved()
      }
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Expense could not be saved.')
    }
  }, () => {
    setSubmitError(null)
    setValidationAttempt((attempt) => attempt + 1)
  })

  return {
    control, setValue, onSubmit, validationIssues, validationAttempt, submitError, saving, assetStatus, isDirty,
    initial, period, today, categories, eligibleOccurrences, paidFromAssets,
    title: initial ? 'Edit expense' : 'Add expense',
    submitLabel: assetStatus === 'loading' && initial ? 'Loading accounts…' : 'Save expense',
    isSubmitDisabled: Boolean(initial && assetStatus !== 'ready'),
    linkedOccurrenceChanged: (value: string) => {
      const occurrence = eligibleOccurrences.find((item) => `${item.plannedExpenseId}|${item.dueDate}` === value)
      if (occurrence) setValue('categoryId', occurrence.categoryId, { shouldValidate: true })
    },
  }
}
