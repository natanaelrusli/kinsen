import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { Controller, useController, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { DateInput, type DateInputProps } from '@astryxdesign/core/DateInput'
import { Field } from '@astryxdesign/core/Field'
import { Selector } from '@astryxdesign/core/Selector'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import { formatGroupedAmount } from '../format/money'

type AstryxDate = NonNullable<DateInputProps['value']>
type ControlledFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  description?: string
  isOptional?: boolean
  className?: string
}

type TextFieldProps<T extends FieldValues> = ControlledFieldProps<T> & {
  autoComplete?: string
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  isDisabled?: boolean
  isLabelHidden?: boolean
  maxLength?: number
  placeholder?: string
  startContent?: ReactNode
}

function inputStatus(message?: string) {
  return message ? { type: 'error' as const, message } : undefined
}

function groupedCaretOffset(value: string, rawOffset: number): number {
  const formatted = formatGroupedAmount(value)
  const target = Math.min(Math.max(rawOffset, 0), value.length)
  if (target === 0) return 0
  let rawPosition = 0
  for (let index = 0; index < formatted.length; index += 1) {
    if (formatted[index] !== ',') rawPosition += 1
    if (rawPosition >= target) return index + 1
  }
  return formatted.length
}

export function AstryxTextField<T extends FieldValues>({ control, name, label, description, isOptional, className, autoComplete, inputMode, isDisabled, isLabelHidden, maxLength, placeholder, startContent }: TextFieldProps<T>) {
  const fieldRef = useRef<((element: HTMLInputElement | null) => void) | undefined>(undefined)
  // Astryx TextInput has no inputMode prop; preserve native mobile keyboard hints through its ref.
  const inputRef = useCallback((element: HTMLInputElement | null) => {
    fieldRef.current?.(element)
    if (element) element.inputMode = inputMode ?? ''
  }, [inputMode])
  return <Controller control={control} name={name} render={({ field, fieldState }) => {
    fieldRef.current = field.ref
    return (
      <TextInput
        isLabelHidden={isLabelHidden}
        label={label}
        value={typeof field.value === 'string' ? field.value : field.value == null ? '' : String(field.value)}
        onChange={(value) => field.onChange(maxLength === undefined ? value : value.slice(0, maxLength))}
        onBlur={field.onBlur}
        ref={inputRef}
        htmlName={field.name}
        autoComplete={autoComplete}
        isDisabled={isDisabled}
        placeholder={placeholder}
        startIcon={startContent}
        description={description}
        isOptional={isOptional}
        status={inputStatus(fieldState.error?.message)}
        statusVariant="detached"
        className={className}
      />
    )
  }} />
}

export function AstryxTextAreaField<T extends FieldValues>({ control, name, label, description, isOptional, className, maxLength, rows = 3 }: ControlledFieldProps<T> & { maxLength?: number; rows?: number }) {
  return <Controller control={control} name={name} render={({ field, fieldState }) => (
    <TextArea
      label={label}
      value={typeof field.value === 'string' ? field.value : field.value == null ? '' : String(field.value)}
      onChange={(value) => field.onChange(maxLength === undefined ? value : value.slice(0, maxLength))}
      onBlur={field.onBlur}
      ref={field.ref}
      htmlName={field.name}
      rows={rows}
      maxLength={maxLength}
      description={description}
      isOptional={isOptional}
      status={inputStatus(fieldState.error?.message)}
      statusVariant="detached"
      className={className}
    />
  )} />
}

type CurrencyAmountFieldProps<T extends FieldValues> = ControlledFieldProps<T> & {
  autoComplete?: string
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  isDisabled?: boolean
  isLabelHidden?: boolean
  maxLength?: number
  placeholder?: string
  prefix?: ReactNode
  step?: number
}

export function CurrencyAmountField<T extends FieldValues>({ control, name, label, description, isOptional, className, autoComplete, inputMode, isDisabled, isLabelHidden, maxLength, placeholder, prefix, step = 1 }: CurrencyAmountFieldProps<T>) {
  const { field, fieldState } = useController({ control, name })
  const [editingValue, setEditingValue] = useState<string | null>(null)
  const [selectionRevision, setSelectionRevision] = useState(0)
  const fieldRef = useRef<((element: HTMLInputElement | null) => void) | undefined>(undefined)
  const inputElementRef = useRef<HTMLInputElement | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const isNumeric = typeof field.value === 'number'
  const isEmpty = field.value === '' || field.value === null || field.value === undefined
  useLayoutEffect(() => {
    if (!isOptional && isEmpty) field.onChange(typeof field.value === 'string' ? '0' : 0)
  }, [field.onChange, field.value, isEmpty, isOptional])
  useLayoutEffect(() => {
    const input = inputElementRef.current
    const selection = pendingSelectionRef.current
    if (!input || selection === null) return
    input.setSelectionRange(selection.start, selection.end)
    pendingSelectionRef.current = null
  }, [selectionRevision])
  const inputRef = useCallback((element: HTMLInputElement | null) => {
    fieldRef.current?.(element)
    inputElementRef.current = element
    if (element) element.inputMode = inputMode ?? (step === 1 ? 'numeric' : 'decimal')
  }, [inputMode, step])
  fieldRef.current = field.ref

  const storedValue = typeof field.value === 'string'
    ? field.value
    : typeof field.value === 'number' && Number.isFinite(field.value)
      ? String(field.value)
      : ''
  const displaySource = (editingValue ?? storedValue) || '0'
  const commitNumber = (value: string) => {
    const parsed = value.trim() === '' ? 0 : Number(value)
    if (!Number.isFinite(parsed)) {
      field.onChange(Number.NaN)
      return Number.NaN
    }
    field.onChange(parsed)
    return parsed
  }

  return (
    <TextInput
      isLabelHidden={isLabelHidden}
      label={label}
      value={formatGroupedAmount(displaySource)}
      onChange={(value, event) => {
        const ungrouped = value.replaceAll(',', '')
        const truncated = typeof field.value === 'string' && maxLength !== undefined
          ? ungrouped.slice(0, maxLength)
          : ungrouped
        const nextValue = truncated === '' && !isOptional ? '0' : truncated
        const start = event?.currentTarget.selectionStart ?? value.length
        const end = event?.currentTarget.selectionEnd ?? start
        const rawStart = value.slice(0, start).replaceAll(',', '').length
        const rawEnd = value.slice(0, end).replaceAll(',', '').length
        pendingSelectionRef.current = {
          start: groupedCaretOffset(nextValue || '0', rawStart),
          end: groupedCaretOffset(nextValue || '0', rawEnd),
        }
        setSelectionRevision((revision) => revision + 1)
        setEditingValue(nextValue)
        if (isNumeric) {
          field.onChange(nextValue === '' ? (isOptional ? undefined : 0) : Number(nextValue))
        } else {
          field.onChange(nextValue)
        }
      }}
      onFocus={() => {
        setEditingValue(displaySource)
        if (displaySource === '0') {
          pendingSelectionRef.current = { start: 0, end: 1 }
          setSelectionRevision((revision) => revision + 1)
        }
      }}
      onKeyDown={(event) => {
        if (displaySource === '0' && (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete')) {
          event.currentTarget.setSelectionRange(0, event.currentTarget.value.length)
        }
      }}
      onBlur={(event) => {
        if (isNumeric) {
          const value = (event.currentTarget as HTMLInputElement).value.replaceAll(',', '')
          const committed = commitNumber(value)
          setEditingValue(Number.isFinite(committed) ? null : value)
        } else {
          setEditingValue(null)
        }
        field.onBlur()
      }}
      onEnter={() => {
        if (!isNumeric) return
        const value = inputElementRef.current?.value.replaceAll(',', '') ?? ''
        const committed = commitNumber(value)
        setEditingValue(Number.isFinite(committed) ? String(committed) : value)
      }}
      ref={inputRef}
      htmlName={field.name}
      autoComplete={autoComplete}
      isDisabled={isDisabled}
      placeholder={placeholder}
      startIcon={prefix}
      hasClear
      description={description}
      isOptional={isOptional}
      status={inputStatus(fieldState.error?.message)}
      statusVariant="detached"
      className={className}
    />
  )
}

export type AstryxOption = { value: string; label: string; description?: string; disabled?: boolean }

export function AstryxSelectField<T extends FieldValues>({ control, name, label, description, isOptional, className, options, placeholder, isDisabled, onValueChange }: ControlledFieldProps<T> & {
  options: AstryxOption[]
  placeholder?: string
  isDisabled?: boolean
  onValueChange?: (value: string) => void
}) {
  return <Controller control={control} name={name} render={({ field, fieldState }) => (
    <Selector
      label={label}
      options={options}
      value={typeof field.value === 'string' ? field.value : undefined}
      onChange={(value) => { field.onChange(value); onValueChange?.(value) }}
      onBlur={field.onBlur}
      htmlName={field.name}
      placeholder={placeholder}
      isDisabled={isDisabled}
      description={description}
      isOptional={isOptional}
      status={inputStatus(fieldState.error?.message)}
      statusVariant="detached"
      className={className}
    />
  )} />
}

type DateFieldProps<T extends FieldValues> = ControlledFieldProps<T> & {
  min?: string
  max?: string
  onValueChange?: (value: string) => void
}

export function AstryxDateField<T extends FieldValues>({ control, name, label, description, isOptional, className, min, max, onValueChange }: DateFieldProps<T>) {
  return <Controller control={control} name={name} render={({ field, fieldState }) => (
    <DateInput
      label={label}
      value={typeof field.value === 'string' && field.value ? field.value as AstryxDate : undefined}
      onChange={(value) => { const nextValue = value ?? ''; field.onChange(nextValue); onValueChange?.(nextValue) }}
      onBlur={field.onBlur}
      ref={field.ref}
      min={min as DateInputProps['min']}
      max={max as DateInputProps['max']}
      presentation="native"
      format="system_date"
      description={description}
      isOptional={isOptional}
      status={inputStatus(fieldState.error?.message)}
      statusVariant="detached"
      className={className}
    />
  )} />
}

export function AstryxColorField<T extends FieldValues>({ control, name, label, className }: ControlledFieldProps<T>) {
  const inputId = useId()
  return <Controller control={control} name={name} render={({ field, fieldState }) => (
    <Field label={label} inputID={inputId} status={inputStatus(fieldState.error?.message)} statusVariant="detached" className={className}>
      <input
        id={inputId}
        ref={field.ref}
        name={field.name}
        type="color"
        className="color-input"
        value={typeof field.value === 'string' ? field.value : '#000000'}
        onChange={(event) => field.onChange(event.currentTarget.value)}
        onBlur={field.onBlur}
      />
    </Field>
  )} />
}
