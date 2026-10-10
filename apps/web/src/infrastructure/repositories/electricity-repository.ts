import type { DateOnly, TokenObservation } from '@kinsen/budget-domain'

export interface ElectricityRepository {
  getObservations(): Promise<TokenObservation[]>
  getMutationEpoch(): number
  saveObservation(observation: TokenObservation, position: number, today: DateOnly, replacingId?: string, expectedEpoch?: number): Promise<void>
  deleteObservation(id: string, today: DateOnly, expectedEpoch?: number): Promise<void>
}
