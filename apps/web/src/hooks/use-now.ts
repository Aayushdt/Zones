import { useEffect, useState } from 'react'

/**
 * Returns a monotonic epoch timestamp updated only on timer intervals.
 * Avoids calling impure Date.now() during component render projections.
 */
export function useNow(intervalMs = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs, enabled])

  return now
}

/**
 * Derives non-negative remaining seconds from a target timestamp and current now,
 * returning null when target is absent or invalid.
 */
export function countdownSeconds(target: string | number | null | undefined, now: number): number | null {
  if (target === null || target === undefined) return null
  const targetMs = typeof target === 'number' ? target : Date.parse(target)
  if (!Number.isFinite(targetMs)) return null
  return Math.max(0, Math.ceil((targetMs - now) / 1000))
}
