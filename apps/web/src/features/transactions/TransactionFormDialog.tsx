import { Grid } from '@astryxdesign/core/Grid'
import { DialogForm, DialogFormSection } from '../../shared/components/DialogForm'
import { AstryxDateField, CurrencyAmountField, AstryxSelectField, AstryxTextField } from '../../shared/components/AstryxFields'
import { formatDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { useTransactionForm, type TransactionFormProps } from './useTransactionForm'

export function TransactionFormDialog(props: TransactionFormProps) {
  const { open, onClose } = props
  const {
    control, onSubmit, validationIssues, validationAttempt, submitError, saving, assetStatus, initial, period,
    categories, eligibleOccurrences, paidFromAssets, title, submitLabel, isSubmitDisabled, linkedOccurrenceChanged,
  } = useTransactionForm(props)

  return (
    <DialogForm
      open={open}
      title={title}
      description="Actual spending updates your safe-to-spend amount right away."
      className="form-stack transaction-form"
      errorIssues={validationAttempt > 0 ? validationIssues : []}
      submitError={submitError}
      onClose={onClose}
      onSubmit={onSubmit}
      saving={saving}
      submitLabel={submitLabel}
      isSubmitDisabled={isSubmitDisabled}
    >
      <DialogFormSection
        title="Expense details"
        description="Add a description, category, and date."
        lead={<CurrencyAmountField control={control} name="amount" label="Amount" prefix={<span aria-hidden="true">Rp</span>} description="Whole rupiah only." className="field dialog-form-amount-control" />}
      >
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
      </DialogFormSection>

      <DialogFormSection title="Optional links" description="Connect this expense to a planned bill or a tracked cash account if needed.">
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
              onValueChange={linkedOccurrenceChanged}
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
      </DialogFormSection>
    </DialogForm>
  )
}

