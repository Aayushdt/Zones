import { describe, expect, it } from 'vitest'
import {
  advanceZoneConfirmation,
  balanceTeams,
  canStartLobby,
  classifyZoneSample,
  didTagMeetDeadline,
  haversineDistanceMeters,
  latestDuePingIndex,
  mergeLatestPings,
  nextRandomRole,
  projectEventForRole,
  resolveActiveOutcome,
  zoneAt,
  type EventEnvelope,
  type TeamMember,
  type ZoneScheduleConfig,
} from './index.ts'

describe('GOLDEN MASTER: Pure Game Logic Snapshot Matrix', () => {
  it('1. Zone radius and shrink schedule (zoneAt, haversineDistanceMeters, classifyZoneSample, advanceZoneConfirmation)', () => {
    const config: ZoneScheduleConfig = {
      center: { lat: 51.5074, lon: -0.1278 },
      startRadiusM: 600,
      shrinkStages: 3,
      shrinkIntervalSeconds: 300,
      finalRadiusM: 150,
      headStartSeconds: 60,
    }

    const startMs = 1700000000000
    const timeOffsets = [
      0, // match start
      30_000, // midway through head start
      60_000, // end of head start
      200_000, // stage 0 active
      360_000, // exactly first shrink
      500_000, // stage 1
      660_000, // exactly second shrink
      800_000, // stage 2
      960_000, // exactly final shrink (stage 3)
      1_500_000, // well past final shrink
    ]

    const zoneResults = timeOffsets.map((offset) => ({
      offset,
      result: zoneAt(config, startMs, startMs + offset),
    }))

    // Zero shrink stages configuration
    const zeroStagesConfig: ZoneScheduleConfig = {
      ...config,
      shrinkStages: 0,
    }
    const zeroStagesResult = zoneAt(zeroStagesConfig, startMs, startMs + 500_000)

    // Haversine distance matrix
    const coordinates = [
      { lat1: 51.5074, lon1: -0.1278, lat2: 51.5074, lon2: -0.1278 }, // 0m
      { lat1: 51.5074, lon1: -0.1278, lat2: 51.5084, lon2: -0.1278 }, // ~111m north
      { lat1: 51.5074, lon1: -0.1278, lat2: 51.5074, lon2: -0.1268 }, // ~69m east
      { lat1: 0, lon1: 0, lat2: 0, lon2: 1 }, // equator 1 deg
      { lat1: 89, lon1: 0, lat2: 90, lon2: 0 }, // near pole
      { lat1: -91, lon1: 0, lat2: 0, lon2: 0 }, // invalid lat
      { lat1: 0, lon1: 181, lat2: 0, lon2: 0 }, // invalid lon
    ]
    const distanceResults = coordinates.map((c) => ({
      coords: c,
      dist: haversineDistanceMeters(c.lat1, c.lon1, c.lat2, c.lon2),
    }))

    // Sample classification matrix
    const sampleTests = [
      { d: 100, acc: 10, r: 200 }, // INSIDE (100+10 < 200)
      { d: 195, acc: 10, r: 200 }, // UNCERTAIN (crosses 200)
      { d: 250, acc: 20, r: 200 }, // OUTSIDE (250-20 > 200)
      { d: 210, acc: 15, r: 200 }, // UNCERTAIN (210-15 < 200)
      { d: null, acc: 10, r: 200 }, // NO_FIX
      { d: 100, acc: null, r: 200 }, // NO_FIX
      { d: -5, acc: 10, r: 200 }, // NO_FIX
      { d: 100, acc: 10, r: 0 }, // NO_FIX
    ]
    const sampleResults = sampleTests.map((t) => ({
      test: t,
      sample: classifyZoneSample(t.d, t.acc, t.r),
    }))

    // Consecutive confirmation state transitions
    let confirmationState = { outsideSamples: 0, insideSamples: 0, revealed: false }
    const sequence: Array<'INSIDE' | 'OUTSIDE' | 'UNCERTAIN' | 'NO_FIX'> = [
      'INSIDE',
      'INSIDE',
      'UNCERTAIN',
      'OUTSIDE',
      'OUTSIDE', // should reveal
      'OUTSIDE',
      'UNCERTAIN',
      'INSIDE',
      'INSIDE', // should clear reveal
      'NO_FIX',
    ]
    const confirmationHistory = sequence.map((sample) => {
      confirmationState = advanceZoneConfirmation(confirmationState, sample)
      return { sample, state: { ...confirmationState } }
    })

    expect({
      zoneResults,
      zeroStagesResult,
      distanceResults,
      sampleResults,
      confirmationHistory,
    }).toMatchSnapshot()
  })

  it('2. Ping scheduling and coalescing (latestDuePingIndex, mergeLatestPings)', () => {
    const firstPingAtMs = 100_000
    const pingSeconds = 60
    const endsAtMs = 1_000_000

    const pingTests = [
      { lastIdx: -1, now: 90_000 }, // before first ping -> null
      { lastIdx: -1, now: 100_000 }, // exactly first ping -> 0
      { lastIdx: -1, now: 159_000 }, // during slot 0 -> 0
      { lastIdx: 0, now: 159_000 }, // already seen slot 0 -> null
      { lastIdx: 0, now: 160_000 }, // slot 1 due -> 1
      { lastIdx: 0, now: 350_000 }, // missed slots 1, 2, 3, now in 4 -> 4 (coalesced)
      { lastIdx: 4, now: 1_000_000 }, // at deadline -> null
      { lastIdx: 4, now: 1_050_000 }, // past deadline -> null
      { lastIdx: 10, now: 200_000 }, // already seen higher index -> null
    ]

    const pingResults = pingTests.map((t) => ({
      input: t,
      due: latestDuePingIndex(t.lastIdx, firstPingAtMs, pingSeconds, t.now, endsAtMs),
    }))

    // Ping snapshot merging
    const currentPings = [
      { runner_id: 'r1', status: 'OK' as const, lat: 51.5, lon: -0.1, accuracy_m: 10, captured_at: '2026-01-01T00:00:00Z', age_seconds: 5, ping_index: 0 },
      { runner_id: 'r2', status: 'OK' as const, lat: 51.6, lon: -0.2, accuracy_m: 15, captured_at: '2026-01-01T00:00:00Z', age_seconds: 5, ping_index: 0 },
    ]
    const incomingPings = [
      { runner_id: 'r1', status: 'OK' as const, lat: 51.51, lon: -0.11, accuracy_m: 8, captured_at: '2026-01-01T00:01:00Z', age_seconds: 2, ping_index: 1 }, // newer
      { runner_id: 'r2', status: 'STALE' as const, age_seconds: 65, ping_index: 0 }, // same index
      { runner_id: 'r3', status: 'NO_FIX' as const, age_seconds: 10, ping_index: 1 }, // new runner
    ]
    const merged = mergeLatestPings(currentPings, incomingPings)

    expect({ pingResults, merged }).toMatchSnapshot()
  })

  it('3. Team balancing and lobby rules (balanceTeams, nextRandomRole, canStartLobby)', () => {
    // balanceTeams across 0..105 player range
    const balanceMatrix = Array.from({ length: 16 }, (_, i) => i).concat([20, 50, 100, 101, 102]).map((n) => ({
      n,
      balance: balanceTeams(n),
    }))

    // nextRandomRole across sizes and hunter counts
    const randomRoleTests = [
      { n: 2, h: 0 },
      { n: 2, h: 1 },
      { n: 3, h: 0 },
      { n: 3, h: 1 },
      { n: 10, h: 0 },
      { n: 10, h: 1 },
      { n: 11, h: 1 },
      { n: 11, h: 2 },
      { n: 12, h: 1 },
      { n: 12, h: 2 },
      { n: 12, h: 5 }, // already high hunter count
    ]
    const randomRoleResults = randomRoleTests.map((t) => ({
      test: t,
      role: nextRandomRole(t.n, t.h),
    }))

    // canStartLobby combinations
    const makePlayer = (role: 'HUNTER' | 'RUNNER' | null, ready: boolean, status: 'ACTIVE' | 'TAGGED' | 'LEFT' = 'ACTIVE'): TeamMember => ({
      role,
      ready,
      status,
    })

    const lobbyTests = [
      { desc: 'empty', players: [] },
      { desc: '1 player', players: [makePlayer('HUNTER', true)] },
      { desc: '2 players balanced and ready', players: [makePlayer('HUNTER', true), makePlayer('RUNNER', true)] },
      { desc: '2 players unready', players: [makePlayer('HUNTER', true), makePlayer('RUNNER', false)] },
      { desc: '2 players no roles', players: [makePlayer(null, true), makePlayer(null, true)] },
      { desc: '2 hunters 0 runners', players: [makePlayer('HUNTER', true), makePlayer('HUNTER', true)] },
      { desc: '3 players (1H 2R) ready', players: [makePlayer('HUNTER', true), makePlayer('RUNNER', true), makePlayer('RUNNER', true)] },
      { desc: '12 players (5H 7R) custom allowed', players: [
        makePlayer('HUNTER', true), makePlayer('HUNTER', true), makePlayer('HUNTER', true), makePlayer('HUNTER', true), makePlayer('HUNTER', true),
        makePlayer('RUNNER', true), makePlayer('RUNNER', true), makePlayer('RUNNER', true), makePlayer('RUNNER', true), makePlayer('RUNNER', true), makePlayer('RUNNER', true), makePlayer('RUNNER', true),
      ] },
      { desc: '12 players (7H 5R) unbalanced rejected', players: [
        makePlayer('HUNTER', true), makePlayer('HUNTER', true), makePlayer('HUNTER', true), makePlayer('HUNTER', true), makePlayer('HUNTER', true), makePlayer('HUNTER', true), makePlayer('HUNTER', true),
        makePlayer('RUNNER', true), makePlayer('RUNNER', true), makePlayer('RUNNER', true), makePlayer('RUNNER', true), makePlayer('RUNNER', true),
      ] },
    ]
    const lobbyResults = lobbyTests.map((t) => ({
      desc: t.desc,
      check: canStartLobby(t.players),
    }))

    expect({ balanceMatrix, randomRoleResults, lobbyResults }).toMatchSnapshot()
  })

  it('4. Role-based payload filtering (projectEventForRole security projections)', () => {
    const makeEnvelope = (type: string, data: Record<string, unknown>): EventEnvelope => ({
      event_id: 'ev-1',
      match_id: 'm-1',
      revision: 1,
      server_at: '2026-01-01T00:00:00Z',
      type,
      data,
    })

    const testEvents = [
      // Teammate live location
      makeEnvelope('team.location_live', {
        player_id: 'p-runner-1',
        display_name: 'Runner One',
        lat: 51.5074,
        lon: -0.1278,
        accuracy_m: 10,
        captured_at: '2026-01-01T00:00:00Z',
        age_seconds: 2,
        is_stale: false,
        team_role: 'RUNNER',
      }),
      // Scheduled runner ping clue
      makeEnvelope('hunter.runner_ping', {
        runner_id: 'p-runner-1',
        status: 'OK',
        lat: 51.508,
        lon: -0.129,
        accuracy_m: 12,
        captured_at: '2026-01-01T00:05:00Z',
        ping_at: '2026-01-01T00:05:00Z',
        age_seconds: 5,
        ping_index: 1,
      }),
      // Runner location revealed notice
      makeEnvelope('runner.location_revealed', {
        ping_index: 1,
        ping_at: '2026-01-01T00:05:00Z',
      }),
      // Zone moved
      makeEnvelope('zone.moved', {
        center: { lat: 51.5074, lon: -0.1278 },
        radius_m: 300,
      }),
      // Tag accepted
      makeEnvelope('tag.accepted', {
        runner_id: 'p-runner-1',
        status: 'TAGGED',
        method: 'QR',
        accepted_at: '2026-01-01T00:08:00Z',
      }),
      // Match result
      makeEnvelope('match.result', {
        winner: 'HUNTER',
        end_reason: 'ALL_RUNNERS_TAGGED',
        ended_at: '2026-01-01T00:08:05Z',
      }),
    ]

    const projections = testEvents.map((event) => ({
      type: event.type,
      hunterView: projectEventForRole('HUNTER', event),
      runnerView: projectEventForRole('RUNNER', event),
    }))

    expect(projections).toMatchSnapshot()
  })

  it('5. Tag deadline and terminal win conditions (didTagMeetDeadline, resolveActiveOutcome)', () => {
    const deadlineMs = 1_000_000
    const deadlineTests = [
      { tagAt: 999_999, deadline: deadlineMs }, // before deadline -> true
      { tagAt: 1_000_000, deadline: deadlineMs }, // exact boundary -> false (server deadline wins)
      { tagAt: 1_000_001, deadline: deadlineMs }, // after deadline -> false
    ]
    const deadlineResults = deadlineTests.map((t) => ({
      test: t,
      met: didTagMeetDeadline(t.tagAt, t.deadline),
    }))

    const outcomeTests = [
      // All runners tagged -> HUNTERS WIN
      { counts: { runnerTotal: 2, runnerActive: 0, hunterTotal: 1, hunterActive: 1 }, now: 500_000, endsAt: 1_000_000 },
      // All hunters left -> RUNNERS WIN
      { counts: { runnerTotal: 2, runnerActive: 2, hunterTotal: 1, hunterActive: 0 }, now: 500_000, endsAt: 1_000_000 },
      // Time limit expired with runners alive -> RUNNERS WIN
      { counts: { runnerTotal: 2, runnerActive: 1, hunterTotal: 1, hunterActive: 1 }, now: 1_000_000, endsAt: 1_000_000 },
      { counts: { runnerTotal: 2, runnerActive: 1, hunterTotal: 1, hunterActive: 1 }, now: 1_000_050, endsAt: 1_000_000 },
      // Simultaneous 0 runners and 0 hunters -> HUNTER precedence on elimination
      { counts: { runnerTotal: 2, runnerActive: 0, hunterTotal: 1, hunterActive: 0 }, now: 500_000, endsAt: 1_000_000 },
      // Ongoing match -> null
      { counts: { runnerTotal: 2, runnerActive: 2, hunterTotal: 1, hunterActive: 1 }, now: 500_000, endsAt: 1_000_000 },
    ]
    const outcomeResults = outcomeTests.map((t) => ({
      test: t,
      outcome: resolveActiveOutcome(t.counts, t.now, t.endsAt),
    }))

    expect({ deadlineResults, outcomeResults }).toMatchSnapshot()
  })
})
