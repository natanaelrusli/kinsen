const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export function formatIdr(amount: number): string {
  return idr.format(amount)
}

export function formatCompactIdr(amount: number): string {
  if (amount >= 1_000_000) return `Rp ${(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`
  if (amount >= 1_000) return `Rp ${(amount / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 0 })} rb`
  return formatIdr(amount)
}
