import { describe, expect, it } from 'vitest'
import {
  interpolateMapCoordinate,
  isStationaryFix,
  computeAdaptiveUploadInterval,
  UPLOAD_INTERVAL_MOVING_MS,
  UPLOAD_INTERVAL_STATIONARY_MS,
} from './map-smoothing.ts'

describe('display-only map coordinate smoothing', () => {
  it('eases between display coordinates and reaches both endpoints', () => {
    expect(interpolateMapCoordinate([10, 20], [20, 40], 0)).toEqual([10, 20])
    expect(interpolateMapCoordinate([10, 20], [20, 40], 0.5)).toEqual([15, 30])
    expect(interpolateMapCoordinate([10, 20], [20, 40], 1)).toEqual([20, 40])
  })

  it('clamps progress outside the animation interval', () => {
    expect(interpolateMapCoordinate([1, 2], [3, 4], -1)).toEqual([1, 2])
    expect(interpolateMapCoordinate([1, 2], [3, 4], 2)).toEqual([3, 4])
  })
})

describe('pure stationary movement detector (I-004)', () => {
  const anchor = { lat: 37.7749, lon: -122.4194, accuracy_m: 5 }

  it('identifies identical coordinates as stationary', () => {
    expect(isStationaryFix(anchor, { ...anchor })).toBe(true)
  })

  it('identifies small displacements within default 3m threshold as stationary', () => {
    // ~1.1 meters north: deltaLat ~ 0.00001 degrees
    const tinyMove = { lat: 37.77491, lon: -122.4194, accuracy_m: 2 }
    expect(isStationaryFix(anchor, tinyMove)).toBe(true)
  })

  it('identifies significant displacement as moving', () => {
    // ~55 meters north: deltaLat ~ 0.0005 degrees
    const bigMove = { lat: 37.7754, lon: -122.4194, accuracy_m: 5 }
    expect(isStationaryFix(anchor, bigMove)).toBe(false)
  })

  it('treats displacement within noisy accuracy radius as stationary GPS jitter', () => {
    // ~11 meters displacement with 20m reported accuracy
    const noisyMove = { lat: 37.7750, lon: -122.4194, accuracy_m: 20 }
    expect(isStationaryFix(anchor, noisyMove)).toBe(true)
  })

  it('returns false for invalid coordinate inputs', () => {
    expect(isStationaryFix(anchor, { lat: NaN, lon: -122.4194, accuracy_m: 5 })).toBe(false)
    expect(isStationaryFix(anchor, { lat: 37.7749, lon: 999, accuracy_m: 5 })).toBe(false)
  })

  it('calculates adaptive upload intervals', () => {
    expect(computeAdaptiveUploadInterval(false)).toBe(UPLOAD_INTERVAL_MOVING_MS)
    expect(computeAdaptiveUploadInterval(false)).toBe(2_000)
    expect(computeAdaptiveUploadInterval(true)).toBe(UPLOAD_INTERVAL_STATIONARY_MS)
    expect(computeAdaptiveUploadInterval(true)).toBe(6_000)
  })
})
