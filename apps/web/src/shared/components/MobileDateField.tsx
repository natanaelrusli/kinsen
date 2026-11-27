import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form'
import type { DateOnly } from '@kinsen/budget-domain'
import { toLocalDate } from '../format/date'
import { AstryxDateField } from './AstryxFields'

function previousDay(date: DateOnly): DateOnly {
  const d = toLocalDate(date)
  d.setDate(d.getDate() - 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` as DateOnly
}

type MobileDateFieldProps<T extends FieldValues> = {
  control: Control<T>
  name: FieldPath<T>
  label: string
  today: DateOnly | ''
  min?: string
  max?: string
}

/**
 * Touch date picker: Today/Yesterday shortcuts for the common case, plus a tappable
 * field showing a readable date ("Fri, Nov 27, 2026") that opens a calendar bottom sheet.
 */
export function MobileDateField<T extends FieldValues>({ control, name, label, today, min, max }: MobileDateFieldProps<T>) {
  const yesterday = today ? previousDay(today) : ''
  // Yesterday can fall outside the allowed range, which the picker would reject.
  const shortcuts = [
    ...(today ? [{ label: 'Today', value: today }] : []),
    ...(yesterday && (!min || yesterday >= min) ? [{ label: 'Yesterday', value: yesterday }] : []),
  ]
  return (
    <div className="mobile-date-field">
      <AstryxDateField control={control} name={name} label={label} min={min} max={max} presentation="bottom-sheet" format="date_weekday" className="field" />
      <Controller control={control} name={name} render={({ field }) => (
        <div className="expense-sheet-chips" role="radiogroup" aria-label={`${label} shortcuts`}>
          {shortcuts.map((shortcut) => (
            <button
              key={shortcut.label}
              type="button"
              role="radio"
              aria-checked={field.value === shortcut.value}
              className="expense-sheet-chip"
              onClick={() => field.onChange(shortcut.value)}>
              {shortcut.label}
            </button>
          ))}
        </div>
      )} />
    </div>
  )
}
