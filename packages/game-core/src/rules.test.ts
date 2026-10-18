import { describe, expect, it } from 'vitest'
import {
  balanceTeams,
  canStartLobby,
  didTagMeetDeadline,
  latestDuePingIndex,
  haversineDistanceMeters,
  nextRandomRole,
  resolveActiveOutcome,
} from './rules.ts'
import type { TeamMember } from './types.ts'

describe('team balance and readiness', () => {
  it('balances every supported lobby size from 3 through 12', () => {
    for (let count = 3; count <= 12; count += 1) {
      const result = balanceTeams(count)
      expect(result).not.toBeNull()
      expect(result!.hunters).toBe(Math.min(Math.ceil(count / 10), Math.floor(count / 2)))
      expect(result!.runners).toBe(count - result!.hunters)
      expect(result!.hunters).toBeGreaterThan(0)
      expect(result!.runners).toBeGreaterThanOrEqual(result!.hunters)
    }
  })

  it('rejects player counts outside 3–12 and handles 3-player Random assignment', () => {
    expect(balanceTeams(2)).toBeNull()
    expect(balanceTeams(13)).toBeNull()
    expect(nextRandomRole(1, 0)).toBe('RUNNER')
    expect(nextRandomRole(2, 0)).toBe('HUNTER')
    expect(nextRandomRole(3, 1)).toBe('RUNNER')
    expect(nextRandomRole(13, 0)).toBeNull()
  })

  it('requires at least three active players, both teams, and readiness', () => {
    const players: TeamMember[] = [
      { role: 'HUNTER', status: 'ACTIVE', ready: true },
      { role: 'RUNNER', status: 'ACTIVE', ready: true },
      { role: 'RUNNER', status: 'ACTIVE', ready: true },
    ]
    expect(canStartLobby(players)).toEqual({ canStart: true, activeCounts: { hunters: 1, runners: 2 } })
    expect(canStartLobby(players.slice(0, 2)).blockReason).toBe('NEEDS_THREE_PLAYERS')
    expect(canStartLobby(players.map((player) => ({ ...player, role: 'RUNNER' as const }))).blockReason).toBe('NEEDS_TEAMS')
    expect(canStartLobby(players.map((player, index) => index === 2 ? { ...player, ready: false } : player).map((player) => player)).blockReason)
      .toBe('WAITING_FOR_READY')
    expect(canStartLobby([...players, ...Array.from({ length: 10 }, () => players[2])]).blockReason).toBe('LOBBY_FULL')
  })
})

describe('active outcomes and server deadline', () => {
  it('awards the Hunters the match when all Runners are tagged or leave', () => {
    expect(resolveActiveOutcome({ runnerTotal: 2, runnerActive: 0, hunterTotal: 1, hunterActive: 1 }, 1, 2))
      .toEqual({ winner: 'HUNTER', reason: 'ALL_RUNNERS_TAGGED_OR_LEFT' })
  })

  it('awards the Runners the match when all Hunters leave', () => {
    expect(resolveActiveOutcome({ runnerTotal: 2, runnerActive: 2, hunterTotal: 1, hunterActive: 0 }, 1, 2))
      .toEqual({ winner: 'RUNNER', reason: 'ALL_HUNTERS_LEFT' })
  })

  it('uses the match server deadline, with exact-boundary tags rejected', () => {
    expect(didTagMeetDeadline(999, 1000)).toBe(true)
    expect(didTagMeetDeadline(1000, 1000)).toBe(false)
    expect(didTagMeetDeadline(1001, 1000)).toBe(false)
    expect(resolveActiveOutcome({ runnerTotal: 2, runnerActive: 1, hunterTotal: 1, hunterActive: 1 }, 1000, 1000))
      .toEqual({ winner: 'RUNNER', reason: 'TIME_LIMIT' })
  })

  it('resolves Runner elimination first if both teams empty in the same serialized transition', () => {
    expect(resolveActiveOutcome({ runnerTotal: 2, runnerActive: 0, hunterTotal: 1, hunterActive: 0 }, 1, 2))
      .toEqual({ winner: 'HUNTER', reason: 'ALL_RUNNERS_TAGGED_OR_LEFT' })
  })
})

describe('lazy ping scheduling', () => {
  const firstPing = Date.parse('2026-10-18T18:03:00.000Z')
  const endsAt = Date.parse('2026-10-18T18:45:00.000Z')

  it('does not ping before the active phase and issues a due slot once', () => {
    expect(latestDuePingIndex(-1, firstPing, 300, firstPing - 1, endsAt)).toBeNull()
    expect(latestDuePingIndex(-1, firstPing, 300, firstPing, endsAt)).toBe(0)
    expect(latestDuePingIndex(0, firstPing, 300, firstPing, endsAt)).toBeNull()
  })

  it('coalesces multiple missed sync slots into one latest index', () => {
    const now = firstPing + 2 * 300_000 + 17_000
    expect(latestDuePingIndex(-1, firstPing, 300, now, endsAt)).toBe(2)
    expect(latestDuePingIndex(2, firstPing, 300, now, endsAt)).toBeNull()
  })

  it('does not create a ping at or after match end', () => {
    expect(latestDuePingIndex(7, firstPing, 300, endsAt, endsAt)).toBeNull()
    expect(latestDuePingIndex(7, firstPing, 300, endsAt + 1, endsAt)).toBeNull()
  })
})

describe('distance helper', () => {
  it('calculates meters without exposing or persisting a route', () => {
    expect(haversineDistanceMeters(0, 0, 0, 1)).toBeCloseTo(111_195, -1)
    expect(haversineDistanceMeters(91, 0, 0, 1)).toBeNull()
  })
})
