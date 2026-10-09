import { Button } from '@astryxdesign/core/Button'
import { Stack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AstryxSelectField, AstryxTextField } from '../../shared/components/AstryxFields'
import { useBudgetStore } from '../../shared/state/budget-store'

const storageKey = 'kinsen-bca-email-config'
const configurationSchema = z.object({
  gmailAddress: z.string().trim().email('Enter a valid Gmail mailbox address.'),
  senderAddress: z.string().trim().email('Enter the sender address from a BCA transaction email.'),
  categoryId: z.string(),
})
type Configuration = z.infer<typeof configurationSchema>
const emptyConfiguration: Configuration = { gmailAddress: '', senderAddress: '', categoryId: '' }

function readConfiguration(): Configuration {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return emptyConfiguration
    const result = configurationSchema.safeParse(JSON.parse(stored))
    return result.success ? result.data : emptyConfiguration
  } catch {
    return emptyConfiguration
  }
}

export function BankEmailSettings() {
  const snapshot = useBudgetStore((state) => state.snapshot)
  const categories = snapshot?.categories ?? []
  const [initialConfiguration] = useState(readConfiguration)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { control, handleSubmit, reset, watch, setError: setFieldError } = useForm<Configuration>({
    resolver: zodResolver(configurationSchema),
    defaultValues: initialConfiguration,
    mode: 'onBlur',
    reValidateMode: 'onChange',
  })
  const categoryId = watch('categoryId')
  const missingCategory = categoryId !== '' && !categories.some((category) => category.id === categoryId)

  function saveConfiguration(configuration: Configuration) {
    setMessage(null)
    setError(null)
    if (configuration.categoryId && !categories.some((category) => category.id === configuration.categoryId)) {
      setFieldError('categoryId', { message: 'Choose an available category or review each expense.' })
      return
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(configuration))
      reset(configuration)
      setMessage('BCA configuration saved on this device. Email importing is not active.')
    } catch {
      setError('Could not save the configuration. Allow browser storage and try again.')
    }
  }

  function clearConfiguration() {
    setMessage(null)
    setError(null)
    try {
      window.localStorage.removeItem(storageKey)
      reset(emptyConfiguration)
      setMessage('BCA configuration cleared from this device.')
    } catch {
      setError('Could not clear the configuration. Allow browser storage and try again.')
    }
  }

  return (
    <Stack gap={6}>
      <Stack className="settings-group" gap={3}>
        <Heading level={3}>BCA bank email</Heading>
        <Text>Prepare the mailbox and expense defaults for BCA transaction emails. BCA is the only supported bank in this configuration.</Text>
        <Text weight="semibold">Not connected · Imports inactive</Text>
        <Text type="supporting">This menu saves configuration only. Gmail authorization, bank email verification, and server processing are not connected yet. Saving does not read emails or create expenses.</Text>
      </Stack>
      <form noValidate onSubmit={handleSubmit(saveConfiguration, () => { setMessage(null); setError(null) })}
        onChange={() => { setMessage(null); setError(null) }}>
        <Stack gap={4} className="settings-group">
          <Heading level={3}>Email configuration</Heading>
          <AstryxTextField control={control} name="gmailAddress" label="Gmail mailbox" inputMode="email" autoComplete="email"
            description="The Google mailbox that receives your BCA transaction emails. This does not connect your Google account." />
          <AstryxTextField control={control} name="senderAddress" label="BCA sender email" inputMode="email" autoComplete="off"
            description="Copy the exact sender address from a genuine BCA transaction email. An address alone is not proof that an email is authentic." />
          <AstryxSelectField control={control} name="categoryId" label="Default expense category"
            onValueChange={() => { setMessage(null); setError(null) }}
            options={[
              { value: '', label: 'Review each expense' },
              ...categories.map((category) => ({ value: category.id, label: category.name })),
              ...(missingCategory ? [{ value: categoryId, label: 'Unavailable category — choose another' }] : []),
            ]}
            description="Choose a budget category for unmatched payments, or leave them for review when importing is connected." />
          {categories.length === 0 && <Text type="supporting">Add categories in Budget to choose a default expense category.</Text>}
          <Text type="supporting">Transaction currency: IDR · Transaction timezone: Asia/Jakarta (WIB).</Text>
          <Text type="supporting">Do not enter your bank password, PIN, card details, or one-time codes. Configuration stays in this browser and is not sent to the server.</Text>
          {error && <Text role="alert">{error}</Text>}
          {message && <Text role="status">{message}</Text>}
          <Stack gap={2}>
            <Button label="Save BCA configuration" variant="primary" type="submit" />
            <Button label="Clear configuration" variant="ghost" type="button" onClick={clearConfiguration} />
          </Stack>
        </Stack>
      </form>
    </Stack>
  )
}
