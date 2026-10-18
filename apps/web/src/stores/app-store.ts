import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Theme = 'dusk' | 'paper'
export type MapStylePreference = 'auto' | 'dusk' | 'paper'

interface AppState {
  theme: Theme
  mapStyle: MapStylePreference
  hapticsEnabled: boolean
  guestName: string
  setTheme: (theme: Theme) => void
  setMapStyle: (mapStyle: MapStylePreference) => void
  setHapticsEnabled: (enabled: boolean) => void
  setGuestName: (guestName: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dusk',
      mapStyle: 'auto',
      hapticsEnabled: false,
      guestName: '',
      setTheme: (theme) => set({ theme }),
      setMapStyle: (mapStyle) => set({ mapStyle }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setGuestName: (guestName) => set({ guestName }),
    }),
    { name: 'xzones.preferences', storage: createJSONStorage(() => localStorage) },
  ),
)
