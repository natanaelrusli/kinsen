import type { FormEvent } from 'react'
import userEvent from '@testing-library/user-event'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FormWizard } from './FormWizard'

afterEach(cleanup)

describe('FormWizard', () => {
  it('focuses the first invalid field and the new step context in both directions', async () => {
    const user = userEvent.setup()
    const validateStep = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())

    render(<FormWizard
      steps={[
        { label: 'Details', fields: ['name'], content: <input name="name" aria-label="Name" /> },
        { label: 'Schedule', fields: ['date'], content: <input name="date" aria-label="Date" /> },
      ]}
      validateStep={validateStep}
      onSubmit={onSubmit}
      submitLabel="Save"
    />)

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const scheduleContext = screen.getByRole('group', { name: 'Schedule' })
    expect(scheduleContext).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('group', { name: 'Details' })).toHaveFocus()
  })
  it('focuses the first invalid named field instead of an earlier valid field', async () => {
    const user = userEvent.setup()
    render(<FormWizard
      steps={[{
        label: 'Details',
        fields: ['name', 'amount'],
        content: <>
          <input name="name" aria-label="Name" aria-invalid="false" />
          <input name="amount" aria-label="Amount" aria-invalid="true" />
        </>,
      }]}
      validateStep={vi.fn().mockResolvedValue(false)}
      onSubmit={(event) => event.preventDefault()}
      submitLabel="Save"
    />)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveFocus()
  })
  it('matches nested invalid fields in collection steps', async () => {
    const user = userEvent.setup()
    render(<FormWizard
      steps={[{
        label: 'Categories',
        fields: ['categories'],
        content: <>
          <input name="categories.0.name" aria-label="First category" aria-invalid="false" />
          <input name="categories.1.name" aria-label="Second category" aria-invalid="true" />
        </>,
      }]}
      validateStep={vi.fn().mockResolvedValue(false)}
      onSubmit={(event) => event.preventDefault()}
      submitLabel="Save"
    />)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('textbox', { name: 'Second category' })).toHaveFocus()
  })



  it('focuses the first invalid field when final save validation fails', async () => {
    const user = userEvent.setup()
    const validateStep = vi.fn().mockResolvedValue(false)
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault())

    render(<FormWizard
      steps={[{ label: 'Review', fields: ['confirmed'], content: <input name="confirmed" aria-label="Confirmation" /> }]}
      validateStep={validateStep}
      onSubmit={onSubmit}
      submitLabel="Save"
    />)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('textbox', { name: 'Confirmation' })).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
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
