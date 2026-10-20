import { describe, expect, it } from 'vitest'
import { HIDE_AND_SEEK_CONFIG, HIDE_AND_SEEK_MODE, isWithinSetting } from './hideAndSeekConfig.ts'

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
})
