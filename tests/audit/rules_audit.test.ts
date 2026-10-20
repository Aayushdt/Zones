import { describe, expect, it } from 'vitest'
import {
  advanceZoneConfirmation,
  balanceTeams,
  canStartLobby,
  classifyZoneSample,
  didTagMeetDeadline,
  haversineDistanceMeters,
  latestDuePingIndex,
  nextRandomRole,
  resolveActiveOutcome,
  type TeamMember,
} from '../../packages/game-core/src/index.ts'

describe('AUDIT CHECKLIST A: Team logic and lobby rules (packages/game-core)', () => {
  it('A1: balanceTeams enforces 2..100 player boundaries and formula hunters = min(ceil(n/10), floor(n/2))', () => {
    expect(balanceTeams(2)).toEqual({ hunters: 1, runners: 1 })
    expect(balanceTeams(100)).toEqual({ hunters: 10, runners: 90 })
    expect(balanceTeams(101)).toBeNull()
    expect(balanceTeams(0)).toBeNull()
    expect(balanceTeams(-1)).toBeNull()

    // Boundaries 3 to 12
    const table: Array<[number, number, number]> = [
      [3, 1, 2],
      [4, 1, 3],
      [5, 1, 4],
      [6, 1, 5],
      [7, 1, 6],
      [8, 1, 7],
      [9, 1, 8],
      [10, 1, 9],
      [11, 2, 9],
      [12, 2, 10],
    ]
    for (const [n, expectedHunters, expectedRunners] of table) {
      const balance = balanceTeams(n)
      expect(balance).not.toBeNull()
      expect(balance?.hunters).toBe(expectedHunters)
      expect(balance?.runners).toBe(expectedRunners)
    }

    expect(balanceTeams(13)).not.toBeNull()
    expect(balanceTeams(20)).not.toBeNull()
  })

  it('A2: nextRandomRole assigns to short side toward target', () => {
    // 3 players: target is 1 hunter
    expect(nextRandomRole(3, 0)).toBe('HUNTER')
    expect(nextRandomRole(3, 1)).toBe('RUNNER')

    // 12 players: target is 2 hunters
    expect(nextRandomRole(12, 0)).toBe('HUNTER')
    expect(nextRandomRole(12, 1)).toBe('HUNTER')
    expect(nextRandomRole(12, 2)).toBe('RUNNER')
    // What if manual selections already exceeded target? (e.g. 5 hunters in 12 players)
    expect(nextRandomRole(12, 5)).toBe('RUNNER')
  })

  it('A3 / F-07: canStartLobby allows custom Hunter counts within safe bounds', () => {
    // Correct 3-player lobby: 1 hunter, 2 runners, all ready
    const valid3: TeamMember[] = [
      { role: 'HUNTER', status: 'ACTIVE', ready: true },
      { role: 'RUNNER', status: 'ACTIVE', ready: true },
      { role: 'RUNNER', status: 'ACTIVE', ready: true },
    ]
    expect(canStartLobby(valid3)).toEqual({ canStart: true, activeCounts: { hunters: 1, runners: 2 } })

    const custom12: TeamMember[] = [
      ...Array.from({ length: 5 }, () => ({ role: 'HUNTER' as const, status: 'ACTIVE' as const, ready: true })),
      ...Array.from({ length: 7 }, () => ({ role: 'RUNNER' as const, status: 'ACTIVE' as const, ready: true })),
    ]
    expect(canStartLobby(custom12)).toEqual({ canStart: true, activeCounts: { hunters: 5, runners: 7 } })

    // An 11-Hunter preference/assignment cannot be finalized into a valid team.
    const unbalanced12: TeamMember[] = [
      ...Array.from({ length: 11 }, () => ({ role: 'HUNTER' as const, status: 'ACTIVE' as const, ready: true })),
      { role: 'RUNNER', status: 'ACTIVE', ready: true },
    ]
    const check12 = canStartLobby(unbalanced12)
    expect(check12.canStart).toBe(false)
    expect(check12.blockReason).toBe('NEEDS_TEAMS')
  })

  it('A4: canStartLobby rejects unassigned, unready, under 2, over 100', () => {
    const unready: TeamMember[] = [
      { role: 'HUNTER', status: 'ACTIVE', ready: true },
      { role: 'RUNNER', status: 'ACTIVE', ready: false },
      { role: 'RUNNER', status: 'ACTIVE', ready: true },
    ]
    expect(canStartLobby(unready).canStart).toBe(false)
    expect(canStartLobby(unready).blockReason).toBe('WAITING_FOR_READY')

    const unassigned: TeamMember[] = [
      { role: null, status: 'ACTIVE', ready: true },
      { role: 'HUNTER', status: 'ACTIVE', ready: true },
      { role: 'RUNNER', status: 'ACTIVE', ready: true },
    ]
    expect(canStartLobby(unassigned).canStart).toBe(false)
    expect(canStartLobby(unassigned).blockReason).toBe('NEEDS_TEAMS')

    const onePlayer: TeamMember[] = [{ role: 'HUNTER', status: 'ACTIVE', ready: true }]
    expect(canStartLobby(onePlayer).canStart).toBe(false)
    expect(canStartLobby(onePlayer).blockReason).toBe('NEEDS_TWO_PLAYERS')
    const hundredPlayers: TeamMember[] = Array.from({ length: 100 }, (_, index) => ({
      role: index < 10 ? 'HUNTER' : 'RUNNER', status: 'ACTIVE', ready: true,
    }))
    expect(canStartLobby(hundredPlayers).canStart).toBe(true)
    expect(canStartLobby([...hundredPlayers, hundredPlayers[99]]).blockReason).toBe('LOBBY_FULL')
  })
})

describe('AUDIT CHECKLIST B: State machine, timers and deadlines (packages/game-core)', () => {
  it('B1: didTagMeetDeadline strictly rejects exact-boundary and late tags', () => {
    const deadline = 1_700_000_000_000
    // Tag arrived 1ms before deadline -> meets deadline
    expect(didTagMeetDeadline(deadline - 1, deadline)).toBe(true)
    // Tag arrived at EXACT deadline ms -> loses!
    expect(didTagMeetDeadline(deadline, deadline)).toBe(false)
    // Tag arrived 1ms after deadline -> loses!
    expect(didTagMeetDeadline(deadline + 1, deadline)).toBe(false)
    // NaN / Infinity checks
    expect(didTagMeetDeadline(NaN, deadline)).toBe(false)
    expect(didTagMeetDeadline(deadline - 1, Infinity)).toBe(false)
  })

  it('B2: latestDuePingIndex computes exact 9 slots (0..8) for 45/5/3 example', () => {
    const roundSeconds = 45 * 60 // 2700s
    const headStartSeconds = 3 * 60 // 180s
    const pingSeconds = 5 * 60 // 300s
    const firstPingAtMs = headStartSeconds * 1000 // 180,000 ms
    const endsAtMs = roundSeconds * 1000 // 2,700,000 ms

    // At head-start end (t = 180s): slot 0 is due
    expect(latestDuePingIndex(-1, firstPingAtMs, pingSeconds, 180_000, endsAtMs)).toBe(0)

    // At t = 180 + 300 = 480s: slot 1 is due
    expect(latestDuePingIndex(0, firstPingAtMs, pingSeconds, 480_000, endsAtMs)).toBe(1)

    // Verify all slots up to end:
    // Slot 8 is at t = 180 + 8*300 = 2580s (43 min)
    expect(latestDuePingIndex(7, firstPingAtMs, pingSeconds, 2580_000, endsAtMs)).toBe(8)

    // At t = 2699_999 ms (1ms before match end): no new slot beyond 8 (next would be 9 at 2880s, which is > endsAt)
    expect(latestDuePingIndex(8, firstPingAtMs, pingSeconds, 2699_999, endsAtMs)).toBeNull()

    // At t = 2700_000 ms (exact match end): match is over, returns null
    expect(latestDuePingIndex(8, firstPingAtMs, pingSeconds, 2700_000, endsAtMs)).toBeNull()
  })

  it('B3: latestDuePingIndex collapses missed slots into the single newest slot', () => {
    const firstPingAtMs = 180_000
    const pingSeconds = 300
    const endsAtMs = 2700_000

    // Gap: last ping was index 0 at 180s. Now t = 1380s (slot 4 is due).
    // Slots 1, 2, 3 were missed.
    const latest = latestDuePingIndex(0, firstPingAtMs, pingSeconds, 1380_000, endsAtMs)
    expect(latest).toBe(4) // Directly advances to 4, does not emit 1, 2, 3
  })

  it('B4: latestDuePingIndex handles inconsistent bounds (head start >= round)', () => {
    // If head_start_seconds (900) >= round_seconds (600)
    const firstPingAtMs = 900_000
    const endsAtMs = 600_000
    expect(latestDuePingIndex(-1, firstPingAtMs, 300, 700_000, endsAtMs)).toBeNull()
  })
})

describe('AUDIT CHECKLIST C: Zone calculations (packages/game-core)', () => {
  it('C1: haversineDistanceMeters accurately computes distance and validates inputs', () => {
    // Null on invalid coordinates
    expect(haversineDistanceMeters(91, 0, 0, 0)).toBeNull()
    expect(haversineDistanceMeters(0, 181, 0, 0)).toBeNull()
    expect(haversineDistanceMeters(NaN, 0, 0, 0)).toBeNull()

    // Same point -> 0 meters
    expect(haversineDistanceMeters(51.5074, -0.1278, 51.5074, -0.1278)).toBe(0)

    // Known distance: London (51.5074, -0.1278) to Paris (48.8566, 2.3522) ~= 343.5 km
    const d = haversineDistanceMeters(51.5074, -0.1278, 48.8566, 2.3522)
    expect(d).not.toBeNull()
    expect(Math.round(d! / 1000)).toBe(344)
  })

  it('C2: classifyZoneSample accounts for accuracy bounds', () => {
    const radius = 500 // 500m radius

    // Fix at 400m with 50m accuracy: 400 + 50 = 450 < 500 -> confident INSIDE
    expect(classifyZoneSample(400, 50, radius)).toBe('INSIDE')

    // Fix at 600m with 50m accuracy: 600 - 50 = 550 > 500 -> confident OUTSIDE
    expect(classifyZoneSample(600, 50, radius)).toBe('OUTSIDE')

    // Fix at 480m with 50m accuracy: 480 + 50 = 530 > 500, 480 - 50 = 430 < 500 -> UNCERTAIN (straddles edge)
    expect(classifyZoneSample(480, 50, radius)).toBe('UNCERTAIN')

    // Fix at 520m with 50m accuracy: straddles edge -> UNCERTAIN
    expect(classifyZoneSample(520, 50, radius)).toBe('UNCERTAIN')

    // Poor/missing fix -> NO_FIX
    expect(classifyZoneSample(null, 50, radius)).toBe('NO_FIX')
    expect(classifyZoneSample(400, null, radius)).toBe('NO_FIX')
    expect(classifyZoneSample(400, -5, radius)).toBe('NO_FIX')
  })

  it('C3: advanceZoneConfirmation requires two consecutive confident samples to reveal and clear', () => {
    const initial = { outsideSamples: 0, insideSamples: 0, revealed: false }

    // 1st OUTSIDE: outsideSamples = 1, revealed = false
    const s1 = advanceZoneConfirmation(initial, 'OUTSIDE')
    expect(s1).toEqual({ outsideSamples: 1, insideSamples: 0, revealed: false })

    // 2nd OUTSIDE: outsideSamples = 2, revealed = true
    const s2 = advanceZoneConfirmation(s1, 'OUTSIDE')
    expect(s2).toEqual({ outsideSamples: 2, insideSamples: 0, revealed: true })

    // UNCERTAIN while revealed: resets counters, remains revealed
    const s3 = advanceZoneConfirmation(s2, 'UNCERTAIN')
    expect(s3).toEqual({ outsideSamples: 0, insideSamples: 0, revealed: true })

    // 1st INSIDE: insideSamples = 1, remains revealed
    const s4 = advanceZoneConfirmation(s3, 'INSIDE')
    expect(s4).toEqual({ outsideSamples: 0, insideSamples: 1, revealed: true })

    // 2nd INSIDE: insideSamples = 2, revealed clears to false
    const s5 = advanceZoneConfirmation(s4, 'INSIDE')
    expect(s5).toEqual({ outsideSamples: 0, insideSamples: 2, revealed: false })
  })
})

describe('AUDIT CHECKLIST E: Win conditions and team emptying (packages/game-core)', () => {
  it('E1: all runners tagged or left -> Hunters win', () => {
    const outcome = resolveActiveOutcome(
      { runnerActive: 0, runnerTotal: 2, hunterActive: 1, hunterTotal: 1 },
      1000,
      2000,
    )
    expect(outcome).toEqual({ winner: 'HUNTER', reason: 'ALL_RUNNERS_TAGGED_OR_LEFT' })
  })

  it('E2: all hunters left -> Runners win', () => {
    const outcome = resolveActiveOutcome(
      { runnerActive: 2, runnerTotal: 2, hunterActive: 0, hunterTotal: 1 },
      1000,
      2000,
    )
    expect(outcome).toEqual({ winner: 'RUNNER', reason: 'ALL_HUNTERS_LEFT' })
  })

  it('E3: time limit reached with active runners -> Runners win', () => {
    const outcome = resolveActiveOutcome(
      { runnerActive: 1, runnerTotal: 2, hunterActive: 1, hunterTotal: 1 },
      2000,
      2000,
    )
    expect(outcome).toEqual({ winner: 'RUNNER', reason: 'TIME_LIMIT' })
  })

  it('E4 / F-01: both teams empty in one tick resolves to a Hunter win', () => {
    // In game-core:
    const outcome = resolveActiveOutcome(
      { runnerActive: 0, runnerTotal: 2, hunterActive: 0, hunterTotal: 1 },
      1000,
      2000,
    )
    // The documented tie-break checks Runner elimination before Hunter elimination.
    expect(outcome?.winner).toBe('HUNTER')
    expect(outcome?.reason).toBe('ALL_RUNNERS_TAGGED_OR_LEFT')
  })
})
