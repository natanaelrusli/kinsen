import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DialogForm, type FormErrorIssue } from './DialogForm'

afterEach(cleanup)

function RepeatedSubmitForm({ onSubmit }: { onSubmit: () => void }) {
  const [attempts, setAttempts] = useState(0)
  const errorIssues: FormErrorIssue[] = attempts > 0
    ? [{ name: 'name', label: 'Name', message: attempts === 1 ? 'Add a name.' : 'Keep the name.' }]
    : []
  return <DialogForm
    open
    title="Add item"
    errorIssues={errorIssues}
    onClose={() => undefined}
    onSubmit={() => { setAttempts((count) => count + 1); onSubmit() }}
    submitLabel="Save"
  >
    <input name="name" aria-label="Name" />
  </DialogForm>
}

describe('DialogForm error summary focus', () => {
  it('returns focus to the current summary on repeated failed submissions with an unchanged error count', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<RepeatedSubmitForm onSubmit={onSubmit} />)
    const save = screen.getByRole('button', { name: 'Save' })

    await user.click(save)
    const summary = await screen.findByRole('alert')
    expect(summary).toHaveFocus()
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    save.focus()
    await user.click(save)
    expect(summary).toHaveFocus()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('Keep the name.')).toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledTimes(2)
  })
})
