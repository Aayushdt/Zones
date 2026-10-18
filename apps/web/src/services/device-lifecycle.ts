export interface GeolocationWatchApi {
  watchPosition: (success: (position: GeolocationPosition) => void, error: (error: GeolocationPositionError) => void,
    options: PositionOptions) => number
  clearWatch: (watchId: number) => void
}

export function watchDeviceLocation(
  sharing: boolean,
  geolocation: GeolocationWatchApi,
  onPosition: (position: GeolocationPosition) => void,
  onError: (error: GeolocationPositionError) => void,
): () => void {
  if (!sharing) return () => undefined
  const watchId = geolocation.watchPosition(onPosition, onError, {
    enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000,
  })
  return () => geolocation.clearWatch(watchId)
}

export interface ScreenWakeLockSentinel {
  released: boolean
  release: () => Promise<void>
}

export interface ScreenWakeLockApi {
  request: (type: 'screen') => Promise<ScreenWakeLockSentinel>
}

export interface VisibilityTarget {
  visibilityState: DocumentVisibilityState
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
