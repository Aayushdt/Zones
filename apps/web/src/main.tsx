import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { HIDE_AND_SEEK_CONFIG } from '@xzones/game-core'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').then(async (registration) => {
      await navigator.serviceWorker.ready
      const worker = registration.active ?? navigator.serviceWorker.controller
      worker?.postMessage({
        type: 'xzones:configure-tile-cache',
        maxEntries: HIDE_AND_SEEK_CONFIG.map.tileCacheEntries.default,
      })
    }).catch(() => undefined)
  })
}
