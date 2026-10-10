import 'fake-indexeddb/auto'
import userEvent from '@testing-library/user-event'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DateOnly, TokenObservation } from '@kinsen/budget-domain'
import { addDays } from '@kinsen/budget-domain/date-only'
import { budgetRepository } from '../../infrastructure/repositories/dexie-budget-repository'
import { formatDate, localToday } from '../../shared/format/date'
import { formatIdr } from '../../shared/format/money'
import { useElectricityStore } from '../../shared/state/electricity-store'
import { ElectricityPage } from './ElectricityPage'

function observation(id: string, date: DateOnly, remainingMilliKwh: number, refillMilliKwh: number | null, refillCostIdr: number | null, refillSource: TokenObservation['refillSource']): TokenObservation {
  return { id, date, sequence: 0, remainingMilliKwh, refillMilliKwh, refillCostIdr, refillSource }
}

/** Value shown on the metric card carrying this label. */
function metricCardValue(labelText: string): string {
  const label = screen.getAllByText(labelText)[0]!
  let container: HTMLElement | null = label.parentElement
  while (container && !container.querySelector('h3')) container = container.parentElement
  return container?.querySelector('h3')?.textContent?.trim() ?? ''
}

/** Value shown on the metadata row carrying this label inside the "This month" card. */
function monthRowValue(labelText: string): string {
  const label = screen.getAllByText(labelText).at(-1)!
  return label.parentElement?.textContent?.replace(labelText, '').trim() ?? ''
}

beforeEach(async () => {
  await budgetRepository.clearAccountData()
  useElectricityStore.setState({ status: 'idle', observations: [], error: null, saving: false })
})

afterEach(async () => {
  cleanup()
  await budgetRepository.clearAccountData()
})

describe('ElectricityPage', () => {
  it('loads local readings and presents reconciled usage, forecast, refill provenance, and chart', async () => {
    const today = localToday()
    await budgetRepository.saveObservation(observation('opening', addDays(today, -10), 10_000, null, null, 'none'), 0, today)
    await budgetRepository.saveObservation(observation('top-up', addDays(today, -5), 14_000, 5_000, 500, 'entered'), 0, today)
    await budgetRepository.saveObservation(observation('latest', today, 13_000, null, null, 'none'), 0, today)
    useElectricityStore.setState({ status: 'idle', observations: [] })

    render(<ElectricityPage />)

    expect(await screen.findAllByText('0,2 kWh/day')).not.toHaveLength(0)
    expect(screen.getByText('65 days')).toBeInTheDocument()
    expect(screen.getByText('Saved on this device · not synced to your Kinsen account or other devices.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Remaining PLN token balance across recorded readings/ })).toBeInTheDocument()
    expect(screen.getByText('5 kWh · Actual')).toBeInTheDocument()
    expect(screen.getAllByText(/Rp\s?500/).length).toBeGreaterThan(0)
    // With a recorded purchase the card shows the real total, not the placeholder.
    expect(metricCardValue('Refill spending')).toBe(formatIdr(500))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: `Delete reading from ${formatDate(addDays(today, -5))}` }))
    expect(await screen.findByRole('button', { name: 'Delete reading' })).toBeDisabled()
    expect(screen.getByText(/Deleting this reading would make the remaining history inconsistent:/)).toBeInTheDocument()
  })
  it('shows an empty state without numeric errors or zero-spend claims', async () => {
    render(<ElectricityPage />)

    expect(await screen.findByText('No reading yet')).toBeInTheDocument()
    // The card shows a placeholder; the detail line explains why.
    expect(metricCardValue('Refill spending')).toBe('—')
    expect(screen.queryByText('No refill spending yet')).not.toBeInTheDocument()
    expect(screen.getByText('No refill purchases recorded yet.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Data quality' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('does not show unrecorded refill prices as zero spending', async () => {
    const today = localToday()
    await budgetRepository.saveObservation(observation('opening', addDays(today, -3), 10_000, null, null, 'none'), 0, today)
    await budgetRepository.saveObservation(observation('refill', addDays(today, -2), 14_000, 5_000, null, 'entered'), 0, today)
    await budgetRepository.saveObservation(observation('latest', today, 13_000, null, null, 'none'), 0, today)
    render(<ElectricityPage />)

    // Refills exist but no prices were entered: show the placeholder, never a zero total.
    await screen.findByText('No purchase amounts recorded; some refill costs are unknown.')
    expect(metricCardValue('Refill spending')).toBe('—')
    expect(monthRowValue('Refill spending')).toBe('—')
    expect(screen.queryByText('No purchases recorded')).not.toBeInTheDocument()
    expect(screen.queryByText(/^Rp\s?0$/)).not.toBeInTheDocument()
  })
  it('opens the history page containing a reading linked from a warning', async () => {
    const today = localToday()
    const firstDate = addDays(today, -50)
    for (let offset = 0; offset <= 50; offset += 1) {
      const isUnknownOpening = offset === 0
      await budgetRepository.saveObservation(
        observation(
          `reading-${offset}`,
          addDays(firstDate, offset),
          100_000 - offset * 1_000,
          null,
          null,
          isUnknownOpening ? 'unknown' : 'none',
        ),
        0,
        today,
      )
    }
    render(<ElectricityPage />)

    expect(await screen.findByText('Credited kWh is unknown, so usage across this reading cannot be reconciled.')).toBeInTheDocument()
    expect(await screen.findByText('Showing 1–50 of 51')).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getAllByRole('link', { name: 'Review reading' })[0]!)

    expect(await screen.findByText('Showing 51–51 of 51')).toBeInTheDocument()
    const reviewedReading = document.getElementById('reading-reading-0')
    expect(reviewedReading).toHaveTextContent(formatDate(firstDate))
    expect(reviewedReading).toHaveFocus()
  })
})
