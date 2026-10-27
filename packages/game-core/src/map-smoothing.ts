import { haversineDistanceMeters } from './rules.ts'

export function interpolateMapCoordinate(
  from: readonly [number, number],
  to: readonly [number, number],
  progress: number,
): [number, number] {
  const amount = Math.min(1, Math.max(0, progress))
  const eased = amount * amount * (3 - 2 * amount)
  return [from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased]
}

export interface StationaryDetectionSample {
  lat: number
  lon: number
  accuracy_m: number
}

/**
 * Evaluates whether a location fix represents stationary movement relative to an anchor fix.
 * Uses a dynamic threshold of Math.max(minDisplacementMeters, current.accuracy_m)
 * to avoid falsely detecting movement from normal GPS jitter or low accuracy.
 */
export function isStationaryFix(
  anchor: StationaryDetectionSample,
  current: StationaryDetectionSample,
  minDisplacementMeters = 3,
): boolean {
  const dist = haversineDistanceMeters(anchor.lat, anchor.lon, current.lat, current.lon)
  if (dist === null) return false
  const threshold = Math.max(minDisplacementMeters, current.accuracy_m)
  return dist < threshold
}

export const UPLOAD_INTERVAL_MOVING_MS = 2_000
export const UPLOAD_INTERVAL_STATIONARY_MS = 6_000

/**
 * Computes adaptive upload interval based on stationary state:
 * - Moving: 2,000ms for responsive tracking
 * - Stationary: 6,000ms (capped comfortably below server's 30s staleness limit)
 */
export function computeAdaptiveUploadInterval(isStationary: boolean): number {
  return isStationary ? UPLOAD_INTERVAL_STATIONARY_MS : UPLOAD_INTERVAL_MOVING_MS
}
