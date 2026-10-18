export interface MatchConfig {
  roundSeconds: number
  headStartSeconds: number
  pingSeconds: number | null
}

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  roundSeconds: 2700,
  headStartSeconds: 180,
  pingSeconds: 300,
}

export function isValidMatchConfig(config: MatchConfig): boolean {
  const { roundSeconds, headStartSeconds, pingSeconds } = config
  if (!Number.isInteger(roundSeconds) || roundSeconds < 600 || roundSeconds > 10_800
    || !Number.isInteger(headStartSeconds) || headStartSeconds < 0 || headStartSeconds > 900
    || roundSeconds - headStartSeconds < 300) return false
  return pingSeconds === null || (Number.isInteger(pingSeconds)
    && pingSeconds >= 60 && pingSeconds <= 1800
    && pingSeconds <= roundSeconds - headStartSeconds)
}
