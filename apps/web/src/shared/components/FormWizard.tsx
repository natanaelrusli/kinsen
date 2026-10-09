import { useLayoutEffect, useRef, useState } from 'react'
import type { FormEvent, FormEventHandler, ReactNode } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Stack } from '@astryxdesign/core/Stack'
import { Step, Stepper } from '@astryxdesign/core/Stepper'

type FormWizardStep = {
  label: string
  fields: readonly string[]
  content: ReactNode
}

type FormWizardProps = {
  steps: readonly FormWizardStep[]
  validateStep: (stepIndex: number, fields: readonly string[]) => boolean | Promise<boolean>
  onSubmit: FormEventHandler<HTMLFormElement>
  submitLabel: string
  isSaving?: boolean
  submitDisabled?: boolean
  onCancel?: () => void
  open?: boolean
  className?: string
}

export function FormWizard({
  steps,
  validateStep,
  onSubmit,
  submitLabel,
  isSaving = false,
  submitDisabled = false,
  onCancel,
  open,
  className,
}: FormWizardProps) {
  const [activeStep, setActiveStep] = useState(0)
  const [invalidSteps, setInvalidSteps] = useState<ReadonlySet<number>>(() => new Set())
  const [isValidating, setIsValidating] = useState(false)
  const validationInFlight = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const bodyRef = useRef<HTMLElement>(null)
  const previousStepRef = useRef(0)
  const [focusRequest, setFocusRequest] = useState<readonly string[] | null>(null)

  useLayoutEffect(() => {
    if (open === undefined) return
    setActiveStep(0)
    previousStepRef.current = 0
    setInvalidSteps(new Set())
    setFocusRequest(null)
    validationInFlight.current = false
    setIsValidating(false)
  }, [open])

  useLayoutEffect(() => {
    if (open === false || !focusRequest) return
    const form = formRef.current
    if (!form) return
    const namedFields = Array.from(form.elements).filter((element): element is HTMLElement & { name: string } => {
      if (!(element instanceof HTMLElement) || !('name' in element) || typeof element.name !== 'string') return false
      const name = element.name
      return focusRequest.some((fieldName) =>
        name === fieldName ||
        (name.startsWith(fieldName) && (name[fieldName.length] === '.' || name[fieldName.length] === '[')),
      )
    })
    const invalidField = namedFields.find((element) => element.getAttribute('aria-invalid') === 'true')
    const namedField = invalidField ?? namedFields[0]
    const target = namedField instanceof HTMLInputElement && namedField.type === 'hidden'
      ? namedField.parentElement?.querySelector<HTMLElement>('button:not(:disabled), [role="combobox"]:not([aria-disabled="true"])')
      : namedField
    if (target && !target.matches(':disabled, [aria-disabled="true"]')) {
      target.focus()
      return
    }
    bodyRef.current?.focus()
  }, [focusRequest, open])

  if (steps.length === 0) throw new Error('FormWizard requires at least one step.')

  const currentIndex = Math.min(activeStep, steps.length - 1)
  const finalStep = currentIndex === steps.length - 1
  const active = steps[currentIndex]!
  useLayoutEffect(() => {
    if (open === false) {
      previousStepRef.current = currentIndex
      return
    }
    if (previousStepRef.current === currentIndex) return
    previousStepRef.current = currentIndex
    const body = bodyRef.current
    if (!body) return
    body.scrollTop = 0
    body.focus()
  }, [currentIndex, open])


  async function validateActiveStep() {
    if (validationInFlight.current) return false
    validationInFlight.current = true
    setIsValidating(true)
    try {
      const valid = await validateStep(currentIndex, active.fields)
      setInvalidSteps((current) => {
        const next = new Set(current)
        if (valid) next.delete(currentIndex)
        else next.add(currentIndex)
        return next
      })
      if (!valid) setFocusRequest([...active.fields])
      return valid
    } finally {
      validationInFlight.current = false
      setIsValidating(false)
    }
  }

  async function advance() {
    if (await validateActiveStep()) setActiveStep((current) => Math.min(current + 1, steps.length - 1))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!finalStep) {
      void advance()
      return
    }
    void validateActiveStep().then((valid) => {
      if (valid) onSubmit(event)
    })
  }

  return (
    <form ref={formRef} className={`form-wizard${className ? ` ${className}` : ''}`} onSubmit={handleSubmit} noValidate>
      <Stepper
        activeStep={currentIndex}
        label="Form progress"
        density="compact"
        onStepClick={(index) => {
          if (!validationInFlight.current && index < currentIndex) setActiveStep(index)
        }}
        horizontalOptions={{ minimumStepWidth: 112, collapsedVariant: 'withLabel' }}
        className="form-wizard-stepper"
      >
        {steps.map((step, index) => (
          <Step
            key={step.label}
            step={index}
            label={step.label}
            status={invalidSteps.has(index) ? 'error' : undefined}
            isDisabled={index > currentIndex}
          />
        ))}
      </Stepper>

      <Stack
        as="section"
        ref={bodyRef}
        tabIndex={-1}
        className="form-wizard-body"
        role="group"
        aria-label={active.label}
        direction="vertical"
        gap={3}
      >
        {active.content}
      </Stack>

      <footer className="form-actions form-wizard-actions">
        <Stack className="form-wizard-navigation" direction="horizontal" align="center" gap={1}>
          <Button
            label="Back"
            className="button button-quiet"
            variant="ghost"
            type="button"
            isDisabled={currentIndex === 0 || isSaving || isValidating}
            onClick={() => setActiveStep((current) => Math.max(current - 1, 0))}
          />
          {onCancel && <Button label="Cancel" className="button button-quiet form-wizard-cancel" variant="ghost" type="button" onClick={onCancel} />}
        </Stack>
        <Button
          label={finalStep ? (isSaving ? 'Saving…' : submitLabel) : 'Continue'}
          className="button button-primary form-wizard-primary"
          variant="primary"
          type="submit"
          isDisabled={isSaving || isValidating || (finalStep && submitDisabled)}
          isLoading={finalStep && isSaving}
          onClick={(event) => {
            if (!finalStep) {
              event.preventDefault()
              void advance()
            }
          }}
        />
      </footer>
    </form>
  )
}

type FormWizardDialogProps = Omit<FormWizardProps, 'open' | 'onCancel'> & {
  open: boolean
  title: string
  description?: string
  onClose: () => void
}

export function FormWizardDialog({ open, title, description, onClose, ...wizard }: FormWizardDialogProps) {
  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onClose()
  }

  return (
    <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form" width={560} maxHeight="90dvh">
      <DialogHeader title={title} subtitle={description} onOpenChange={handleOpenChange} />
      <FormWizard {...wizard} open={open} onCancel={onClose} />
    </Dialog>
  )
}
