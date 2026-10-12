import { z } from 'zod'
import { goldPriceSources, parseDateOnly } from '@kinsen/budget-domain'

const id = z.string().trim().min(1).max(200)
const text = z.string().trim().min(1).max(500)
const note = z.string().max(5000).optional()
const integer = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const amount = integer.nonnegative()
const date = z.string().refine(value => {
  try { parseDateOnly(value); return true } catch { return false }
}, 'Use a valid YYYY-MM-DD calendar date.')
const category = z.strictObject({
  id, name: text, mode: z.enum(['DAILY', 'PERIOD', 'SCHEDULED']), bucket: z.enum(['FLEXIBLE', 'PLANNED']),
  allocation: amount, color: text, defaultCadence: z.enum(['WEEKLY', 'MONTHLY']).optional(),
})
const period = z.strictObject({
  id, totalAmount: amount, reserveAmount: amount, flexibleAllocation: amount, plannedAllocation: amount,
  startDate: date, endDate: date, isSample: z.boolean().optional(),
})
const transaction = z.strictObject({
  id, description: text, categoryId: id, amount, date,
  plannedExpenseId: id.optional(), plannedOccurrenceDate: date.optional(),
})
const expense = z.strictObject({
  id, name: text, categoryId: id, amount, dueDate: date,
  cadence: z.enum(['WEEKLY', 'MONTHLY']).nullable(), endDate: date.optional(),
})
const goldPricing = z.strictObject({
  source: z.enum(goldPriceSources), materialType: text, weightGrams: text, lineKey: z.string().max(500), units: text, revision: id,
})
const asset = z.strictObject({
  id, name: text, type: z.enum(['CASH', 'BANK_ACCOUNT', 'E_WALLET', 'DEPOSIT', 'MUTUAL_FUND', 'STOCK_ETF', 'GOLD', 'FOREIGN_CURRENCY', 'OTHER']),
  institution: z.string().max(500), purpose: z.enum(['DAILY_CASH', 'PROTECTED_SAVINGS', 'INVESTMENT', 'OTHER']).optional(),
  nativeCurrency: text, balanceMode: z.enum(['LEDGER', 'VALUATION']), notes: note, createdAt: date,
  archivedAt: date.optional(), goldPricing: goldPricing.optional(),
})
const valuation = z.strictObject({
  id, assetId: id, asOfDate: date, nativeAmountMinor: amount, nativeCurrency: text,
  exchangeRate: text, rateDate: date, valueIdr: amount, quantity: text.optional(), unitPrice: text.optional(),
  source: z.enum(['MANUAL', 'IMPORTED']), note, recordedAt: amount,
})
const liability = z.strictObject({
  id, name: text, type: z.enum(['CREDIT_CARD', 'PAY_LATER', 'INSTALLMENT', 'LOAN', 'OTHER']),
  institution: z.string().max(500), nativeCurrency: text, notes: note, createdAt: date, archivedAt: date.optional(),
})
const observation = z.strictObject({
  id, date, sequence: amount, remainingMilliKwh: amount, refillMilliKwh: amount.nullable(),
  refillCostIdr: amount.nullable(), refillSource: z.enum(['none', 'entered', 'inferred_balance_difference', 'unknown']),
  note, sourceReference: z.string().max(500).optional(),
})
const destructive = z.literal(true).describe('Must be true: the user explicitly authorized this deletion or archive.')

export const tools = {
  kinsen_get_data: {
    description: 'Read the paired browser’s budget, assets/valuations/transfers, liabilities, and electricity readings. IDs come from these records. Budget sync status is included; assets and electricity are device-local.',
    schema: z.strictObject({ scope: z.enum(['all', 'budget', 'assets', 'electricity']).default('all') }), readOnly: true,
  },
  kinsen_save_budget: {
    description: 'Save the complete budget period and category list. Read first: omitted categories are removed; referenced categories cannot be removed. All budget amounts are whole IDR. Does not replace transactions or commitments.',
    schema: z.strictObject({ period, categories: z.array(category) }),
  },
  kinsen_save_transaction: {
    description: 'Create/update a budget expense by stable ID. paidFromAssetId links to an IDR ledger asset; null removes its existing link; omit to preserve it. Reuse the same ID when updating.',
    schema: z.strictObject({ transaction, paidFromAssetId: id.nullable().optional() }),
  },
  kinsen_delete_transaction: {
    description: 'Delete a budget expense and its linked asset debit. Requires user authorization.',
    schema: z.strictObject({ id, confirm: destructive }), destructive: true,
  },
  kinsen_save_commitment: {
    description: 'Create/update a planned expense by stable ID. cadence null is one-off; WEEKLY/MONTHLY expand recurring occurrences. Amount is whole IDR.',
    schema: z.strictObject({ expense }),
  },
  kinsen_delete_commitment: {
    description: 'Delete a planned expense rule. Requires user authorization; existing transactions remain subject to the app’s rules.',
    schema: z.strictObject({ id, confirm: destructive }), destructive: true,
  },
  kinsen_create_asset: {
    description: 'Create an asset with an opening balance (LEDGER) or manual opening valuation (VALUATION). IDs must be new. Automatic gold pricing fetches a verified provider quote instead of accepting supplied provenance.',
    schema: z.strictObject({ asset, openingRecord: z.union([
      z.strictObject({ entry: z.strictObject({ id, assetId: id, date, kind: z.literal('OPENING_BALANCE'), amountMinor: amount, note }) }),
      z.strictObject({ valuation }),
    ]) }),
  },
  kinsen_save_asset: {
    description: 'Edit existing asset details; retain createdAt/archivedAt and balance mode. To enable/change automatic IDR gold pricing supply goldPricing with a new revision; a real provider quote is fetched. Omit goldPricing to disable it.',
    schema: z.strictObject({ asset }),
  },
  kinsen_archive_asset: {
    description: 'Archive an asset without erasing its history. Requires user authorization.',
    schema: z.strictObject({ id, date, confirm: destructive }), destructive: true,
  },
  kinsen_save_asset_activity: {
    description: 'Create/update standalone ledger activity in native minor units. CORRECTION accepts signed amounts. Opening balances, transfers, linked budget debits and liability payments use their source tools.',
    schema: z.strictObject({ entry: z.strictObject({ id, assetId: id, date, kind: z.enum(['CREDIT', 'DEBIT', 'CORRECTION']), amountMinor: integer, note }) }),
  },
  kinsen_delete_asset_activity: {
    description: 'Delete standalone asset activity or both sides of a transfer. Opening/linked records are protected. Requires user authorization.',
    schema: z.strictObject({ id, confirm: destructive }), destructive: true,
  },
  kinsen_save_valuation: {
    description: 'Append an immutable manual valuation with a new ID. Native amount is in currency minor units; valueIdr must match conversion by exchangeRate. Disable automatic gold pricing before recording manual values.',
    schema: z.strictObject({ valuation }),
  },
  kinsen_transfer_assets: {
    description: 'Atomically transfer whole IDR between two different active IDR ledger assets. Creates both transfer entries; does not create a budget expense.',
    schema: z.strictObject({ sourceAssetId: id, destinationAssetId: id, amountMinor: amount.positive(), date, note }),
  },
  kinsen_create_liability: {
    description: 'Create an IDR liability with its opening debt. IDs must be new; openingEntry must reference the liability.',
    schema: z.strictObject({ liability, openingEntry: z.strictObject({ id, liabilityId: id, date, kind: z.literal('OPENING_BALANCE'), amountMinor: amount, note }) }),
  },
  kinsen_save_liability: {
    description: 'Edit existing liability details, retaining its createdAt/archivedAt dates.',
    schema: z.strictObject({ liability }),
  },
  kinsen_archive_liability: {
    description: 'Archive a liability without erasing its history. Requires user authorization.',
    schema: z.strictObject({ id, date, confirm: destructive }), destructive: true,
  },
  kinsen_save_liability_activity: {
    description: 'Create/update standalone liability activity in whole IDR. CORRECTION accepts signed amounts; use the payment tool for settlements from an asset.',
    schema: z.strictObject({ entry: z.strictObject({ id, liabilityId: id, date, kind: z.enum(['CHARGE', 'INTEREST_OR_FEE', 'CORRECTION']), amountMinor: integer, note }) }),
  },
  kinsen_delete_liability_activity: {
    description: 'Delete standalone liability activity. Opening balances and linked payments are protected. Requires user authorization.',
    schema: z.strictObject({ id, confirm: destructive }), destructive: true,
  },
  kinsen_pay_liability: {
    description: 'Atomically record an IDR liability payment and linked asset debit. Does not create a budget expense.',
    schema: z.strictObject({ liabilityId: id, assetId: id, amountMinor: amount.positive(), date, note }),
  },
  kinsen_save_electricity_reading: {
    description: 'Create/edit a PLN reading. Balance/refill units are milli-kWh (1000 = 1 kWh); cost is IDR. position is a zero-based insertion position among same-day readings; sequence is recalculated. For edits replacingId must equal observation.id.',
    schema: z.strictObject({ observation, position: amount, replacingId: id.optional() }),
  },
  kinsen_delete_electricity_reading: {
    description: 'Delete a PLN reading only when the remaining history is valid. Requires user authorization.',
    schema: z.strictObject({ id, confirm: destructive }), destructive: true,
  },
  kinsen_get_gold_prices: {
    description: 'Read the allowlisted real gold price catalog through the signed-in API. Does not accept fabricated quotes.',
    schema: z.strictObject({ source: z.enum(goldPriceSources) }), readOnly: true,
  },
  kinsen_refresh_gold_prices: {
    description: 'Refresh automatic gold holdings from real provider prices. Failures retain last saved values and are returned per holding.',
    schema: z.strictObject({}),
  },
} as const

export type ToolName = keyof typeof tools
export type ToolCall = { [K in ToolName]: { name: K; arguments: z.infer<(typeof tools)[K]['schema']> } }[ToolName]
export function parseToolCall(name: string, args: unknown): ToolCall {
  if (!Object.hasOwn(tools, name)) throw new Error(`Unknown Kinsen tool: ${name}`)
  const toolName = name as ToolName
  return { name: toolName, arguments: tools[toolName].schema.parse(args) } as ToolCall
}

export const bridgeRequestSchema = z.strictObject({ type: z.literal('call'), id, name: z.string(), arguments: z.unknown() })
export const bridgeResultSchema = z.discriminatedUnion('ok', [
  z.strictObject({ type: z.literal('result'), id, ok: z.literal(true), data: z.unknown() }),
  z.strictObject({ type: z.literal('result'), id, ok: z.literal(false), error: text }),
])
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>
export type BridgeResult = z.infer<typeof bridgeResultSchema>
export const bridgeProtocolVersion = 1
