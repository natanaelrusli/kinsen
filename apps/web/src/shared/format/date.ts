import type { DateOnly } from '@kinsen/budget-domain'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'


export function localToday(): DateOnly {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function toLocalDate(value: DateOnly): Date {
  const { year, month, day } = parseDateOnly(value)
  return new Date(year, month - 1, day)
}

export function formatDate(value: DateOnly, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  return new Intl.DateTimeFormat('en-ID', options).format(toLocalDate(value))
}

export function formatLongDate(value: DateOnly): string {
  return new Intl.DateTimeFormat('en-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(toLocalDate(value))
}

export function formatMonth(value: DateOnly): string {
  return new Intl.DateTimeFormat('en-ID', { month: 'long', year: 'numeric' }).format(toLocalDate(value))
}
