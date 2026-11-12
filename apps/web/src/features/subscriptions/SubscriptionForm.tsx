import { useNavigate } from 'react-router-dom'
import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Grid } from '@astryxdesign/core/Grid'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import type { Subscription } from '@kinsen/budget-domain'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'
import { DialogForm, DialogFormSection } from '../../shared/components/DialogForm'
import { AstryxDateField, AstryxSelectField, AstryxTextField, CurrencyAmountField } from '../../shared/components/AstryxFields'
import { Icon } from '../../shared/components/Icon'
import { formatIdr } from '../../shared/format/money'
import { useBudgetStore } from '../../shared/state/budget-store'

const providers = ['Netflix', 'PlayStation Plus', 'Disney+', 'Spotify', 'YouTube Premium', 'iCloud', 'ChatGPT', 'Custom']
const cadences = [{ value: 'MONTHLY', label: 'Monthly', perYear: 12 }, { value: 'QUARTERLY', label: 'Quarterly', perYear: 4 }, { value: 'YEARLY', label: 'Yearly', perYear: 1 }] as const

const subscriptionSchema = z.object({
  provider: z.string().min(1, 'Choose a service.'),
  name: z.string().trim().min(1, 'Name this subscription.').max(80, 'Keep the name under 80 characters.'),
  price: z.number().int('Use whole rupiah only.').safe('Amount is too large.').positive('Price must be greater than zero.'),
  cadence: z.enum(['MONTHLY', 'QUARTERLY', 'YEARLY']),
  renewal: z.string().refine((value) => {
    try { parseDateOnly(value); return true } catch { return false }
  }, 'Enter the next renewal date.'),
})

type SubscriptionFormValues = z.infer<typeof subscriptionSchema>

const defaultValues: SubscriptionFormValues = { provider: 'Netflix', name: 'Netflix', price: 0, cadence: 'MONTHLY', renewal: '' }

type SubscriptionFormProps = {
  open: boolean
  onClose: () => void
  onSave: (subscription: Subscription) => void
}

function costPreview(price: number, cadence: SubscriptionFormValues['cadence']) {
  if (!Number.isSafeInteger(price) || price <= 0) return 'Enter a price to see what this costs over a year.'
  const yearly = price * (cadences.find((item) => item.value === cadence)?.perYear ?? 12)
  return cadence === 'MONTHLY' ? `${formatIdr(yearly)} a year.` : `About ${formatIdr(Math.round(yearly / 12))} a month · ${formatIdr(yearly)} a year.`
}

export function SubscriptionForm({ open, onClose, onSave }: SubscriptionFormProps) {
  const category = useBudgetStore((state) => state.snapshot?.categories.find((item) => item.mode === 'SCHEDULED'))
  const { control, handleSubmit, reset, setValue, watch } = useForm<SubscriptionFormValues>({ resolver: zodResolver(subscriptionSchema), defaultValues })
  const [price, cadence] = watch(['price', 'cadence'])
  const navigate = useNavigate()

  const onSubmit = handleSubmit((values) => {
    if (!category) return
    onSave({
      id: crypto.randomUUID(), name: values.name.trim(), providerId: values.provider.toLowerCase().replaceAll(' ', '-'), plan: '', notes: '', status: 'ACTIVE', reminderDays: 3,
      segments: [{ id: crypto.randomUUID(), categoryId: category.id, dueDate: values.renewal, cadence: values.cadence, grossAmountIdr: values.price, myShareIdr: values.price }],
    })
    reset(defaultValues)
    onClose()
  })

  return (
    <DialogForm open={open} title="Add subscription" description="Track what you pay and when it renews." className="form-stack transaction-form" width={600} onClose={onClose} onSubmit={onSubmit} submitLabel="Save subscription" isSubmitDisabled={!category}>
      {!category && <Stack as="div" direction="horizontal" className="inline-alert subscription-category-alert" role="alert">
        <Icon name="warning" size={17} />
        <span>Subscriptions need a scheduled budget category.</span>
        <Button label="Add scheduled category" className="button button-small button-secondary" variant="secondary" type="button" icon={<Icon name="plus" size={16} />} onClick={() => { onClose(); navigate('/budget?add=scheduled') }} />
      </Stack>}
      <DialogFormSection
        title="Service"
        description="Pick a known service, or choose Custom and name it yourself. The name is how it appears in your list."
        lead={<CurrencyAmountField control={control} name="price" label="Price per billing cycle" prefix={<span aria-hidden="true">Rp</span>} description="Your share, in whole rupiah." className="field dialog-form-amount-control" />}
      >
        <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
          <AstryxSelectField control={control} name="provider" label="Service" options={providers.map((item) => ({ value: item, label: item }))} onValueChange={(value) => setValue('name', value === 'Custom' ? '' : value, { shouldValidate: value !== 'Custom' })} className="field" />
          <AstryxTextField control={control} name="name" label="Name" placeholder="e.g. Netflix Premium" autoComplete="off" maxLength={80} className="field" />
        </Grid>
      </DialogFormSection>
      <DialogFormSection title="Billing" description="How often you are charged, and when the next charge lands.">
        <Controller control={control} name="cadence" render={({ field }) => (
          <SegmentedControl label="Billing cycle" value={field.value} onChange={field.onChange} layout="fill">
            {cadences.map((item) => <SegmentedControlItem key={item.value} value={item.value} label={item.label} />)}
          </SegmentedControl>
        )} />
        <AstryxDateField control={control} name="renewal" label="Next renewal" className="field" />
        <p className="subscription-cost-preview" aria-live="polite">{costPreview(price, cadence)}</p>
      </DialogFormSection>
    </DialogForm>
  )
}
