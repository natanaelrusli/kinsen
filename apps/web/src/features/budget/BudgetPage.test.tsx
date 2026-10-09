import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSampleSnapshot, type DateOnly } from '@kinsen/budget-domain'
import { useBudgetStore } from '../../shared/state/budget-store'
import { BudgetPage } from './BudgetPage'

const snapshot = createSampleSnapshot('2026-10-08' as DateOnly)

beforeEach(() => {
  useBudgetStore.setState({ status: 'ready', snapshot, overview: null })
})

afterEach(() => {
  cleanup()
  useBudgetStore.setState(useBudgetStore.getInitialState(), true)
})

describe('BudgetPage landmarks', () => {
  it('keeps its heading and content inside the shell main landmark', () => {
    render(
      <MemoryRouter>
        <main><BudgetPage /></main>
      </MemoryRouter>,
    )

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Budget settings', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Set your budget period', level: 2 })).toBeInTheDocument()
  })
})
