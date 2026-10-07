import { useCallback, useId, useRef } from 'react'
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import { DateInput, type DateInputProps } from '@astryxdesign/core/DateInput'
import { Field } from '@astryxdesign/core/Field'
import { NumberInput } from '@astryxdesign/core/NumberInput'
import { Selector } from '@astryxdesign/core/Selector'
import { TextArea } from '@astryxdesign/core/TextArea'
import { TextInput } from '@astryxdesign/core/TextInput'
import type { InputHTMLAttributes, ReactNode } from 'react'

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

export function AstryxNumberField<T extends FieldValues>({ control, name, label, description, isOptional, className, prefix, min, max, step = 1 }: ControlledFieldProps<T> & { prefix?: ReactNode; min?: number; max?: number; step?: number }) {
  return <Controller control={control} name={name} render={({ field, fieldState }) => (
    <NumberInput
      label={label}
      value={typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : null}
      onChange={(value) => field.onChange(value ?? Number.NaN)}
      onBlur={field.onBlur}
      ref={field.ref}
      htmlName={field.name}
      min={min}
      max={max}
      step={step}
      isIntegerOnly={step === 1}
      hasClear
      startIcon={prefix}
      description={description}
      isOptional={isOptional}
      status={inputStatus(fieldState.error?.message)}
      statusVariant="detached"
      className={className}
    />
  )} />
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
