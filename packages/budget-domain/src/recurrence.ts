import type { DateOnly, RecurrenceCadence } from './model.js'
import { addDays, addMonthsPreservingDay, parseDateOnly } from './date.js'

/** Enumerates recurrence dates in the requested inclusive range without walking dates before it. */
export function recurrenceDates(anchor: DateOnly, cadence: RecurrenceCadence | null, start: DateOnly, end: DateOnly): DateOnly[] {
  const { year, month, day } = parseDateOnly(anchor)
  parseDateOnly(start)
  parseDateOnly(end)
  if (end < start) throw new Error('End date precedes start date')
  if (end < anchor) return []
  if (!cadence) return anchor >= start ? [anchor] : []

  const dates: DateOnly[] = []
  if (cadence === 'WEEKLY') {
    const elapsedDays = Math.max(0, Math.floor((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 86_400_000))
    let due = addDays(anchor, Math.ceil(elapsedDays / 7) * 7)
    while (due <= end) { dates.push(due); due = addDays(due, 7) }
    return dates
  }

  const interval = cadence === 'MONTHLY' ? 1 : cadence === 'QUARTERLY' ? 3 : 12
  const [startYear, startMonth] = start.split('-').map(Number)
  const elapsedMonths = Math.max(0, (startYear! - year) * 12 + startMonth! - month)
  let index = Math.floor(elapsedMonths / interval)
  let due = addMonthsPreservingDay(anchor, index * interval, day)
  if (due < start) { index++; due = addMonthsPreservingDay(anchor, index * interval, day) }
  while (due <= end) {
    dates.push(due)
    index++
    due = addMonthsPreservingDay(anchor, index * interval, day)
  }
  return dates
}
