export interface GeolocationWatchApi {
  watchPosition: (success: (position: DevicePosition) => void, error: (error: DevicePositionError) => void,
    options: DevicePositionOptions) => number
  clearWatch: (watchId: number) => void
}

export interface DevicePosition {
  coords: { latitude: number; longitude: number; accuracy: number }
  timestamp: number
}

export interface DevicePositionError {
  code: number
  readonly PERMISSION_DENIED: number
}

export interface DevicePositionOptions {
  enableHighAccuracy?: boolean
  maximumAge?: number
  timeout?: number
}

export function watchDeviceLocation(
  sharing: boolean,
  geolocation: GeolocationWatchApi,
  onPosition: (position: DevicePosition) => void,
  onError: (error: DevicePositionError) => void,
): () => void {
  if (!sharing) return () => undefined
  const watchId = geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000,
  })
  return () => geolocation.clearWatch(watchId)
}

export interface LocationLifecycleTarget {
  readonly visibilityState: 'hidden' | 'visible' | 'prerender'
  addEventListener: (type: 'visibilitychange', listener: () => void) => void
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void
}

export interface PageLifecycleTarget {
  addEventListener: (type: 'pageshow', listener: () => void) => void
  removeEventListener: (type: 'pageshow', listener: () => void) => void
}

export function maintainDeviceLocation(
  sharing: boolean,
  geolocation: GeolocationWatchApi,
  lifecycle: LocationLifecycleTarget,
  pageLifecycle: PageLifecycleTarget,
  onPosition: (position: DevicePosition) => void,
  onError: (error: DevicePositionError) => void,
  onPaused: () => void,
): () => void {
  if (!sharing) return () => undefined
  let stopped = false
  let watchId: number | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  const start = () => {
    if (stopped || lifecycle.visibilityState !== 'visible' || watchId !== undefined) return
    watchId = geolocation.watchPosition(onPosition, (error) => {
      if (watchId !== undefined) geolocation.clearWatch(watchId)
      watchId = undefined
      if (stopped) return
      onError(error)
      if (error.code !== error.PERMISSION_DENIED) retryTimer = setTimeout(start, 1_000)
    }, { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 })
  }
  const pause = () => {
    if (watchId !== undefined) geolocation.clearWatch(watchId)
    watchId = undefined
    onPaused()
  }
  const resume = () => {
    if (lifecycle.visibilityState !== 'visible') return
    if (retryTimer !== undefined) clearTimeout(retryTimer)
    retryTimer = undefined
    start()
  }
  const onPageShow = () => {
    if (watchId !== undefined) geolocation.clearWatch(watchId)
    watchId = undefined
    resume()
  }
  const onVisibilityChange = () => lifecycle.visibilityState === 'visible' ? resume() : pause()
  lifecycle.addEventListener('visibilitychange', onVisibilityChange)
  pageLifecycle.addEventListener('pageshow', onPageShow)
  start()
  return () => {
    stopped = true
    if (retryTimer !== undefined) clearTimeout(retryTimer)
    if (watchId !== undefined) geolocation.clearWatch(watchId)
    lifecycle.removeEventListener('visibilitychange', onVisibilityChange)
    pageLifecycle.removeEventListener('pageshow', onPageShow)
  }
}

export interface ScreenWakeLockSentinel {
  released: boolean
  release: () => Promise<void>
}

export interface ScreenWakeLockApi {
  request: (type: 'screen') => Promise<ScreenWakeLockSentinel>
}

export interface VisibilityTarget {
  visibilityState: 'hidden' | 'visible' | 'prerender'
  addEventListener: (type: 'visibilitychange', listener: () => void) => void
  removeEventListener: (type: 'visibilitychange', listener: () => void) => void
}

export function maintainScreenWakeLock(
  enabled: boolean,
  wakeLock: ScreenWakeLockApi | undefined,
  visibility: VisibilityTarget,
): () => void {
  if (!enabled || !wakeLock) return () => undefined
  let stopped = false
  let pending = false
  let sentinel: ScreenWakeLockSentinel | null = null
  const release = () => {
    const current = sentinel
    sentinel = null
    if (current && !current.released) void current.release().catch(() => undefined)
  }
  const sync = () => {
    if (stopped) return
    if (visibility.visibilityState !== 'visible') { release(); return }
    if (pending || sentinel) return
    pending = true
    void wakeLock.request('screen').then((next) => {
      pending = false
      if (stopped || visibility.visibilityState !== 'visible') {
        if (!next.released) void next.release().catch(() => undefined)
      } else sentinel = next
    }).catch(() => { pending = false })
  }
  visibility.addEventListener('visibilitychange', sync)
  sync()
  return () => {
    stopped = true
    visibility.removeEventListener('visibilitychange', sync)
    release()
  }
}
