import Dexie, { type Table } from 'dexie'
import { validateSnapshot } from '@kinsen/budget-domain'
import type { AssetAccount, AssetData, AssetEntry, AssetValuation, BudgetPeriod, BudgetSnapshot, Category, DateOnly, LiabilityAccount, LiabilityEntry, PlannedExpense, Transaction } from '@kinsen/budget-domain'
import type { BudgetRepository } from './budget-repository'
import type { PendingBudgetOperation } from './pending-budget-operation'
import { validateAssetData } from '@kinsen/budget-domain'
import type { AssetRepository } from './asset-repository'
import type { AssetOpeningRecord } from './asset-repository'

class BudgetDatabase extends Dexie {
  periods!: Table<BudgetPeriod, string>
  categories!: Table<Category, string>
  plannedExpenses!: Table<PlannedExpense, string>
  transactions!: Table<Transaction, string>
  pendingOperations!: Table<PendingBudgetOperation, number>
  accountMetadata!: Table<{ key: string; value: number }, string>
  assetAccounts!: Table<AssetAccount, string>
  assetEntries!: Table<AssetEntry, string>
  assetValuations!: Table<AssetValuation, string>
  liabilityAccounts!: Table<LiabilityAccount, string>
  liabilityEntries!: Table<LiabilityEntry, string>


  constructor() {
    super('kinsen-budget')
    this.version(1).stores({
      periods: 'id',
      categories: 'id',
      plannedExpenses: 'id, categoryId',
      transactions: 'id, categoryId, plannedExpenseId',
    })
    this.version(2).stores({
      periods: 'id',
      categories: 'id',
      plannedExpenses: 'id, categoryId',
      transactions: 'id, categoryId, plannedExpenseId',
      pendingOperations: '++queueId, createdAt',
    })
    this.version(3).stores({
      periods: 'id',
      categories: 'id',
      plannedExpenses: 'id, categoryId',
      transactions: 'id, categoryId, plannedExpenseId',
      pendingOperations: '++queueId, createdAt',
      accountMetadata: 'key',
    })
    this.version(4).stores({
      periods: 'id',
      categories: 'id',
      plannedExpenses: 'id, categoryId',
      transactions: 'id, categoryId, plannedExpenseId',
      pendingOperations: '++queueId, createdAt',
      accountMetadata: 'key',
      assetAccounts: 'id, type, institution, purpose, archivedAt',
      assetEntries: 'id, assetId, date, kind, transferId, budgetTransactionId, liabilityEntryId',
      assetValuations: 'id, assetId, asOfDate, recordedAt',
      liabilityAccounts: 'id, type, institution, archivedAt',
      liabilityEntries: 'id, liabilityId, date, kind, assetEntryId',
    })

  }
}

export class DexieBudgetRepository implements BudgetRepository, AssetRepository {
  constructor(private readonly db = new BudgetDatabase()) {}

  async getSnapshot(): Promise<BudgetSnapshot> {
    const [period, categories, plannedExpenses, transactions] = await Promise.all([
      this.db.periods.toCollection().first(),
      this.db.categories.toArray(),
      this.db.plannedExpenses.toArray(),
      this.db.transactions.toArray(),
    ])
    return { period: period ?? null, categories, plannedExpenses, transactions }
  }
  async getDataGeneration(): Promise<number> {
    const row = await this.db.accountMetadata.get('dataGeneration')
    return row?.value ?? 0
  }

  setDataGeneration(value: number): Promise<string> {
    return this.db.accountMetadata.put({ key: 'dataGeneration', value })
  }

  async clearAccountData(): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.periods,
        this.db.categories,
        this.db.plannedExpenses,
        this.db.transactions,
        this.db.pendingOperations,
        this.db.assetAccounts,
        this.db.assetEntries,
        this.db.assetValuations,
        this.db.liabilityAccounts,
        this.db.liabilityEntries,
      ],
      async () => {
        await Promise.all([
          this.db.periods.clear(),
          this.db.categories.clear(),
          this.db.plannedExpenses.clear(),
          this.db.transactions.clear(),
          this.db.pendingOperations.clear(),
          this.db.assetAccounts.clear(),
          this.db.assetEntries.clear(),
          this.db.assetValuations.clear(),
          this.db.liabilityAccounts.clear(),
          this.db.liabilityEntries.clear(),
        ])
      },
    )
  }


  async saveBudget(period: BudgetPeriod, categories: Category[]): Promise<void> {
    await this.db.transaction('rw', this.db.periods, this.db.categories, this.db.pendingOperations, async () => {
      await this.db.periods.clear()
      await this.db.periods.put(period)
      await this.db.categories.clear()
      await this.db.categories.bulkPut(categories)
      await this.db.pendingOperations.add({ kind: 'SAVE_BUDGET', period, categories, createdAt: Date.now() })
    })
  }

  async savePlannedExpense(expense: PlannedExpense): Promise<void> {
    await this.db.transaction('rw', this.db.plannedExpenses, this.db.pendingOperations, async () => {
      await this.db.plannedExpenses.put(expense)
      await this.db.pendingOperations.add({ kind: 'SAVE_PLANNED_EXPENSE', expense, createdAt: Date.now() })
    })
  }

  async deletePlannedExpense(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.plannedExpenses, this.db.transactions, this.db.pendingOperations, async () => {
      await this.db.plannedExpenses.delete(id)
      const linked = await this.db.transactions.where('plannedExpenseId').equals(id).toArray()
      await this.db.transactions.bulkPut(linked.map(({ plannedExpenseId: _id, plannedOccurrenceDate: _date, ...transaction }) => transaction))
      await this.db.pendingOperations.add({ kind: 'DELETE_PLANNED_EXPENSE', id, createdAt: Date.now() })
    })
  }

  async saveTransaction(transaction: Transaction, paidFromAssetId?: string | null): Promise<void> {
    await this.db.transaction(
      'rw',
      [
        this.db.transactions,
        this.db.pendingOperations,
        this.db.assetAccounts,
        this.db.assetEntries,
        this.db.assetValuations,
        this.db.liabilityAccounts,
        this.db.liabilityEntries,
      ],
      async () => {
        const data = await this.readAssetData()
        const oldLinkedEntries = data.assetEntries.filter((entry) => entry.budgetTransactionId === transaction.id)
        const linkedAssetId = paidFromAssetId === undefined ? oldLinkedEntries[0]?.assetId : paidFromAssetId ?? undefined
        const remainingEntries = data.assetEntries.filter((entry) => entry.budgetTransactionId !== transaction.id)
        const nextEntries = [...remainingEntries]
        if (linkedAssetId) {
          const account = data.assets.find((asset) => asset.id === linkedAssetId)
          const hasHistoricalLink = oldLinkedEntries.some((entry) => entry.assetId === linkedAssetId)
          const archivedLinkIsUnchanged = account?.archivedAt && hasHistoricalLink && transaction.date < account.archivedAt
          if (!account || account.balanceMode !== 'LEDGER' || (account.archivedAt && !archivedLinkIsUnchanged)) {
            throw new Error('Choose an active cash, bank, e-wallet, or deposit account for Paid from.')
          }
          nextEntries.push({
            id: `asset-entry-${crypto.randomUUID()}`,
            assetId: linkedAssetId,
            date: transaction.date,
            kind: 'DEBIT',
            amountMinor: transaction.amount,
            budgetTransactionId: transaction.id,
            note: transaction.description,
          })
        }
        validateAssetData({ ...data, assetEntries: nextEntries })
        await this.db.transactions.put(transaction)
        await this.db.assetEntries.where('budgetTransactionId').equals(transaction.id).delete()
        if (linkedAssetId) await this.db.assetEntries.add(nextEntries[nextEntries.length - 1]!)
        await this.db.pendingOperations.add({ kind: 'SAVE_TRANSACTION', transaction, createdAt: Date.now() })
      },
    )
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.transactions, this.db.pendingOperations, this.db.assetEntries, async () => {
      await this.db.transactions.delete(id)
      await this.db.assetEntries.where('budgetTransactionId').equals(id).delete()
      await this.db.pendingOperations.add({ kind: 'DELETE_TRANSACTION', id, createdAt: Date.now() })
    })
  }

  async getAssetData(): Promise<AssetData> {
    return this.db.transaction(
      'r',
      this.db.assetAccounts,
      this.db.assetEntries,
      this.db.assetValuations,
      this.db.liabilityAccounts,
      this.db.liabilityEntries,
      () => this.readAssetData(),
    )
  }

  async createAsset(asset: AssetAccount, openingRecord: AssetOpeningRecord): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      const next: AssetData = { ...data, assets: [...data.assets, asset] }
      if ('entry' in openingRecord) next.assetEntries = [...data.assetEntries, openingRecord.entry]
      else next.valuations = [...data.valuations, openingRecord.valuation]
      validateAssetData(next)
      await this.db.assetAccounts.add(asset)
      if ('entry' in openingRecord) await this.db.assetEntries.add(openingRecord.entry)
      else await this.db.assetValuations.add(openingRecord.valuation)
    })
  }

  async saveAsset(asset: AssetAccount): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      const current = data.assets.find((item) => item.id === asset.id)
      if (!current || current.archivedAt) throw new Error('This asset is archived or no longer available.')
      if (current.createdAt !== asset.createdAt || current.archivedAt !== asset.archivedAt) throw new Error('Asset dates cannot be changed while editing details.')
      validateAssetData({ ...data, assets: data.assets.map((item) => item.id === asset.id ? asset : item) })
      await this.db.assetAccounts.put(asset)
    })
  }

  async saveAssetEntry(entry: AssetEntry): Promise<void> {
    if (entry.kind === 'OPENING_BALANCE' || entry.kind === 'TRANSFER_IN' || entry.kind === 'TRANSFER_OUT' || entry.budgetTransactionId || entry.liabilityEntryId || entry.transferId) {
      throw new Error('Opening balances, transfers, budget expenses, and liability settlements must be changed from their source action.')
    }
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      const nextEntries = [...data.assetEntries.filter((item) => item.id !== entry.id), entry]
      validateAssetData({ ...data, assetEntries: nextEntries })
      await this.db.assetEntries.put(entry)
    })
  }

  async deleteAssetEntry(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      const entry = data.assetEntries.find((item) => item.id === id)
      if (!entry) return
      if (entry.kind === 'OPENING_BALANCE' || entry.budgetTransactionId || entry.liabilityEntryId) {
        throw new Error('This entry is linked or establishes an opening balance. Record a correction or edit its source transaction instead.')
      }
      const entries = entry.transferId
        ? data.assetEntries.filter((item) => item.transferId !== entry.transferId)
        : data.assetEntries.filter((item) => item.id !== id)
      validateAssetData({ ...data, assetEntries: entries })
      await this.db.assetEntries.bulkDelete(data.assetEntries.filter((item) => entry.transferId ? item.transferId === entry.transferId : item.id === id).map((item) => item.id))
    })
  }

  async saveAssetValuation(valuation: AssetValuation): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      validateAssetData({ ...data, valuations: [...data.valuations.filter((item) => item.id !== valuation.id), valuation] })
      await this.db.assetValuations.add(valuation)
    })
  }

  async transferAssets(sourceEntry: AssetEntry, destinationEntry: AssetEntry): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      validateAssetData({ ...data, assetEntries: [...data.assetEntries, sourceEntry, destinationEntry] })
      await this.db.assetEntries.bulkAdd([sourceEntry, destinationEntry])
    })
  }

  async archiveAsset(id: string, date: DateOnly): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      const asset = data.assets.find((item) => item.id === id)
      if (!asset || asset.archivedAt) throw new Error('This asset is archived or no longer available.')
      const archived = { ...asset, archivedAt: date }
      validateAssetData({ ...data, assets: data.assets.map((item) => item.id === id ? archived : item) })
      await this.db.assetAccounts.put(archived)
    })
  }

  async createLiability(liability: LiabilityAccount, openingEntry: LiabilityEntry): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      validateAssetData({ ...data, liabilities: [...data.liabilities, liability], liabilityEntries: [...data.liabilityEntries, openingEntry] })
      await this.db.liabilityAccounts.add(liability)
      await this.db.liabilityEntries.add(openingEntry)
    })
  }

  async saveLiability(liability: LiabilityAccount): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      const current = data.liabilities.find((item) => item.id === liability.id)
      if (!current || current.archivedAt) throw new Error('This liability is archived or no longer available.')
      if (current.createdAt !== liability.createdAt || current.archivedAt !== liability.archivedAt) throw new Error('Liability dates cannot be changed while editing details.')
      validateAssetData({ ...data, liabilities: data.liabilities.map((item) => item.id === liability.id ? liability : item) })
      await this.db.liabilityAccounts.put(liability)
    })
  }

  async saveLiabilityEntry(entry: LiabilityEntry): Promise<void> {
    if (entry.kind === 'OPENING_BALANCE' || entry.kind === 'PAYMENT' || entry.assetEntryId) {
      throw new Error('Opening balances and liability payments must be changed from their source action.')
    }
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      validateAssetData({ ...data, liabilityEntries: [...data.liabilityEntries.filter((item) => item.id !== entry.id), entry] })
      await this.db.liabilityEntries.put(entry)
    })
  }

  async deleteLiabilityEntry(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      const entry = data.liabilityEntries.find((item) => item.id === id)
      if (!entry) return
      if (entry.kind === 'OPENING_BALANCE' || entry.kind === 'PAYMENT' || entry.assetEntryId) {
        throw new Error('Opening balances and settlements are retained for reconciliation.')
      }
      const liabilityEntries = data.liabilityEntries.filter((item) => item.id !== id)
      validateAssetData({ ...data, liabilityEntries })
      await this.db.liabilityEntries.delete(id)
    })
  }

  async recordLiabilityPayment(assetEntry: AssetEntry, liabilityEntry: LiabilityEntry): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      validateAssetData({
        ...data,
        assetEntries: [...data.assetEntries, assetEntry],
        liabilityEntries: [...data.liabilityEntries, liabilityEntry],
      })
      await this.db.assetEntries.add(assetEntry)
      await this.db.liabilityEntries.add(liabilityEntry)
    })
  }

  async archiveLiability(id: string, date: DateOnly): Promise<void> {
    await this.db.transaction('rw', this.db.assetAccounts, this.db.assetEntries, this.db.assetValuations, this.db.liabilityAccounts, this.db.liabilityEntries, async () => {
      const data = await this.readAssetData()
      const liability = data.liabilities.find((item) => item.id === id)
      if (!liability || liability.archivedAt) throw new Error('This liability is archived or no longer available.')
      const archived = { ...liability, archivedAt: date }
      validateAssetData({ ...data, liabilities: data.liabilities.map((item) => item.id === id ? archived : item) })
      await this.db.liabilityAccounts.put(archived)
    })
  }
  async seedIfEmpty(snapshot: BudgetSnapshot): Promise<void> {
    validateSnapshot(snapshot)
    await this.db.transaction('rw', this.db.periods, this.db.categories, this.db.plannedExpenses, this.db.transactions, this.db.pendingOperations, async () => {
      if (await this.db.periods.count()) return
      await this.writeSnapshot(snapshot)
      await this.db.pendingOperations.add({ kind: 'IMPORT_SNAPSHOT', snapshot, createdAt: Date.now() })
    })
  }

  async queueImportSnapshot(snapshot: BudgetSnapshot): Promise<void> {
    validateSnapshot(snapshot)
    await this.db.transaction('rw', this.db.pendingOperations, async () => {
      await this.db.pendingOperations.clear()
      await this.db.pendingOperations.add({ kind: 'IMPORT_SNAPSHOT', snapshot, createdAt: Date.now() })
    })
  }

  async replaceSnapshotFromRemote(snapshot: BudgetSnapshot): Promise<void> {
    validateSnapshot(snapshot)
    await this.db.transaction('rw', this.db.periods, this.db.categories, this.db.plannedExpenses, this.db.transactions, this.db.pendingOperations, async () => {
      const [periods, categories, plannedExpenses, transactions, pendingOperations] = await Promise.all([
        this.db.periods.count(),
        this.db.categories.count(),
        this.db.plannedExpenses.count(),
        this.db.transactions.count(),
        this.db.pendingOperations.count(),
      ])
      if (periods + categories + plannedExpenses + transactions + pendingOperations > 0) {
        throw new Error('Local data already exists; refusing to replace it with the API snapshot.')
      }
      await this.writeSnapshot(snapshot)
    })
  }

  getPendingOperations(): Promise<PendingBudgetOperation[]> {
    return this.db.pendingOperations.orderBy('queueId').toArray()
  }

  acknowledgePendingOperation(id: number): Promise<void> {
    return this.db.pendingOperations.delete(id)
  }

  private async writeSnapshot(snapshot: BudgetSnapshot): Promise<void> {
    if (snapshot.period) await this.db.periods.put(snapshot.period)
    await this.db.categories.bulkPut(snapshot.categories)
    await this.db.plannedExpenses.bulkPut(snapshot.plannedExpenses)
    await this.db.transactions.bulkPut(snapshot.transactions)
  }
  private async readAssetData(): Promise<AssetData> {
    const [assets, assetEntries, valuations, liabilities, liabilityEntries] = await Promise.all([
      this.db.assetAccounts.toArray(),
      this.db.assetEntries.toArray(),
      this.db.assetValuations.toArray(),
      this.db.liabilityAccounts.toArray(),
      this.db.liabilityEntries.toArray(),
    ])
    return { assets, assetEntries, valuations, liabilities, liabilityEntries }
  }
}

export const budgetRepository = new DexieBudgetRepository()
export const assetRepository: AssetRepository = budgetRepository
