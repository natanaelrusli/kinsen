const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})
const groupedNumberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 })
const groupedNumericTextPattern = /^(-?)(\d+)(?:\.(\d*))?$/

// Set once at app start (and on preference change) so plain formatting helpers stay synchronous.
let moneyStyle: 'full' | 'compact' = 'full'

export function setMoneyStyle(style: 'full' | 'compact') {
  moneyStyle = style
}

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
  if (moneyStyle === 'compact') return formatCompactIdr(amount)
  return idr.format(amount)
}

function formatCompactIdr(amount: number): string {
  const absolute = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (absolute >= 1_000_000_000) return `${sign}Rp ${(absolute / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} M`
  if (absolute >= 1_000_000) return `${sign}Rp ${(absolute / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (absolute >= 1_000) return `${sign}Rp ${(absolute / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`
  return idr.format(amount)
}

