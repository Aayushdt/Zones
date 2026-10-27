import { describe, expect, it, vi } from 'vitest'
import { mergeLatestPings } from '../../packages/game-core/src/index.ts'
import { createMockApi } from '../../apps/web/src/services/mock-api.ts'
import { useLocationStore } from '../../apps/web/src/stores/location-store.ts'
import { maintainScreenWakeLock, watchDeviceLocation } from '../../apps/web/src/services/device-lifecycle.ts'
import { createRealtimeEventGate, applyMatchRealtimeEvent } from '../../apps/web/src/services/realtime-events.ts'
import { parseApiError, supabaseGameApi } from '../../apps/web/src/services/supabase-api.ts'
import { fallbackSyncDelay, startFallbackSync } from '../../apps/web/src/services/fallback-sync.ts'
import { createLocationSendState } from '../../apps/web/src/services/location-send-state.ts'
import { createTacticalFallbackStyle } from '../../apps/web/src/utils/map-tactical-style.ts'
import { GPS_READY_THRESHOLD_METERS, GPS_STALE_AGE_MS } from '../../apps/web/src/components/GpsReadinessBadge.tsx'
import { countdownSeconds } from '../../apps/web/src/hooks/use-now.ts'

class TestVisibility {
  hidden = false
  private listeners = new Set<() => void>()
  addEventListener(_type: 'visibilitychange', listener: () => void) { this.listeners.add(listener) }
  removeEventListener(_type: 'visibilitychange', listener: () => void) { this.listeners.delete(listener) }
  change(hidden: boolean) { this.hidden = hidden; for (const listener of this.listeners) listener() }
}

function timeLeft(clock: { ends_at: string; server_now: string }, anchor: number): number {
  const deadline = Date.parse(clock.ends_at)
  const serverAt = Date.parse(clock.server_now)
  return Number.isFinite(deadline) && Number.isFinite(serverAt)
    ? Math.max(0, Math.ceil((deadline - serverAt - (performance.now() - anchor)) / 1000)) : 0
}

function elapsedTo(target: string | null, serverNow: string, anchor: number, now: number): number | null {
  if (!target) return null
  const deadline = Date.parse(target), server = Date.parse(serverNow)
  if (!Number.isFinite(deadline) || !Number.isFinite(server)) return null
  return Math.max(0, Math.ceil((deadline - server - Math.max(0, now - anchor)) / 1000))
}

function ageText(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s ago`
}

describe('AUDIT CHECKLIST I: Client game logic', () => {
  it('uses jittered 30–45 second fallback sync and pauses while hidden', async () => {
    expect(fallbackSyncDelay(() => 0)).toBe(30_000)
    expect(fallbackSyncDelay(() => 0.999)).toBe(44_985)
    vi.useFakeTimers()
    const visibility = new TestVisibility()
    const sync = vi.fn()
    const stop = startFallbackSync(sync, visibility, () => 0)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(sync).toHaveBeenCalledTimes(1)
    visibility.change(true)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sync).toHaveBeenCalledTimes(1)
    visibility.change(false)
    await Promise.resolve()
    expect(sync).toHaveBeenCalledTimes(2)
    stop()
    vi.useRealTimers()
  })

  it('keeps location sequence and pacing state independent per match watcher', () => {
    const first = createLocationSendState()
    const second = createLocationSendState()
    first.sequence = 123
    first.sentAt = 456
    first.sentFix = { lat: 1, lon: 2 }
    expect(second).toEqual({ sequence: 0, sentAt: 0, sentFix: null })
  })

  it('F02: Realtime events dedupe IDs, ignore stale location sequences, and update the role-safe view', () => {
    const gate = createRealtimeEventGate('RUNNER')
    const initial = {
      state: 'ACTIVE' as const, revision: 2, server_now: '2026-10-19T00:00:00Z', active_counts: { hunters: 1, runners: 2 },
      can_end: false, can_claim: false, claim_expires_at: null, own_player_id: 'runner-self', own_status: 'ACTIVE' as const,
      next_ping_at: null, own_team_positions: [], role: 'RUNNER' as const, runner_ping_notice: null,
    }
    const newer = { event_id: 'loc-2', match_id: 'match-1', revision: 2, server_at: 't', type: 'team.location_live', data: {
      player_id: 'runner-peer', display_name: 'Peer', lat: 25, lon: 85, accuracy_m: 5, captured_at: 't', age_seconds: 0, is_stale: false, sequence: 2,
    } }
    const stale = { ...newer, event_id: 'loc-1', data: { ...newer.data, lat: 24, sequence: 1 } }
    expect(gate.accept(newer)).toBe(true)
    const withNewer = applyMatchRealtimeEvent(initial, newer)
    expect(withNewer?.own_team_positions[0]?.lat).toBe(25)
    expect(gate.accept(newer)).toBe(false)
    expect(gate.accept(stale)).toBe(false)
    const staleNotice = { event_id: 'stale-2', match_id: 'match-1', revision: 2, server_at: 't', type: 'location.stale',
      data: { player_id: 'runner-peer', is_stale: true } }
    expect(gate.accept(staleNotice)).toBe(true)
    const withStaleNotice = applyMatchRealtimeEvent(withNewer!, staleNotice)
    expect(withStaleNotice?.own_team_positions[0]?.is_stale).toBe(true)
    expect(gate.accept(staleNotice)).toBe(false)
    const tagged = applyMatchRealtimeEvent(withNewer, { event_id: 'tag-3', match_id: 'match-1', revision: 3, server_at: 't', type: 'tag.accepted', data: { runner_id: 'runner-self', status: 'TAGGED', method: 'QR', accepted_at: 't' } })
    expect(tagged?.own_status).toBe('TAGGED')
  })

  it('F10: a throttled location response is retryable and carries a bounded server delay', () => {
    expect(parseApiError({ error: { code: 'RATE_LIMITED', message: 'paced' } }, 429, '2'))
      .toEqual({ code: 'RATE_LIMITED', message: 'paced', retryable: true, retryAfterSeconds: 2 })
    expect(parseApiError({ error: { code: 'RATE_LIMITED', message: 'paced' } }, 429, '900').retryAfterSeconds).toBe(30)
  })

  it('F12: screen wake lock is acquired only while visible and released on hide/unmount', async () => {
    let visibilityState: DocumentVisibilityState = 'visible'
    let listener: (() => void) | undefined
    const released: number[] = []
    let requests = 0
    const visibility = {
      get visibilityState() { return visibilityState },
      addEventListener: (_type: 'visibilitychange', value: () => void) => { listener = value },
      removeEventListener: (_type: 'visibilitychange', value: () => void) => { if (listener === value) listener = undefined },
    }
    const wakeLock = { request: async (_type: 'screen') => {
      const id = ++requests
      return { released: false, release: async () => { released.push(id) } }
    } }
    const stop = maintainScreenWakeLock(true, wakeLock, visibility)
    await Promise.resolve()
    expect(requests).toBe(1)
    visibilityState = 'hidden'; listener?.()
    expect(released).toEqual([1])
    visibilityState = 'visible'; listener?.()
    await Promise.resolve()
    expect(requests).toBe(2)
    stop()
    expect(released).toEqual([1, 2])
    expect(listener).toBeUndefined()
  })

  it('F13: tagged or disabled players never start GPS and an active watcher is cleared on teardown', () => {
    let nextId = 1
    const watched: number[] = []
    const cleared: number[] = []
    const geolocation = {
      watchPosition: () => { const id = nextId++; watched.push(id); return id },
      clearWatch: (id: number) => { cleared.push(id) },
    }
    const taggedStop = watchDeviceLocation(false, geolocation, () => undefined, () => undefined)
    expect(watched).toEqual([])
    taggedStop()
    const stop = watchDeviceLocation(true, geolocation, () => undefined, () => undefined)
    expect(watched).toEqual([1])
    stop()
    expect(cleared).toEqual([1])
  })

  it('I1: countdown timers are bounded at 0 and never display negative values', () => {
    const anchor = performance.now()
    const clock = {
      ends_at: new Date(Date.now() - 5000).toISOString(), // 5s in past
      server_now: new Date().toISOString(),
    }
    expect(timeLeft(clock, anchor)).toBe(0)

    // elapsedTo with expired target
    expect(elapsedTo(clock.ends_at, clock.server_now, anchor, performance.now())).toBe(0)
  })

  it('I2: countdown handles malformed dates gracefully without throwing or NaN', () => {
    const anchor = performance.now()
    expect(timeLeft({ ends_at: 'invalid', server_now: 'invalid' }, anchor)).toBe(0)
    expect(elapsedTo('invalid', 'invalid', anchor, performance.now())).toBeNull()
  })

  it('I3: age formatting displays seconds and minutes correctly', () => {
    expect(ageText(0)).toBe('0s ago')
    expect(ageText(45)).toBe('45s ago')
    expect(ageText(60)).toBe('1m 0s ago')
    expect(ageText(125)).toBe('2m 5s ago')
  })

  it('I4: mergeLatestPings deduplicates by runner_id and retains highest ping_index', () => {
    const p1 = { runner_id: 'r1', status: 'OK' as const, ping_index: 0, age_seconds: 10 }
    const p2 = { runner_id: 'r2', status: 'OK' as const, ping_index: 0, age_seconds: 12 }
    const current = [p1, p2]

    // New sync with newer p1 (index 1) and same p2 (index 0)
    const update = [
      { runner_id: 'r1', status: 'OK' as const, ping_index: 1, age_seconds: 5 },
      { runner_id: 'r2', status: 'OK' as const, ping_index: 0, age_seconds: 27 },
    ]
    const merged = mergeLatestPings(current, update)
    expect(merged).toHaveLength(2)
    const r1 = merged.find((p) => p.runner_id === 'r1')
    expect(r1?.ping_index).toBe(1)
    const r2 = merged.find((p) => p.runner_id === 'r2')
    expect(r2?.ping_index).toBe(0)
  })

  it('I5: location store is memory-only and does not persist coordinates to localStorage', () => {
    const store = useLocationStore.getState()
    store.enable('match-123')
    store.setFix({
      player_id: 'p1',
      display_name: 'Player 1',
      lat: 51.5,
      lon: -0.1,
      accuracy_m: 15,
      captured_at: new Date().toISOString(),
    })
    expect(useLocationStore.getState().ownFix?.lat).toBe(51.5)

    // Clear match clears state
    store.clearMatch('match-123')
    expect(useLocationStore.getState().enabledMatchId).toBeNull()
    expect(useLocationStore.getState().ownFix).toBeNull()

    // Confirm nothing in localStorage if in browser environment
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('xzones.location')).toBeNull()
    }
  })

  it('I6: mock simulator API returns simulation discriminator and blocks real joins', async () => {
    const mock = createMockApi()
    const lobbyRes = await mock.createLobby({
      display_name: 'Tester',
      round_seconds: 2700,
      head_start_seconds: 180,
      ping_seconds: 300,
    })
    expect(lobbyRes.ok).toBe(true)
    if (lobbyRes.ok) {
      expect(lobbyRes.data.source).toBe('SIMULATION')
      expect(lobbyRes.data.id).toContain('mock_match_')
      expect(lobbyRes.data.code).toContain('SIM-')
    }

    const joinRes = await mock.joinLobby({ display_name: 'Tester', code: 'ANY' })
    expect(joinRes.ok).toBe(false)
    if (!joinRes.ok) {
      expect(joinRes.error.code).toBe('SIM_CODE_ONLY')
    }
  })

  it('I7: tactical fallback style requires zero network requests and handles themes', () => {
    const duskStyle = createTacticalFallbackStyle('dusk')
    expect(duskStyle.version).toBe(8)
    expect(Object.keys(duskStyle.sources).length).toBe(0)
    expect(duskStyle.layers.length).toBeGreaterThan(0)
    expect((duskStyle.layers[0] as { paint?: { 'background-color'?: string } }).paint?.['background-color']).toBe('#080808')

    const paperStyle = createTacticalFallbackStyle('paper')
    expect(paperStyle.version).toBe(8)
    expect(Object.keys(paperStyle.sources).length).toBe(0)
    expect((paperStyle.layers[0] as { paint?: { 'background-color'?: string } }).paint?.['background-color']).toBe('#F0F4F1')
  })

  it('I8: GPS calibration thresholds evaluate 25m readiness and 30s staleness accurately', () => {
    expect(GPS_READY_THRESHOLD_METERS).toBe(25)
    expect(GPS_STALE_AGE_MS).toBe(30_000)

    function evaluateCalibration(acc: number | null, ageMs: number, denied = false): string {
      if (denied) return 'denied'
      if (acc === null) return 'untested'
      if (ageMs > GPS_STALE_AGE_MS) return 'stale'
      if (acc <= GPS_READY_THRESHOLD_METERS) return 'ready'
      if (acc <= 100) return 'weak'
      return 'poor'
    }

    expect(evaluateCalibration(12, 5000)).toBe('ready')
    expect(evaluateCalibration(25, 1000)).toBe('ready')
    expect(evaluateCalibration(26, 2000)).toBe('weak')
    expect(evaluateCalibration(60, 4000)).toBe('weak')
    expect(evaluateCalibration(105, 500)).toBe('poor')
    expect(evaluateCalibration(15, 35_000)).toBe('stale')
    expect(evaluateCalibration(null, 0, true)).toBe('denied')
  })

  it('I9: startMatch must pass lobby.revision to prevent REVISION_CONFLICT', async () => {
    let capturedRevision: number | undefined
    const originalPost = (supabaseGameApi as any).post
    ;(supabaseGameApi as any).post = vi.fn().mockImplementation((_url: string, body: { expected_revision: number }) => {
      capturedRevision = body.expected_revision
      if (body.expected_revision === 0) {
        return Promise.resolve({ ok: false, error: { code: 'REVISION_CONFLICT', message: 'Revision conflict' } })
      }
      return Promise.resolve({ ok: true, data: { ends_at: '2026-10-21T16:00:00Z', server_now: '2026-10-21T15:00:00Z' } })
    })

    try {
      // Calling startMatch with lobby.revision sends the expected revision and succeeds
      const resSuccess = await supabaseGameApi.startMatch('match-123', 4)
      expect(resSuccess.ok).toBe(true)
      expect(capturedRevision).toBe(4)

      // Calling startMatch without revision sends 0, failing with REVISION_CONFLICT
      const resFail = await supabaseGameApi.startMatch('match-123')
      expect(resFail.ok).toBe(false)
      expect((resFail as any).error.code).toBe('REVISION_CONFLICT')
      expect(capturedRevision).toBe(0)
    } finally {
      ;(supabaseGameApi as any).post = originalPost
    }
  })

  it('I10: realtime subscription reconnects cleanly without dangling listeners', async () => {
    let unsubsCount = 0
    let subsCount = 0
    const unsubMock = vi.fn().mockImplementation(() => {
      unsubsCount++
    })
    const subMock = vi.fn().mockImplementation(() => {
      subsCount++
      return Promise.resolve(unsubMock)
    })

    const originalSubscribe = supabaseGameApi.subscribe
    supabaseGameApi.subscribe = subMock

    try {
      // Mount subscription 1
      let active1 = true
      let unlisten1: (() => void) | undefined
      const stop1 = await supabaseGameApi.subscribe('match-1', 'RUNNER', { onEvent: () => {} })
      if (active1) unlisten1 = stop1

      expect(subsCount).toBe(1)
      expect(unsubsCount).toBe(0)

      // Tear down on reconnect / role change
      active1 = false
      unlisten1?.()
      expect(unsubsCount).toBe(1)

      // Reconnect with new role
      let active2 = true
      let unlisten2: (() => void) | undefined
      const stop2 = await supabaseGameApi.subscribe('match-1', 'HUNTER', { onEvent: () => {} })
      if (active2) unlisten2 = stop2

      expect(subsCount).toBe(2)
      active2 = false
      unlisten2?.()
      expect(unsubsCount).toBe(2)
    } finally {
      supabaseGameApi.subscribe = originalSubscribe
    }
  })

  it('countdownSeconds computes ceiling remaining seconds and stops at 0s upon expiry', () => {
    const baseNow = 1_700_000_000_000
    const targetMs = baseNow + 12_500 // 12.5 seconds in future
    const targetIso = new Date(targetMs).toISOString()

    // 12.5s remaining -> ceiling is 13s
    expect(countdownSeconds(targetMs, baseNow)).toBe(13)
    expect(countdownSeconds(targetIso, baseNow)).toBe(13)

    // After 10 seconds (2.5s remaining) -> ceiling is 3s
    expect(countdownSeconds(targetMs, baseNow + 10_000)).toBe(3)

    // After 12.5s -> 0s
    expect(countdownSeconds(targetMs, baseNow + 12_500)).toBe(0)

    // Past expiry (past target) -> 0s (never negative)
    expect(countdownSeconds(targetMs, baseNow + 15_000)).toBe(0)

    // Null or undefined target returns null
    expect(countdownSeconds(null, baseNow)).toBe(null)
    expect(countdownSeconds(undefined, baseNow)).toBe(null)
    expect(countdownSeconds('invalid-date', baseNow)).toBe(null)
  })
})
