import { projectEventForRole } from '../../packages/game-core/src/payloads.ts'

const forbidden = new Set([
  'hunter_id', 'hunter_positions', 'hunter_lat', 'hunter_lon', 'opponent_distance',
  'direction', 'bearing', 'latest_fix', 'live_runner_position', 'runner_route',
  'auth_user_id', 'session_cap_hash', 'code_hash', 'token_hash', 'session_capability',
])

function assertNoForbiddenFields(value: unknown, path = 'payload'): void {
  if (Array.isArray(value)) return value.forEach((item, index) => assertNoForbiddenFields(item, `${path}[${index}]`))
  if (value === null || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    if (forbidden.has(key)) throw new Error(`${path} leaked ${key}`)
    assertNoForbiddenFields(nested, `${path}.${key}`)
  }
}

Deno.test('review leak checker catches an injected leak fixture and accepts projected payloads', () => {
  let caught = false
  try {
    assertNoForbiddenFields({ event: { data: { runner_id: 'r1', hunter_lat: 42.1 } } })
  } catch (error) {
    caught = error instanceof Error && error.message.includes('hunter_lat')
  }
  if (!caught) throw new Error('The checker did not detect the deliberately leaking hunter_lat fixture.')

  for (const role of ['HUNTER', 'RUNNER'] as const) {
    const safe = projectEventForRole(role, {
      event_id: 'review-event', match_id: 'review-match', revision: 1,
      server_at: '2026-10-19T00:00:00Z', type: 'match.state',
      data: { state: 'ACTIVE', server_now: '2026-10-19T00:00:00Z', ends_at: '2026-10-19T01:00:00Z',
        active_counts: { hunters: 1, runners: 2 }, hunter_lat: 42.1, latest_fix: { lat: 42.1, lon: -71.2 } },
    })
    if (!safe) throw new Error(`${role} safe state fixture was rejected.`)
    assertNoForbiddenFields(safe, `${role}.match.state`)
    if ('hunter_lat' in safe.data || 'latest_fix' in safe.data) throw new Error('Projector preserved the injected field.')
  }
})
