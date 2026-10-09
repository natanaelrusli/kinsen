import { goldPriceSources, normalizeGoldDecimal, type GoldPriceQuote, type GoldPriceResponse, type GoldPriceSource } from '@kinsen/budget-domain'
import { parseDateOnly } from '@kinsen/budget-domain/date-only'
import { z } from 'zod'
import { HttpError } from '../http/errors.js'

export interface GoldPriceReader {
  getPrices(source: GoldPriceSource): Promise<GoldPriceResponse>
}

const envelopeSchema = z.object({ success: z.literal(true), data: z.array(z.unknown()) })
const rowSchema = z.object({
  source: z.string(),
  material: z.literal('gold'),
  currency: z.literal('IDR'),
  materialType: z.string().trim().min(1),
  weight: z.union([z.string(), z.number().finite()]),
  weightUnit: z.string().trim().toLowerCase().pipe(z.enum(['gr', 'gram', 'g'])),
  sellPrice: z.number().int().safe().positive(),
  recordedDate: z.string(),
  lineKey: z.string().nullish(),
  displayName: z.string().trim().nullish(),
})

function unavailable(): HttpError {
  return new HttpError(502, 'GOLD_PRICE_UNAVAILABLE', 'Gold prices are currently unavailable.')
}

function jakartaToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function normalizeRow(raw: unknown, source: GoldPriceSource, today: string): GoldPriceQuote | undefined {
  const parsed = rowSchema.safeParse(raw)
  if (!parsed.success || parsed.data.source !== source) return undefined
  const row = parsed.data
  try {
    const rawWeight = typeof row.weight === 'number' && String(row.weight).includes('e')
      ? row.weight.toFixed(8)
      : String(row.weight)
    if (typeof row.weight === 'number' && Number(rawWeight) !== row.weight) return undefined
    const weightGrams = normalizeGoldDecimal(rawWeight)
    if (weightGrams === '0') return undefined
    parseDateOnly(row.recordedDate)
    if (row.recordedDate > today) return undefined
    return {
      source, materialType: row.materialType, weightGrams, lineKey: row.lineKey ?? '',
      displayName: row.displayName || source, sellPrice: row.sellPrice, recordedDate: row.recordedDate,
    }
  } catch {
    return undefined
  }
}

// Scale decimal weights to their maximum permitted precision for exact sorting.
function weightOrder(weight: string): bigint {
  const [whole, fraction = ''] = weight.split('.')
  return BigInt(whole + fraction.padEnd(8, '0'))
}

export const defaultGoldPriceReader: GoldPriceReader = {
  async getPrices(source) {
    // Defense in depth: typed callers must not turn this fixed-origin adapter into a URL proxy.
    if (!goldPriceSources.includes(source)) throw unavailable()
    const signal = AbortSignal.timeout(8000)
    try {
      const response = await fetch(`https://logam-mulia-api.iamutaki.workers.dev/api/prices/${source}`, { signal })
      if (!response.ok) throw unavailable()
      const envelope = envelopeSchema.safeParse(await response.json())
      if (!envelope.success) throw unavailable()
      const today = jakartaToday()
      const products = new Map<string, { quote: GoldPriceQuote; conflicting: boolean }>()
      for (const raw of envelope.data.data) {
        const quote = normalizeRow(raw, source, today)
        if (!quote) continue
        const key = JSON.stringify([quote.materialType, quote.weightGrams, quote.lineKey])
        const existing = products.get(key)
        if (!existing || quote.recordedDate > existing.quote.recordedDate) {
          products.set(key, { quote, conflicting: false })
        } else if (quote.recordedDate === existing.quote.recordedDate && quote.sellPrice !== existing.quote.sellPrice) {
          existing.conflicting = true
        }
      }
      const quotes = [...products.values()].filter((product) => !product.conflicting).map((product) => product.quote)
      quotes.sort((left, right) => {
        const material = left.materialType.localeCompare(right.materialType)
        if (material) return material
        const leftWeight = weightOrder(left.weightGrams)
        const rightWeight = weightOrder(right.weightGrams)
        return leftWeight < rightWeight ? -1 : leftWeight > rightWeight ? 1 : left.lineKey.localeCompare(right.lineKey)
      })
      if (quotes.length === 0) throw unavailable()
      return { source, quotes, fetchedAt: new Date().toISOString() }
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
        throw new HttpError(504, 'GOLD_PRICE_TIMEOUT', 'Gold price request timed out.')
      }
      throw unavailable()
    }
  },
}
