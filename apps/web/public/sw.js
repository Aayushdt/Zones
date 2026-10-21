const CACHE_NAME = 'xzones-static-v1'
const TILE_CACHE_NAME = 'xzones-map-tiles-v1'
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons.svg', '/icons-192.png', '/icons-512.png']
let tileCacheLimit = 0

self.addEventListener('message', (event) => {
  const message = event.data
  if (message?.type === 'xzones:configure-tile-cache'
    && Number.isSafeInteger(message.maxEntries) && message.maxEntries > 0) {
    tileCacheLimit = message.maxEntries
  }
})

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => (key.startsWith('xzones-static-') && key !== CACHE_NAME)
      || (key.startsWith('xzones-map-tiles-') && key !== TILE_CACHE_NAME)).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET') return
  if (url.origin === 'https://tiles.openfreemap.org'
    && (/\/\d+\/\d+\/\d+\.(?:pbf|png|jpg|webp)$/.test(url.pathname) || url.pathname.startsWith('/styles/'))) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE_NAME)
      const cached = await cache.match(request)
      const refresh = fetch(request).then(async (response) => {
        if (tileCacheLimit > 0 && (response.ok || response.type === 'opaque')) {
          await cache.put(request, response.clone())
          const keys = await cache.keys()
          for (const key of keys.slice(0, Math.max(0, keys.length - tileCacheLimit))) await cache.delete(key)
        }
        return response
      }).catch(() => undefined)
      if (cached) {
        event.waitUntil(refresh)
        return cached
      }
      const networkResponse = await refresh
      return networkResponse || Response.error()
    })())
    return
  }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/functions/') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/')) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/')) || Response.error()))
    return
  }
  if (!url.pathname.startsWith('/assets/')) return
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, response.clone())
    }
    return response
  })))
})
