import { create } from 'zustand'

export interface CurrentFix {
  player_id: string
  display_name: string
  lat: number
  lon: number
  accuracy_m: number
  captured_at: string
}

interface LocationState {
  enabledMatchId: string | null
  ownFix: CurrentFix | null
  status: string
  enable: (matchId: string) => void
  setFix: (fix: CurrentFix) => void
  setStatus: (status: string) => void
  clearMatch: (matchId: string) => void
  stopSharing: (matchId: string, reason: string) => void
}

// Deliberately memory-only: never persist a coordinate or location status.
export const useLocationStore = create<LocationState>((set) => ({
  enabledMatchId: null,
  ownFix: null,
  status: 'Location has not been enabled for this match.',
  enable: (enabledMatchId) => set({ enabledMatchId, ownFix: null, status: 'Waiting for an accurate location fix.' }),
  setFix: (ownFix) => set({ ownFix, status: 'Location shared with your team.' }),
  setStatus: (status) => set({ status }),
  clearMatch: (matchId) => set((state) => state.enabledMatchId === matchId
    ? { enabledMatchId: null, ownFix: null, status: 'Location sharing stopped.' } : state),
  stopSharing: (matchId, status) => set((state) => state.enabledMatchId === matchId
    ? { enabledMatchId: null, ownFix: null, status } : state),
}))
