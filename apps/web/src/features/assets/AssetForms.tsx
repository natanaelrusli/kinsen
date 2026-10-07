import { useLayoutEffect, useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, type FieldPath } from 'react-hook-form'
import { z } from 'zod'
import type { AssetAccount, AssetEntry, AssetType, AssetPurpose, AssetValuation, DateOnly, LiabilityAccount, LiabilityEntry, LiabilityType } from '@kinsen/budget-domain'
import { assetBalanceMode, assetTypeLabels, convertMinorUnitsToIdr, liabilityTypeLabels, parseAmountToMinorUnits, supportedAssetCurrencies } from '@kinsen/budget-domain'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'
import { localToday } from '../../shared/format/date'
import { newId } from '../../shared/format/id'
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput'
import { Grid } from '@astryxdesign/core/Grid'
import { Selector } from '@astryxdesign/core/Selector'
import {
  AstryxDateField,
  AstryxSelectField,
  AstryxTextAreaField,
  AstryxTextField,
} from '../../shared/components/AstryxFields'
import { FormWizardDialog } from '../../shared/components/FormWizard'
import type { AssetOpeningRecord } from '../../infrastructure/repositories/asset-repository'

const ASSET_TYPES = ['CASH', 'BANK_ACCOUNT', 'E_WALLET', 'DEPOSIT', 'MUTUAL_FUND', 'STOCK_ETF', 'GOLD', 'FOREIGN_CURRENCY', 'OTHER'] as const satisfies readonly AssetType[]
const LIABILITY_TYPES = ['CREDIT_CARD', 'PAY_LATER', 'INSTALLMENT', 'LOAN', 'OTHER'] as const satisfies readonly LiabilityType[]
const PURPOSES = ['', 'DAILY_CASH', 'PROTECTED_SAVINGS', 'INVESTMENT', 'OTHER'] as const
const currencies = supportedAssetCurrencies()
const dateOnly = z.string().refine((value) => {
  try { parseDateOnly(value); return true } catch { return false }
}, 'Enter a valid calendar date.')


function SubmitError({ children }: { children: string | null }) {
  return children ? <p className="form-error" role="alert">{children}</p> : null
}

export function AssetForm({ open, initial, today = localToday(), saving, onClose, onSave }: {
  open: boolean
  initial?: AssetAccount | null
  today?: DateOnly
  saving: boolean
  onClose: () => void
  onSave: (asset: AssetAccount, openingRecord?: AssetOpeningRecord) => Promise<void>
}) {
  const schema = z.object({
    name: z.string().trim().min(1, 'Add an asset name.').max(100),
    type: z.enum(ASSET_TYPES),
    institution: z.string().trim().min(1, 'Add a bank, institution, or holding place.').max(100),
    purpose: z.enum(PURPOSES),
    nativeCurrency: z.string().min(3).max(3),
    notes: z.string().max(1000),
    openingAmount: z.string().min(1, 'Enter an opening value.'),
    openingDate: dateOnly,
    exchangeRate: z.string(),
    rateDate: dateOnly,
  })
  type Values = z.infer<typeof schema>
  const defaults: Values = {
    name: initial?.name ?? '',
    type: initial?.type ?? 'BANK_ACCOUNT',
    institution: initial?.institution ?? '',
    purpose: initial?.purpose ?? '',
    nativeCurrency: initial?.nativeCurrency ?? 'IDR',
    notes: initial?.notes ?? '',
    openingAmount: '0',
    openingDate: initial?.createdAt ?? today,
    exchangeRate: (initial?.nativeCurrency ?? 'IDR') === 'IDR' ? '1' : '',
    rateDate: today,
  }
  const { control, handleSubmit, reset, setValue, watch, trigger, setError, getValues } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const assetType = watch('type')
  const currency = watch('nativeCurrency')
  const isLedger = assetBalanceMode(assetType) === 'LEDGER'
  const isInitial = !initial

  useLayoutEffect(() => {
    if (!open) return
    setSubmitError(null)
    reset({ ...defaults, openingDate: today, rateDate: today })
  }, [open, initial, today, reset])

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      const mode = assetBalanceMode(values.type)
      const openingDate = initial?.createdAt ?? values.openingDate
      const asset: AssetAccount = {
        id: initial?.id ?? newId('asset'),
        name: values.name.trim(),
        type: values.type,
        institution: values.institution.trim(),
        nativeCurrency: mode === 'LEDGER' ? 'IDR' : values.nativeCurrency,
        balanceMode: mode,
        createdAt: initial?.createdAt ?? openingDate,
        ...(values.purpose ? { purpose: values.purpose as AssetPurpose } : {}),
        ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
        ...(initial?.archivedAt ? { archivedAt: initial.archivedAt } : {}),
      }
      if (initial) {
        await onSave(asset)
      } else if (mode === 'LEDGER') {
        const amountMinor = parseAmountToMinorUnits(values.openingAmount, 'IDR')
        const entry: AssetEntry = { id: newId('asset-entry'), assetId: asset.id, date: openingDate, kind: 'OPENING_BALANCE', amountMinor, note: 'Opening balance' }
        await onSave(asset, { entry })
      } else {
        const nativeAmountMinor = parseAmountToMinorUnits(values.openingAmount, asset.nativeCurrency)
        const exchangeRate = asset.nativeCurrency === 'IDR' ? '1' : values.exchangeRate.trim()
        const rateDate = asset.nativeCurrency === 'IDR' ? openingDate : values.rateDate
        const valuation: AssetValuation = {
          id: newId('valuation'), assetId: asset.id, asOfDate: openingDate, nativeAmountMinor,
          nativeCurrency: asset.nativeCurrency, exchangeRate, rateDate,
          valueIdr: convertMinorUnitsToIdr(nativeAmountMinor, asset.nativeCurrency, exchangeRate),
          source: 'MANUAL', recordedAt: Date.now(), note: 'Opening valuation',
        }
        await onSave(asset, { valuation })
      }
      onClose()
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Asset could not be saved.')
    }
  })

  return (
    <FormWizardDialog
      open={open}
      title={initial ? 'Edit asset details' : 'Add an asset'}
      description="Track the value separately from money safe to spend. Values are saved on this device."
      onClose={onClose}
      steps={[
        {
          label: 'Details',
          fields: ['name', 'type', 'purpose', 'institution', 'nativeCurrency'],
          content: <>
            <AstryxTextField control={control} name="name" label="Name" autoComplete="off" maxLength={100} className="field" />
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              <AstryxSelectField
                control={control}
                name="type"
                label="Asset type"
                className="field"
                options={ASSET_TYPES.map((type) => ({ value: type, label: assetTypeLabels[type] }))}
                onValueChange={(value) => {
                  if (assetBalanceMode(value as AssetType) === 'LEDGER') {
                    setValue('nativeCurrency', 'IDR')
                    setValue('exchangeRate', '1')
                  } else if (value === 'FOREIGN_CURRENCY' && currency === 'IDR') {
                    setValue('nativeCurrency', 'USD')
                    setValue('exchangeRate', '')
                  }
                }}
              />
              <AstryxSelectField
                control={control}
                name="purpose"
                label="Purpose"
                className="field"
                options={[
                  { value: '', label: 'No purpose tag' },
                  { value: 'DAILY_CASH', label: 'Daily-use cash' },
                  { value: 'PROTECTED_SAVINGS', label: 'Protected savings' },
                  { value: 'INVESTMENT', label: 'Investment' },
                  { value: 'OTHER', label: 'Other' },
                ]}
              />
            </Grid>
            <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
              <AstryxTextField control={control} name="institution" label="Bank / institution / place" autoComplete="off" maxLength={100} className="field" />
              <AstryxSelectField
                control={control}
                name="nativeCurrency"
                label="Currency"
                className="field"
                options={currencies.map((code) => ({ value: code, label: code }))}
                isDisabled={isLedger}
                onValueChange={(value) => setValue('exchangeRate', value === 'IDR' ? '1' : '')}
                description="Cash-like ledger accounts use IDR. Use Foreign currency for manually converted FX holdings."
              />
            </Grid>
          </>,
        },
        {
          label: isInitial ? 'Opening value' : 'Notes',
          fields: isInitial ? ['openingAmount', 'openingDate', 'exchangeRate', 'rateDate', 'notes'] : ['notes'],
          content: <>
            {isInitial && <>
              <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
                <AstryxTextField control={control} name="openingAmount" label="Opening value (manual estimate)" autoComplete="off" inputMode="decimal" placeholder="0" startContent={currency} className="field" />
                <AstryxDateField control={control} name="openingDate" label="Opening date" className="field" />
              </Grid>
              {!isLedger && currency !== 'IDR' && <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
                <AstryxTextField control={control} name="exchangeRate" label={`IDR rate per ${currency}`} inputMode="decimal" placeholder="15000" description="Saved with this valuation; Kinsen does not refresh exchange rates." className="field" />
                <AstryxDateField control={control} name="rateDate" label="Rate date" className="field" />
              </Grid>}
            </>}
            <AstryxTextAreaField control={control} name="notes" label="Notes" isOptional maxLength={1000} rows={3} className="field" />
            <SubmitError>{submitError}</SubmitError>
          </>,
        },
      ]}
      validateStep={async (stepIndex, fields) => {
        if (!await trigger(fields as FieldPath<Values>[])) return false
        if (!isInitial || stepIndex !== 1) return true
        const values = getValues()
        let amountMinor: number
        try {
          amountMinor = parseAmountToMinorUnits(values.openingAmount, values.nativeCurrency)
        } catch (error) {
          setError('openingAmount', { type: 'validate', message: error instanceof Error ? error.message : 'Enter a valid opening value.' })
          return false
        }
        if (assetBalanceMode(values.type) !== 'LEDGER' && values.nativeCurrency !== 'IDR') {
          try {
            convertMinorUnitsToIdr(amountMinor, values.nativeCurrency, values.exchangeRate.trim())
          } catch (error) {
            setError('exchangeRate', { type: 'validate', message: error instanceof Error ? error.message : 'Enter a valid exchange rate.' })
            return false
          }
        }
        return true
      }}
      onSubmit={onSubmit}
      submitLabel={initial ? 'Save details' : 'Save asset'}
      isSaving={saving}
    />
  )
}

const assetActivitySchema = z.object({
  kind: z.enum(['CREDIT', 'DEBIT', 'CORRECTION']),
  amount: z.string().min(1, 'Enter an amount.'),
  date: dateOnly,
  note: z.string().max(500),
}).superRefine((values, context) => {
  try {
    const amount = parseAmountToMinorUnits(values.amount, 'IDR', values.kind === 'CORRECTION')
    if (values.kind === 'CORRECTION' ? amount === 0 : amount <= 0) context.addIssue({ code: 'custom', path: ['amount'], message: values.kind === 'CORRECTION' ? 'Correction must change the balance.' : 'Amount must be greater than zero.' })
    if (values.kind === 'CORRECTION' && !values.note.trim()) context.addIssue({ code: 'custom', path: ['note'], message: 'Add a reason for this correction.' })
  } catch (error) {
    context.addIssue({ code: 'custom', path: ['amount'], message: error instanceof Error ? error.message : 'Enter a valid amount.' })
  }
})

export function AssetActivityForm({ open, asset, initial, today = localToday(), saving, onClose, onSave }: {
  open: boolean
  asset: AssetAccount
  initial?: AssetEntry | null
  today?: DateOnly
  saving: boolean
  onClose: () => void
  onSave: (entry: AssetEntry) => Promise<void>
}) {
  type Values = z.infer<typeof assetActivitySchema>
  const { control, handleSubmit, reset, trigger } = useForm<Values>({
    resolver: zodResolver(assetActivitySchema),
    defaultValues: { kind: initial?.kind === 'DEBIT' || initial?.kind === 'CORRECTION' ? initial.kind : 'CREDIT', amount: initial ? String(initial.amountMinor) : '', date: initial?.date ?? today, note: initial?.note ?? '' },
  })
  const [submitError, setSubmitError] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    setSubmitError(null)
    reset({ kind: initial?.kind === 'DEBIT' || initial?.kind === 'CORRECTION' ? initial.kind : 'CREDIT', amount: initial ? String(initial.amountMinor) : '', date: initial?.date ?? today, note: initial?.note ?? '' })
  }, [open, initial, today, reset])
  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      const kind = values.kind
      const entry: AssetEntry = {
        id: initial?.id ?? newId('asset-entry'), assetId: asset.id, date: values.date, kind,
        amountMinor: parseAmountToMinorUnits(values.amount, 'IDR', kind === 'CORRECTION'),
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
      }
      await onSave(entry)
      onClose()
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Activity could not be saved.') }
  })
  return <FormWizardDialog
    open={open}
    title={initial ? 'Edit activity' : 'Add cash activity'}
    description={`${asset.name} · corrections keep the original activity in history.`}
    onClose={onClose}
    steps={[
      {
        label: 'Activity',
        fields: ['kind', 'amount', 'date'],
        content: <>
          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <AstryxSelectField control={control} name="kind" label="Activity" className="field" options={[
              { value: 'CREDIT', label: 'Credit / deposit' },
              { value: 'DEBIT', label: 'Debit / withdrawal' },
              { value: 'CORRECTION', label: 'Correction' },
            ]} />
            <AstryxTextField control={control} name="amount" label="Amount (IDR)" inputMode="decimal" placeholder="0" startContent="Rp" className="field" />
          </Grid>
          <AstryxDateField control={control} name="date" label="Date" className="field" />
        </>,
      },
      {
        label: 'Note',
        fields: ['note'],
        content: <>
          <AstryxTextAreaField control={control} name="note" label="Note / correction reason" isOptional maxLength={500} rows={2} className="field" />
          <SubmitError>{submitError}</SubmitError>
        </>,
      },
    ]}
    validateStep={(_, fields) => trigger(fields as FieldPath<Values>[])}
    onSubmit={onSubmit}
    submitLabel={initial ? 'Save activity' : 'Record activity'}
    isSaving={saving}
  />
}

export function AssetValuationForm({ open, asset, latest, selectableAssets, latestForAsset, today = localToday(), saving, onClose, onSave }: {
  open: boolean
  asset: AssetAccount
  latest: AssetValuation | null
  selectableAssets?: readonly AssetAccount[]
  latestForAsset?: (assetId: string) => AssetValuation | null
  today?: DateOnly
  saving: boolean
  onClose: () => void
  onSave: (valuation: AssetValuation) => Promise<void>
}) {
  const schema = z.object({ nativeAmount: z.string().min(1, 'Enter the current value.'), asOfDate: dateOnly, exchangeRate: z.string(), rateDate: dateOnly, quantity: z.string().max(40), unitPrice: z.string().max(40), note: z.string().max(500) })
  type Values = z.infer<typeof schema>
  const [selectedAssetId, setSelectedAssetId] = useState(asset.id)
  const currentAsset = selectableAssets?.find((option) => option.id === selectedAssetId) ?? asset
  const defaults: Values = { nativeAmount: '', asOfDate: today, exchangeRate: asset.nativeCurrency === 'IDR' ? '1' : '', rateDate: today, quantity: '', unitPrice: '', note: '' }
  const { control, handleSubmit, reset, watch, trigger, setError, getValues } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmOlder, setConfirmOlder] = useState(false)
  const nativeAmount = watch('nativeAmount')
  const exchangeRate = watch('exchangeRate')
  const asOfDate = watch('asOfDate')
  const currentLatest = latestForAsset ? latestForAsset(currentAsset.id) : latest
  const older = Boolean(currentLatest && asOfDate && asOfDate < currentLatest.asOfDate)
  const preview = useMemo(() => {
    try {
      if (!nativeAmount) return null
      return convertMinorUnitsToIdr(parseAmountToMinorUnits(nativeAmount, currentAsset.nativeCurrency), currentAsset.nativeCurrency, currentAsset.nativeCurrency === 'IDR' ? '1' : exchangeRate)
    } catch { return null }
  }, [nativeAmount, currentAsset.nativeCurrency, exchangeRate])
  useLayoutEffect(() => {
    if (!open) return
    setSelectedAssetId(asset.id)
    setSubmitError(null)
    setConfirmOlder(false)
    reset({ nativeAmount: '', asOfDate: today, exchangeRate: asset.nativeCurrency === 'IDR' ? '1' : '', rateDate: today, quantity: '', unitPrice: '', note: '' })
  }, [open, asset.id, asset.nativeCurrency, today, reset])
  useLayoutEffect(() => {
    if (!open || !selectableAssets) return
    const selected = selectableAssets.find((option) => option.id === selectedAssetId)
    if (!selected) return
    setSubmitError(null)
    setConfirmOlder(false)
    reset({ nativeAmount: '', asOfDate: today, exchangeRate: selected.nativeCurrency === 'IDR' ? '1' : '', rateDate: today, quantity: '', unitPrice: '', note: '' })
  }, [open, selectedAssetId, selectableAssets, today, reset])
  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    if (older && !confirmOlder) return
    try {
      const nativeAmountMinor = parseAmountToMinorUnits(values.nativeAmount, currentAsset.nativeCurrency)
      const rate = currentAsset.nativeCurrency === 'IDR' ? '1' : values.exchangeRate.trim()
      const valueIdr = convertMinorUnitsToIdr(nativeAmountMinor, currentAsset.nativeCurrency, rate)
      const valuation: AssetValuation = {
        id: newId('valuation'), assetId: currentAsset.id, asOfDate: values.asOfDate,
        nativeAmountMinor, nativeCurrency: currentAsset.nativeCurrency, exchangeRate: rate,
        rateDate: currentAsset.nativeCurrency === 'IDR' ? values.asOfDate : values.rateDate,
        valueIdr, source: 'MANUAL', recordedAt: Date.now(),
        ...(values.quantity.trim() ? { quantity: values.quantity.trim() } : {}),
        ...(values.unitPrice.trim() ? { unitPrice: values.unitPrice.trim() } : {}),
        ...(values.note.trim() ? { note: values.note.trim() } : {}),
      }
      await onSave(valuation)
      onClose()
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Valuation could not be saved.') }
  })
  const selectionStep = selectableAssets ? [{
    label: 'Asset',
    fields: ['asset'],
    content: <Selector
      label="Asset"
      className="field"
      value={selectedAssetId}
      options={selectableAssets.map((option) => ({ value: option.id, label: `${option.name} · ${option.institution}` }))}
      onChange={setSelectedAssetId}
    />,
  }] : []
  const stepOffset = selectableAssets ? 1 : 0
  return <FormWizardDialog
    open={open}
    title="Update asset value"
    description={selectableAssets ? 'Choose an asset, then enter a manual estimate. Kinsen does not fetch live prices or exchange rates.' : 'Manual estimate only. Kinsen does not fetch live prices or exchange rates.'}
    onClose={onClose}
    steps={[
      ...selectionStep,
      {
        label: 'Value',
        fields: ['nativeAmount', 'asOfDate'],
        content: <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
          <AstryxTextField control={control} name="nativeAmount" label={`Native value (${currentAsset.nativeCurrency})`} inputMode="decimal" placeholder="0" className="field" />
          <AstryxDateField control={control} name="asOfDate" label="Valuation date" onValueChange={() => { setConfirmOlder(false); setSubmitError(null) }} className="field" />
        </Grid>,
      },
      {
        label: 'Details',
        fields: ['exchangeRate', 'rateDate', 'quantity', 'unitPrice'],
        content: <>
          {currentAsset.nativeCurrency !== 'IDR' && <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <AstryxTextField control={control} name="exchangeRate" label={`IDR per ${currentAsset.nativeCurrency}`} inputMode="decimal" placeholder="Exchange rate" className="field" />
            <AstryxDateField control={control} name="rateDate" label="Rate date" className="field" />
          </Grid>}
          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <AstryxTextField control={control} name="quantity" label="Quantity" isOptional inputMode="decimal" placeholder="Exact decimal" maxLength={40} className="field" />
            <AstryxTextField control={control} name="unitPrice" label="Unit price" isOptional inputMode="decimal" placeholder="Exact decimal" maxLength={40} className="field" />
          </Grid>
          <p className="valuation-preview">Estimated IDR value <strong>{preview === null ? 'Enter a valid value and rate' : `Rp ${preview.toLocaleString('id-ID')}`}</strong></p>
        </>,
      },
      {
        label: 'Note',
        fields: ['note'],
        content: <>
          {older && <CheckboxInput
            label={`This date is older than the latest valuation on ${currentLatest?.asOfDate}. Add it without replacing the newer record.`}
            value={confirmOlder}
            onChange={(value) => {
              setConfirmOlder(value)
              if (value) setSubmitError(null)
            }}
            className="confirm-older-value"
          />}
          <AstryxTextAreaField control={control} name="note" label="Note" isOptional maxLength={500} rows={2} className="field" />
          <SubmitError>{submitError}</SubmitError>
        </>,
      },
    ]}
    validateStep={async (stepIndex, fields) => {
      if (selectableAssets && stepIndex === 0) return selectableAssets.some((option) => option.id === selectedAssetId)
      if (!await trigger(fields as FieldPath<Values>[])) return false
      const valueStep = stepIndex - stepOffset
      if (valueStep === 0) {
        try {
          parseAmountToMinorUnits(getValues('nativeAmount'), currentAsset.nativeCurrency)
        } catch (error) {
          setError('nativeAmount', { type: 'validate', message: error instanceof Error ? error.message : 'Enter a valid value.' })
          return false
        }
      }
      if (valueStep === 1 && currentAsset.nativeCurrency !== 'IDR') {
        try {
          const amount = parseAmountToMinorUnits(getValues('nativeAmount'), currentAsset.nativeCurrency)
          convertMinorUnitsToIdr(amount, currentAsset.nativeCurrency, getValues('exchangeRate').trim())
        } catch (error) {
          setError('exchangeRate', { type: 'validate', message: error instanceof Error ? error.message : 'Enter a valid exchange rate.' })
          return false
        }
      }
      if (valueStep === 2 && older && !confirmOlder) {
        setSubmitError('Confirm that this older valuation should be added without replacing the newer record.')
        return false
      }
      return true
    }}
    onSubmit={onSubmit}
    submitLabel="Save valuation"
    isSaving={saving}
  />
}

const transferSchema = z.object({ sourceAssetId: z.string().min(1, 'Choose a source account.'), destinationAssetId: z.string().min(1, 'Choose a destination account.'), amount: z.string().min(1, 'Enter an amount.'), date: dateOnly, note: z.string().max(500) }).superRefine((values, context) => {
  if (values.sourceAssetId === values.destinationAssetId) context.addIssue({ code: 'custom', path: ['destinationAssetId'], message: 'Choose a different destination account.' })
  try { if (parseAmountToMinorUnits(values.amount, 'IDR') <= 0) context.addIssue({ code: 'custom', path: ['amount'], message: 'Amount must be greater than zero.' }) }
  catch (error) { context.addIssue({ code: 'custom', path: ['amount'], message: error instanceof Error ? error.message : 'Enter a valid amount.' }) }
})

export function TransferForm({ open, accounts, sourceAssetId, today = localToday(), saving, onClose, onSave }: {
  open: boolean
  accounts: AssetAccount[]
  sourceAssetId?: string
  today?: DateOnly
  saving: boolean
  onClose: () => void
  onSave: (input: { sourceAssetId: string; destinationAssetId: string; amountMinor: number; date: DateOnly; note?: string }) => Promise<void>
}) {
  type Values = z.infer<typeof transferSchema>
  const defaultSourceAssetId = sourceAssetId ?? accounts[0]?.id ?? ''
  const defaults: Values = { sourceAssetId: defaultSourceAssetId, destinationAssetId: accounts.find((asset) => asset.id !== defaultSourceAssetId)?.id ?? '', amount: '', date: today, note: '' }
  const { control, handleSubmit, reset, trigger } = useForm<Values>({ resolver: zodResolver(transferSchema), defaultValues: defaults })
  const [submitError, setSubmitError] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    setSubmitError(null)
    reset({ ...defaults, date: today })
  }, [open, sourceAssetId, accounts, today, reset])
  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      await onSave({ sourceAssetId: values.sourceAssetId, destinationAssetId: values.destinationAssetId, amountMinor: parseAmountToMinorUnits(values.amount, 'IDR'), date: values.date, ...(values.note.trim() ? { note: values.note.trim() } : {}) })
      onClose()
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Transfer could not be saved.') }
  })
  return <FormWizardDialog
    open={open}
    title="Record transfer"
    description="A tracked-to-tracked transfer creates paired entries and leaves total assets unchanged."
    onClose={onClose}
    steps={[
      {
        label: 'Accounts',
        fields: ['sourceAssetId', 'destinationAssetId'],
        content: <>
          <AstryxSelectField control={control} name="sourceAssetId" label="From" className="field" options={accounts.map((asset) => ({ value: asset.id, label: `${asset.name} · ${asset.institution}` }))} />
          <AstryxSelectField control={control} name="destinationAssetId" label="To" className="field" options={accounts.map((asset) => ({ value: asset.id, label: `${asset.name} · ${asset.institution}` }))} />
        </>,
      },
      {
        label: 'Transfer details',
        fields: ['amount', 'date', 'note'],
        content: <>
          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <AstryxTextField control={control} name="amount" label="Amount" inputMode="numeric" placeholder="0" startContent="Rp" className="field" />
            <AstryxDateField control={control} name="date" label="Date" className="field" />
          </Grid>
          <AstryxTextField control={control} name="note" label="Note" isOptional maxLength={500} className="field" />
          <SubmitError>{submitError}</SubmitError>
        </>,
      },
    ]}
    validateStep={(_, fields) => trigger(fields as FieldPath<Values>[])}
    onSubmit={onSubmit}
    submitLabel="Record transfer"
    isSaving={saving}
  />
}

const liabilitySchema = z.object({ name: z.string().trim().min(1, 'Add a liability name.').max(100), type: z.enum(LIABILITY_TYPES), institution: z.string().trim().min(1, 'Add a bank or provider.').max(100), notes: z.string().max(1000), openingAmount: z.string().min(1, 'Enter an opening balance.'), openingDate: dateOnly })

export function LiabilityForm({ open, initial, today = localToday(), saving, onClose, onSave }: {
  open: boolean
  initial?: LiabilityAccount | null
  today?: DateOnly
  saving: boolean
  onClose: () => void
  onSave: (liability: LiabilityAccount, openingEntry?: LiabilityEntry) => Promise<void>
}) {
  type Values = z.infer<typeof liabilitySchema>
  const defaults: Values = { name: initial?.name ?? '', type: initial?.type ?? 'CREDIT_CARD', institution: initial?.institution ?? '', notes: initial?.notes ?? '', openingAmount: '0', openingDate: initial?.createdAt ?? today }
  const { control, handleSubmit, reset, trigger, setError, getValues } = useForm<Values>({ resolver: zodResolver(liabilitySchema), defaultValues: defaults })
  const [submitError, setSubmitError] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    setSubmitError(null)
    reset({ ...defaults, openingDate: today })
  }, [open, initial, today, reset])
  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      const liability: LiabilityAccount = {
        id: initial?.id ?? newId('liability'), name: values.name.trim(), type: values.type,
        institution: values.institution.trim(), nativeCurrency: 'IDR', createdAt: initial?.createdAt ?? values.openingDate,
        ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
        ...(initial?.archivedAt ? { archivedAt: initial.archivedAt } : {}),
      }
      if (initial) await onSave(liability)
      else await onSave(liability, { id: newId('liability-entry'), liabilityId: liability.id, date: values.openingDate, kind: 'OPENING_BALANCE', amountMinor: parseAmountToMinorUnits(values.openingAmount, 'IDR'), note: 'Opening balance' })
      onClose()
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Liability could not be saved.') }
  })
  return <FormWizardDialog
    open={open}
    title={initial ? 'Edit liability details' : 'Add a liability'}
    description="Record outstanding debt so Kinsen can calculate net worth. Balances stay on this device."
    onClose={onClose}
    steps={[
      {
        label: 'Details',
        fields: ['name', 'type', 'institution'],
        content: <>
          <AstryxTextField control={control} name="name" label="Name" maxLength={100} className="field" />
          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <AstryxSelectField control={control} name="type" label="Type" className="field" options={LIABILITY_TYPES.map((type) => ({ value: type, label: liabilityTypeLabels[type] }))} />
            <AstryxTextField control={control} name="institution" label="Bank / provider" maxLength={100} className="field" />
          </Grid>
        </>,
      },
      {
        label: initial ? 'Notes' : 'Opening balance',
        fields: initial ? ['notes'] : ['openingAmount', 'openingDate', 'notes'],
        content: <>
          {!initial && <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <AstryxTextField control={control} name="openingAmount" label="Opening balance (IDR)" inputMode="numeric" placeholder="0" startContent="Rp" className="field" />
            <AstryxDateField control={control} name="openingDate" label="As-of date" className="field" />
          </Grid>}
          <AstryxTextAreaField control={control} name="notes" label="Notes" isOptional maxLength={1000} rows={2} className="field" />
          <SubmitError>{submitError}</SubmitError>
        </>,
      },
    ]}
    validateStep={async (stepIndex, fields) => {
      if (!await trigger(fields as FieldPath<Values>[])) return false
      if (initial || stepIndex !== 1) return true
      try {
        parseAmountToMinorUnits(getValues('openingAmount'), 'IDR')
        return true
      } catch (error) {
        setError('openingAmount', { type: 'validate', message: error instanceof Error ? error.message : 'Enter a valid opening balance.' })
        return false
      }
    }}
    onSubmit={onSubmit}
    submitLabel={initial ? 'Save details' : 'Save liability'}
    isSaving={saving}
  />
}

const liabilityActivitySchema = z.object({ kind: z.enum(['CHARGE', 'INTEREST_OR_FEE', 'CORRECTION']), amount: z.string().min(1, 'Enter an amount.'), date: dateOnly, note: z.string().max(500) }).superRefine((values, context) => {
  try {
    const amount = parseAmountToMinorUnits(values.amount, 'IDR', values.kind === 'CORRECTION')
    if (values.kind === 'CORRECTION' ? amount === 0 : amount <= 0) context.addIssue({ code: 'custom', path: ['amount'], message: values.kind === 'CORRECTION' ? 'Correction must change the balance.' : 'Amount must be greater than zero.' })
    if (values.kind === 'CORRECTION' && !values.note.trim()) context.addIssue({ code: 'custom', path: ['note'], message: 'Add a reason for this correction.' })
  } catch (error) { context.addIssue({ code: 'custom', path: ['amount'], message: error instanceof Error ? error.message : 'Enter a valid amount.' }) }
})

export function LiabilityActivityForm({ open, liability, initial, today = localToday(), saving, onClose, onSave }: {
  open: boolean
  liability: LiabilityAccount
  initial?: LiabilityEntry | null
  today?: DateOnly
  saving: boolean
  onClose: () => void
  onSave: (entry: LiabilityEntry) => Promise<void>
}) {
  type Values = z.infer<typeof liabilityActivitySchema>
  const activityKind = initial?.kind === 'INTEREST_OR_FEE' || initial?.kind === 'CORRECTION' ? initial.kind : 'CHARGE'
  const defaults: Values = { kind: activityKind, amount: initial ? String(initial.amountMinor) : '', date: initial?.date ?? today, note: initial?.note ?? '' }
  const { control, handleSubmit, reset, trigger } = useForm<Values>({ resolver: zodResolver(liabilityActivitySchema), defaultValues: defaults })
  const [submitError, setSubmitError] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    setSubmitError(null)
    reset({ ...defaults, date: initial?.date ?? today })
  }, [open, initial, today, reset])
  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      const entry: LiabilityEntry = { id: initial?.id ?? newId('liability-entry'), liabilityId: liability.id, date: values.date, kind: values.kind, amountMinor: parseAmountToMinorUnits(values.amount, 'IDR', values.kind === 'CORRECTION'), ...(values.note.trim() ? { note: values.note.trim() } : {}) }
      await onSave(entry)
      onClose()
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Liability activity could not be saved.') }
  })
  return <FormWizardDialog
    open={open}
    title={initial ? 'Edit liability activity' : 'Record liability change'}
    description={`${liability.name} · payments are recorded separately from budget expenses.`}
    onClose={onClose}
    steps={[
      {
        label: 'Change',
        fields: ['kind', 'amount', 'date'],
        content: <>
          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <AstryxSelectField control={control} name="kind" label="Change type" className="field" options={[
              { value: 'CHARGE', label: 'New charge' },
              { value: 'INTEREST_OR_FEE', label: 'Interest / fee' },
              { value: 'CORRECTION', label: 'Correction' },
            ]} />
            <AstryxTextField control={control} name="amount" label="Amount (IDR)" inputMode="numeric" placeholder="0" startContent="Rp" className="field" />
          </Grid>
          <AstryxDateField control={control} name="date" label="Date" className="field" />
        </>,
      },
      {
        label: 'Note',
        fields: ['note'],
        content: <>
          <AstryxTextAreaField control={control} name="note" label="Note / correction reason" maxLength={500} rows={2} className="field" />
          <SubmitError>{submitError}</SubmitError>
        </>,
      },
    ]}
    validateStep={(_, fields) => trigger(fields as FieldPath<Values>[])}
    onSubmit={onSubmit}
    submitLabel="Save balance change"
    isSaving={saving}
  />
}

export function LiabilityPaymentForm({ open, liability, accounts, assetBalances, maxLiabilityBalance, today = localToday(), saving, onClose, onSave }: {
  open: boolean
  liability: LiabilityAccount
  accounts: AssetAccount[]
  assetBalances: Record<string, number>
  maxLiabilityBalance: number
  today?: DateOnly
  saving: boolean
  onClose: () => void
  onSave: (input: { assetId: string; amountMinor: number; date: DateOnly; note?: string }) => Promise<void>
}) {
  const schema = z.object({
    assetId: z.string().min(1, 'Choose a payment account.'),
    amount: z.string().min(1, 'Enter an amount.'),
    date: dateOnly,
    note: z.string().max(500),
  }).superRefine((values, context) => {
    try {
      const amount = parseAmountToMinorUnits(values.amount, 'IDR')
      if (amount <= 0) context.addIssue({ code: 'custom', path: ['amount'], message: 'Payment must be greater than zero.' })
      const maximum = Math.min(maxLiabilityBalance, assetBalances[values.assetId] ?? 0)
      if (amount > maximum) context.addIssue({ code: 'custom', path: ['amount'], message: `Payment cannot exceed the available ${maximum.toLocaleString('id-ID')} rupiah.` })
    } catch (error) {
      context.addIssue({ code: 'custom', path: ['amount'], message: error instanceof Error ? error.message : 'Enter a valid payment.' })
    }
  })
  type Values = z.infer<typeof schema>
  const defaults: Values = { assetId: accounts[0]?.id ?? '', amount: '', date: today, note: '' }
  const { control, handleSubmit, reset, watch, trigger } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const selectedAssetId = watch('assetId')
  const available = Math.min(maxLiabilityBalance, assetBalances[selectedAssetId] ?? 0)
  useLayoutEffect(() => {
    if (!open) return
    setSubmitError(null)
    reset({ ...defaults, date: today })
  }, [open, liability.id, accounts, today, reset])
  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      await onSave({ assetId: values.assetId, amountMinor: parseAmountToMinorUnits(values.amount, 'IDR'), date: values.date, ...(values.note.trim() ? { note: values.note.trim() } : {}) })
      onClose()
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Payment could not be saved.') }
  })
  return <FormWizardDialog
    open={open}
    title="Record liability payment"
    description="This settles debt and reduces cash. It does not create another budget expense."
    onClose={onClose}
    steps={[
      {
        label: 'Account',
        fields: ['assetId'],
        content: <AstryxSelectField
          control={control}
          name="assetId"
          label="Paid from"
          className="field"
          options={accounts.map((asset) => ({ value: asset.id, label: `${asset.name} · ${asset.institution}` }))}
          description={`Available to settle: Rp ${available.toLocaleString('id-ID')}`}
        />,
      },
      {
        label: 'Payment',
        fields: ['amount', 'date', 'note'],
        content: <>
          <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
            <AstryxTextField control={control} name="amount" label="Amount (IDR)" inputMode="numeric" placeholder="0" startContent="Rp" className="field" />
            <AstryxDateField control={control} name="date" label="Date" className="field" />
          </Grid>
          <AstryxTextField control={control} name="note" label="Note" isOptional maxLength={500} className="field" />
          <SubmitError>{submitError}</SubmitError>
        </>,
      },
    ]}
    validateStep={(_, fields) => trigger(fields as FieldPath<Values>[])}
    onSubmit={onSubmit}
    submitLabel="Record payment"
    isSaving={saving}
  />
}
