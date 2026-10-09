import { useLayoutEffect, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@astryxdesign/core/Button'
import { useToast } from '@astryxdesign/core/Toast'
import { Grid } from '@astryxdesign/core/Grid'
import { Stack } from '@astryxdesign/core/Stack'
import type { DateOnly, Transaction } from '@kinsen/budget-domain'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'
import { formatDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { newId } from '../../shared/format/id'
import { FormDialog } from '../../shared/components/FormDialog'
import { AstryxDateField, CurrencyAmountField, AstryxSelectField, AstryxTextField } from '../../shared/components/AstryxFields'
import { useBudgetStore } from '../../shared/state/budget-store'
import { useAssetStore } from '../../shared/state/asset-store'

const transactionSchema = z.object({
  description: z.string().trim().min(1, 'Add a short description.').max(100, 'Keep the description under 100 characters.'),
  categoryId: z.string().min(1, 'Choose a category.'),
  amount: z.number().int('Use whole rupiah only.').safe('Amount is too large.').positive('Amount must be greater than zero.'),
  date: z.string().refine((value) => {
    try { parseDateOnly(value); return true } catch { return false }
  }, 'Enter a valid calendar date.'),
  commitmentKey: z.string().optional(),
  paidFromAssetId: z.string(),
})

type TransactionFormValues = z.infer<typeof transactionSchema>
const TRANSACTION_FORM_FIELDS = [
  { name: 'description', label: 'Description' },
  { name: 'amount', label: 'Amount' },
  { name: 'categoryId', label: 'Category' },
  { name: 'date', label: 'Date' },
  { name: 'commitmentKey', label: 'Commitment' },
  { name: 'paidFromAssetId', label: 'Paid from' },
] as const

type TransactionFormProps = {
  open: boolean
  initial?: Transaction | null
  initialDate?: DateOnly
  linkedOccurrence?: { plannedExpenseId: string; dueDate: DateOnly } | null
  onClose: () => void
}

export function TransactionForm({ open, initial = null, initialDate, linkedOccurrence = null, onClose }: TransactionFormProps) {
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
  const errorSummaryRef = useRef<HTMLElement | null>(null)
  const formRef = useRef<HTMLFormElement | null>(null)
  const pendingValidationFocusRef = useRef(false)
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
  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm<TransactionFormValues>({
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
    pendingValidationFocusRef.current = false
    reset(defaultValues)
    if (formRef.current) formRef.current.scrollTop = 0
    if (typeof window.requestAnimationFrame !== 'function') return
    const frame = window.requestAnimationFrame(() => {
      if (formRef.current) formRef.current.scrollTop = 0
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, initial, initialDate, linkedOccurrence?.plannedExpenseId, linkedOccurrence?.dueDate, paidFromAssetId, reset])

  const validationIssues = TRANSACTION_FORM_FIELDS.flatMap(({ name, label }) => {
    const message = errors[name]?.message
    return typeof message === 'string' ? [{ name, label, message }] : []
  })
  useLayoutEffect(() => {
    if (!pendingValidationFocusRef.current || validationIssues.length === 0) return
    pendingValidationFocusRef.current = false
    errorSummaryRef.current?.focus()
  }, [validationAttempt, validationIssues.length])

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
      if (!initial) toast({ body: 'Expense added', uniqueID: 'expense-added' })
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Expense could not be saved.')
    }
  }, () => {
    pendingValidationFocusRef.current = true
    setSubmitError(null)
    setValidationAttempt((attempt) => attempt + 1)
  })

  return (
    <FormDialog open={open} title={initial ? 'Edit expense' : 'Add expense'} description="Actual spending updates your safe-to-spend amount right away." onClose={onClose}>
      <form ref={formRef} className="form-stack transaction-form" onSubmit={onSubmit} noValidate>
        {validationAttempt > 0 && validationIssues.length > 0 && (
          <section
            ref={errorSummaryRef}
            className="form-error"
            role="alert"
            aria-labelledby="transaction-error-summary-title"
            tabIndex={-1}
          >
            <strong id="transaction-error-summary-title">Review these fields</strong>
            <p>{validationIssues.length === 1 ? 'There is 1 field to check.' : `There are ${validationIssues.length} fields to check.`} Review the field messages below.</p>
            <ul>
              {validationIssues.map((issue) => (
                <li key={issue.name}><strong>{issue.label}:</strong> {issue.message}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="form-section" aria-labelledby="transaction-details-title">
          <CurrencyAmountField control={control} name="amount" label="Amount" prefix={<span aria-hidden="true">Rp</span>} description="Whole rupiah only." className="field transaction-amount-control" />
          <Stack className="section-title-row transaction-details-heading" direction="vertical" gap={1}>
            <h2 id="transaction-details-title">Expense details</h2>
            <p>Add a description, category, and date.</p>
          </Stack>
          <Stack direction="vertical" gap={3}>
            <AstryxTextField control={control} name="description" label="Description" autoComplete="off" maxLength={100} className="field" />
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              <AstryxSelectField
                control={control}
                name="categoryId"
                label="Category"
                placeholder="Choose category"
                options={categories.map((category) => ({ value: category.id, label: category.name }))}
                className="field"
              />
              <AstryxDateField control={control} name="date" label="Date" min={period?.startDate} max={period?.endDate} className="field" />
            </Grid>
          </Stack>
        </section>

        <section className="form-section" aria-labelledby="transaction-links-title">
          <Stack className="section-title-row" direction="vertical" gap={1}>
            <h2 id="transaction-links-title">Optional links</h2>
            <p>Connect this expense to a planned bill or a tracked cash account if needed.</p>
          </Stack>
          <Stack direction="vertical" gap={3}>
            <AstryxSelectField
              control={control}
              name="commitmentKey"
              label="Link to a commitment"
              isOptional
              placeholder="Not linked"
              description="Linking an expense pays down that commitment; the expense is never counted twice."
              options={[
                { value: '', label: 'Not linked' },
                ...eligibleOccurrences.map((occurrence) => ({
                  value: `${occurrence.plannedExpenseId}|${occurrence.dueDate}`,
                  label: `${occurrence.name} · ${formatDate(occurrence.dueDate, { day: 'numeric', month: 'short' })} · ${formatIdr(occurrence.outstandingAmount)} left`,
                })),
              ]}
              onValueChange={(value) => {
                const occurrence = eligibleOccurrences.find((item) => `${item.plannedExpenseId}|${item.dueDate}` === value)
                if (occurrence) setValue('categoryId', occurrence.categoryId, { shouldValidate: true })
              }}
              className="field"
            />
            <AstryxSelectField
              control={control}
              name="paidFromAssetId"
              label="Paid from"
              isOptional
              description="A linked expense reduces this cash account once; it does not change how Safe to Spend is calculated."
              options={[
                { value: '', label: 'Not linked to a tracked account' },
                ...paidFromAssets.map((asset) => ({ value: asset.id, label: `${asset.name} · ${asset.institution}${asset.archivedAt ? ' (archived)' : ''}` })),
              ]}
              className="field"
            />
            {assetStatus === 'error' && <p className="field-error" role="alert">{initial ? 'Tracked accounts could not be loaded. Reopen after storage is available to preserve any existing Paid from link.' : 'Tracked accounts could not be loaded. You can still save this expense without a Paid from link.'}</p>}
          </Stack>
        </section>

        {submitError && <p className="form-error" role="alert">{submitError}</p>}

        <footer className="form-actions">
          <Button label="Cancel" type="button" variant="ghost" className="button button-outline" onClick={onClose} isDisabled={saving} />
          <Button
            label={saving ? 'Saving…' : assetStatus === 'loading' && initial ? 'Loading accounts…' : 'Save expense'}
            type="submit"
            variant="primary"
            className="button button-primary"
            isDisabled={saving || Boolean(initial && assetStatus !== 'ready')}
            isLoading={saving}
          />
        </footer>
      </form>
    </FormDialog>
  )
}

