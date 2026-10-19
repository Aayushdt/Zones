import { handleRequest } from '../../backend/supabase/functions/api/index.ts'

Deno.test('R-01 regression: stale team fix emits one deduplicable, coordinate-free location.stale event', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  const published: Array<Record<string, unknown> & { test_topic: string }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_cleanup')) return Response.json({ deleted_matches: 0 })
    if (url.endsWith('/rest/v1/rpc/xzones_resolve_match')) return Response.json({ state: 'ACTIVE' })
    if (url.includes('/rest/v1/players?') && url.includes('auth_user_id=')) return Response.json([{ id: 'player-1' }])
    if (url.includes('/rest/v1/players?')) return Response.json([
      { id: 'player-1', role: 'RUNNER' }, { id: 'hunter-1', role: 'HUNTER' },
    ])
    if (url.includes('/rest/v1/matches?')) return Response.json([{ revision: 3, state: 'ACTIVE', ends_at: '2026-10-19T01:00:00Z' }])
    if (url.endsWith('/rest/v1/rpc/xzones_match_controls')) return Response.json({ can_end: false, can_claim: false })
    if (url.endsWith('/rest/v1/rpc/xzones_sync_lobby')) return Response.json({ error: 'NOT_LOBBY' })
    if (url.endsWith('/rest/v1/rpc/xzones_match_clock')) return Response.json({
      state: 'ACTIVE', server_now: '2026-10-19T00:30:00Z', start_at: '2026-10-19T00:00:00Z',
      head_start_ends_at: '2026-10-19T00:03:00Z', ends_at: '2026-10-19T01:00:00Z', revision: 3,
    })
    if (url.endsWith('/rest/v1/rpc/xzones_team_positions')) return Response.json({
      role: 'RUNNER', own_player_id: 'player-1', positions: [{ player_id: 'teammate-1', display_name: 'Runner',
        team_role: 'RUNNER', lat: 1, lon: 2, accuracy_m: 10, captured_at: '2026-10-19T00:29:00Z', age_seconds: 60, is_stale: true }],
    })
    if (url.endsWith('/rest/v1/rpc/xzones_sync_match')) return Response.json({
      state: 'ACTIVE', server_now: '2026-10-19T00:30:00Z', ends_at: '2026-10-19T01:00:00Z', revision: 3,
      role: 'RUNNER', active_counts: { hunters: 1, runners: 2 }, own_player_id: 'player-1', own_status: 'ACTIVE',
      due_pings: [], runner_notice: null, next_ping_at: '2026-10-19T00:35:00Z',
    })
    if (url.includes('/realtime/v1/api/broadcast/')) {
      published.push({ ...(JSON.parse(String(init?.body)) as Record<string, unknown>), test_topic: decodeURIComponent(url.split('/broadcast/')[1]?.split('/events/')[0] ?? '') })
      return new Response(null, { status: 202 })
    }
    throw new Error(`Unexpected test URL: ${url}`)
  }
  try {
    const response = await handleRequest(new Request('http://unit.test/functions/v1/api/matches/63adbd40-4fc6-4d7c-b7a8-1f18f97496a3/sync', {
      method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ last_revision: 2 }),
    }))
    const body = await response.json()
    if (response.status !== 200) throw new Error(`Expected sync 200, got ${response.status}`)
    if (!body.events.some((event: { type: string; data: { is_stale?: boolean } }) => event.type === 'team.location_live' && event.data.is_stale === true)) {
      throw new Error('Expected stale teammate state in sync response for this fixture.')
    }
    const staleEvents = body.events.filter((event: { type: string }) => event.type === 'location.stale')
    if (staleEvents.length !== 1) throw new Error(`Expected one stale event in sync, got ${staleEvents.length}`)
    const staleEvent = staleEvents[0]
    const staleData = staleEvent.data as Record<string, unknown>
    if (staleData.player_id !== 'teammate-1' || staleData.is_stale !== true
      || 'lat' in staleData || 'lon' in staleData || 'accuracy_m' in staleData || 'captured_at' in staleData) {
      throw new Error('Stale event must identify the teammate and stale state without location data.')
    }
    const broadcasts = published.filter((event) => event.type === 'location.stale')
    if (broadcasts.length !== 1) throw new Error(`Expected one stale broadcast, got ${broadcasts.length}`)
    if (broadcasts[0].event_id !== staleEvent.event_id) throw new Error('Sync and Realtime event IDs must match for deduplication.')
    if (!broadcasts[0].test_topic.endsWith(':runner:player-1')) throw new Error('Stale status must be sent on the syncing team’s private player topic.')
    if (published.some((event) => event.type === 'location.stale' && event.test_topic.includes(':hunter:'))) {
      throw new Error('A team stale event must never be sent to the opposing team.')
    }
    if (String(broadcasts[0].match_id) !== '63adbd40-4fc6-4d7c-b7a8-1f18f97496a3') {
      throw new Error('Stale event must be scoped to the current match.')
    }
    if ('lat' in (broadcasts[0].data as Record<string, unknown>)
      || 'lon' in (broadcasts[0].data as Record<string, unknown>)) {
      throw new Error('Realtime stale broadcast must not contain coordinates.')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})
