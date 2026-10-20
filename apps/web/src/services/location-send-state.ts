export interface LocationSendState {
  sequence: number
  sentAt: number
  sentFix: { lat: number; lon: number } | null
}

export function createLocationSendState(): LocationSendState {
  return { sequence: 0, sentAt: 0, sentFix: null }
}
