import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Theme = 'system' | 'dusk' | 'paper'
export type MapStylePreference = 'auto' | 'dusk' | 'paper'

export function resolveTheme(theme: Theme, prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true): Exclude<Theme, 'system'> {
  return theme === 'system' ? (prefersDark ? 'dusk' : 'paper') : theme
}

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
      theme: 'system',
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
