import { describe, expect, it } from 'vitest'
import {
  calculateDepletionForecast,
  calculateLifetimeMetrics,
  calculateMonthMetrics,
  formatMilliKwh,
  parseIdrAmount,
  parseKwhToMilliKwh,
  validateElectricityHistory,
} from './electricity.js'
import type { TokenObservation } from './electricity.js'

const rawFixture: Array<[string, string, string?, number?, 'entered' | 'inferred_balance_difference'?, string?]> = [
  ['2026-06-04', '68.00'], ['2026-06-08', '38.35'], ['2026-06-10', '22.60'],
  ['2026-06-11', '345.00', '332.80', 500_000, 'entered'], ['2026-06-12', '336.00'],
  ['2026-06-16', '317.00'], ['2026-06-17', '308.00'], ['2026-06-18', '299.31'],
  ['2026-06-20', '283.00'], ['2026-06-21', '273.00'], ['2026-06-22', '265.00'],
  ['2026-06-24', '253.00'], ['2026-06-26', '236.00'], ['2026-06-29', '218.00'], ['2026-06-30', '208.00'],
  ['2026-07-01', '199.00'], ['2026-07-03', '179.00'], ['2026-07-05', '170.00'], ['2026-07-06', '163.00'],
  ['2026-07-08', '142.00'], ['2026-07-14', '125.00'], ['2026-07-15', '102.90'], ['2026-07-16', '96.00'],
  ['2026-07-19', '79.00'], ['2026-07-21', '58.00'], ['2026-07-27', '46.70'], ['2026-07-29', '19.00'],
  ['2026-07-29', '351.86', '332.86', 500_000, 'inferred_balance_difference', 'C33'], ['2026-07-30', '339.63'],
  ['2026-08-11', '244.00'], ['2026-08-18', '197.00'], ['2026-08-25', '144.00'],
  ['2026-09-01', '102.00'], ['2026-09-13', '25.00'],
  ['2026-09-15', '346.74', '321.74', 500_000, 'inferred_balance_difference', 'C40'], ['2026-09-24', '274.05'],
  ['2026-10-02', '228.58'],
]

const workbookFixture: TokenObservation[] = rawFixture.map(([date, balance, refill, cost, source, sourceReference], index, rows) => ({
  id: `workbook-${index + 1}`,
  date,
  sequence: index > 0 && rows[index - 1]?.[0] === date ? 1 : 0,
  remainingMilliKwh: parseKwhToMilliKwh(balance),
  refillMilliKwh: refill === undefined ? null : parseKwhToMilliKwh(refill),
  refillCostIdr: cost ?? null,
  refillSource: source ?? 'none',
  ...(sourceReference ? { sourceReference } : {}),
}))

function reading(overrides: Partial<TokenObservation> = {}): TokenObservation {
  return {
    id: 'reading', date: '2026-01-01', sequence: 0, remainingMilliKwh: 10_000,
    refillMilliKwh: null, refillCostIdr: null, refillSource: 'none', ...overrides,
  }
}

describe('electricity workbook reconciliation', () => {
  it('reproduces the 37-record lifetime workbook totals with inferred refill provenance', () => {
    const result = calculateLifetimeMetrics(workbookFixture, '2026-10-02')
    expect(workbookFixture).toHaveLength(37)
    expect(workbookFixture.filter(({ sourceReference }) => sourceReference).map(({ sourceReference, refillSource }) => ({ sourceReference, refillSource }))).toEqual([
      { sourceReference: 'C33', refillSource: 'inferred_balance_difference' },
      { sourceReference: 'C40', refillSource: 'inferred_balance_difference' },
    ])
    expect(result).toMatchObject({
      status: 'ok', asOfDate: '2026-10-02', startDate: '2026-06-04', recordCount: 37, elapsedDays: 120,
      firstBalanceKwh: 68, latestBalanceKwh: 228.58, totalKnownRefillKwh: 987.4,
      consumedKwh: 826.82, averageDailyKwh: 826.82 / 120,
      totalRecordedRefillSpendingIdr: 1_500_000,
      averageWeeklyRefillSpendingIdr: 87_500, average30DayRefillSpendingIdr: 375_000,
      estimatedDaysToDepletion: 228.58 / (826.82 / 120), predictedDepletionDate: '2026-11-04',
    })
    expect(result.warnings.filter(({ code }) => code === 'uncertain_refill')).toHaveLength(2)
    expect(result.spendingComplete).toBe(true)
  })

  it('reconciles observed month rates by YYYY-MM and marks the singleton month insufficient', () => {
    expect(calculateMonthMetrics(workbookFixture, '2026-06', '2026-10-02').averageDailyKwh).toBeCloseTo(7.415384615, 8)
    expect(calculateMonthMetrics(workbookFixture, '2026-07', '2026-10-02').averageDailyKwh).toBeCloseTo(6.62862069, 8)
    expect(calculateMonthMetrics(workbookFixture, '2026-08', '2026-10-02').averageDailyKwh).toBeCloseTo(7.14285714, 8)
    expect(calculateMonthMetrics(workbookFixture, '2026-09', '2026-10-02').averageDailyKwh).toBeCloseTo(6.50826087, 8)
    const october = calculateMonthMetrics(workbookFixture, '2026-10', '2026-10-02')
    expect(october).toMatchObject({ status: 'insufficient_data', startDate: '2026-10-02', endDate: '2026-10-02', observedKwh: null, averageDailyKwh: null, thirtyDayEquivalentKwh: null })
    expect(october.partialMonth).toBe(true)
  })

  it('separates years and reports incomplete or empty periods without zero usage claims', () => {
    const october2027 = reading({ id: 'oct-27-a', date: '2027-10-01' })
    const october2027End = reading({ id: 'oct-27-b', date: '2027-10-03', sequence: 0, remainingMilliKwh: 8_000 })
    const bothYears = [...workbookFixture, october2027End, october2027]
    expect(calculateMonthMetrics(bothYears, '2026-10', '2027-10-03').status).toBe('insufficient_data')
    expect(calculateMonthMetrics(bothYears, '2027-10', '2027-10-03').averageDailyKwh).toBe(1)
    expect(calculateMonthMetrics([], '2026-10', '2026-10-02')).toMatchObject({ status: 'insufficient_data', observedKwh: null, recordedRefillSpendingIdr: 0 })
  })
})

describe('electricity invariants and forecasts', () => {
  it('treats an empty history as insufficient rather than numeric overflow', () => {
    expect(calculateLifetimeMetrics([], '2026-10-02')).toMatchObject({
      status: 'insufficient_data',
      asOfDate: null,
      startDate: null,
      recordCount: 0,
      latestBalanceKwh: null,
      averageDailyKwh: null,
      totalRecordedRefillSpendingIdr: null,
      forecastStatus: 'insufficient_data',
      spendingComplete: false,
      errors: [],
    })
  })

  it('uses same-day sequence for refill reconciliation but requires elapsed days for a rate', () => {
    const before = reading({ id: 'before', date: '2026-07-29', remainingMilliKwh: 19_000 })
    const after = reading({ id: 'after', date: '2026-07-29', sequence: 1, remainingMilliKwh: 351_860, refillMilliKwh: 332_860, refillCostIdr: 500_000, refillSource: 'inferred_balance_difference' })
    const result = calculateLifetimeMetrics([after, before], '2026-07-29')
    expect(result).toMatchObject({ status: 'insufficient_data', elapsedDays: 0, consumedKwh: 0, averageDailyKwh: null, forecastStatus: 'insufficient_data' })
    expect(validateElectricityHistory([before, { ...after, sequence: 0 }], '2026-07-29').errors[0]?.code).toBe('duplicate_sequence')
  })

  it('keeps unknown refill data distinct from a zero-credit claim', () => {
    const first = reading({ id: 'first' })
    const unknown = reading({ id: 'unknown', date: '2026-01-03', remainingMilliKwh: 8_000, refillSource: 'unknown', refillCostIdr: 100_000 })
    expect(calculateLifetimeMetrics([first, unknown], '2026-01-03')).toMatchObject({ status: 'insufficient_data', consumedKwh: null, totalRecordedRefillSpendingIdr: 100_000, refillDataComplete: false })
    const missing = reading({ id: 'missing', date: '2026-01-03', remainingMilliKwh: 12_000 })
    expect(validateElectricityHistory([first, missing], '2026-01-03').errors[0]?.code).toBe('missing_refill')
  })

  it('rejects a negative intermediate interval even if later balances could mask it', () => {
    const first = reading({ id: 'first', remainingMilliKwh: 20_000 })
    const second = reading({ id: 'second', date: '2026-01-02', remainingMilliKwh: 25_000 })
    const third = reading({ id: 'third', date: '2026-01-03', remainingMilliKwh: 5_000 })
    expect(calculateLifetimeMetrics([first, second, third], '2026-01-03').errors[0]?.code).toBe('missing_refill')
  })

  it('distinguishes zero burn, empty balance, and stale readings', () => {
    const still = reading({ id: 'still', remainingMilliKwh: 10_000 })
    const next = reading({ id: 'next', date: '2026-01-03', remainingMilliKwh: 10_000 })
    expect(calculateLifetimeMetrics([still, next], '2026-01-05')).toMatchObject({ status: 'ok', averageDailyKwh: 0, forecastStatus: 'indefinite', predictedDepletionDate: null, readingAgeDays: 2 })
    expect(calculateLifetimeMetrics([still, { ...next, remainingMilliKwh: 0 }], '2026-01-03')).toMatchObject({ forecastStatus: 'empty', estimatedDaysToDepletion: 0, predictedDepletionDate: '2026-01-03' })
    expect(calculateLifetimeMetrics([still], '2025-12-31')).toMatchObject({ status: 'invalid_input', errors: [{ code: 'future_observation' }] })
  })

  it('does not count a top-up already included in the opening balance', () => {
    const opening = reading({ refillMilliKwh: 50_000, refillCostIdr: 500_000, refillSource: 'entered', remainingMilliKwh: 60_000 })
    const closing = reading({ id: 'closing', date: '2026-01-11', remainingMilliKwh: 50_000 })
    expect(calculateLifetimeMetrics([opening, closing], '2026-01-11')).toMatchObject({ consumedKwh: 10, totalKnownRefillKwh: 0, totalRecordedRefillSpendingIdr: 500_000 })
  })

  it('keeps costs in integer IDR and flags missing refill prices without blocking energy', () => {
    const first = reading({ id: 'first', remainingMilliKwh: 20_000 })
    const refill = reading({ id: 'refill', date: '2026-01-02', remainingMilliKwh: 24_000, refillMilliKwh: 10_000, refillSource: 'entered' })
    const end = reading({ id: 'end', date: '2026-01-03', remainingMilliKwh: 20_000 })
    expect(calculateLifetimeMetrics([first, refill, end], '2026-01-03')).toMatchObject({ status: 'ok', consumedKwh: 10, spendingComplete: false, totalRecordedRefillSpendingIdr: 0 })
    expect(parseIdrAmount('1500000')).toBe(1_500_000)
    expect(() => parseIdrAmount('1.5')).toThrow()
  })

  it('detects unsafe aggregate precision and rejects excessive kWh decimal precision', () => {
    const first = reading({ id: 'first', remainingMilliKwh: Number.MAX_SAFE_INTEGER })
    const refill = reading({ id: 'refill', date: '2026-01-02', remainingMilliKwh: 0, refillMilliKwh: Number.MAX_SAFE_INTEGER, refillSource: 'entered' })
    expect(calculateLifetimeMetrics([first, refill], '2026-01-02').errors.some(({ code }) => code === 'numeric_overflow')).toBe(true)
    expect(() => parseKwhToMilliKwh('1.0001')).toThrow()
    expect(parseKwhToMilliKwh('0.001')).toBe(1)
    expect(formatMilliKwh(68_000)).toBe('68')
    expect(formatMilliKwh(68_010)).toBe('68.01')
  })

  it('keeps depletion forecasts anchored to the last date and handles unrepresentable dates', () => {
    expect(calculateDepletionForecast(1_000, 1, '2026-10-02', 'ok')).toMatchObject({ status: 'forecast', estimatedDaysRemaining: 1, predictedDate: '2026-10-03' })
    expect(calculateDepletionForecast(1_000, 0, '2026-10-02', 'ok')).toMatchObject({ status: 'indefinite', predictedDate: null })
    expect(calculateDepletionForecast(1_000, 1, '9999-12-31', 'ok')).toMatchObject({ status: 'beyond_date_range', predictedDate: null })
  })
})
