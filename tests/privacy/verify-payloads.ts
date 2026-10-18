import { projectEventForRole } from '../../backend/supabase/functions/api/payloads.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const hiddenKeys = new Set([
  'hunter_id', 'hunter_position', 'hunter_positions', 'hunter_coordinates', 'hunter_lat', 'hunter_lon',
  'opponent', 'opponents', 'opponent_distance', 'distance', 'direction', 'bearing', 'marker_metadata',
  'latest_fix', 'live_runner_position', 'runner_live_position', 'runner_route', 'raw_fix', 'coordinates',
  'auth_user_id', 'session_cap_hash', 'code_hash', 'token_hash', 'session_capability', 'token', 'code',
])

function assertNoHiddenKeys(value: unknown, context: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoHiddenKeys(item, `${context}[${index}]`))
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    assert(!hiddenKeys.has(key), `${context} leaked hidden key: ${key}`)
    assertNoHiddenKeys(nested, `${context}.${key}`)
  }
}

const envelope = (type: string, data: Record<string, unknown>) => ({
  event_id: 'event-test',
  match_id: 'match-test',
  revision: 9,
  server_at: '2026-10-18T12:00:00.000Z',
  type,
  data,
})

const hostile = {
  hunter_id: 'hidden-hunter', hunter_positions: [{ lat: 1, lon: 2 }],
  distance: 10, direction: 'north', opponent_distance: 10,
  marker_metadata: { icon: 'secret' }, latest_fix: { lat: 3, lon: 4 },
  extra_metadata: { hidden: true },
}

const eventFixtures = [
  envelope('match.state', { state: 'ACTIVE', server_now: 't', ends_at: 't2', active_counts: { hunters: 2, runners: 5 }, ...hostile }),
  envelope('team.location_live', { team_role: 'RUNNER', player_id: 'runner-teammate', lat: 1, lon: 2, accuracy_m: 4, captured_at: 't', ...hostile }),
  envelope('team.location_live', { team_role: 'HUNTER', player_id: 'hunter-teammate', lat: 3, lon: 4, accuracy_m: 5, captured_at: 't', ...hostile }),
  envelope('hunter.runner_ping', { runner_id: 'runner-1', status: 'OK', lat: 5, lon: 6, accuracy_m: 5, captured_at: 't', ping_at: 't', age_seconds: 1, ping_index: 2, ...hostile }),
  envelope('hunter.runner_ping', { runner_id: 'runner-2', status: 'NO_FIX', lat: 0, lon: 0, accuracy_m: 2, captured_at: 't', ping_at: 't', age_seconds: 0, ping_index: 3, ...hostile }),
  envelope('hunter.runner_ping', { runner_id: 'runner-3', status: 'STALE', lat: 7, lon: 8, accuracy_m: 4, captured_at: 't', ping_at: 't', age_seconds: 61, ping_index: 4, ...hostile }),
  envelope('runner.location_revealed', { ping_index: 2, ping_at: 't', ...hostile }),
  envelope('match.started', { state: 'HEAD_START', start_at: 't', head_start_ends_at: 't2', ends_at: 't3', revision: 10, ...hostile }),
  envelope('tag.accepted', { runner_id: 'runner-1', status: 'TAGGED', method: 'QR', accepted_at: 't', ...hostile }),
  envelope('match.result', { winner: 'RUNNER', end_reason: 'TIME', ended_at: 't', ...hostile }),
  envelope('location.stale', { team_role: 'RUNNER', player_id: 'runner-1', is_stale: true, ...hostile }),
  envelope('lobby.created', { match_id: 'match-test', code_expires_at: 't', revision: 1, code: 'SECRET', ...hostile }),
  envelope('lobby.player_joined', { player_id: 'player-1', display_name: 'Guest', status: 'ACTIVE', auth_user_id: 'secret', ...hostile }),
  envelope('lobby.teams', { hunter_count: 2, runner_count: 5, own_role: 'HUNTER', can_start: true, ...hostile }),
  envelope('lobby.readiness', { player_id: 'player-1', ready: true, can_start: false, block_reason: 'WAITING', ...hostile }),
  envelope('player.left', { player_id: 'player-1', status: 'LEFT', ...hostile }),
  envelope('match.host_migrated', { controller_player_id: 'player-2', claim_expires_at: 't', ...hostile }),
  envelope('match.ended', { state: 'ENDED', winner: 'HUNTER', end_reason: 'HOST_END', ended_at: 't', ...hostile }),
]

Deno.test('captures every declared event for both roles and rejects hidden fields', () => {
  const captured: Record<string, unknown> = { HUNTER: {}, RUNNER: {} }
  for (const role of ['HUNTER', 'RUNNER'] as const) {
    for (const event of eventFixtures) {
      const projected = projectEventForRole(role, event)
      ;(captured[role] as Record<string, unknown>)[event.type] ??= []
      ;((captured[role] as Record<string, unknown>)[event.type] as unknown[]).push(projected)
      if (projected) assertNoHiddenKeys(projected, `${role}.${event.type}`)
    }
  }

  const hunters = captured.HUNTER as Record<string, unknown>
  const runners = captured.RUNNER as Record<string, unknown>
  assert((hunters['hunter.runner_ping'] as unknown[]).every(Boolean), 'Hunters should receive scheduled Runner ping events')
  assert((runners['hunter.runner_ping'] as unknown[]).every((payload) => payload === null), 'Runners must never receive Hunter ping payloads')
  assert((hunters['team.location_live'] as unknown[])[0] === null, 'Hunters must never receive live Runner positions')
  assert((runners['team.location_live'] as unknown[])[1] === null, 'Runners must never receive live Hunter positions')
  assert((runners['runner.location_revealed'] as unknown[]).every(Boolean), 'Runners should receive generic ping notices')
  assert((hunters['runner.location_revealed'] as unknown[]).every((payload) => payload === null), 'Hunters must not receive Runner-only notice payloads')
})

Deno.test('scheduled no-fix and stale snapshots discard coordinates', () => {
  for (const status of ['NO_FIX', 'STALE']) {
    const projected = projectEventForRole('HUNTER', envelope('hunter.runner_ping', {
      runner_id: 'runner-1', status, lat: 30, lon: 40, accuracy_m: 1, captured_at: 't',
      ping_at: 't', age_seconds: 70, ping_index: 1,
    }))
    assert(projected !== null, `${status} snapshot should be retained`)
    assert(projected.data.lat === null && projected.data.lon === null, `${status} snapshot leaked a fix`)
  }
})
