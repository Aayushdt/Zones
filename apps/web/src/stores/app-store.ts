import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Theme = 'dusk' | 'paper'

interface AppState {
  theme: Theme
  guestName: string
  setTheme: (theme: Theme) => void
  setGuestName: (guestName: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dusk',
      guestName: '',
      setTheme: (theme) => set({ theme }),
      setGuestName: (guestName) => set({ guestName }),
    }),
    { name: 'xzones.preferences', storage: createJSONStorage(() => localStorage) },
  ),
)
