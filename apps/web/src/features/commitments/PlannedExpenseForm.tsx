import { useLayoutEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, type FieldPath } from 'react-hook-form'
import { z } from 'zod'
import type { PlannedExpense } from '@kinsen/budget-domain'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'
import { newId } from '../../shared/format/id'
import { FormWizardDialog } from '../../shared/components/FormWizard'
import { Grid } from '@astryxdesign/core/Grid'
import { AstryxDateField, AstryxNumberField, AstryxSelectField, AstryxTextField } from '../../shared/components/AstryxFields'
import { useBudgetStore } from '../../shared/state/budget-store'

const plannedExpenseSchema = z.object({
  name: z.string().trim().min(1, 'Name this commitment.').max(80, 'Keep the name under 80 characters.'),
  amount: z.number().int('Use whole rupiah only.').safe('Amount is too large.').positive('Amount must be greater than zero.'),
  categoryId: z.string().min(1, 'Choose a category.'),
  dueDate: z.string().refine((value) => {
    try { parseDateOnly(value); return true } catch { return false }
  }, 'Enter a valid calendar date.'),
  cadence: z.enum(['ONCE', 'WEEKLY', 'MONTHLY']),
  endDate: z.string().optional(),
})

type PlannedExpenseFormValues = z.infer<typeof plannedExpenseSchema>

type PlannedExpenseFormProps = {
  open: boolean
  initial?: PlannedExpense | null
  onClose: () => void
}

export function PlannedExpenseForm({ open, initial = null, onClose }: PlannedExpenseFormProps) {
  const snapshot = useBudgetStore((state) => state.snapshot)
  const runMutation = useBudgetStore((state) => state.runMutation)
  const saving = useBudgetStore((state) => state.saving)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const period = snapshot?.period
  const eligibleCategories = (snapshot?.categories ?? []).filter((category) => category.mode !== 'DAILY').sort((left, right) => Number(right.mode === 'SCHEDULED') - Number(left.mode === 'SCHEDULED'))
  const defaultValues: PlannedExpenseFormValues = {
    name: initial?.name ?? '',
    amount: initial?.amount ?? 0,
    categoryId: initial?.categoryId ?? eligibleCategories[0]?.id ?? '',
    dueDate: initial?.dueDate ?? period?.startDate ?? '',
    cadence: initial?.cadence ?? 'ONCE',
    endDate: initial?.endDate ?? period?.endDate ?? '',
  }
  const { control, handleSubmit, reset, watch, trigger } = useForm<PlannedExpenseFormValues>({
    resolver: zodResolver(plannedExpenseSchema),
    defaultValues,
  })
  const cadence = watch('cadence')

  useLayoutEffect(() => {
    if (!open) return
    setSubmitError(null)
    reset(defaultValues)
  }, [open, initial, reset])

  const onSubmit = handleSubmit(async (values) => {
    const expense: PlannedExpense = {
      id: initial?.id ?? newId('commitment'),
      name: values.name.trim(),
      amount: values.amount,
      categoryId: values.categoryId,
      dueDate: values.dueDate,
      cadence: values.cadence === 'ONCE' ? null : values.cadence,
      ...(values.cadence !== 'ONCE' && values.endDate ? { endDate: values.endDate } : {}),
    }
    try {
      await runMutation((useCases) => useCases.savePlannedExpense(expense))
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Commitment could not be saved.')
    }
  })

  return (
    <FormWizardDialog open={open} title={initial ? 'Edit commitment' : 'Plan a commitment'} description="Keep future bills and irregular expenses visible before they are due." onClose={onClose}
      steps={[
        {
          label: 'Details',
          fields: ['name', 'amount', 'categoryId'],
          content: <>
            <AstryxTextField control={control} name="name" label="Name" autoComplete="off" maxLength={80} className="field" />
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              <AstryxNumberField control={control} name="amount" label="Amount" prefix={<span>Rp</span>} min={1} className="field" />
              <AstryxSelectField
                control={control}
                name="categoryId"
                label="Category"
                placeholder="Choose category"
                options={eligibleCategories.map((category) => ({ value: category.id, label: `${category.name}${category.mode === 'SCHEDULED' ? ' · scheduled' : ''}` }))}
                className="field"
              />
            </Grid>
          </>,
        },
        {
          label: 'Schedule',
          fields: ['dueDate', 'cadence', 'endDate'],
          content: <>
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              <AstryxDateField control={control} name="dueDate" label="Due date" min={period?.startDate} max={period?.endDate} className="field" />
              <AstryxSelectField
                control={control}
                name="cadence"
                label="Repeats"
                options={[
                  { value: 'ONCE', label: 'Does not repeat' },
                  { value: 'WEEKLY', label: 'Weekly' },
                  { value: 'MONTHLY', label: 'Monthly' },
                ]}
                className="field"
              />
            </Grid>
            {cadence !== 'ONCE' && <AstryxDateField
              control={control}
              name="endDate"
              label="Repeat until"
              isOptional
              min={watch('dueDate') || period?.startDate}
              max={period?.endDate}
              description="Recurring commitments need a scheduled category. Monthly dates that do not exist fall on the last day of that month."
              className="field"
            />}
            {submitError && <p className="form-error" role="alert">{submitError}</p>}
          </>,
        },
      ]}
      validateStep={(_, fields) => trigger(fields as FieldPath<PlannedExpenseFormValues>[])}
      onSubmit={onSubmit}
      submitLabel="Save commitment"
      isSaving={saving}
    />
  )
}
