import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { afterEach, describe, expect, it } from 'vitest'
import { CurrencyAmountField } from './AstryxFields'

afterEach(cleanup)

describe('CurrencyAmountField', () => {
  it('keeps the insertion point and grouped display while editing string amounts', async () => {
    const user = userEvent.setup()
    const savedValues: string[] = []
    function AmountForm() {
      const { control, handleSubmit } = useForm<{ amount: string }>({ defaultValues: { amount: '1234567' } })
      return (
        <form onSubmit={handleSubmit(({ amount }) => { savedValues.push(amount) })}>
          <CurrencyAmountField control={control} name="amount" label="Amount" inputMode="decimal" />
          <button type="submit">Save</button>
        </form>
      )
    }

    render(<AmountForm />)
    const input = screen.getByRole('textbox', { name: 'Amount' }) as HTMLInputElement
    expect(input).toHaveValue('1,234,567')

    await user.click(input)
    input.setSelectionRange(4, 4)
    await user.keyboard('9')
    expect(input).toHaveValue('12,394,567')
    expect(input.selectionStart).toBe(5)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(savedValues).toEqual(['12394567'])
  })

  it('formats numeric amounts while typing and submits a number', async () => {
    const user = userEvent.setup()
    const savedValues: number[] = []
    function AmountForm() {
      const { control, handleSubmit } = useForm<{ amount: number }>({ defaultValues: { amount: 0 } })
      return (
        <form onSubmit={handleSubmit(({ amount }) => { savedValues.push(amount) })}>
          <CurrencyAmountField control={control} name="amount" label="Amount" />
          <button type="submit">Save</button>
        </form>
      )
    }

    render(<AmountForm />)
    const input = screen.getByRole('textbox', { name: 'Amount' })
    expect(input).toHaveValue('0')
    await user.click(input)
    await user.keyboard('12345678')
    expect(input).toHaveValue('12,345,678')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(savedValues).toEqual([12345678])
  })

  it('groups decimal text without changing its submitted precision', async () => {
    const user = userEvent.setup()
    const savedValues: string[] = []
    function AmountForm() {
      const { control, handleSubmit } = useForm<{ amount: string }>({ defaultValues: { amount: '' } })
      return (
        <form onSubmit={handleSubmit(({ amount }) => { savedValues.push(amount) })}>
          <CurrencyAmountField control={control} name="amount" label="Amount" inputMode="decimal" />
          <button type="submit">Save</button>
        </form>
      )
    }

    render(<AmountForm />)
    const input = screen.getByRole('textbox', { name: 'Amount' })
    expect(input).toHaveValue('0')
    await user.type(input, '120000.50')
    expect(input).toHaveValue('120,000.50')

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(savedValues).toEqual(['120000.50'])
  })

  it.each([
    { value: '-500', commit: 'blur' },
    { value: '-500', commit: 'enter' },
    { value: '0.5', commit: 'blur' },
    { value: '0.5', commit: 'enter' },
    { value: '0', commit: 'blur' },
  ])('preserves invalid numeric value $value on $commit', async ({ value, commit }) => {
    const user = userEvent.setup()
    function AmountForm() {
      const { control, watch } = useForm<{ amount: number }>({ defaultValues: { amount: 0 } })
      return (
        <form>
          <CurrencyAmountField control={control} name="amount" label="Amount" />
          <output>{String(watch('amount'))}</output>
        </form>
      )
    }

    render(<AmountForm />)
    const input = screen.getByRole('textbox', { name: 'Amount' })
    await user.clear(input)
    await user.type(input, value)
    if (commit === 'enter') await user.keyboard('{Enter}')
    else await user.tab()

    expect(input).toHaveValue(value)
    expect(screen.getByText(value)).toBeInTheDocument()
  })
})
