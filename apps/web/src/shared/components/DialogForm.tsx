import { useId, useLayoutEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { FormDialog } from './FormDialog'

export type FormErrorIssue = { name: string; label: string; message: string }

type DialogFormProps = {
  open: boolean
  title: string
  description?: string
  /** Field errors collected from the last submit attempt; rendered as a focusable summary. */
  errorIssues?: readonly FormErrorIssue[]
  /** Non-field error from saving, shown below the sections. */
  submitError?: string | null
  onClose: () => void
  onSubmit: () => void
  className?: string
  saving?: boolean
  cancelLabel?: string
  submitLabel: string
  isSubmitDisabled?: boolean
  children: ReactNode
}

/**
 * Shared skeleton for dialog forms: the scrollable form body, the validation
 * error summary, and the sticky action footer. Sections come from DialogFormSection.
 */
export function DialogForm({
  open,
  title,
  description,
  errorIssues,
  submitError,
  onClose,
  onSubmit,
  className,
  saving = false,
  cancelLabel = 'Cancel',
  submitLabel,
  isSubmitDisabled = false,
  children,
}: DialogFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const errorSummaryRef = useRef<HTMLElement | null>(null)
  const errorCount = errorIssues?.length ?? 0
  const previousErrorCountRef = useRef(0)
  const titleId = useId()

  // Start each open dialog at the top; a long form can otherwise reopen scrolled
  // to wherever the user left the previous one. scrollTop is used rather than
  // scrollTo because the latter is missing in the jsdom test environment.
  useLayoutEffect(() => {
    if (!open) return
    if (formRef.current) formRef.current.scrollTop = 0
    if (typeof window.requestAnimationFrame !== 'function') return
    const frame = window.requestAnimationFrame(() => {
      if (formRef.current) formRef.current.scrollTop = 0
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  // Move focus to the summary when a submit attempt first produces errors, so
  // keyboard and screen reader users are not left on the button that failed.
  useLayoutEffect(() => {
    if (errorCount > 0 && previousErrorCountRef.current === 0) errorSummaryRef.current?.focus()
    previousErrorCountRef.current = errorCount
  }, [errorCount])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <FormDialog open={open} title={title} description={description} onClose={onClose}>
      <form ref={formRef} className={className} onSubmit={handleSubmit} noValidate>
        {errorCount > 0 && (
          <section ref={errorSummaryRef} className="form-error" role="alert" aria-labelledby={titleId} tabIndex={-1}>
            <strong id={titleId}>Review these fields</strong>
            <p>{errorCount === 1 ? 'There is 1 field to check.' : `There are ${errorCount} fields to check.`} Review the field messages below.</p>
            <ul>
              {errorIssues!.map((issue) => (
                <li key={issue.name}><strong>{issue.label}:</strong> {issue.message}</li>
              ))}
            </ul>
          </section>
        )}

        {children}

        {submitError && <p className="form-error" role="alert">{submitError}</p>}

        <footer className="form-actions">
          <Button label={cancelLabel} type="button" variant="ghost" className="button button-outline" onClick={onClose} isDisabled={saving} />
          <Button
            label={saving ? 'Saving…' : submitLabel}
            type="submit"
            variant="primary"
            className="button button-primary"
            isDisabled={saving || isSubmitDisabled}
            isLoading={saving}
          />
        </footer>
      </form>
    </FormDialog>
  )
}

type DialogFormSectionProps = {
  title: string
  description?: string
  /**
   * Optional emphasized control shown above the section heading. The heading is
   * then separated by a divider, matching the amount-first layout used by dialogs
   * that lead with one dominant value.
   */
  lead?: ReactNode
  children: ReactNode
}

/** A bordered card grouping related fields under a titled subheading. */
export function DialogFormSection({ title, description, lead, children }: DialogFormSectionProps) {
  const headingId = useId()
  return (
    <section className="form-section" aria-labelledby={headingId}>
      {lead}
      <Stack className={lead ? 'section-title-row dialog-form-lead-heading' : 'section-title-row'} direction="vertical" gap={1}>
        <h2 id={headingId}>{title}</h2>
        {description && <p>{description}</p>}
      </Stack>
      <Stack direction="vertical" gap={3}>
        {children}
      </Stack>
    </section>
  )
}