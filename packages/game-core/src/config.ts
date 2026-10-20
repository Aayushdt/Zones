import { HIDE_AND_SEEK_CONFIG } from './hideAndSeekConfig.ts'

export interface MatchConfig {
  roundSeconds: number | null
  headStartSeconds: number
  pingSeconds: number | null
}

export interface ZoneConfig {
  shrinkStages: number
  shrinkIntervalSeconds: number
  finalRadiusM: number
}

export const DEFAULT_ZONE_CONFIG: ZoneConfig = {
  shrinkStages: HIDE_AND_SEEK_CONFIG.zone.shrinkStages.default,
  shrinkIntervalSeconds: HIDE_AND_SEEK_CONFIG.zone.shrinkIntervalSeconds.default,
  finalRadiusM: HIDE_AND_SEEK_CONFIG.zone.finalRadiusM.default,
}

export function isValidZoneConfig(config: ZoneConfig, startRadiusM: number | null): boolean {
  return Number.isInteger(config.shrinkStages)
    && config.shrinkStages >= HIDE_AND_SEEK_CONFIG.zone.shrinkStages.min
    && config.shrinkStages <= HIDE_AND_SEEK_CONFIG.zone.shrinkStages.max
    && Number.isInteger(config.shrinkIntervalSeconds)
    && config.shrinkIntervalSeconds >= HIDE_AND_SEEK_CONFIG.zone.shrinkIntervalSeconds.min
    && config.shrinkIntervalSeconds <= HIDE_AND_SEEK_CONFIG.zone.shrinkIntervalSeconds.max
    && Number.isInteger(config.finalRadiusM)
    && config.finalRadiusM >= HIDE_AND_SEEK_CONFIG.zone.finalRadiusM.min
    && config.finalRadiusM <= (startRadiusM ?? HIDE_AND_SEEK_CONFIG.zone.startRadiusM.max)
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  roundSeconds: HIDE_AND_SEEK_CONFIG.match.roundSeconds.default,
  headStartSeconds: HIDE_AND_SEEK_CONFIG.match.headStartSeconds.default,
  pingSeconds: HIDE_AND_SEEK_CONFIG.match.pingSeconds.default,
}

export function isValidMatchConfig(config: MatchConfig): boolean {
  const { roundSeconds, headStartSeconds, pingSeconds } = config
  if ((roundSeconds !== null && (!Number.isInteger(roundSeconds) || roundSeconds < HIDE_AND_SEEK_CONFIG.match.roundSeconds.min
    || roundSeconds > HIDE_AND_SEEK_CONFIG.match.roundSeconds.max))
    || !Number.isInteger(headStartSeconds) || headStartSeconds < HIDE_AND_SEEK_CONFIG.match.headStartSeconds.min
    || headStartSeconds > HIDE_AND_SEEK_CONFIG.match.headStartSeconds.max
    || (roundSeconds !== null && roundSeconds - headStartSeconds < HIDE_AND_SEEK_CONFIG.match.minimumActiveSeconds.default)) return false
  return pingSeconds === null || (Number.isInteger(pingSeconds)
    && pingSeconds >= HIDE_AND_SEEK_CONFIG.match.pingSeconds.min
    && pingSeconds <= HIDE_AND_SEEK_CONFIG.match.pingSeconds.max
    && (roundSeconds === null || pingSeconds <= roundSeconds - headStartSeconds))
}
