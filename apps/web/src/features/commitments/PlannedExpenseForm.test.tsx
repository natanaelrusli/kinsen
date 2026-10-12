import userEvent from '@testing-library/user-event'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useBudgetStore } from '../../shared/state/budget-store'
import { PlannedExpenseForm } from './PlannedExpenseForm'

afterEach(() => {
  cleanup()
  useBudgetStore.setState({ snapshot: null, saving: false })
})

describe('PlannedExpenseForm recurring eligibility', () => {
  it('removes recurring choices and resets cadence when switching to a PERIOD category', async () => {
    const user = userEvent.setup()
    useBudgetStore.setState({
      snapshot: {
        period: {
          id: 'period', totalAmount: 1000, reserveAmount: 0, flexibleAllocation: 1000, plannedAllocation: 0,
          startDate: '2026-10-01', endDate: '2026-10-31',
        },
        categories: [
          { id: 'period-category', name: 'Period', mode: 'PERIOD', bucket: 'FLEXIBLE', allocation: 500, color: '#112233' },
          { id: 'scheduled-category', name: 'Scheduled', mode: 'SCHEDULED', bucket: 'PLANNED', allocation: 500, color: '#223344' },
        ],
        plannedExpenses: [],
        transactions: [],
      },
      saving: false,
    })
    render(<PlannedExpenseForm open onClose={() => undefined} />)

    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Plan')
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '100')

    const category = screen.getByRole('combobox', { name: 'Category' })
    await user.click(category)
    await user.click(await screen.findByRole('option', { name: 'Scheduled · scheduled' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const repeats = screen.getByRole('combobox', { name: 'Repeats' })
    await user.click(repeats)
    await user.click(await screen.findByRole('option', { name: 'Monthly' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(screen.getByRole('combobox', { name: 'Category' }))
    await user.click(await screen.findByRole('option', { name: 'Period' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    const updatedRepeats = screen.getByRole('combobox', { name: 'Repeats' })
    expect(updatedRepeats).toHaveTextContent(/does not repeat/i)
    await user.click(updatedRepeats)
    expect(screen.getByRole('option', { name: 'Does not repeat' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Weekly' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Monthly' })).not.toBeInTheDocument()
  })
})
