import { useRef, useState } from 'react'
import { Controller } from 'react-hook-form'
import { BottomSheet } from '@astryxdesign/core/BottomSheet'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { Link } from '@astryxdesign/core/Link'
import { Stack } from '@astryxdesign/core/Stack'
import type { DateOnly } from '@kinsen/budget-domain'
import { Icon } from '../../shared/components/Icon'
import { MobileDateField } from '../../shared/components/MobileDateField'
import { AstryxSelectField, AstryxTextField, CurrencyAmountField } from '../../shared/components/AstryxFields'
import { formatDate } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { useTransactionForm, type TransactionFormProps } from './useTransactionForm'

/**
 * Touch-first expense form: a bottom sheet the user can swipe down to dismiss (until
 * they have typed something, when swipes are blocked so entered data is never lost).
 * Big amount, tappable category chips and date shortcuts replace the dialog's selects.
 */
export function TransactionFormSheet(props: TransactionFormProps) {
  const { open, onClose } = props
  const {
    control, onSubmit, validationIssues, validationAttempt, submitError, saving, assetStatus, isDirty, period, today,
    categories, eligibleOccurrences, paidFromAssets, title, submitLabel, isSubmitDisabled, linkedOccurrenceChanged,
  } = useTransactionForm(props)
  const [showMore, setShowMore] = useState(false)
  const errorRef = useRef<HTMLElement | null>(null)
  const issues = validationAttempt > 0 ? validationIssues : []
  const cannotSave = !period || categories.length === 0

  return (
    <BottomSheet
      isOpen={open}
      onOpenChange={(next) => { if (!next) onClose() }}
      label={title}
      height="hug"
      purpose={isDirty ? 'form' : 'info'}>
      <form className="expense-sheet" onSubmit={(event) => { event.preventDefault(); void onSubmit(event) }} noValidate>
        <header className="expense-sheet-header">
          <h2 className="expense-sheet-title">{title}</h2>
          <IconButton label="Close" variant="ghost" icon={<Icon name="close" size={20} />} onClick={onClose} isDisabled={saving} />
        </header>

        <CurrencyAmountField control={control} name="amount" label="Amount" prefix={<span aria-hidden="true">Rp</span>} className="field expense-sheet-amount" />
        <AstryxTextField control={control} name="description" label="Description" autoComplete="off" maxLength={100} className="field" />

        <Controller control={control} name="categoryId" render={({ field, fieldState }) => (
          <fieldset className="expense-sheet-group">
            <legend>Category</legend>
            {categories.length === 0 ? (
              <Link href="/budget" onClick={onClose} className="expense-sheet-empty">
                <span>No categories yet</span>
                <span className="expense-sheet-empty-action">Set up budget <Icon name="arrow" size={14} aria-hidden="true" /></span>
              </Link>
            ) : (
              <div className="expense-sheet-chips" role="radiogroup" aria-label="Category">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    role="radio"
                    aria-checked={field.value === category.id}
                    className="expense-sheet-chip"
                    onClick={() => field.onChange(category.id)}>
                    {category.name}
                  </button>
                ))}
              </div>
            )}
            {fieldState.error && <p className="field-error" role="alert">{fieldState.error.message}</p>}
          </fieldset>
        )} />

        <MobileDateField control={control} name="date" label="Date" today={today as DateOnly | ''} min={period?.startDate} max={period?.endDate} />

        <Button
          label={showMore ? 'Hide extra options' : 'Link a bill or account'}
          type="button"
          variant="ghost"
          className="expense-sheet-more"
          aria-expanded={showMore}
          onClick={() => setShowMore((value) => !value)}
        />
        {showMore && (
          <Stack direction="vertical" gap={3}>
            <AstryxSelectField
              control={control}
              name="commitmentKey"
              label="Link to a commitment"
              isOptional
              placeholder="Not linked"
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
              options={[
                { value: '', label: 'Not linked to a tracked account' },
                ...paidFromAssets.map((asset) => ({ value: asset.id, label: `${asset.name} · ${asset.institution}` })),
              ]}
              className="field"
            />
            {assetStatus === 'error' && <p className="field-error" role="alert">Tracked accounts could not be loaded. You can still save without a Paid from link.</p>}
          </Stack>
        )}

        {issues.length > 0 && (
          <section ref={errorRef} className="form-error" role="alert">
            <ul>{issues.map((issue) => <li key={issue.name}><strong>{issue.label}:</strong> {issue.message}</li>)}</ul>
          </section>
        )}
        {submitError && <p className="form-error" role="alert">{submitError}</p>}

        <footer className="expense-sheet-actions">
          <Button
            label={saving ? 'Saving…' : submitLabel}
            type="submit"
            variant="primary"
            className="button button-primary expense-sheet-save"
            isDisabled={saving || isSubmitDisabled || cannotSave}
            isLoading={saving}
          />
        </footer>
      </form>
    </BottomSheet>
  )
}
