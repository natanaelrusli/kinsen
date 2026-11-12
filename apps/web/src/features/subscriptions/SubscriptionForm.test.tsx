import userEvent from '@testing-library/user-event'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { BudgetSnapshot } from '@kinsen/budget-domain'
import { useBudgetStore } from '../../shared/state/budget-store'
import { SubscriptionForm } from './SubscriptionForm'

const period = { id: 'period', totalAmount: 1000, reserveAmount: 0, flexibleAllocation: 1000, plannedAllocation: 0, startDate: '2026-11-01', endDate: '2026-11-30' }
const snapshot = (categories: BudgetSnapshot['categories']) => ({ period, categories, plannedExpenses: [], transactions: [] }) as BudgetSnapshot

afterEach(() => {
  cleanup()
  useBudgetStore.setState({ snapshot: null, saving: false })
})

describe('SubscriptionForm', () => {
  it('previews the monthly and yearly cost of a quarterly plan', async () => {
    const user = userEvent.setup()
    useBudgetStore.setState({ snapshot: snapshot([{ id: 'subs', name: 'Subscriptions', mode: 'SCHEDULED', bucket: 'PLANNED', allocation: 500, color: '#223344' }]) })
    render(<MemoryRouter><SubscriptionForm open onClose={() => undefined} onSave={() => undefined} /></MemoryRouter>)

    await user.type(screen.getByRole('textbox', { name: 'Price per billing cycle' }), '120000')
    await user.click(screen.getByRole('radio', { name: 'Quarterly' }))

    expect(screen.getByText(/About .*40\.000 a month · .*480\.000 a year\./)).toBeTruthy()
  })

  it('blocks saving until a scheduled category exists', () => {
    useBudgetStore.setState({ snapshot: snapshot([{ id: 'flex', name: 'Flexible', mode: 'PERIOD', bucket: 'FLEXIBLE', allocation: 500, color: '#112233' }]) })
    render(<MemoryRouter><SubscriptionForm open onClose={() => undefined} onSave={() => undefined} /></MemoryRouter>)

    expect(screen.getByText(/need a scheduled budget category/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save subscription' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Add scheduled category' })).toBeTruthy()
  })
})
