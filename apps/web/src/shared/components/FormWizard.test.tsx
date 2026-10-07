import type { FormEvent } from 'react'
import userEvent from '@testing-library/user-event'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormWizard } from './FormWizard'

afterEach(cleanup)

describe('FormWizard', () => {
  it('blocks invalid steps, advances when valid, and returns to previous steps', async () => {
    const user = userEvent.setup()
    const validateStep = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())

    render(<FormWizard
      steps={[
        { label: 'Details', fields: ['name'], content: <p>Details content</p> },
        { label: 'Schedule', fields: ['date'], content: <p>Schedule content</p> },
      ]}
      validateStep={validateStep}
      onSubmit={onSubmit}
      submitLabel="Save"
    />)

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(validateStep).toHaveBeenLastCalledWith(0, ['name'])
    expect(screen.getByText('Details content')).toBeInTheDocument()
    expect(screen.queryByText('Schedule content')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Schedule content')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.queryByText('Details content')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Details content')).toBeInTheDocument()
  })

  it('validates the final step before invoking the submit handler', async () => {
    const user = userEvent.setup()
    const validateStep = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())

    render(<FormWizard
      steps={[
        { label: 'Details', fields: ['name'], content: <p>Details content</p> },
        { label: 'Review', fields: ['confirmed'], content: <p>Review content</p> },
      ]}
      validateStep={validateStep}
      onSubmit={onSubmit}
      submitLabel="Save"
    />)

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText('Review content')
    expect(onSubmit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(validateStep).toHaveBeenLastCalledWith(1, ['confirmed'])
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })
})
