import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { TokenObservation } from '@kinsen/budget-domain'
import { budgetRepository } from '../../infrastructure/repositories/dexie-budget-repository'
import { useElectricityStore } from './electricity-store'

const reading: TokenObservation = {
  id: 'pending-electricity-reading', date: '2026-01-01', sequence: 0, remainingMilliKwh: 10_000,
  refillMilliKwh: null, refillCostIdr: null, refillSource: 'none',
}

describe('electricity account reset lifecycle', () => {
  it('prevents a save that started before reset from restoring cleared meter data', async () => {
    await budgetRepository.clearAccountData()
    let releaseRead!: (observations: TokenObservation[]) => void
    const delayedRead = new Promise<TokenObservation[]>((resolve) => { releaseRead = resolve })
    vi.spyOn(budgetRepository, 'getObservations').mockImplementationOnce(() => delayedRead)

    const pendingSave = useElectricityStore.getState().runMutation((useCases) =>
      useCases.saveObservation(reading, 0, '2026-01-02'),
    )
    await Promise.resolve()
    await budgetRepository.clearAccountData()
    releaseRead([])

    await expect(pendingSave).rejects.toThrow(/reset/i)
    expect(await budgetRepository.getObservations()).toEqual([])
    expect(useElectricityStore.getState()).toMatchObject({ status: 'ready', observations: [], saving: false })
    vi.restoreAllMocks()
  })
})
