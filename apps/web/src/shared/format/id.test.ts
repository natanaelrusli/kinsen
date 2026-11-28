import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId, randomUUID } from './id'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.unstubAllGlobals())

describe('randomUUID', () => {
  // Plain-HTTP origins (the bare-IP deployment) have no crypto.randomUUID.
  it('falls back to getRandomValues outside a secure context', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    const ids = new Set(Array.from({ length: 50 }, () => randomUUID()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(UUID_V4)
    expect(newId('transaction')).toMatch(/^transaction-/)
  })

  it('uses the native implementation when available', () => {
    expect(randomUUID()).toMatch(UUID_V4)
  })
})
