import { describe, expect, it } from 'vitest'
import { HIDE_AND_SEEK_CONFIG, HIDE_AND_SEEK_MODE, isWithinSetting } from './hideAndSeekConfig.ts'
import { DEFAULT_ZONE_CONFIG, isValidZoneConfig } from './config.ts'

describe('Hide & Seek configuration', () => {
  it('identifies the single implemented mode and keeps every numeric default inside its declared bounds', () => {
    expect(HIDE_AND_SEEK_MODE).toBe('HIDE_AND_SEEK')
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      if ('default' in value && 'min' in value && 'max' in value) {
        const setting = value as { default: number; min: number; max: number }
        expect(isWithinSetting(setting, setting.default)).toBe(true)
        expect(setting.min).toBeLessThanOrEqual(setting.max)
        return
      }
      for (const child of Object.values(value)) visit(child)
    }
    visit(HIDE_AND_SEEK_CONFIG)
  })

  it('preserves the recorded player, round, head-start, and ping bounds', () => {
    expect(HIDE_AND_SEEK_CONFIG.players.min.default).toBe(2)
    expect(HIDE_AND_SEEK_CONFIG.players.max.default).toBe(100)
    expect(HIDE_AND_SEEK_CONFIG.match.roundSeconds.default).toBe(2700)
    expect(HIDE_AND_SEEK_CONFIG.match.headStartSeconds.default).toBe(180)
    expect(HIDE_AND_SEEK_CONFIG.match.pingSeconds.default).toBe(300)
  })

  it('validates the configured circular shrink stages, interval, and final radius', () => {
    expect(isValidZoneConfig(DEFAULT_ZONE_CONFIG, 500)).toBe(true)
    expect(isValidZoneConfig({ ...DEFAULT_ZONE_CONFIG, shrinkStages: 11 }, 500)).toBe(false)
    expect(isValidZoneConfig({ ...DEFAULT_ZONE_CONFIG, shrinkIntervalSeconds: 59 }, 500)).toBe(false)
    expect(isValidZoneConfig({ ...DEFAULT_ZONE_CONFIG, finalRadiusM: 501 }, 500)).toBe(false)
    expect(isValidZoneConfig({ ...DEFAULT_ZONE_CONFIG, finalRadiusM: 50 }, null)).toBe(true)
  })
})
