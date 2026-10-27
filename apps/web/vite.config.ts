import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // MapLibre GL is dynamically imported exclusively on map routes (MatchPage, ZonePicker)
    // and naturally produces a standalone ~1,075 kB vendor chunk. Raising the warning limit
    // avoids false-positive build warnings while maintaining lazy-loaded route chunk isolation.
    chunkSizeWarningLimit: 1200,
  },
})
