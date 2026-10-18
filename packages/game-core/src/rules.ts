import type {
  ActivePlayerCounts,
  MatchOutcome,
  Role,
  StartCheck,
  TeamBalance,
  TeamMember,
} from './types.ts'

const MIN_PLAYERS = 3
const MAX_PLAYERS = 12

export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number | null {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)
    || lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90
    || lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) return null
  const radians = (degrees: number) => degrees * Math.PI / 180
  const deltaLat = radians(lat2 - lat1), deltaLon = radians(lon2 - lon1)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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

  if (active.length < MIN_PLAYERS) return { canStart: false, blockReason: 'NEEDS_THREE_PLAYERS', activeCounts }
  if (active.length > MAX_PLAYERS) return { canStart: false, blockReason: 'LOBBY_FULL', activeCounts }
  if (active.some((player) => player.role === null) || hunters === 0 || runners === 0) {
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
  endsAtMs: number,
): MatchOutcome {
  if (counts.runnerTotal > 0 && counts.runnerActive === 0) {
    return { winner: 'HUNTER', reason: 'ALL_RUNNERS_TAGGED_OR_LEFT' }
  }
  if (counts.hunterTotal > 0 && counts.hunterActive === 0) {
    return { winner: 'RUNNER', reason: 'ALL_HUNTERS_LEFT' }
  }
  if (Number.isFinite(nowMs) && Number.isFinite(endsAtMs) && nowMs >= endsAtMs) {
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
