import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultGoldPriceReader } from './gold-price-reader.js'

const row = (changes: Record<string, unknown> = {}) => ({
  source: 'logammulia', material: 'gold', materialType: 'Emas Batangan', weight: 5,
  weightUnit: 'gr', sellPrice: 12600000, currency: 'IDR', recordedDate: '2026-10-09',
  lineKey: '', displayName: 'Logam Mulia', buybackPrice: null, ...changes,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T18:00:00Z')) // October 9 in Jakarta, October 8 in UTC.
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function respond(data: unknown, status = 200) {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status }))
  vi.stubGlobal('fetch', fetcher)
  return fetcher
}

describe('gold price reader', () => {
  it('normalizes Antam package weights and uses a fixed bounded upstream request', async () => {
    const fetcher = respond({ success: true, data: [row(), row({ weight: '0001.000', weightUnit: ' GR ', lineKey: null, displayName: null })] })
    const result = await defaultGoldPriceReader.getPrices('logammulia')
    expect(result).toEqual({ source: 'logammulia', fetchedAt: '2026-10-08T18:00:00.000Z', quotes: [
      { source: 'logammulia', materialType: 'Emas Batangan', weightGrams: '1', lineKey: '', displayName: 'logammulia', sellPrice: 12600000, recordedDate: '2026-10-09' },
      { source: 'logammulia', materialType: 'Emas Batangan', weightGrams: '5', lineKey: '', displayName: 'Logam Mulia', sellPrice: 12600000, recordedDate: '2026-10-09' },
    ] })
    expect(fetcher).toHaveBeenCalledWith('https://logam-mulia-api.iamutaki.workers.dev/api/prices/logammulia', { signal: expect.any(AbortSignal) })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('retains separate Galeri24 brands/lines and filters invalid or irrelevant rows', async () => {
    const valid = row({ source: 'galeri24', materialType: 'Galeri24', weightUnit: 'gram', weight: 1 })
    respond({ success: true, data: [valid,
      { ...valid, materialType: 'Antam', weight: 10 },
      { ...valid, materialType: 'Antam', weight: 2, lineKey: 'Gift' },
      ...[
        { sellPrice: 0 }, { sellPrice: -1 }, { sellPrice: 1.2 }, { sellPrice: Number.MAX_SAFE_INTEGER + 1 },
        { material: 'silver' }, { source: 'logammulia' }, { currency: 'USD' }, { weight: 0 },
        { weight: '1e-2' }, { weight: '0.000000001' }, { weightUnit: 'kg' }, { materialType: ' ' },
        { recordedDate: '2026-10-10' }, { recordedDate: '2026-02-30' }, { lineKey: 42 },
      ].map((changes) => ({ ...valid, ...changes })), null,
    ] })
    const result = await defaultGoldPriceReader.getPrices('galeri24')
    expect(result.quotes.map((quote) => [quote.materialType, quote.weightGrams, quote.lineKey])).toEqual([
      ['Antam', '2', 'Gift'], ['Antam', '10', ''], ['Galeri24', '1', ''],
    ])
  })

  it('accepts Pegadaian fractional packages without treating them as grams held', async () => {
    respond({ success: true, data: [row({ source: 'pegadaian', materialType: 'Tabungan Emas', weight: 0.01, weightUnit: 'g', sellPrice: 25000 })] })
    expect((await defaultGoldPriceReader.getPrices('pegadaian')).quotes[0]).toMatchObject({ weightGrams: '0.01', sellPrice: 25000 })
  })

  it('collapses duplicates, selects latest dates, and omits conflicting latest prices regardless of order', async () => {
    respond({ success: true, data: [
      row({ weight: 1, recordedDate: '2026-10-08', sellPrice: 100 }),
      row({ weight: 1, sellPrice: 101 }), row({ weight: 1, sellPrice: 101 }),
      row({ weight: 2, sellPrice: 200 }), row({ weight: 2, sellPrice: 201 }), row({ weight: 2, sellPrice: 200 }),
      row({ weight: 3, recordedDate: '2026-10-08', sellPrice: 300 }),
      row({ weight: 3, recordedDate: '2026-10-08', sellPrice: 301 }), row({ weight: 3, sellPrice: 302 }),
      row({ weight: 3, recordedDate: '2026-10-08', sellPrice: 303 }),
    ] })
    expect((await defaultGoldPriceReader.getPrices('logammulia')).quotes.map((quote) => [quote.weightGrams, quote.sellPrice])).toEqual([['1', 101], ['3', 302]])
  })

  it.each([
    { success: false, data: [row()] }, { success: true, data: {} }, { success: true, data: [] },
    { success: true, data: [row({ sellPrice: 0 })] },
  ])('classifies unusable envelopes/catalogs as provider failures: %j', async (body) => {
    respond(body)
    await expect(defaultGoldPriceReader.getPrices('logammulia')).rejects.toMatchObject({ status: 502, code: 'GOLD_PRICE_UNAVAILABLE' })
  })

  it('classifies HTTP, JSON and transport failures without exposing upstream details', async () => {
    respond({}, 503)
    await expect(defaultGoldPriceReader.getPrices('logammulia')).rejects.toMatchObject({ status: 502, code: 'GOLD_PRICE_UNAVAILABLE' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not JSON')))
    await expect(defaultGoldPriceReader.getPrices('logammulia')).rejects.toMatchObject({ status: 502, code: 'GOLD_PRICE_UNAVAILABLE' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private upstream details')))
    await expect(defaultGoldPriceReader.getPrices('logammulia')).rejects.toMatchObject({ status: 502, message: 'Gold prices are currently unavailable.' })
  })

  it('classifies request and body timeouts distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')))
    await expect(defaultGoldPriceReader.getPrices('logammulia')).rejects.toMatchObject({ status: 504, code: 'GOLD_PRICE_TIMEOUT' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')) }))
    await expect(defaultGoldPriceReader.getPrices('logammulia')).rejects.toMatchObject({ status: 504, code: 'GOLD_PRICE_TIMEOUT' })
  })

  it('rejects unsupported sources before fetching', async () => {
    const fetcher = respond({ success: true, data: [row()] })
    await expect(defaultGoldPriceReader.getPrices('kursdolar' as never)).rejects.toMatchObject({ status: 502 })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('gold reader decimal and timeout boundaries', () => {
  it('accepts numeric weights representable at eight decimals and rejects smaller weights', async () => {
    respond({ success: true, data: [row({ weight: 1e-8 }), row({ weight: 1e-9 })] })
    expect((await defaultGoldPriceReader.getPrices('logammulia')).quotes.map((quote) => quote.weightGrams)).toEqual(['0.00000001'])
  })

  it('bounds outbound work at eight seconds and maps aborted requests to 504', async () => {
    const controller = new AbortController()
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => {
      const { promise, reject } = Promise.withResolvers<Response>()
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
      return promise
    }))
    const pending = defaultGoldPriceReader.getPrices('logammulia')
    const rejected = expect(pending).rejects.toMatchObject({ status: 504, code: 'GOLD_PRICE_TIMEOUT' })
    controller.abort()
    await rejected
    expect(timeout).toHaveBeenCalledWith(8000)
  })
})
