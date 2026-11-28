import userEvent from '@testing-library/user-event'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DialogForm } from './DialogForm'
import { ConfirmationDialog } from './ConfirmationDialog'
import { FormWizardDialog } from './FormWizard'
import { useIsMobile } from '../hooks/use-is-mobile'

vi.mock('../hooks/use-is-mobile', () => ({ useIsMobile: vi.fn() }))

afterEach(() => { cleanup(); vi.mocked(useIsMobile).mockReset() })

describe('forms on mobile', () => {
  it('presents a DialogForm as a bottom sheet and still submits and closes', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true)
    const onSubmit = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<DialogForm open title="Add item" onClose={onClose} onSubmit={onSubmit} submitLabel="Save"><input aria-label="Name" /></DialogForm>)

    expect(screen.getByRole('dialog', { name: 'Add item' })).toBeInTheDocument()
    expect(document.querySelector('.form-dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the centered dialog on desktop', () => {
    vi.mocked(useIsMobile).mockReturnValue(false)
    render(<DialogForm open title="Add item" onClose={() => undefined} onSubmit={() => undefined} submitLabel="Save"><input aria-label="Name" /></DialogForm>)
    expect(document.querySelector('.form-dialog')).not.toBeNull()
    expect(document.querySelector('.form-sheet')).toBeNull()
  })

  it('presents confirmations as a bottom sheet', async () => {
    vi.mocked(useIsMobile).mockReturnValue(true)
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(<ConfirmationDialog open title="Delete it?" description="Gone for good." confirmLabel="Delete" onClose={() => undefined} onConfirm={onConfirm} />)
    expect(document.querySelector('.form-sheet')).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalled()
  })

  it('presents a wizard as a bottom sheet', () => {
    vi.mocked(useIsMobile).mockReturnValue(true)
    render(<FormWizardDialog open title="Add asset" onClose={() => undefined} onSubmit={() => undefined} submitLabel="Save" validateStep={() => true} steps={[{ label: 'Basics', fields: [], content: <input aria-label="Name" /> }]} />)
    expect(document.querySelector('.form-sheet')).not.toBeNull()
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
  })
})
