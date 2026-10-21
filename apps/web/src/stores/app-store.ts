import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Theme = 'system' | 'dusk' | 'paper'
export type MapStylePreference = 'auto' | 'dusk' | 'paper'

export function resolveTheme(theme: Theme, prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true): Exclude<Theme, 'system'> {
  return theme === 'system' ? (prefersDark ? 'dusk' : 'paper') : theme
}

function detectLowEndDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const lowCores = typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4
  const saveData = Boolean((navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData)
  return lowCores || saveData
}

interface AppState {
  theme: Theme
  mapStyle: MapStylePreference
  hapticsEnabled: boolean
  soundEnabled: boolean
  reduceEffects: boolean
  guestName: string
  setTheme: (theme: Theme) => void
  setMapStyle: (mapStyle: MapStylePreference) => void
  setHapticsEnabled: (enabled: boolean) => void
  setSoundEnabled: (enabled: boolean) => void
  setReduceEffects: (enabled: boolean) => void
  setGuestName: (guestName: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'system',
      mapStyle: 'auto',
      hapticsEnabled: false,
      soundEnabled: false,
      reduceEffects: detectLowEndDevice(),
      guestName: '',
      setTheme: (theme) => set({ theme }),
      setMapStyle: (mapStyle) => set({ mapStyle }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setReduceEffects: (reduceEffects) => set({ reduceEffects }),
      setGuestName: (guestName) => set({ guestName }),
    }),
    { name: 'xzones.preferences', storage: createJSONStorage(() => localStorage) },
  ),
)
