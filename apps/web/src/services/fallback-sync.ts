export interface VisibilitySource {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export function fallbackSyncDelay(random = Math.random): number {
  return 30_000 + Math.floor(Math.min(Math.max(random(), 0), 0.999999) * 15_001)
}

export function startFallbackSync(
  sync: () => void | Promise<void>,
  visibility: VisibilitySource = document,
  random = Math.random,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let syncing = false

  const schedule = () => {
    if (stopped || visibility.hidden) return
    timer = setTimeout(() => {
      timer = undefined
      void runSync()
    }, fallbackSyncDelay(random))
  }
  const runSync = async () => {
    if (stopped || visibility.hidden || syncing) return
    syncing = true
    try { await sync() } finally {
      syncing = false
      schedule()
    }
  }
  const onVisibilityChange = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    if (!visibility.hidden) void runSync()
  }

  visibility.addEventListener('visibilitychange', onVisibilityChange)
  schedule()
  return () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    visibility.removeEventListener('visibilitychange', onVisibilityChange)
  }
}
