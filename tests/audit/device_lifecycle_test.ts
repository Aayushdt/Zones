import { maintainDeviceLocation, type DevicePosition, type DevicePositionError, type LocationLifecycleTarget, type PageLifecycleTarget } from '../../apps/web/src/services/device-lifecycle.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('location watcher stops while hidden and reacquires on visibility and pageshow', () => {
  let visibilityState: 'hidden' | 'visible' | 'prerender' = 'visible'
  const listeners = new Map<string, () => void>()
  const lifecycle: LocationLifecycleTarget = {
    get visibilityState() { return visibilityState },
    addEventListener: (type, listener) => { listeners.set(type, listener) },
    removeEventListener: (type) => { listeners.delete(type) },
  }
  const pageListeners = new Map<string, () => void>()
  const pageLifecycle: PageLifecycleTarget = {
    addEventListener: (type, listener) => { pageListeners.set(type, listener) },
    removeEventListener: (type) => { pageListeners.delete(type) },
  }
  let nextWatchId = 0
  const active = new Set<number>()
  const activeCount = () => active.size
  const geolocation = {
    watchPosition: () => { const id = ++nextWatchId; active.add(id); return id },
    clearWatch: (id: number) => { active.delete(id) },
  }
  let pausedCount = 0
  const stop = maintainDeviceLocation(true, geolocation, lifecycle, pageLifecycle, () => undefined, () => undefined, () => { pausedCount++ })
  assert(activeCount() === 1, 'watch starts immediately')
  visibilityState = 'hidden'
  listeners.get('visibilitychange')?.()
  assert(activeCount() < 1 && pausedCount === 1, 'watch stops and reports paused while hidden')
  visibilityState = 'visible'
  listeners.get('visibilitychange')?.()
  assert(activeCount() === 1, 'watch reacquires when visible')
  pageListeners.get('pageshow')?.()
  assert(activeCount() === 1 && nextWatchId === 3, 'pageshow replaces the active watcher')
  stop()
  assert(activeCount() < 1 && listeners.size < 1 && pageListeners.size < 1, 'cleanup removes watcher and listeners')
})

Deno.test('location watcher retries after a transient geolocation error', async () => {
  let failWatch: ((error: DevicePositionError) => void) | undefined
  let nextWatchId = 0
  const active = new Set<number>()
  const activeCount = () => active.size
  const lifecycle: LocationLifecycleTarget = {
    visibilityState: 'visible',
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  const pageLifecycle: PageLifecycleTarget = { addEventListener: () => undefined, removeEventListener: () => undefined }
  const geolocation = {
    watchPosition: (_success: (position: DevicePosition) => void, onError: (error: DevicePositionError) => void) => {
      failWatch = onError
      const id = ++nextWatchId
      active.add(id)
      return id
    },
    clearWatch: (id: number) => { active.delete(id) },
  }
  const stop = maintainDeviceLocation(true, geolocation, lifecycle, pageLifecycle, () => undefined, () => undefined, () => undefined)
  failWatch?.({ code: 2, PERMISSION_DENIED: 1 })
  await new Promise((resolve) => setTimeout(resolve, 1_050))
  assert(nextWatchId === 2 && activeCount() === 1, 'transient error installs a replacement watcher')
  stop()
})
