import { describe, expect, it } from 'vitest'
import { DEFAULT_MATCH_CONFIG, isValidMatchConfig } from './config.ts'
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
} from './rules.ts'
import { mergeLatestPings } from './pings.ts'
import { privateMatchTopic } from './realtime.ts'
import { projectEventForRole } from './payloads.ts'
import type { TeamMember } from './types.ts'

function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}

describe('phase 3 exhaustive game-core review', () => {
  it('checks every three-choice role assignment (Hunter/Runner/unassigned) for 3–12 players', () => {
    let assignments = 0
    for (let n = 3; n <= 12; n += 1) {
      const total = 3 ** n
      for (let encoded = 0; encoded < total; encoded += 1) {
        let digits = encoded
        let hunters = 0, runners = 0, unassigned = 0
        const members: TeamMember[] = []
        for (let i = 0; i < n; i += 1) {
          const choice = digits % 3
          digits = Math.floor(digits / 3)
          const role = choice === 0 ? 'HUNTER' : choice === 1 ? 'RUNNER' : null
          if (role === 'HUNTER') hunters += 1
          else if (role === 'RUNNER') runners += 1
          else unassigned += 1
          members.push({ role, status: 'ACTIVE', ready: true })
        }
        const result = canStartLobby(members)
        expect(result.canStart).toBe(unassigned === 0 && hunters >= 1 && hunters <= Math.floor(n / 2) && runners > 0)
        expect(result.activeCounts).toEqual({ hunters, runners })
        assignments += 1
      }
    }
    expect(assignments).toBe(797_148)
  }, 20_000)

  it('checks readiness/status boundaries and Random assignment for every supported count', () => {
    for (let n = 3; n <= 12; n += 1) {
      const target = balanceTeams(n)!.hunters
      expect(nextRandomRole(n, target - 1)).toBe('HUNTER')
      expect(nextRandomRole(n, target)).toBe('RUNNER')
      const members: TeamMember[] = Array.from({ length: n }, (_, i) => ({
        role: i < target ? 'HUNTER' : 'RUNNER', status: 'ACTIVE', ready: true,
      }))
      for (let i = 0; i < n; i += 1) {
        const changed = members.map((p, j) => j === i ? { ...p, ready: false } : p)
        expect(canStartLobby(changed).blockReason).toBe('WAITING_FOR_READY')
      }
      expect(canStartLobby(members.map((p, i) => i === n - 1 ? { ...p, status: 'LEFT' } : p)).activeCounts)
        .toEqual({ hunters: target, runners: n - target - (n - 1 >= target ? 1 : 0) })
    }
    expect(canStartLobby([]).blockReason).toBe('NEEDS_TWO_PLAYERS')
    expect(nextRandomRole(3, -1)).toBeNull()
    expect(nextRandomRole(3, 4)).toBeNull()
  })

  it('checks all bounded active team counts and deadline orderings', () => {
    for (let rt = 1; rt <= 10; rt += 1) for (let ra = 0; ra <= rt; ra += 1)
      for (let ht = 1; ht <= 6; ht += 1) for (let ha = 0; ha <= ht; ha += 1) {
        const result = resolveActiveOutcome({ runnerTotal: rt, runnerActive: ra, hunterTotal: ht, hunterActive: ha }, 100, 200)
        if (ra === 0) expect(result?.winner).toBe('HUNTER')
        else if (ha === 0) expect(result?.winner).toBe('RUNNER')
        else expect(result).toBeNull()
        expect(resolveActiveOutcome({ runnerTotal: rt, runnerActive: ra, hunterTotal: ht, hunterActive: ha }, 200, 200))
          .toEqual(ra === 0 ? { winner: 'HUNTER', reason: 'ALL_RUNNERS_TAGGED_OR_LEFT' }
            : ha === 0 ? { winner: 'RUNNER', reason: 'ALL_HUNTERS_LEFT' }
              : { winner: 'RUNNER', reason: 'TIME_LIMIT' })
      }
    expect(didTagMeetDeadline(199, 200)).toBe(true)
    expect(didTagMeetDeadline(200, 200)).toBe(false)
    for (const bad of [NaN, Infinity, -Infinity]) expect(didTagMeetDeadline(bad, 200)).toBe(false)
    expect(resolveActiveOutcome({ runnerTotal: 1, runnerActive: 1, hunterTotal: 1, hunterActive: 1 }, 10_000, null)).toBeNull()
  })

  it('checks ping-slot math across round, head-start and interval combinations', () => {
    let combinations = 0
    for (let roundMinutes = 10; roundMinutes <= 180; roundMinutes += 10)
      for (let headMinutes = 0; headMinutes <= 15; headMinutes += 3)
        for (let intervalMinutes = 1; intervalMinutes <= 30; intervalMinutes += 1) {
          const ends = roundMinutes * 60_000
          const first = headMinutes * 60_000
          if (first >= ends) continue
          const interval = intervalMinutes * 60
          for (let due = 0; due <= Math.floor((ends - first - 1) / (interval * 1000)); due += 1) {
            const now = first + due * interval * 1000
            expect(latestDuePingIndex(-1, first, interval, now, ends)).toBe(due)
            expect(latestDuePingIndex(due, first, interval, now, ends)).toBeNull()
            const missed = first + (due + 2) * interval * 1000 + 1
            if (missed < ends) expect(latestDuePingIndex(-1, first, interval, missed, ends)).toBe(due + 2)
            combinations += 1
          }
          expect(latestDuePingIndex(-1, first, interval, ends, ends)).toBeNull()
        }
    expect(combinations).toBeGreaterThan(30_000)
  })

  it('checks config limits and deterministic geometry properties with seeded inputs', () => {
    expect(isValidMatchConfig(DEFAULT_MATCH_CONFIG)).toBe(true)
    expect(isValidMatchConfig({ roundSeconds: null, headStartSeconds: 180, pingSeconds: 300 })).toBe(true)
    expect(isValidMatchConfig({ roundSeconds: null, headStartSeconds: 900, pingSeconds: 1800 })).toBe(true)
    for (const roundSeconds of [599, 600, 10_800, 10_801]) {
      const valid = roundSeconds >= 600 && roundSeconds <= 10_800
      expect(isValidMatchConfig({ roundSeconds, headStartSeconds: 0, pingSeconds: null })).toBe(valid)
    }
    for (const headStartSeconds of [-1, 0, 900, 901]) {
      const valid = headStartSeconds >= 0 && headStartSeconds <= 900 && 600 - headStartSeconds >= 300
      expect(isValidMatchConfig({ roundSeconds: 600, headStartSeconds, pingSeconds: null })).toBe(valid)
    }
    for (const pingSeconds of [-1, 59, 60, 1800, 1801]) {
      const valid = pingSeconds >= 60 && pingSeconds <= 1800 && pingSeconds <= 2700 - 180
      expect(isValidMatchConfig({ ...DEFAULT_MATCH_CONFIG, pingSeconds })).toBe(valid)
    }
    expect(isValidMatchConfig({ ...DEFAULT_MATCH_CONFIG, pingSeconds: null })).toBe(true)

    const random = seeded(0x585a4f4e)
    for (let i = 0; i < 20_000; i += 1) {
      const aLat = random() * 180 - 90, aLon = random() * 360 - 180
      const bLat = random() * 180 - 90, bLon = random() * 360 - 180
      const forward = haversineDistanceMeters(aLat, aLon, bLat, bLon)
      const reverse = haversineDistanceMeters(bLat, bLon, aLat, aLon)
      expect(forward).not.toBeNull()
      expect(forward).toBeGreaterThanOrEqual(0)
      expect(Math.abs(forward! - reverse!)).toBeLessThan(1e-6)
      const sample = classifyZoneSample(forward, random() * 200, 500)
      expect(['INSIDE', 'OUTSIDE', 'UNCERTAIN']).toContain(sample)
    }
    expect(classifyZoneSample(-1, 1, 10)).toBe('NO_FIX')
    expect(classifyZoneSample(1, -1, 10)).toBe('NO_FIX')
    const initial = { outsideSamples: 0, insideSamples: 0, revealed: false }
    expect(advanceZoneConfirmation(initial, 'NO_FIX')).toEqual(initial)
    expect(haversineDistanceMeters(90.01, 0, 0, 0)).toBeNull()
  })

  it('checks ping merge idempotency and role projector deny-by-default with a seeded stream', () => {
    const random = seeded(42)
    let snapshots: Array<{ runner_id: string; ping_index: number }> = []
    for (let i = 0; i < 10_000; i += 1) {
      const input = Array.from({ length: 1 + Math.floor(random() * 5) }, () => ({
        runner_id: `r${Math.floor(random() * 10)}`,
        ping_index: Math.floor(random() * 50),
      }))
      const merged = mergeLatestPings(snapshots, input)
      expect(mergeLatestPings(merged, input)).toEqual(merged)
      for (const row of merged) expect(row.ping_index).toBe(Math.max(...[...snapshots, ...input].filter(x => x.runner_id === row.runner_id).map(x => x.ping_index)))
      snapshots = merged
    }
    const base = { event_id: 'e', match_id: 'm', revision: 1, server_at: 't' }
    expect(projectEventForRole('RUNNER', { ...base, type: 'hunter.runner_ping', data: { runner_id: 'r', status: 'OK', lat: 1, lon: 2, accuracy_m: 1, captured_at: 't', ping_at: 't', age_seconds: 0, ping_index: 0 } })).toBeNull()
    expect(projectEventForRole('RUNNER', { ...base, type: 'unregistered.event', data: { hidden: true } })).toBeNull()
    expect(() => privateMatchTopic('malformed', 'RUNNER', 'malformed')).toThrow()
  })
})
