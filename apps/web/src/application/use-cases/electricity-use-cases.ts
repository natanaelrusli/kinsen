import { sortElectricityHistory, validateElectricityHistory } from '@kinsen/budget-domain'
import type { DateOnly, TokenObservation } from '@kinsen/budget-domain'
import type { ElectricityRepository } from '../../infrastructure/repositories/electricity-repository'

function nextHistory(history: readonly TokenObservation[], observation: TokenObservation, position: number, replacingId?: string): TokenObservation[] {
  if (replacingId && !history.some((item) => item.id === replacingId)) throw new Error('This reading no longer exists. Reload the history before editing.')
  if (!replacingId && history.some((item) => item.id === observation.id)) throw new Error('This reading ID is already in use.')

  const remaining = history.filter((item) => item.id !== replacingId)
  const sameDay = sortElectricityHistory(remaining.filter((item) => item.date === observation.date))
  if (!Number.isSafeInteger(position) || position < 0 || position > sameDay.length) {
    throw new Error('Choose a valid order among readings on this date.')
  }
  sameDay.splice(position, 0, { ...observation, sequence: 0 })
  const reordered = sameDay.map((item, sequence) => ({ ...item, sequence }))
  return sortElectricityHistory([...remaining.filter((item) => item.date !== observation.date), ...reordered])
}

function assertValid(history: readonly TokenObservation[], today: DateOnly): void {
  const validation = validateElectricityHistory(history, today)
  if (validation.errors.length) throw new Error(validation.errors.map((item) => item.message).join(' '))
}

export class ElectricityUseCases {
  constructor(private readonly repository: ElectricityRepository) {}

  getObservations(): Promise<TokenObservation[]> {
    return this.repository.getObservations()
  }

  async saveObservation(observation: TokenObservation, position: number, today: DateOnly, replacingId?: string): Promise<void> {
    const expectedEpoch = this.repository.getMutationEpoch()
    const history = await this.getObservations()
    assertValid(nextHistory(history, observation, position, replacingId), today)
    await this.repository.saveObservation(observation, position, today, replacingId, expectedEpoch)
  }

  async deleteObservation(id: string, today: DateOnly): Promise<void> {
    const expectedEpoch = this.repository.getMutationEpoch()
    const history = await this.getObservations()
    if (!history.some((item) => item.id === id)) return
    assertValid(history.filter((item) => item.id !== id), today)
    await this.repository.deleteObservation(id, today, expectedEpoch)
  }
}
