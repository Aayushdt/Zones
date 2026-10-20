import { HIDE_AND_SEEK_CONFIG } from './hideAndSeekConfig.ts'

export interface MatchConfig {
  roundSeconds: number
  headStartSeconds: number
  pingSeconds: number | null
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  roundSeconds: HIDE_AND_SEEK_CONFIG.match.roundSeconds.default,
  headStartSeconds: HIDE_AND_SEEK_CONFIG.match.headStartSeconds.default,
  pingSeconds: HIDE_AND_SEEK_CONFIG.match.pingSeconds.default,
}

export function isValidMatchConfig(config: MatchConfig): boolean {
  const { roundSeconds, headStartSeconds, pingSeconds } = config
  if (!Number.isInteger(roundSeconds) || roundSeconds < HIDE_AND_SEEK_CONFIG.match.roundSeconds.min
    || roundSeconds > HIDE_AND_SEEK_CONFIG.match.roundSeconds.max
    || !Number.isInteger(headStartSeconds) || headStartSeconds < HIDE_AND_SEEK_CONFIG.match.headStartSeconds.min
    || headStartSeconds > HIDE_AND_SEEK_CONFIG.match.headStartSeconds.max
    || roundSeconds - headStartSeconds < HIDE_AND_SEEK_CONFIG.match.minimumActiveSeconds.default) return false
  return pingSeconds === null || (Number.isInteger(pingSeconds)
    && pingSeconds >= HIDE_AND_SEEK_CONFIG.match.pingSeconds.min
    && pingSeconds <= HIDE_AND_SEEK_CONFIG.match.pingSeconds.max
    && pingSeconds <= roundSeconds - headStartSeconds)
}
