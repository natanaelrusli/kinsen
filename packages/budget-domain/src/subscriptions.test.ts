import { describe, expect, it } from 'vitest'
import { calculateOverview, recurrenceDates, summarizeSubscriptions, type BudgetSnapshot } from './index.js'

const snapshot: BudgetSnapshot = {
  period: { id: 'p', totalAmount: 3_000_000, reserveAmount: 0, flexibleAllocation: 0, plannedAllocation: 3_000_000, startDate: '2026-11-01', endDate: '2026-11-30' },
  categories: [{ id: 'subscriptions', name: 'Subscriptions', mode: 'SCHEDULED', bucket: 'PLANNED', allocation: 3_000_000, color: 'green' }],
  plannedExpenses: [], transactions: [], subscriptions: [{
    id: 'netflix', name: 'Netflix', providerId: 'netflix', plan: 'Standard', notes: '', status: 'ACTIVE', reminderDays: 3,
    segments: [{ id: 'initial', categoryId: 'subscriptions', dueDate: '2026-11-15', cadence: 'MONTHLY', grossAmountIdr: 120_000, myShareIdr: 120_000 }],
  }],
}

describe('subscription schedules and budget projection', () => {
  it('projects a monthly subscription once into commitments', () => {
    const summary = summarizeSubscriptions(snapshot, '2026-11-12')
    const overview = calculateOverview(snapshot, '2026-11-12')
    expect(summary.monthlyCostIdr).toBe(120_000)
    expect(summary.yearlyCostIdr).toBe(1_440_000)
    expect(overview.outstandingCommitments).toBe(120_000)
  })

  it('recovers a monthly anchor after clamping a month end', () => {
    expect(recurrenceDates('2027-01-31', 'MONTHLY', '2027-01-01', '2027-03-31'))
      .toEqual(['2027-01-31', '2027-02-28', '2027-03-31'])
  })

  it('recovers a leap day yearly anchor in later leap years', () => {
    expect(recurrenceDates('2028-02-29', 'YEARLY', '2029-01-01', '2032-12-31'))
      .toEqual(['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29'])
  })

  it('jumps to the period start for an old monthly anchor', () => {
    expect(recurrenceDates('2000-01-31', 'MONTHLY', '2026-11-01', '2026-11-30'))
      .toEqual(['2026-11-30'])
  })

  it('reports no upcoming reservation for a paused subscription', () => {
    const paused = { ...snapshot, subscriptions: snapshot.subscriptions!.map(subscription => ({ ...subscription, status: 'PAUSED' as const })) }
    expect(summarizeSubscriptions(paused, '2026-11-12').monthlyCostIdr).toBe(0)
    expect(calculateOverview(paused, '2026-11-12').outstandingCommitments).toBe(0)
  })
})
