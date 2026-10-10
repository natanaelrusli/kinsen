import { afterEach, describe, expect, it } from 'vitest'
import { formatIdr, setMoneyStyle } from './money'

// Intl renders a non-breaking space between the currency code and the digits.
const render = (amount: number) => formatIdr(amount).replace(/\u00a0/g, ' ')

describe('formatIdr', () => {
  afterEach(() => setMoneyStyle('full'))

  it('groups every digit in full style', () => {
    setMoneyStyle('full')
    expect(render(1_250_000)).toBe('Rp 1.250.000')
    expect(render(950)).toBe('Rp 950')
  })

  it('abbreviates thousands and millions in compact style', () => {
    setMoneyStyle('compact')
    expect(render(1_250_000)).toBe('Rp 1,3 jt')
    expect(render(950_000)).toBe('Rp 950 rb')
    expect(render(2_500_000_000)).toBe('Rp 2,5 M')
  })

  it('keeps sub-thousand amounts exact in compact style and keeps the sign', () => {
    setMoneyStyle('compact')
    expect(render(950)).toBe('Rp 950')
    expect(render(-1_250_000)).toBe('-Rp 1,3 jt')
  })
})
