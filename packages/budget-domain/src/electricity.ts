import type { DateOnly } from './model.js'
import { addDays, daysBetween, daysInMonth, parseDateOnly } from './date-only.js'

export type RefillSource = 'none' | 'entered' | 'inferred_balance_difference' | 'unknown'

export interface TokenObservation {
  id: string
  date: DateOnly
  sequence: number
  /** Reading after any credit represented by this observation. */
  remainingMilliKwh: number
  /** null means no credit for source=none, or unknown for source=unknown. */
  refillMilliKwh: number | null
  refillCostIdr: number | null
  refillSource: RefillSource
  note?: string
  /** Optional source-sheet locator for imported or test fixtures. */
  sourceReference?: string
}

export type ElectricityStatus = 'ok' | 'insufficient_data' | 'invalid_input'
export type ElectricityIssueCode =
  | 'invalid_today' | 'invalid_id' | 'duplicate_id' | 'invalid_date' | 'future_observation'
  | 'invalid_sequence' | 'duplicate_sequence' | 'invalid_balance' | 'invalid_refill'
  | 'invalid_refill_source' | 'source_mismatch' | 'invalid_cost' | 'cost_without_refill'
  | 'negative_interval_usage' | 'missing_refill' | 'numeric_overflow' | 'invalid_month'
export type ElectricityWarningCode = 'uncertain_refill' | 'unknown_refill' | 'missing_refill_cost' | 'stale_reading' | 'partial_month' | 'insufficient_data'

export interface ElectricityIssue {
  code: ElectricityIssueCode
  message: string
  recordIds: string[]
}

export interface ElectricityWarning {
  code: ElectricityWarningCode
  message: string
  recordIds: string[]
}

export interface ElectricityValidation {
  valid: boolean
  errors: ElectricityIssue[]
  warnings: ElectricityWarning[]
}

export type ForecastStatus = 'forecast' | 'indefinite' | 'empty' | 'insufficient_data' | 'invalid_input' | 'beyond_date_range'

export interface DepletionForecast {
  status: ForecastStatus
  estimatedDaysRemaining: number | null
  predictedDate: DateOnly | null
}

export interface ElectricityMetrics {
  status: ElectricityStatus
  asOfDate: DateOnly | null
  startDate: DateOnly | null
  recordCount: number
  readingAgeDays: number | null
  elapsedDays: number | null
  firstBalanceKwh: number | null
  latestBalanceKwh: number | null
  totalKnownRefillKwh: number | null
  refillDataComplete: boolean
  consumedKwh: number | null
  averageDailyKwh: number | null
  totalRecordedRefillSpendingIdr: number | null
  spendingComplete: boolean
  averageWeeklyRefillSpendingIdr: number | null
  average30DayRefillSpendingIdr: number | null
  estimatedDaysToDepletion: number | null
  predictedDepletionDate: DateOnly | null
  forecastStatus: ForecastStatus
  warnings: ElectricityWarning[]
  errors: ElectricityIssue[]
}

export interface MonthMetrics {
  month: string
  status: ElectricityStatus
  startDate: DateOnly | null
  endDate: DateOnly | null
  elapsedDays: number | null
  observedKwh: number | null
  averageDailyKwh: number | null
  thirtyDayEquivalentKwh: number | null
  recordedRefillSpendingIdr: number | null
  spendingComplete: boolean
  average30DayRefillSpendingIdr: number | null
  partialMonth: boolean
  warnings: ElectricityWarning[]
  errors: ElectricityIssue[]
}

const refillSources = new Set<RefillSource>(['none', 'entered', 'inferred_balance_difference', 'unknown'])
const MAX_MILLI_KWH = Number.MAX_SAFE_INTEGER

function compareObservations(left: TokenObservation, right: TokenObservation): number {
  return left.date.localeCompare(right.date) || left.sequence - right.sequence || left.id.localeCompare(right.id)
}

export function sortElectricityHistory(observations: readonly TokenObservation[]): TokenObservation[] {
  return [...observations].sort(compareObservations)
}

function issue(code: ElectricityIssueCode, message: string, ...recordIds: string[]): ElectricityIssue {
  return { code, message, recordIds }
}

function warning(code: ElectricityWarningCode, message: string, ...recordIds: string[]): ElectricityWarning {
  return { code, message, recordIds }
}

function addSafe(left: number, right: number): number | null {
  const result = left + right
  return Number.isSafeInteger(result) ? result : null
}

function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

export function validateElectricityHistory(observations: readonly TokenObservation[], today: DateOnly): ElectricityValidation {
  const errors: ElectricityIssue[] = []
  const warnings: ElectricityWarning[] = []
  try {
    parseDateOnly(today)
  } catch {
    errors.push(issue('invalid_today', 'The current date must be a valid local calendar date.'))
  }

  const ids = new Set<string>()
  const sequences = new Set<string>()
  const individuallyValid = new Set<string>()

  for (const observation of observations) {
    if (!observation.id.trim()) errors.push(issue('invalid_id', 'Each reading needs a stable ID.', observation.id))
    if (ids.has(observation.id)) errors.push(issue('duplicate_id', 'Reading IDs must be unique.', observation.id))
    ids.add(observation.id)

    let dateValid = false
    try {
      parseDateOnly(observation.date)
      dateValid = true
      if (observation.date > today) errors.push(issue('future_observation', 'A meter reading cannot be dated in the future.', observation.id))
    } catch {
      errors.push(issue('invalid_date', 'Enter a valid local date in YYYY-MM-DD format.', observation.id))
    }

    let rowValid = dateValid && observation.id.trim().length > 0 && Number.isSafeInteger(observation.sequence) && observation.sequence >= 0
    if (!Number.isSafeInteger(observation.sequence) || observation.sequence < 0) {
      errors.push(issue('invalid_sequence', 'Reading order must be a nonnegative whole number.', observation.id))
      rowValid = false
    }
    const orderKey = `${observation.date}\u0000${observation.sequence}`
    if (sequences.has(orderKey)) {
      errors.push(issue('duplicate_sequence', 'Two readings on the same date cannot have the same order.', observation.id))
      rowValid = false
    }
    sequences.add(orderKey)

    if (!isSafeNonNegativeInteger(observation.remainingMilliKwh)) {
      errors.push(issue('invalid_balance', 'Remaining credit must be a nonnegative value with at most three decimal places.', observation.id))
      rowValid = false
    }

    if (observation.refillMilliKwh !== null && !isSafeNonNegativeInteger(observation.refillMilliKwh)) {
      errors.push(issue('invalid_refill', 'Credited refill must be a nonnegative value with at most three decimal places.', observation.id))
      rowValid = false
    }
    if (!refillSources.has(observation.refillSource)) {
      errors.push(issue('invalid_refill_source', 'Choose a supported refill provenance.', observation.id))
      rowValid = false
    } else if ((observation.refillSource === 'none' || observation.refillSource === 'unknown') !== (observation.refillMilliKwh === null)) {
      errors.push(issue('source_mismatch', 'Refill provenance and credited kWh do not match.', observation.id))
      rowValid = false
    }

    if (observation.refillCostIdr !== null && !isSafeNonNegativeInteger(observation.refillCostIdr)) {
      errors.push(issue('invalid_cost', 'Purchase amount must be a nonnegative whole IDR amount.', observation.id))
      rowValid = false
    }
    if (observation.refillSource === 'none' && observation.refillCostIdr !== null && observation.refillCostIdr > 0) {
      errors.push(issue('cost_without_refill', 'A purchase amount needs a refill record.', observation.id))
      rowValid = false
    }
    if (observation.refillSource !== 'none' && observation.refillCostIdr === null) {
      warnings.push(warning('missing_refill_cost', 'Purchase amount is not recorded; spending rates include recorded purchases only.', observation.id))
    }
    if (observation.refillSource === 'unknown') {
      warnings.push(warning('unknown_refill', 'Credited kWh is unknown, so usage across this reading cannot be reconciled.', observation.id))
    }
    if (observation.refillSource === 'inferred_balance_difference') {
      warnings.push(warning('uncertain_refill', 'This refill is inferred from balance differences and assumes no consumption between readings.', observation.id))
    }
    if (rowValid) individuallyValid.add(observation.id)
  }

  if (errors.length === 0) {
    const ordered = sortElectricityHistory(observations)
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1]!
      const current = ordered[index]!
      if (!individuallyValid.has(previous.id) || !individuallyValid.has(current.id) || current.refillSource === 'unknown') continue
      const available = addSafe(previous.remainingMilliKwh, current.refillMilliKwh ?? 0)
      if (available === null) {
        errors.push(issue('numeric_overflow', 'Energy totals exceed safe numeric precision.', previous.id, current.id))
        continue
      }
      if (available < current.remainingMilliKwh) {
        const missing = current.refillSource === 'none' && current.remainingMilliKwh > previous.remainingMilliKwh
        errors.push(issue(
          missing ? 'missing_refill' : 'negative_interval_usage',
          missing
            ? 'The balance increased without a recorded refill. Add its credited kWh or mark the refill unknown.'
            : 'Known refill credit does not reconcile the neighboring readings; correct a reading or refill amount.',
          previous.id,
          current.id,
        ))
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

function withStaleness(warnings: ElectricityWarning[], asOfDate: DateOnly | null, today: DateOnly): void {
  if (!asOfDate) return
  try {
    const age = daysBetween(asOfDate, today)
    if (age > 0) warnings.push(warning('stale_reading', `The latest meter reading is ${age} day${age === 1 ? '' : 's'} old.`,))
  } catch {
    // Date validation reports malformed or future readings.
  }
}

function costTotal(observations: readonly TokenObservation[]): number | null {
  let total = 0
  for (const observation of observations) {
    if (observation.refillCostIdr === null) continue
    const next = addSafe(total, observation.refillCostIdr)
    if (next === null) return null
    total = next
  }
  return total
}

function knownRefillTotal(observations: readonly TokenObservation[]): number | null {
  let total = 0
  for (const observation of observations) {
    if (observation.refillSource === 'unknown') return null
    if (observation.refillMilliKwh === null) continue
    const next = addSafe(total, observation.refillMilliKwh)
    if (next === null) return Number.NaN
    total = next
  }
  return total
}

function makeForecast(balanceMilliKwh: number | null, dailyKwh: number | null, lastDate: DateOnly | null, status: ElectricityStatus): DepletionForecast {
  if (balanceMilliKwh === 0 && lastDate) return { status: 'empty', estimatedDaysRemaining: 0, predictedDate: lastDate }
  if (status === 'invalid_input') return { status: 'invalid_input', estimatedDaysRemaining: null, predictedDate: null }
  if (!lastDate || balanceMilliKwh === null || status !== 'ok' || dailyKwh === null) {
    return { status: 'insufficient_data', estimatedDaysRemaining: null, predictedDate: null }
  }
  if (dailyKwh === 0) return { status: 'indefinite', estimatedDaysRemaining: null, predictedDate: null }
  if (dailyKwh < 0) return { status: 'invalid_input', estimatedDaysRemaining: null, predictedDate: null }
  const days = balanceMilliKwh / 1000 / dailyKwh
  if (!Number.isFinite(days)) return { status: 'beyond_date_range', estimatedDaysRemaining: null, predictedDate: null }
  const wholeDays = Math.floor(days)
  if (wholeDays > 3_652_058) return { status: 'beyond_date_range', estimatedDaysRemaining: days, predictedDate: null }
  try {
    return { status: 'forecast', estimatedDaysRemaining: days, predictedDate: addDays(lastDate, wholeDays) }
  } catch {
    return { status: 'beyond_date_range', estimatedDaysRemaining: days, predictedDate: null }
  }
}

function nullMetrics(status: ElectricityStatus, warnings: ElectricityWarning[], errors: ElectricityIssue[], fields: Partial<ElectricityMetrics> = {}): ElectricityMetrics {
  return {
    status,
    asOfDate: null,
    startDate: null,
    recordCount: 0,
    readingAgeDays: null,
    elapsedDays: null,
    firstBalanceKwh: null,
    latestBalanceKwh: null,
    totalKnownRefillKwh: null,
    refillDataComplete: false,
    consumedKwh: null,
    averageDailyKwh: null,
    totalRecordedRefillSpendingIdr: null,
    spendingComplete: false,
    averageWeeklyRefillSpendingIdr: null,
    average30DayRefillSpendingIdr: null,
    estimatedDaysToDepletion: null,
    predictedDepletionDate: null,
    forecastStatus: status === 'invalid_input' ? 'invalid_input' : 'insufficient_data',
    warnings,
    errors,
    ...fields,
  }
}

export function calculateLifetimeMetrics(observations: readonly TokenObservation[], today: DateOnly): ElectricityMetrics {
  const ordered = sortElectricityHistory(observations)
  const validation = validateElectricityHistory(ordered, today)
  const errors = [...validation.errors]
  const warnings = [...validation.warnings]
  const first = ordered[0] ?? null
  const last = ordered[ordered.length - 1] ?? null
  const asOfDate = last && (() => { try { parseDateOnly(last.date); return last.date } catch { return null } })()
  const firstDate = first && (() => { try { parseDateOnly(first.date); return first.date } catch { return null } })()
  let elapsedDays: number | null = null
  if (firstDate && asOfDate) {
    try { elapsedDays = daysBetween(firstDate, asOfDate) } catch { elapsedDays = null }
  }
  withStaleness(warnings, asOfDate, today)

  let recordedCost = costTotal(ordered)
  if (recordedCost === null) errors.push(issue('numeric_overflow', 'Recorded purchase totals exceed safe integer precision.'))
  const afterOpening = ordered.slice(1)
  const refillDataComplete = afterOpening.every((observation) => observation.refillSource !== 'unknown')
  let refillMilliKwh = knownRefillTotal(afterOpening)
  if (Number.isNaN(refillMilliKwh)) {
    errors.push(issue('numeric_overflow', 'Credited refill totals exceed safe numeric precision.'))
    refillMilliKwh = null
  }
  const unknownCredit = afterOpening.some((observation) => observation.refillSource === 'unknown')
  const spendingComplete = ordered.every((observation) => observation.refillSource === 'none' || observation.refillCostIdr !== null)
  const firstBalanceMilliKwh = first && isSafeNonNegativeInteger(first.remainingMilliKwh) ? first.remainingMilliKwh : null
  const latestBalanceMilliKwh = last && isSafeNonNegativeInteger(last.remainingMilliKwh) ? last.remainingMilliKwh : null
  const firstBalanceKwh = firstBalanceMilliKwh === null ? null : firstBalanceMilliKwh / 1000
  const latestBalanceKwh = latestBalanceMilliKwh === null ? null : latestBalanceMilliKwh / 1000

  if (errors.length > 0) return nullMetrics('invalid_input', warnings, errors, {
    asOfDate, startDate: firstDate, recordCount: ordered.length, elapsedDays, firstBalanceKwh, latestBalanceKwh,
    totalKnownRefillKwh: refillMilliKwh === null ? null : refillMilliKwh / 1000,
    refillDataComplete, totalRecordedRefillSpendingIdr: recordedCost, spendingComplete,
  })
  if (!first || !last) {
    return nullMetrics('insufficient_data', warnings, errors, {
      asOfDate, startDate: firstDate, recordCount: ordered.length, elapsedDays,
      refillDataComplete: false,
      spendingComplete: false,
    })
  }

  const totalEnergyMilliKwh = firstBalanceMilliKwh !== null && refillMilliKwh !== null
    ? addSafe(firstBalanceMilliKwh, refillMilliKwh)
    : null
  if (totalEnergyMilliKwh === null && refillDataComplete) {
    errors.push(issue('numeric_overflow', 'Lifetime energy totals exceed safe numeric precision.'))
    return nullMetrics('invalid_input', warnings, errors, {
      asOfDate, startDate: firstDate, recordCount: ordered.length, elapsedDays, firstBalanceKwh, latestBalanceKwh,
      totalKnownRefillKwh: refillMilliKwh === null ? null : refillMilliKwh / 1000,
      refillDataComplete, totalRecordedRefillSpendingIdr: recordedCost, spendingComplete,
    })
  }
  const consumedMilliKwh = totalEnergyMilliKwh !== null && latestBalanceMilliKwh !== null
    ? totalEnergyMilliKwh - latestBalanceMilliKwh
    : null
  const sufficient = ordered.length >= 2 && elapsedDays !== null && elapsedDays > 0 && !unknownCredit && consumedMilliKwh !== null
  const status: ElectricityStatus = sufficient ? 'ok' : 'insufficient_data'
  if (unknownCredit) warnings.push(warning('insufficient_data', 'Usage and depletion cannot be calculated across an unknown refill.'))
  else if (ordered.length < 2 || elapsedDays === null || elapsedDays <= 0) warnings.push(warning('insufficient_data', 'Record readings on at least two different dates to calculate a daily rate.'))

  const consumedKwh = consumedMilliKwh === null ? null : consumedMilliKwh / 1000
  const averageDailyKwh = status === 'ok' && consumedKwh !== null && elapsedDays !== null ? consumedKwh / elapsedDays : null
  const averageWeekly = elapsedDays && elapsedDays > 0 && recordedCost !== null ? recordedCost / elapsedDays * 7 : null
  const averageThirtyDay = elapsedDays && elapsedDays > 0 && recordedCost !== null ? recordedCost / elapsedDays * 30 : null
  const forecast = makeForecast(latestBalanceMilliKwh, averageDailyKwh, asOfDate, status)
  return {
    status,
    asOfDate,
    startDate: firstDate,
    recordCount: ordered.length,
    readingAgeDays: asOfDate ? Math.max(0, (() => { try { return daysBetween(asOfDate, today) } catch { return 0 } })()) : null,
    elapsedDays,
    firstBalanceKwh,
    latestBalanceKwh,
    totalKnownRefillKwh: refillMilliKwh === null ? null : refillMilliKwh / 1000,
    refillDataComplete,
    consumedKwh,
    averageDailyKwh,
    totalRecordedRefillSpendingIdr: recordedCost,
    spendingComplete,
    averageWeeklyRefillSpendingIdr: averageWeekly,
    average30DayRefillSpendingIdr: averageThirtyDay,
    estimatedDaysToDepletion: forecast.estimatedDaysRemaining,
    predictedDepletionDate: forecast.predictedDate,
    forecastStatus: forecast.status,
    warnings,
    errors,
  }
}

function invalidMonthMetrics(month: string, error: ElectricityIssue): MonthMetrics {
  return {
    month, status: 'invalid_input', startDate: null, endDate: null, elapsedDays: null,
    observedKwh: null, averageDailyKwh: null, thirtyDayEquivalentKwh: null,
    recordedRefillSpendingIdr: null, spendingComplete: false, average30DayRefillSpendingIdr: null,
    partialMonth: false, warnings: [], errors: [error],
  }
}

export function calculateMonthMetrics(observations: readonly TokenObservation[], month: string, today: DateOnly): MonthMetrics {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return invalidMonthMetrics(month, issue('invalid_month', 'Choose a calendar month in YYYY-MM format.'))
  }
  try { parseDateOnly(`${month}-01`) } catch {
    return invalidMonthMetrics(month, issue('invalid_month', 'Choose a valid calendar month in YYYY-MM format.'))
  }

  const validation = validateElectricityHistory(observations, today)
  if (!validation.valid) return {
    month, status: 'invalid_input', startDate: null, endDate: null, elapsedDays: null,
    observedKwh: null, averageDailyKwh: null, thirtyDayEquivalentKwh: null,
    recordedRefillSpendingIdr: null, spendingComplete: false, average30DayRefillSpendingIdr: null,
    partialMonth: false, warnings: validation.warnings, errors: validation.errors,
  }

  const period = sortElectricityHistory(observations.filter((observation) => observation.date.startsWith(`${month}-`)))
  const first = period[0] ?? null
  const last = period[period.length - 1] ?? null
  const periodIds = new Set(period.map((observation) => observation.id))
  const warnings = validation.warnings.filter((item) => item.recordIds.length === 0 || item.recordIds.some((id) => periodIds.has(id)))
  if (!first || !last) {
    warnings.push(warning('insufficient_data', 'No meter readings are recorded in this calendar month.'))
    return {
      month, status: 'insufficient_data', startDate: null, endDate: null, elapsedDays: null,
      observedKwh: null, averageDailyKwh: null, thirtyDayEquivalentKwh: null,
      recordedRefillSpendingIdr: 0, spendingComplete: true, average30DayRefillSpendingIdr: null,
      partialMonth: true, warnings, errors: [],
    }
  }

  const elapsedDays = daysBetween(first.date, last.date)
  const finalDay = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))
  const partialMonth = first.date !== `${month}-01` || last.date !== `${month}-${String(finalDay).padStart(2, '0')}`
  if (partialMonth) warnings.push(warning('partial_month', 'This is an observed period, not a measured full-calendar-month total.', first.id, last.id))

  let spend = costTotal(period)
  const errors: ElectricityIssue[] = []
  if (spend === null) {
    errors.push(issue('numeric_overflow', 'Recorded purchase totals exceed safe integer precision.'))
    spend = null
  }
  const spendingComplete = period.every((observation) => observation.refillSource === 'none' || observation.refillCostIdr !== null)
  const afterOpening = period.slice(1)
  const unknownCredit = afterOpening.some((observation) => observation.refillSource === 'unknown')
  let knownRefills = knownRefillTotal(afterOpening)
  if (Number.isNaN(knownRefills)) {
    errors.push(issue('numeric_overflow', 'Credited refill totals exceed safe numeric precision.'))
    knownRefills = null
  }
  const total = first.remainingMilliKwh + (knownRefills ?? 0)
  if (!Number.isSafeInteger(total)) errors.push(issue('numeric_overflow', 'Observed-period energy totals exceed safe numeric precision.', first.id, last.id))
  const usageMilliKwh = Number.isSafeInteger(total) ? total - last.remainingMilliKwh : null
  const sufficient = errors.length === 0 && period.length >= 2 && elapsedDays > 0 && !unknownCredit && usageMilliKwh !== null
  if (unknownCredit) warnings.push(warning('insufficient_data', 'Usage for this observed period cannot be calculated across an unknown refill.'))
  else if (period.length < 2 || elapsedDays <= 0) warnings.push(warning('insufficient_data', 'Record readings on at least two different dates in this month to calculate a daily rate.'))
  const observedKwh = sufficient && usageMilliKwh !== null ? usageMilliKwh / 1000 : null
  const averageDailyKwh = observedKwh !== null ? observedKwh / elapsedDays : null
  return {
    month,
    status: errors.length ? 'invalid_input' : sufficient ? 'ok' : 'insufficient_data',
    startDate: first.date,
    endDate: last.date,
    elapsedDays,
    observedKwh,
    averageDailyKwh,
    thirtyDayEquivalentKwh: averageDailyKwh === null ? null : averageDailyKwh * 30,
    recordedRefillSpendingIdr: spend,
    spendingComplete,
    average30DayRefillSpendingIdr: elapsedDays > 0 && spend !== null ? spend / elapsedDays * 30 : null,
    partialMonth,
    warnings,
    errors,
  }
}

export function calculateDepletionForecast(balanceMilliKwh: number, averageDailyKwh: number | null, lastReadingDate: DateOnly | null, status: ElectricityStatus): DepletionForecast {
  if (!isSafeNonNegativeInteger(balanceMilliKwh)) return { status: 'invalid_input', estimatedDaysRemaining: null, predictedDate: null }
  return makeForecast(balanceMilliKwh, averageDailyKwh, lastReadingDate, status)
}

export function parseKwhToMilliKwh(value: string): number {
  const normalized = value.trim()
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(normalized)
  if (!match) throw new Error('Enter a nonnegative kWh amount with up to three decimal places.')
  const whole = Number(match[1])
  const fraction = Number((match[2] ?? '').padEnd(3, '0'))
  const result = whole * 1000 + fraction
  if (!Number.isSafeInteger(result)) throw new Error('kWh amount exceeds safe numeric precision.')
  return result
}

export function parseIdrAmount(value: string): number {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) throw new Error('Enter a whole nonnegative IDR amount.')
  const result = Number(normalized)
  if (!Number.isSafeInteger(result)) throw new Error('IDR amount exceeds safe integer precision.')
  return result
}

export function formatMilliKwh(value: number): string {
  if (!isSafeNonNegativeInteger(value)) throw new Error('kWh amount must be a nonnegative safe integer in milli-kWh.')
  const whole = Math.floor(value / 1000)
  const fraction = String(value % 1000).padStart(3, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}
