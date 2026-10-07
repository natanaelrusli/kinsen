export { addDays, addMonthsPreservingDay, daysInMonth, parseDateOnly } from './date.js'
import type { DateOnly } from './model.js'
import { addMonthsPreservingDay, daysBetweenInclusive, parseDateOnly } from './date.js'

export function compareDates(a: DateOnly, b: DateOnly): number {
  parseDateOnly(a); parseDateOnly(b)
  return a < b ? -1 : a > b ? 1 : 0
}

export function daysBetween(start: DateOnly, end: DateOnly): number {
  const comparison = compareDates(start, end)
  if (comparison === 0) return 0
  return comparison < 0 ? daysBetweenInclusive(start, end) - 1 : -(daysBetweenInclusive(end, start) - 1)
}

export function addMonths(date: DateOnly, amount: number): DateOnly {
  return addMonthsPreservingDay(date, amount)
}

export function weekday(date: DateOnly): number {
  const { year, month, day } = parseDateOnly(date)
  let y = year, m = month
  if (m < 3) { y--; m += 12 }
  const k = y % 100, j = Math.floor(y / 100)
  return ((day + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7 + 6) % 7
}
