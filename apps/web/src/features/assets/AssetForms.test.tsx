import userEvent from '@testing-library/user-event'
import { cleanup, render, screen } from '@testing-library/react'
import type { AssetAccount, DateOnly, LiabilityAccount } from '@kinsen/budget-domain'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetValuationForm, LiabilityPaymentForm, TransferForm } from './AssetForms'

const today = '2026-10-12' as DateOnly
const accounts: AssetAccount[] = [
  { id: 'cash-one', name: 'Cash one', type: 'BANK_ACCOUNT', institution: 'Bank', nativeCurrency: 'IDR', balanceMode: 'LEDGER', createdAt: today },
  { id: 'cash-two', name: 'Cash two', type: 'BANK_ACCOUNT', institution: 'Bank', nativeCurrency: 'IDR', balanceMode: 'LEDGER', createdAt: today },
]
const valuationAccounts: AssetAccount[] = accounts.map((account): AssetAccount => ({ ...account, type: 'OTHER', balanceMode: 'VALUATION' }))
const liability: LiabilityAccount = {
  id: 'debt-one', name: 'Card', type: 'CREDIT_CARD', institution: 'Bank', nativeCurrency: 'IDR', createdAt: today,
}

afterEach(cleanup)

describe('asset form drafts during account refreshes', () => {
  it('keeps a manual valuation draft when selectable account snapshots get new identities', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<AssetValuationForm
      open asset={valuationAccounts[0]!} latest={null} selectableAssets={valuationAccounts}
      today={today} saving={false} onClose={vi.fn()} onSave={vi.fn(async () => {})}
    />)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const amount = screen.getByRole('textbox', { name: 'Native value (IDR)' })
    await user.type(amount, '125000')

    rerender(<AssetValuationForm
      open asset={valuationAccounts[0]!} latest={null} selectableAssets={valuationAccounts.map((account) => ({ ...account }))}
      today={today} saving={false} onClose={vi.fn()} onSave={vi.fn(async () => {})}
    />)

    expect(screen.getByRole('textbox', { name: 'Native value (IDR)' })).toHaveValue('125,000')
  })

  it('keeps transfer details and valid account selections during account refreshes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<TransferForm
      open accounts={accounts} today={today} saving={false} onClose={vi.fn()} onSave={vi.fn(async () => {})}
    />)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const amount = screen.getByRole('textbox', { name: 'Amount' })
    await user.type(amount, '125000')

    rerender(<TransferForm
      open accounts={accounts.map((account) => ({ ...account }))} today={today}
      saving={false} onClose={vi.fn()} onSave={vi.fn(async () => {})}
    />)

    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('125,000')

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('combobox', { name: 'From' })).toHaveTextContent('Cash one')
    expect(screen.getByRole('combobox', { name: 'To' })).toHaveTextContent('Cash two')
    await user.click(screen.getByRole('combobox', { name: 'From' }))
    await user.click(screen.getAllByRole('option', { name: 'Cash two · Bank' })[0]!)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('0')

    rerender(<TransferForm open={false} accounts={accounts} today={today} saving={false} onClose={vi.fn()} onSave={vi.fn(async () => {})} />)
    rerender(<TransferForm open accounts={accounts} today={today} saving={false} onClose={vi.fn()} onSave={vi.fn(async () => {})} />)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('textbox', { name: 'Amount' })).toHaveValue('0')
  })

  it('keeps liability payment details during account refreshes', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<LiabilityPaymentForm
      open liability={liability} accounts={accounts} assetBalances={{ 'cash-one': 500_000 }}
      maxLiabilityBalance={500_000} today={today} saving={false} onClose={vi.fn()}
      onSave={vi.fn(async () => {})}
    />)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const amount = screen.getByRole('textbox', { name: 'Amount (IDR)' })
    await user.type(amount, '125000')

    rerender(<LiabilityPaymentForm
      open liability={liability} accounts={accounts.map((account) => ({ ...account }))}
      assetBalances={{ 'cash-one': 500_000 }} maxLiabilityBalance={500_000} today={today}
      saving={false} onClose={vi.fn()} onSave={vi.fn(async () => {})}
    />)

    expect(screen.getByRole('textbox', { name: 'Amount (IDR)' })).toHaveValue('125,000')
  })
})
