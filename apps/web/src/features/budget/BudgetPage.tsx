import { useEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useFieldArray, useForm, type FieldPath } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { createSampleSnapshot, type BudgetPeriod, type Category, type DateOnly } from '@kinsen/budget-domain'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'
import { formatDate, localToday } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { newId } from '../../shared/format/id'
import { Button } from '@astryxdesign/core/Button'
import { Spinner } from '@astryxdesign/core/Spinner'
import { AstryxColorField, AstryxDateField, AstryxNumberField, AstryxSelectField, AstryxTextField } from '../../shared/components/AstryxFields'
import { Icon } from '../../shared/components/Icon'
import { LoadErrorState, PageHeader } from '../../shared/components/Primitives'
import { Grid } from '@astryxdesign/core/Grid'
import { Stack } from '@astryxdesign/core/Stack'
import { FormWizard } from '../../shared/components/FormWizard'
import { useBudgetStore } from '../../shared/state/budget-store'
import { ConfirmationDialog } from '../../shared/components/ConfirmationDialog'

const dateSchema = z.string().refine((value) => {
  try { parseDateOnly(value); return true } catch { return false }
}, 'Enter a valid calendar date.')

const positiveAmountSchema = z.number().int('Use whole rupiah only.').safe('Amount is too large.').positive('Budget must be greater than zero.')
const nonNegativeAmountSchema = z.number().int('Use whole rupiah only.').safe('Amount is too large.').min(0, 'Amount cannot be negative.')

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, 'Name each category.').max(40, 'Keep category names under 40 characters.'),
  mode: z.enum(['DAILY', 'PERIOD', 'SCHEDULED']),
  bucket: z.enum(['FLEXIBLE', 'PLANNED']),
  allocation: nonNegativeAmountSchema,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a valid category color.'),
  defaultCadence: z.union([z.enum(['WEEKLY', 'MONTHLY']), z.literal('')]).optional(),
})

type BudgetAllocations = {
  totalAmount: number
  reserveAmount: number
  flexibleAllocation: number
  plannedAllocation: number
}

type CategoryAllocations = {
  categories: Array<z.infer<typeof categorySchema>>
  flexibleAllocation: number
  plannedAllocation: number
}

function validateBudgetTotal(value: BudgetAllocations, context: z.RefinementCtx, errorField: 'totalAmount' | 'flexibleAllocation') {
  if (value.totalAmount !== value.reserveAmount + value.flexibleAllocation + value.plannedAllocation) {
    context.addIssue({ code: 'custom', path: [errorField], message: 'Total budget must equal reserve + flexible + planned allocations.' })
  }
}

function validatePeriodDates(value: { startDate: string; endDate: string }, context: z.RefinementCtx) {
  if (value.endDate < value.startDate) context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date must be on or after the start date.' })
}

function validateCategoryAllocations(value: CategoryAllocations, context: z.RefinementCtx) {
  const totals = { FLEXIBLE: 0, PLANNED: 0 }
  value.categories.forEach((category, index) => {
    totals[category.bucket] += category.allocation
    if (category.mode === 'DAILY' && category.bucket !== 'FLEXIBLE') context.addIssue({ code: 'custom', path: ['categories', index, 'bucket'], message: 'Daily categories belong in the flexible bucket.' })
    if (category.mode === 'SCHEDULED' && category.bucket !== 'PLANNED') context.addIssue({ code: 'custom', path: ['categories', index, 'bucket'], message: 'Scheduled categories belong in the planned bucket.' })
    if (category.mode !== 'SCHEDULED' && category.defaultCadence) context.addIssue({ code: 'custom', path: ['categories', index, 'defaultCadence'], message: 'Only scheduled categories can have a repeat default.' })
  })
  if (totals.FLEXIBLE !== value.flexibleAllocation) context.addIssue({ code: 'custom', path: ['flexibleAllocation'], message: `Flexible category allocations total ${formatIdr(totals.FLEXIBLE)}.` })
  if (totals.PLANNED !== value.plannedAllocation) context.addIssue({ code: 'custom', path: ['plannedAllocation'], message: `Planned category allocations total ${formatIdr(totals.PLANNED)}.` })
}

const periodStepSchema = z.object({
  totalAmount: positiveAmountSchema,
  reserveAmount: nonNegativeAmountSchema,
  startDate: dateSchema,
  endDate: dateSchema,
}).superRefine(validatePeriodDates)

const allocationFields = {
  totalAmount: positiveAmountSchema,
  reserveAmount: nonNegativeAmountSchema,
  flexibleAllocation: nonNegativeAmountSchema,
  plannedAllocation: nonNegativeAmountSchema,
}

const allocationStepSchema = z.object(allocationFields).superRefine((value, context) => validateBudgetTotal(value, context, 'flexibleAllocation'))

const categoryStepSchema = z.object({
  categories: z.array(categorySchema).min(1, 'Add at least one category.'),
  flexibleAllocation: nonNegativeAmountSchema,
  plannedAllocation: nonNegativeAmountSchema,
}).superRefine(validateCategoryAllocations)

const budgetSchema = z.object({
  ...allocationFields,
  startDate: dateSchema,
  endDate: dateSchema,
  categories: z.array(categorySchema).min(1, 'Add at least one category.'),
}).superRefine((value, context) => {
  validateBudgetTotal(value, context, 'totalAmount')
  validatePeriodDates(value, context)
  validateCategoryAllocations(value, context)
})

type BudgetFormValues = z.infer<typeof budgetSchema>

const palette = ['#E9A23B', '#5D8AA8', '#9B7EBD', '#6C9A8B', '#D17B88', '#D6A756', '#547C66']

function categoryFromForm(value: BudgetFormValues['categories'][number]): Category {
  const { defaultCadence, ...category } = value
  return { ...category, ...(defaultCadence ? { defaultCadence } : {}) }
}

function initialValues(period: BudgetPeriod, categories: Category[]): BudgetFormValues {
  return {
    totalAmount: period.totalAmount,
    reserveAmount: period.reserveAmount,
    flexibleAllocation: period.flexibleAllocation,
    plannedAllocation: period.plannedAllocation,
    startDate: period.startDate,
    endDate: period.endDate,
    categories: categories.map((category) => ({ ...category, defaultCadence: category.defaultCadence ?? '' })),
  }
}

export function BudgetPage() {
  const status = useBudgetStore((state) => state.status)
  const initialize = useBudgetStore((state) => state.initialize)
  const snapshot = useBudgetStore((state) => state.snapshot)
  const runMutation = useBudgetStore((state) => state.runMutation)
  const saving = useBudgetStore((state) => state.saving)
  const navigate = useNavigate()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [categoryToRemove, setCategoryToRemove] = useState<{ index: number; name: string } | null>(null)
  const fallback = useMemo(() => createSampleSnapshot(localToday()), [])
  const currentPeriod = snapshot?.period ?? fallback.period!
  const currentCategories = snapshot?.categories.length ? snapshot.categories : fallback.categories
  const { control, handleSubmit, reset, setValue, watch, getValues, setError, clearErrors, formState: { errors } } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetSchema),
    defaultValues: initialValues(currentPeriod, currentCategories),
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'categories', keyName: 'fieldKey' })
  const values = watch()
  const referenceIds = useMemo(() => new Set([
    ...(snapshot?.transactions.map((transaction) => transaction.categoryId) ?? []),
    ...(snapshot?.plannedExpenses.map((expense) => expense.categoryId) ?? []),
  ]), [snapshot])

  useEffect(() => {
    if (!snapshot?.period) return
    reset(initialValues(snapshot.period, snapshot.categories))
  }, [snapshot, reset])
  function validateBudgetStep(stepIndex: number, fields: readonly string[]): boolean {
    const form = getValues()
    const stepValues = stepIndex === 0
      ? { totalAmount: form.totalAmount, reserveAmount: form.reserveAmount, startDate: form.startDate, endDate: form.endDate }
      : stepIndex === 1
        ? { totalAmount: form.totalAmount, reserveAmount: form.reserveAmount, flexibleAllocation: form.flexibleAllocation, plannedAllocation: form.plannedAllocation }
        : { categories: form.categories, flexibleAllocation: form.flexibleAllocation, plannedAllocation: form.plannedAllocation }
    const schema = stepIndex === 0 ? periodStepSchema : stepIndex === 1 ? allocationStepSchema : categoryStepSchema
    clearErrors(fields as FieldPath<BudgetFormValues>[])
    const result = schema.safeParse(stepValues)
    if (result.success) return true
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') as FieldPath<BudgetFormValues>
      if (path) setError(path, { type: 'validate', message: issue.message })
    }
    return false
  }

  const onSubmit = handleSubmit(async (form) => {
    setSubmitError(null)
    const nextPeriod: BudgetPeriod = {
      id: snapshot?.period?.id ?? newId('budget'),
      totalAmount: form.totalAmount,
      reserveAmount: form.reserveAmount,
      flexibleAllocation: form.flexibleAllocation,
      plannedAllocation: form.plannedAllocation,
      startDate: form.startDate as DateOnly,
      endDate: form.endDate as DateOnly,
      isSample: false,
    }
    try {
      await runMutation((useCases) => useCases.saveBudget(nextPeriod, form.categories.map(categoryFromForm)))
      navigate('/')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Budget could not be saved.')
    }
  })

  if (status === 'loading') return <Spinner className="loading-state" label="Loading your budget" size="md" />
  if (status === 'error' || !snapshot) return <LoadErrorState onRetry={() => void initialize()} />
  const dateRange = `${formatDate(currentPeriod.startDate)} — ${formatDate(currentPeriod.endDate)}`
  const categoryErrors = [
    errors.flexibleAllocation?.message,
    errors.plannedAllocation?.message,
    ...fields.flatMap((_, index) => {
      const item = errors.categories?.[index]
      const message = item?.name?.message ?? item?.allocation?.message ?? item?.bucket?.message ?? item?.mode?.message ?? item?.defaultCadence?.message
      return message ? [message] : []
    }),
  ].filter((message): message is string => typeof message === 'string')
  return (
    <main className="budget-page">
      <PageHeader eyebrow="YOUR PLAN" title="Budget settings" description={snapshot?.period?.isSample ? 'A starter plan is ready. Shape it around the money you actually have.' : `Set the limits that keep this period safe. Current period: ${dateRange}.`} />
      {snapshot?.period?.isSample && <aside className="sample-note"><span className="sample-note-mark" aria-hidden="true">i</span><p><strong>Starter budget</strong> — these amounts are examples. Save your own plan to make it yours.</p></aside>}
      <FormWizard
        className="budget-form"
        steps={[
          {
            label: 'Period',
            fields: ['totalAmount', 'reserveAmount', 'startDate', 'endDate'],
            content: <section className="form-section" aria-labelledby="budget-period-title">
              <Stack className="section-title-row" direction="vertical" gap={1}>
                <p className="eyebrow">01 / PERIOD</p>
                <h2 id="budget-period-title">Set your budget period</h2>
                <p>Use local calendar dates. Both the start and end day are included.</p>
              </Stack>
              <Grid className="budget-form-grid" columns={{ minWidth: 220, max: 2 }} gap={3}>
                <AstryxNumberField control={control} name="totalAmount" label="Total budget" prefix="Rp" min={1} className="field" />
                <AstryxNumberField control={control} name="reserveAmount" label="Protected reserve" prefix="Rp" min={0} description="Held back from daily spending." className="field" />
                <AstryxDateField control={control} name="startDate" label="Start date" className="field" />
                <AstryxDateField control={control} name="endDate" label="End date" className="field" />
              </Grid>
            </section>,
          },
          {
            label: 'Allocations',
            fields: ['totalAmount', 'reserveAmount', 'flexibleAllocation', 'plannedAllocation'],
            content: <section className="form-section" aria-labelledby="budget-allocations-title">
              <Stack className="section-title-row" direction="vertical" gap={1}>
                <p className="eyebrow">02 / ALLOCATIONS</p>
                <h2 id="budget-allocations-title">Give every rupiah a place</h2>
                <p>Flexible and planned amounts plus your reserve must add up to the total.</p>
              </Stack>
              <Grid className="allocation-grid" columns={{ minWidth: 220, max: 2 }} gap={3}>
                <AstryxNumberField control={control} name="flexibleAllocation" label="Flexible allocation" prefix="Rp" min={0} description="Day-to-day and period spending." className="field" />
                <AstryxNumberField control={control} name="plannedAllocation" label="Planned allocation" prefix="Rp" min={0} description="Bills and future commitments." className="field" />
              </Grid>
              <Grid className="allocation-equation" columns={{ minWidth: 120, max: 4 }} gap={2} role="status">
                <Stack className="allocation-equation-item" direction="vertical" gap={1}><span>Protected reserve</span><strong>{formatIdr(Number(values.reserveAmount) || 0)}</strong></Stack>
                <Stack className="allocation-equation-item" direction="vertical" gap={1}><span>Flexible</span><strong>{formatIdr(Number(values.flexibleAllocation) || 0)}</strong></Stack>
                <Stack className="allocation-equation-item" direction="vertical" gap={1}><span>Planned</span><strong>{formatIdr(Number(values.plannedAllocation) || 0)}</strong></Stack>
                <Stack className="allocation-equation-item allocation-equation-total" direction="vertical" gap={1}><span>Budget total</span><strong>{formatIdr(Number(values.totalAmount) || 0)}</strong></Stack>
              </Grid>
              <Stack className="budget-save-bar" direction="vertical" gap={1}>
                <strong>Keep reserve protected</strong>
                <span>Safe to spend recalculates from actuals and commitments.</span>
              </Stack>
            </section>,
          },
          {
            label: 'Categories',
            fields: ['categories', 'flexibleAllocation', 'plannedAllocation'],
            content: <section className="form-section" aria-labelledby="budget-categories-title">
              <Stack className="section-title-row" direction="horizontal" align="end" justify="between" gap={3}>
                <Stack direction="vertical" gap={1}>
                  <p className="eyebrow">03 / CATEGORIES</p>
                  <h2 id="budget-categories-title">Plan your buckets</h2>
                  <p>Category amounts must add up to their bucket. Daily categories are flexible; scheduled categories are planned.</p>
                </Stack>
                <Button className="button button-secondary" label="Add category" variant="secondary" type="button" icon={<Icon name="plus" size={17} />} onClick={() => append({ id: newId('category'), name: '', mode: 'PERIOD', bucket: 'FLEXIBLE', allocation: 0, color: palette[fields.length % palette.length] ?? '#6C9A8B' })} />
              </Stack>
              <Grid className="category-editor-list" columns={{ minWidth: 320, max: 2 }} gap={3}>
                {fields.map((field, index) => {
                  const used = referenceIds.has(field.id)
                  return (
                    <article className="category-editor" key={field.fieldKey}>
                      <Stack className="category-editor-top" direction="horizontal" align="center" gap={2}>
                        <span className="category-color-chip" style={{ backgroundColor: values.categories?.[index]?.color ?? field.color }} />
                        <AstryxTextField control={control} name={`categories.${index}.name`} label="Category name" isLabelHidden maxLength={40} className="field category-name-field" />
                        <Button className="icon-button danger-icon" label={`Remove ${values.categories?.[index]?.name || 'category'}`} isIconOnly icon={<Icon name="trash" size={17} />} variant="destructive" type="button" isDisabled={used || fields.length === 1} tooltip={used ? 'This category has saved activity and cannot be removed.' : 'Remove category'} onClick={() => setCategoryToRemove({ index, name: values.categories?.[index]?.name || 'category' })} />
                      </Stack>
                      <Grid className="category-settings-grid" columns={{ minWidth: 160, max: 2 }} gap={2}>
                        <AstryxSelectField control={control} name={`categories.${index}.mode`} label="Mode" options={[{ value: 'DAILY', label: 'Daily' }, { value: 'PERIOD', label: 'Period' }, { value: 'SCHEDULED', label: 'Scheduled' }]} onValueChange={(value) => { if (value === 'DAILY') setValue(`categories.${index}.bucket`, 'FLEXIBLE'); if (value === 'SCHEDULED') setValue(`categories.${index}.bucket`, 'PLANNED'); if (value !== 'SCHEDULED') setValue(`categories.${index}.defaultCadence`, '') }} className="field" />
                        <AstryxSelectField control={control} name={`categories.${index}.bucket`} label="Bucket" options={[{ value: 'FLEXIBLE', label: 'Flexible' }, { value: 'PLANNED', label: 'Planned' }]} className="field" />
                        <AstryxNumberField control={control} name={`categories.${index}.allocation`} label="Allocation" prefix="Rp" min={0} className="field" />
                        <AstryxColorField control={control} name={`categories.${index}.color`} label="Color" className="field" />
                        {values.categories?.[index]?.mode === 'SCHEDULED' && <AstryxSelectField control={control} name={`categories.${index}.defaultCadence`} label="Default repeat" options={[{ value: '', label: 'No default' }, { value: 'WEEKLY', label: 'Weekly' }, { value: 'MONTHLY', label: 'Monthly' }]} className="field default-cadence-field" />}
                      </Grid>
                    </article>
                  )
                })}
              </Grid>
              {categoryErrors.length > 0 && <p className="form-error" role="alert">{categoryErrors.join(' ')}</p>}
              {submitError && <p className="form-error" role="alert">{submitError}</p>}
            </section>,
          },
        ]}
        validateStep={validateBudgetStep}
        onSubmit={onSubmit}
        submitLabel="Save budget"
        isSaving={saving}
      />
      <ConfirmationDialog
        open={categoryToRemove !== null}
        title={categoryToRemove ? `Remove “${categoryToRemove.name}”?` : 'Remove category?'}
        description="This removes the category from the budget form. Adjust category allocations to match the budget before saving."
        confirmLabel="Remove category"
        onClose={() => setCategoryToRemove(null)}
        onConfirm={() => {
          if (!categoryToRemove) return
          remove(categoryToRemove.index)
          setCategoryToRemove(null)
        }}
      />
    </main>
  )
}
