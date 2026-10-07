import type { DateOnly } from './model.js'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDateOnly(value: DateOnly): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(value)
  if (!match) throw new Error(`Invalid date: ${value}`)
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) throw new Error(`Invalid date: ${value}`)
  return { year, month, day }
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < 1 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Invalid Gregorian month')
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

export function formatDateOnly(year: number, month: number, day: number): DateOnly {
  if (year < 1 || year > 9999 || day < 1 || day > daysInMonth(year, month)) throw new Error('Invalid Gregorian date')
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function addDays(date: DateOnly, count: number): DateOnly {
  if (!Number.isSafeInteger(count)) throw new Error('Day increment must be an integer')
  let { year, month, day } = parseDateOnly(date)
  const step = count < 0 ? -1 : 1
  for (let n = Math.abs(count); n > 0; n--) {
    day += step
    if (step > 0 && day > daysInMonth(year, month)) { day = 1; month++; if (month > 12) { month = 1; year++ } }
    if (step < 0 && day < 1) { month--; if (month < 1) { month = 12; year-- } day = daysInMonth(year, month) }
  }
  return formatDateOnly(year, month, day)
}

export function addMonthsPreservingDay(date: DateOnly, count: number, originalDay?: number): DateOnly {
  const parts = parseDateOnly(date)
  const absolute = parts.year * 12 + parts.month - 1 + count
  const year = Math.floor(absolute / 12), month = absolute % 12 + 1
  return formatDateOnly(year, month, Math.min(originalDay ?? parts.day, daysInMonth(year, month)))
}

export function daysBetweenInclusive(start: DateOnly, end: DateOnly): number {
  if (end < start) throw new Error('End date precedes start date')
  let days = 1
  for (let date = start; date < end; date = addDays(date, 1)) days++
  return days
}
