import type {
  ActivePlayerCounts,
  MatchOutcome,
  Role,
  StartCheck,
  TeamBalance,
  TeamMember,
} from './types.ts'
import { HIDE_AND_SEEK_CONFIG } from './hideAndSeekConfig.ts'

const MIN_PLAYERS = HIDE_AND_SEEK_CONFIG.players.min.default
const MAX_PLAYERS = HIDE_AND_SEEK_CONFIG.players.max.default

export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number | null {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)
    || lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90
    || lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) return null
  const radians = (degrees: number) => degrees * Math.PI / 180
  const deltaLat = radians(lat2 - lat1), deltaLon = radians(lon2 - lon1)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type ZoneSample = 'INSIDE' | 'OUTSIDE' | 'UNCERTAIN' | 'NO_FIX'
export interface ZoneConfirmation { outsideSamples: number; insideSamples: number; revealed: boolean }

export interface ZoneScheduleConfig {
  center: { lat: number; lon: number }
  startRadiusM: number
  shrinkStages: number
  shrinkIntervalSeconds: number
  finalRadiusM: number
  headStartSeconds: number
}

export interface ZoneAtResult {
  center: ZoneScheduleConfig['center']
  radius: number
  stage: number
  nextShrinkAt: number | null
  nextRadius: number | null
}

/** Evaluates the deterministic circle schedule; stage radii are evenly spaced. */
export function zoneAt(config: ZoneScheduleConfig, matchStartedAt: number, now: number): ZoneAtResult {
  const valid = Number.isFinite(matchStartedAt) && Number.isFinite(now)
    && Number.isFinite(config.center.lat) && config.center.lat >= -90 && config.center.lat <= 90
    && Number.isFinite(config.center.lon) && config.center.lon >= -180 && config.center.lon <= 180
    && Number.isFinite(config.startRadiusM) && config.startRadiusM > 0
    && Number.isInteger(config.shrinkStages) && config.shrinkStages >= 0
    && Number.isFinite(config.shrinkIntervalSeconds) && config.shrinkIntervalSeconds > 0
    && Number.isFinite(config.headStartSeconds) && config.headStartSeconds >= 0
    && Number.isFinite(config.finalRadiusM) && config.finalRadiusM > 0
    && config.finalRadiusM <= config.startRadiusM
  if (!valid) throw new RangeError('Invalid zone schedule configuration')

  const { shrinkStages } = config
  if (shrinkStages === 0) {
    return { center: config.center, radius: config.startRadiusM, stage: 0, nextShrinkAt: null, nextRadius: null }
  }
  const intervalMs = config.shrinkIntervalSeconds * 1000
  const firstShrinkAt = matchStartedAt + (config.headStartSeconds * 1000) + intervalMs
  const stage = Math.min(shrinkStages, Math.max(0, Math.floor((now - firstShrinkAt) / intervalMs) + 1))
  const radiusAtStage = (value: number) => config.startRadiusM
    + ((config.finalRadiusM - config.startRadiusM) * value / shrinkStages)
  const nextShrinkAt = stage < shrinkStages ? firstShrinkAt + (stage * intervalMs) : null
  return {
    center: config.center,
    radius: radiusAtStage(stage),
    stage,
    nextShrinkAt,
    nextRadius: stage < shrinkStages ? radiusAtStage(stage + 1) : null,
  }
}

/** Accuracy bounds must lie wholly on one side of the fixed boundary. */
export function classifyZoneSample(
  distanceMeters: number | null,
  accuracyMeters: number | null,
  radiusMeters: number,
): ZoneSample {
  if (distanceMeters === null || accuracyMeters === null || !Number.isFinite(distanceMeters)
    || !Number.isFinite(accuracyMeters) || !Number.isFinite(radiusMeters)
    || distanceMeters < 0 || accuracyMeters < 0 || radiusMeters <= 0) return 'NO_FIX'
  if (distanceMeters + accuracyMeters < radiusMeters) return 'INSIDE'
  if (distanceMeters - accuracyMeters > radiusMeters) return 'OUTSIDE'
  return 'UNCERTAIN'
}

/** Two consecutive confident samples are required to enter or clear reveal. */
export function advanceZoneConfirmation(state: ZoneConfirmation, sample: ZoneSample): ZoneConfirmation {
  if (sample === 'UNCERTAIN' || sample === 'NO_FIX') return { outsideSamples: 0, insideSamples: 0, revealed: state.revealed }
  if (sample === 'OUTSIDE') {
    const outsideSamples = Math.min(2, state.outsideSamples + 1)
    return { outsideSamples, insideSamples: 0, revealed: state.revealed || outsideSamples >= 2 }
  }
  const insideSamples = Math.min(2, state.insideSamples + 1)
  return { outsideSamples: 0, insideSamples, revealed: state.revealed && insideSamples < 2 }
}

/** Balanced target from the plan: ceil(N / 10), bounded by floor(N / 2). */
export function balanceTeams(playerCount: number): TeamBalance | null {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) return null
  const hunters = Math.min(Math.ceil(playerCount / 10), Math.floor(playerCount / 2))
  return { hunters, runners: playerCount - hunters }
}

/** Random fills the currently short side toward the prescribed target. */
export function nextRandomRole(playerCount: number, hunterCount: number): Role | null {
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > MAX_PLAYERS
    || !Number.isInteger(hunterCount) || hunterCount < 0 || hunterCount > playerCount) return null
  const targetHunters = Math.min(Math.max(Math.ceil(playerCount / 10), 1), Math.floor(playerCount / 2))
  return hunterCount < targetHunters ? 'HUNTER' : 'RUNNER'
}

export function canStartLobby(players: readonly TeamMember[]): StartCheck {
  const active = players.filter((player) => player.status === 'ACTIVE')
  const hunters = active.filter((player) => player.role === 'HUNTER').length
  const runners = active.filter((player) => player.role === 'RUNNER').length
  const activeCounts = { hunters, runners }

  if (active.length < MIN_PLAYERS) return { canStart: false, blockReason: 'NEEDS_TWO_PLAYERS', activeCounts }
  if (active.length > MAX_PLAYERS) return { canStart: false, blockReason: 'LOBBY_FULL', activeCounts }
  if (active.some((player) => player.role === null) || hunters < 1 || hunters > Math.floor(active.length / 2) || runners === 0) {
    return { canStart: false, blockReason: 'NEEDS_TEAMS', activeCounts }
  }
  if (active.some((player) => !player.ready)) {
    return { canStart: false, blockReason: 'WAITING_FOR_READY', activeCounts }
  }
  return { canStart: true, activeCounts }
}

/** Exact-boundary tags lose: the server deadline wins when accepted_at >= ends_at. */
export function didTagMeetDeadline(tagAcceptedAtMs: number, endsAtMs: number): boolean {
  return Number.isFinite(tagAcceptedAtMs) && Number.isFinite(endsAtMs) && tagAcceptedAtMs < endsAtMs
}

/**
 * Resolves terminal ACTIVE outcomes. Elimination is evaluated before the timer;
 * if both teams empty in one serialized update, the Runner-elimination rule
 * takes precedence and awards the match to Hunters.
 */
export function resolveActiveOutcome(
  counts: ActivePlayerCounts,
  nowMs: number,
  endsAtMs: number | null,
): MatchOutcome {
  if (counts.runnerTotal > 0 && counts.runnerActive === 0) {
    return { winner: 'HUNTER', reason: 'ALL_RUNNERS_TAGGED_OR_LEFT' }
  }
  if (counts.hunterTotal > 0 && counts.hunterActive === 0) {
    return { winner: 'RUNNER', reason: 'ALL_HUNTERS_LEFT' }
  }
  if (endsAtMs !== null && Number.isFinite(nowMs) && Number.isFinite(endsAtMs) && nowMs >= endsAtMs) {
    return { winner: 'RUNNER', reason: 'TIME_LIMIT' }
  }
  return null
}

/** Returns only the newest newly-due slot, coalescing any missed sync slots. */
export function latestDuePingIndex(
  lastPingIndex: number,
  firstPingAtMs: number,
  pingSeconds: number,
  nowMs: number,
  endsAtMs: number,
): number | null {
  if (!Number.isInteger(lastPingIndex) || lastPingIndex < -1
    || !Number.isFinite(firstPingAtMs) || !Number.isInteger(pingSeconds) || pingSeconds < 1
    || !Number.isFinite(nowMs) || !Number.isFinite(endsAtMs)
    || nowMs < firstPingAtMs || nowMs >= endsAtMs || firstPingAtMs >= endsAtMs) return null

  const latest = Math.floor((nowMs - firstPingAtMs) / (pingSeconds * 1000))
  return latest > lastPingIndex ? latest : null
}
