import userEvent from '@testing-library/user-event'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecordPagination } from './RecordPagination'

afterEach(cleanup)

describe('RecordPagination', () => {
  it('keeps one-page lists uncluttered and exposes the final partial page', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()
    const { rerender } = render(<RecordPagination count={50} page={1} onPageChange={onPageChange} />)
    expect(screen.queryByRole('navigation', { name: 'Record pages' })).not.toBeInTheDocument()

    rerender(<RecordPagination count={51} page={1} onPageChange={onPageChange} />)
    expect(screen.getByText('Showing 1–50 of 51')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous records' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next records' }))
    expect(onPageChange).toHaveBeenCalledWith(2)

    rerender(<RecordPagination count={51} page={2} onPageChange={onPageChange} />)
    expect(screen.getByText('Showing 51–51 of 51')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous records' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next records' })).toBeDisabled()
  })
})
