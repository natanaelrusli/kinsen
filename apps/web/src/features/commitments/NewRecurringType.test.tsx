import userEvent from '@testing-library/user-event'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BudgetUseCases } from '../../application/use-cases/budget-use-cases'
import type { Category } from '@kinsen/budget-domain'
import { useBudgetStore } from '../../shared/state/budget-store'
import { PlannedExpenseForm } from './PlannedExpenseForm'

afterEach(() => { cleanup(); useBudgetStore.setState({ snapshot: null, saving: false }) })

describe('creating a recurring type from the commitment form', () => {
  it('saves a scheduled category with the chosen icon and selects it', async () => {
    const user = userEvent.setup()
    const added: Category[] = []
    const snapshot = {
      period: { id: 'p', totalAmount: 1000, reserveAmount: 0, flexibleAllocation: 1000, plannedAllocation: 0, startDate: '2026-10-01', endDate: '2026-10-31' },
      categories: [{ id: 'period-category', name: 'Period', mode: 'PERIOD', bucket: 'FLEXIBLE', allocation: 1000, color: '#112233' }],
      plannedExpenses: [], transactions: [],
    } as never
    useBudgetStore.setState({
      snapshot,
      runMutation: vi.fn(async (operation: (useCases: BudgetUseCases) => Promise<void>) => operation({ addCategory: async (category: Category) => { added.push(category) } } as unknown as BudgetUseCases)),
    })
    render(<PlannedExpenseForm open onClose={() => undefined} />)

    await user.click(screen.getByRole('button', { name: 'New recurring type' }))
    await user.click(screen.getByRole('button', { name: 'Add type' }))
    expect(await screen.findByText('Name this type.')).toBeInTheDocument()
    expect(added).toHaveLength(0)

    await user.type(screen.getByRole('textbox', { name: 'Type name' }), 'Water bill')
    await user.click(screen.getByRole('radio', { name: 'Water' }))
    await user.click(screen.getByRole('button', { name: 'Add type' }))

    await waitFor(() => expect(added).toHaveLength(1))
    expect(added[0]).toMatchObject({ name: 'Water bill', mode: 'SCHEDULED', bucket: 'PLANNED', allocation: 0, icon: 'water', defaultCadence: 'MONTHLY' })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'New recurring type' })).toBeNull())
  })

  it('rejects a name that already exists', async () => {
    const user = userEvent.setup()
    useBudgetStore.setState({
      snapshot: {
        period: { id: 'p', totalAmount: 1000, reserveAmount: 0, flexibleAllocation: 1000, plannedAllocation: 0, startDate: '2026-10-01', endDate: '2026-10-31' },
        categories: [{ id: 'a', name: 'Period', mode: 'PERIOD', bucket: 'FLEXIBLE', allocation: 1000, color: '#112233' }],
        plannedExpenses: [], transactions: [],
      } as never,
      runMutation: vi.fn(),
    })
    render(<PlannedExpenseForm open onClose={() => undefined} />)
    await user.click(screen.getByRole('button', { name: 'New recurring type' }))
    await user.type(screen.getByRole('textbox', { name: 'Type name' }), 'period')
    await user.click(screen.getByRole('button', { name: 'Add type' }))
    expect(await screen.findByText('A category with this name already exists.')).toBeInTheDocument()
    expect(useBudgetStore.getState().runMutation).not.toHaveBeenCalled()
  })
})
