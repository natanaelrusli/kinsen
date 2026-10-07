import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { calculateFinancialPosition, deriveLedgerBalance } from '@kinsen/budget-domain'
import type { AssetAccount, AssetEntry, LiabilityAccount, LiabilityEntry, Transaction } from '@kinsen/budget-domain'
import { DexieBudgetRepository } from './dexie-budget-repository'

const activityDate = '2024-01-02'

function account(id: string, name: string, opening: number): { asset: AssetAccount; openingEntry: AssetEntry } {
  const asset: AssetAccount = {
    id,
    name,
    type: 'BANK_ACCOUNT',
    institution: name,
    nativeCurrency: 'IDR',
    balanceMode: 'LEDGER',
    createdAt: '2024-01-01',
  }
  return {
    asset,
    openingEntry: { id: `${id}-opening`, assetId: id, date: '2024-01-01', kind: 'OPENING_BALANCE', amountMinor: opening },
  }
}

const expense: Transaction = {
  id: 'expense-1',
  description: 'Groceries',
  categoryId: 'food',
  amount: 300,
  date: activityDate,
}

describe('Dexie budget/asset transaction atomicity', () => {
  it('upgrades the previous local schema without replacing the existing budget', async () => {
    const legacy = new Dexie('kinsen-budget')
    legacy.version(3).stores({
      periods: 'id',
      categories: 'id',
      plannedExpenses: 'id, categoryId',
      transactions: 'id, categoryId, plannedExpenseId',
      pendingOperations: '++queueId, createdAt',
      accountMetadata: 'key',
    })
    const period = {
      id: 'period-from-v3',
      totalAmount: 1_000,
      reserveAmount: 100,
      flexibleAllocation: 800,
      plannedAllocation: 100,
      startDate: '2024-01-01',
      endDate: '2024-01-31',
    }
    await legacy.open()
    await legacy.table('periods').put(period)
    await legacy.table('transactions').put(expense)
    legacy.close()

    const repository = new DexieBudgetRepository()
    expect((await repository.getSnapshot()).period).toEqual(period)
    expect((await repository.getSnapshot()).transactions).toEqual([expense])
    expect(await repository.getAssetData()).toEqual({
      assets: [],
      assetEntries: [],
      valuations: [],
      liabilities: [],
      liabilityEntries: [],
    })
    await repository.clearAccountData()
  })

  it('creates, edits, removes, reloads, and rolls back a Paid from debit atomically', async () => {
    const repository = new DexieBudgetRepository()
    await repository.clearAccountData()
    const first = account('daily-account', 'Daily account', 1_000)
    const second = account('savings-account', 'Savings account', 400)
    await repository.createAsset(first.asset, { entry: first.openingEntry })
    await repository.createAsset(second.asset, { entry: second.openingEntry })

    await repository.saveTransaction(expense, first.asset.id)
    let data = await repository.getAssetData()
    expect(data.assetEntries.filter((entry) => entry.budgetTransactionId === expense.id)).toMatchObject([
      { assetId: first.asset.id, amountMinor: 300, date: activityDate },
    ])
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === first.asset.id), activityDate)).toBe(700)

    const edited: Transaction = { ...expense, amount: 250 }
    await repository.saveTransaction(edited, second.asset.id)
    data = await repository.getAssetData()
    expect(data.assetEntries.filter((entry) => entry.budgetTransactionId === expense.id)).toMatchObject([
      { assetId: second.asset.id, amountMinor: 250, date: activityDate },
    ])
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === first.asset.id), activityDate)).toBe(1_000)
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === second.asset.id), activityDate)).toBe(150)
    expect((await repository.getSnapshot()).transactions).toEqual([edited])

    await expect(repository.saveTransaction({ ...edited, amount: 500 }, second.asset.id)).rejects.toThrow(/negative/i)
    expect((await repository.getSnapshot()).transactions).toEqual([edited])
    data = await repository.getAssetData()
    expect(data.assetEntries.filter((entry) => entry.budgetTransactionId === expense.id)).toMatchObject([
      { assetId: second.asset.id, amountMinor: 250 },
    ])

    await repository.saveTransaction(edited, null)
    data = await repository.getAssetData()
    expect(data.assetEntries.some((entry) => entry.budgetTransactionId === expense.id)).toBe(false)
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === second.asset.id), activityDate)).toBe(400)

    await repository.saveTransaction({ ...edited, amount: 200 }, first.asset.id)
    const reloadedRepository = new DexieBudgetRepository()
    const reloadedData = await reloadedRepository.getAssetData()
    expect(deriveLedgerBalance(reloadedData.assetEntries.filter((entry) => entry.assetId === first.asset.id), activityDate)).toBe(800)
    expect((await reloadedRepository.getSnapshot()).transactions).toMatchObject([{ id: expense.id, amount: 200 }])

    await reloadedRepository.deleteTransaction(expense.id)
    const afterDelete = await repository.getAssetData()
    expect((await repository.getSnapshot()).transactions).toEqual([])
    expect(afterDelete.assetEntries.some((entry) => entry.budgetTransactionId === expense.id)).toBe(false)
    expect(deriveLedgerBalance(afterDelete.assetEntries.filter((entry) => entry.assetId === first.asset.id), activityDate)).toBe(1_000)
    await repository.clearAccountData()
  })
  it('moves value between tracked accounts and settles a liability without changing budget transactions', async () => {
    const repository = new DexieBudgetRepository()
    await repository.clearAccountData()
    const cash = account('cash-for-settlement', 'Cash', 1_000)
    const savings = account('savings-for-transfer', 'Savings', 500)
    await repository.createAsset(cash.asset, { entry: cash.openingEntry })
    await repository.createAsset(savings.asset, { entry: savings.openingEntry })

    const transferId = 'transfer-1'
    await repository.transferAssets(
      { id: 'transfer-out-1', assetId: cash.asset.id, date: activityDate, kind: 'TRANSFER_OUT', amountMinor: 200, transferId },
      { id: 'transfer-in-1', assetId: savings.asset.id, date: activityDate, kind: 'TRANSFER_IN', amountMinor: 200, transferId },
    )
    let data = await repository.getAssetData()
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === cash.asset.id), activityDate)).toBe(800)
    expect(deriveLedgerBalance(data.assetEntries.filter((entry) => entry.assetId === savings.asset.id), activityDate)).toBe(700)

    const liability: LiabilityAccount = {
      id: 'card-1',
      name: 'Credit card',
      type: 'CREDIT_CARD',
      institution: 'Bank',
      nativeCurrency: 'IDR',
      createdAt: '2024-01-01',
    }
    const opening: LiabilityEntry = {
      id: 'card-opening',
      liabilityId: liability.id,
      date: '2024-01-01',
      kind: 'OPENING_BALANCE',
      amountMinor: 300,
    }
    await repository.createLiability(liability, opening)
    await repository.recordLiabilityPayment(
      { id: 'payment-debit', assetId: cash.asset.id, date: activityDate, kind: 'DEBIT', amountMinor: 200, liabilityEntryId: 'card-payment' },
      { id: 'card-payment', liabilityId: liability.id, date: activityDate, kind: 'PAYMENT', amountMinor: 200, assetEntryId: 'payment-debit' },
    )

    data = await repository.getAssetData()
    expect(calculateFinancialPosition(data, activityDate)).toMatchObject({
      totalAssets: 1_300,
      totalLiabilities: 100,
      netWorth: 1_200,
    })
    expect((await repository.getSnapshot()).transactions).toEqual([])
    await repository.clearAccountData()
  })

})
