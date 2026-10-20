import { describe, expect, it } from 'vitest'
import { interpolateMapCoordinate } from './map-smoothing.ts'

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
