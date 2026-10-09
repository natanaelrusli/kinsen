const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})
const groupedNumberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 })
const groupedNumericTextPattern = /^(-?)(\d+)(?:\.(\d*))?$/

export function formatGroupedAmount(value: number | string): string {
  if (typeof value === 'number') return groupedNumberFormatter.format(value)
  const match = groupedNumericTextPattern.exec(value)
  if (!match) return value
  const sign = match[1] ?? ''
  const integer = match[2] ?? ''
  const fraction = match[3]
  return `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction === undefined ? '' : `.${fraction}`}`
}


export function formatIdr(amount: number): string {
  return idr.format(amount)
}

export function formatCompactIdr(amount: number): string {
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`
  return formatIdr(amount)
}
