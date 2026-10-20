import { handleRequest } from './index.ts'
import { publishRoleEvents } from './broadcast.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

Deno.test('low-frequency Realtime events are role-projected, private, and best-effort', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  const originalFetch = globalThis.fetch
  const sent: Array<{ url: string; headers: Headers; payload: Record<string, unknown> }> = []
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('/rest/v1/players?')) return Response.json([
      { id: 'f28cc076-14b5-4553-8d39-86daf01e4cc0', role: 'RUNNER' },
      { id: '18c5cc21-ded0-4a61-a3f4-5e3af52a867b', role: 'RUNNER' },
      { id: '6e69bd10-73ec-46ae-b497-846029e38b1f', role: 'HUNTER' },
    ])
    sent.push({ url: String(input), headers: new Headers(init?.headers), payload: JSON.parse(String(init?.body)) })
    return new Response(null, { status: 202 })
  }
  const matchId = '63adbd40-4fc6-4d7c-b7a8-1f18f97496a3'
  const events = [
    { event_id: 'state-1', match_id: matchId, revision: 7, server_at: '2026-10-19T00:00:00Z', type: 'match.state',
      data: { state: 'ACTIVE', server_now: '2026-10-19T00:00:00Z', ends_at: '2026-10-19T00:45:00Z', active_counts: { hunters: 1, runners: 2 } } },
    { event_id: 'ping-1', match_id: matchId, revision: 7, server_at: '2026-10-19T00:00:00Z', type: 'hunter.runner_ping',
      data: { runner_id: 'runner-1', status: 'OK', lat: 1, lon: 2, accuracy_m: 5, captured_at: '2026-10-19T00:00:00Z', ping_at: '2026-10-19T00:00:00Z', age_seconds: 0, ping_index: 0 } },
    { event_id: 'live-1', match_id: matchId, revision: 7, server_at: '2026-10-19T00:00:00Z', type: 'team.location_live',
      data: { player_id: 'runner-1', team_role: 'RUNNER', lat: 1, lon: 2, accuracy_m: 5, captured_at: '2026-10-19T00:00:00Z', age_seconds: 0, is_stale: false, sequence: 99 } },
  ]
  try {
    await publishRoleEvents(matchId, events)
    assert(sent.length === 6, 'should fan out each role-projected event to active players only')
    const topicOf = (message: { url: string }) => decodeURIComponent(new URL(message.url).pathname.split('/api/broadcast/')[1].split('/events/')[0])
    assert(sent.filter((message) => topicOf(message).includes(':hunter:')).length === 2, 'active Hunter topic should receive state and its scheduled ping')
    assert(sent.filter((message) => topicOf(message).includes(':runner:')).length === 4, 'active Runner topics should receive safe state and teammate location')
    assert(sent.every((message) => message.url.includes('?private=true') && message.url.includes('/events/xzones.event')), 'broadcasts must use the private shared event name')
    assert(sent.every((message) => message.headers.get('apikey') === 'server-test-key'), 'server API key must authenticate REST publishing')
    assert(!sent.some((message) => topicOf(message).includes(':runner:') && message.payload.type === 'hunter.runner_ping'), 'Runner topic must never receive the Hunter-only ping')
    assert((sent.find((message) => message.payload.type === 'team.location_live')?.payload.data as Record<string, unknown>).sequence === 99, 'team location event should preserve the fix sequence')
  } finally { globalThis.fetch = originalFetch }

  globalThis.fetch = async () => { throw new Error('Realtime unavailable') }
  try { await publishRoleEvents(matchId, events) } finally { globalThis.fetch = originalFetch }
})

Deno.test('api router handles CORS, method and guest-auth errors without leaking details', async () => {
  const options = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies', { method: 'OPTIONS' }))
  assert(options.status === 204, 'OPTIONS should return 204')

  const method = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies', { method: 'GET' }))
  assert(method.status === 405, 'non-POST method should return 405')

  const unauthorized = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  }))
  assert(unauthorized.status === 401, 'missing bearer token should return 401')
  const response = await unauthorized.json()
  assert(response.error.code === 'UNAUTHENTICATED', 'unauthorized response should use a safe error code')
})

Deno.test('create lobby returns a one-time code while sending only its HMAC to the database', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  Deno.env.set('JOIN_CODE_HMAC_SECRET', 'join-hmac-test-secret')
  Deno.env.set('RATE_LIMIT_HASH_SECRET', 'rate-hmac-test-secret')

  const originalFetch = globalThis.fetch
  let rpcBody: Record<string, unknown> | undefined
  let serviceKeySentToAuth = false
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    if (url.endsWith('/auth/v1/user')) {
      serviceKeySentToAuth = headers.get('apikey') === 'server-test-key'
      return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    }
    if (url.endsWith('/rest/v1/rpc/xzones_create_lobby')) {
      rpcBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({
        match_id: '63adbd40-4fc6-4d7c-b7a8-1f18f97496a3',
        player_id: 'f28cc076-14b5-4553-8d39-86daf01e4cc0',
        code_expires_at: '2026-10-18T13:00:00Z',
      })
    }
    throw new Error(`Unexpected test URL: ${url}`)
  }

  try {
    const result = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies', {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: 'Host', round_seconds: 2700, head_start_seconds: 180, ping_seconds: 300,
        zone_diameter_m: 1000,
      }),
    }))
    assert(result.status === 200, 'valid create should return 200')
    const response = await result.json()
    assert(/^[A-HJ-NP-Z2-9]{6}$/.test(response.code), 'host should receive six-character code')
    assert(response.match_id === '63adbd40-4fc6-4d7c-b7a8-1f18f97496a3', 'create response should carry match id')
    assert(typeof rpcBody?.p_code_hash === 'string' && rpcBody.p_code_hash.startsWith('\\x'), 'RPC should receive a bytea HMAC')
    assert(rpcBody?.code === undefined, 'raw code must not be sent to the database')
    assert(!serviceKeySentToAuth, 'service-role key must not be sent to Auth user validation')
    assert(new Headers({ authorization: 'Bearer guest-token' }).get('authorization') !== 'server-test-key', 'test bearer is separate from server key')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('lobby creation rejects odd zone diameters to avoid integer-radius truncation', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
  try {
    const response = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies', {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: 'Host', round_seconds: 2700, head_start_seconds: 180, ping_seconds: 300,
        zone_diameter_m: 401,
      }),
    }))
    assert(response.status === 400, 'odd diameter should be rejected')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('sync returns role-projected snapshots and generic Runner notices only', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  let requestedRole: 'HUNTER' | 'RUNNER' = 'RUNNER'
  let requestedStatus: 'ACTIVE' | 'TAGGED' = 'ACTIVE'
  let teamPositionsCalled = false
  const published: Array<{ topic: string; payload: Record<string, unknown> }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.includes('/rest/v1/players?')) return Response.json([
      { id: 'f28cc076-14b5-4553-8d39-86daf01e4cc0', role: requestedRole },
    ])
    if (url.includes('/rest/v1/matches?')) return Response.json([{ revision: 9, state: 'ACTIVE', ends_at: '2026-10-18T18:45:00Z' }])
    if (url.includes('/realtime/v1/api/broadcast/')) {
      const topic = decodeURIComponent(new URL(url).pathname.split('/api/broadcast/')[1].split('/events/')[0])
      published.push({ topic, payload: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return new Response(null, { status: 202 })
    }
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_cleanup')) return Response.json({ deleted_matches: 0 })
    if (url.endsWith('/rest/v1/rpc/xzones_resolve_match')) return Response.json({ state: 'ACTIVE' })
    if (url.endsWith('/rest/v1/rpc/xzones_zone_at')) return Response.json({ enabled: false })
    if (url.endsWith('/rest/v1/rpc/xzones_match_controls')) return Response.json({ can_end: false, can_claim: false })
    if (url.endsWith('/rest/v1/rpc/xzones_team_positions')) {
      teamPositionsCalled = true
      return Response.json({ role: requestedRole, own_player_id: 'own-player', positions: [
        { player_id: 'same-team', display_name: 'Teammate', team_role: requestedRole, lat: 25.6, lon: 85.1, accuracy_m: 5, captured_at: '2026-10-18T18:07:58Z', age_seconds: 2, is_stale: false },
        { player_id: 'opposing-player', display_name: 'Opponent', team_role: requestedRole === 'RUNNER' ? 'HUNTER' : 'RUNNER', lat: 99, lon: 99, accuracy_m: 1, captured_at: 't', age_seconds: 1, is_stale: false },
      ] })
    }
    if (url.endsWith('/rest/v1/rpc/xzones_sync_lobby')) return Response.json({ error: 'NOT_LOBBY' })
    if (url.endsWith('/rest/v1/rpc/xzones_match_clock')) return Response.json({
      state: 'ACTIVE', server_now: '2026-10-18T18:08:00.000Z', start_at: '2026-10-18T18:00:00.000Z',
      head_start_ends_at: '2026-10-18T18:03:00.000Z', ends_at: '2026-10-18T18:45:00.000Z', revision: 9,
    })
    if (url.endsWith('/rest/v1/rpc/xzones_sync_match')) {
      const args = JSON.parse(String(init?.body)) as Record<string, unknown>
      assert(args.p_last_revision === 4, 'sync should use the client revision cursor')
      return Response.json({
        state: 'ACTIVE', server_now: '2026-10-18T18:08:00.000Z', ends_at: '2026-10-18T18:45:00.000Z',
        revision: 9, role: requestedRole, active_counts: { hunters: 1, runners: 2 },
        own_player_id: 'own-player', own_status: requestedStatus,
        due_pings: [{
          runner_id: 'fake-runner-1', status: 'OK', lat: 12.3, lon: 45.6, accuracy_m: 5,
          captured_at: '2026-10-18T18:07:58.000Z', ping_at: '2026-10-18T18:08:00.000Z',
          age_seconds: 2, ping_index: 1, hunter_coordinates: { lat: 99, lon: 99 },
        }],
        runner_notice: { ping_index: 1, ping_at: '2026-10-18T18:08:00.000Z', hunter_positions: [{ lat: 98, lon: 98 }] },
        next_ping_at: '2026-10-18T18:13:00.000Z',
      })
    }
    throw new Error(`Unexpected test URL: ${url}`)
  }

  async function syncAs(role: 'HUNTER' | 'RUNNER', status: 'ACTIVE' | 'TAGGED' = 'ACTIVE') {
    requestedRole = role
    requestedStatus = status
    teamPositionsCalled = false
    return handleRequest(new Request('http://localhost/functions/v1/api/matches/63adbd40-4fc6-4d7c-b7a8-1f18f97496a3/sync', {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ last_revision: 4 }),
    }))
  }

  try {
    const runnerResponse = await syncAs('RUNNER')
    const runner = await runnerResponse.json()
    assert(runnerResponse.status === 200, 'Runner sync should succeed')
    assert(runner.events.every((event: { type: string }) => event.type !== 'hunter.runner_ping'), 'Runner must not get Hunter ping payloads')
    assert(runner.events.some((event: { type: string }) => event.type === 'runner.location_revealed'), 'Runner should get a generic ping notice')
    assert(runner.start_at && runner.head_start_ends_at, 'sync should include authoritative clock timestamps')
    assert(!JSON.stringify(runner).includes('hunter_positions'), 'Runner response leaked Hunter metadata')
    assert(!JSON.stringify(runner).includes('fake-runner-1'), 'Runner response leaked Hunter-only snapshot ID')
    assert(runner.own_player_id === 'own-player', 'sync should identify the current member for local map rendering')
    assert(runner.events.some((event: { type: string; data: { player_id?: string } }) => event.type === 'team.location_live' && event.data.player_id === 'same-team'), 'Runner should receive live Runner teammate positions')
    assert(!JSON.stringify(runner).includes('opposing-player'), 'Runner response leaked a Hunter teammate position')
    assert(runner.own_status === 'ACTIVE', 'sync should return the caller own active status')
    assert(published.some((event) => event.topic.endsWith(':runner:f28cc076-14b5-4553-8d39-86daf01e4cc0') && event.payload.type === 'runner.location_revealed'), 'Runner generic ping notice should publish to its player topic')
    assert(!published.some((event) => event.topic.includes(':runner:') && event.payload.type === 'hunter.runner_ping'), 'Hunter-only snapshots must not publish to a Runner topic')

    published.length = 0
    const hunterResponse = await syncAs('HUNTER')
    const hunter = await hunterResponse.json()
    assert(hunterResponse.status === 200, 'Hunter sync should succeed')
    assert(hunter.events.some((event: { type: string }) => event.type === 'hunter.runner_ping'), 'Hunter should get scheduled ping snapshot')
    assert(!JSON.stringify(hunter).includes('hunter_coordinates'), 'Hunter response leaked hidden extra metadata')
    assert(hunter.events.some((event: { type: string; data: { player_id?: string } }) => event.type === 'team.location_live' && event.data.player_id === 'same-team'), 'Hunter should receive live Hunter teammate positions')
    assert(!JSON.stringify(hunter).includes('opposing-player'), 'Hunter response leaked a Runner live position')
    assert(published.some((event) => event.topic.includes(':hunter:') && event.payload.type === 'hunter.runner_ping'), 'scheduled ping snapshots should publish to Hunter player topics')
    assert(!published.some((event) => event.topic.includes(':runner:') && event.payload.type === 'hunter.runner_ping'), 'Hunter snapshots must never publish to a Runner topic')

    const taggedResponse = await syncAs('RUNNER', 'TAGGED')
    const tagged = await taggedResponse.json()
    assert(taggedResponse.status === 200, 'tagged Runner sync should remain available')
    assert(tagged.own_status === 'TAGGED', 'sync should expose only the caller tagged status')
    assert(!teamPositionsCalled, 'tagged Runner must not trigger live team-location reads')
    assert(!tagged.events.some((event: { type: string }) => event.type === 'team.location_live'), 'tagged Runner must not receive live locations')
    assert(!teamPositionsCalled, 'tagged Runner must not trigger live team-location reads')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('join API maps invalid, full, started, and rate-limited codes to specific safe errors', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  Deno.env.set('JOIN_CODE_HMAC_SECRET', 'join-hmac-test-secret')
  Deno.env.set('RATE_LIMIT_HASH_SECRET', 'rate-hmac-test-secret')
  let rpcError = 'INVALID_CODE'
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_cleanup')) return Response.json({ deleted_matches: 0 })
    if (url.endsWith('/rest/v1/rpc/xzones_resolve_match')) return Response.json({ state: 'LOBBY' })
    if (url.endsWith('/rest/v1/rpc/xzones_join_lobby')) return Response.json({ error: rpcError })
    throw new Error(`Unexpected test URL: ${url}`)
  }

  try {
    const expected = [
      ['INVALID_CODE', 404],
      ['LOBBY_FULL', 409],
      ['MATCH_STARTED', 409],
      ['RATE_LIMITED', 429],
    ] as const
    for (const [code, status] of expected) {
      rpcError = code
      const response = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies/join', {
        method: 'POST',
        headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'ABC234', display_name: 'Guest' }),
      }))
      const body = await response.json()
      assert(response.status === status, `${code} should map to HTTP ${status}`)
      assert(body.error.code === code, `${code} should remain the safe client error code`)
      if (code === 'LOBBY_FULL') assert(body.error.message.includes('100'), 'full-lobby message should use the 100-player limit')
      assert(!JSON.stringify(body).includes('ABC234'), 'error response must not echo private join code')
    }
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('lobby sync returns only safe roster fields and start enforces revision and controller', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_cleanup')) return Response.json({ deleted_matches: 0 })
    if (url.endsWith('/rest/v1/rpc/xzones_resolve_match')) return Response.json({ state: 'LOBBY' })
    if (url.endsWith('/rest/v1/rpc/xzones_sync_lobby')) return Response.json({
      state: 'LOBBY', own_player_id: 'player-1', host_player_id: 'player-1', controller_player_id: 'player-1',
      revision: 8, role: null, active_counts: { runners: 0, hunters: 0 }, can_start: false,
      block_reason: 'NEEDS_TEAMS', players: [{ id: 'player-1', display_name: 'Guest', role: null, ready: false, status: 'ACTIVE', auth_user_id: 'must-not-leak' }],
    })
    if (url.endsWith('/rest/v1/rpc/xzones_start_match')) return Response.json({
      state: 'HEAD_START', start_at: '2026-10-18T18:00:00Z', head_start_ends_at: '2026-10-18T18:01:00Z',
      ends_at: '2026-10-18T18:45:00Z', revision: 9,
    })
    throw new Error(`Unexpected test URL: ${url}`)
  }
  try {
    const lobbyResponse = await handleRequest(new Request('http://localhost/functions/v1/api/matches/63adbd40-4fc6-4d7c-b7a8-1f18f97496a3/sync', {
      method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ last_revision: 0 }),
    }))
    const lobby = await lobbyResponse.json()
    assert(lobbyResponse.status === 200 && lobby.state === 'LOBBY', 'lobby sync should succeed')
    assert(!JSON.stringify(lobby).includes('auth_user_id'), 'lobby roster must not expose auth identities')
    assert(lobby.players[0].display_name === 'Guest' && lobby.host_player_id === 'player-1', 'lobby safe roster/host should be present')

    const started = await handleRequest(new Request('http://localhost/functions/v1/api/matches/63adbd40-4fc6-4d7c-b7a8-1f18f97496a3/start', {
      method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ expected_revision: 8 }),
    }))
    assert(started.status === 200 && (await started.json()).state === 'HEAD_START', 'valid host start should return server clock state')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('QR issue returns one-time opaque token while RPC receives only its SHA-256 hash', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  const originalFetch = globalThis.fetch
  const captured: { rpcArgs?: Record<string, unknown> } = {}
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_issue_qr')) {
      captured.rpcArgs = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ expires_at: '2026-10-18T13:01:00Z', server_now: '2026-10-18T13:00:00Z' })
    }
    throw new Error(`Unexpected test URL: ${url}`)
  }
  try {
    const response = await handleRequest(new Request('http://localhost/functions/v1/api/matches/63adbd40-4fc6-4d7c-b7a8-1f18f97496a3/qr', {
      method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' }, body: '{}',
    }))
    const body = await response.json()
    assert(response.status === 200, 'QR issue should succeed')
    assert(typeof body.token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(body.token), 'token should be 256-bit base64url')
    assert(!JSON.stringify(captured.rpcArgs).includes(body.token), 'database must never receive the raw QR token')
    assert(typeof captured.rpcArgs?.p_token_hash === 'string' && String(captured.rpcArgs.p_token_hash).length === 66, 'database should receive a 32-byte hash')
    const tokenBytes = Uint8Array.from(atob(body.token.replace(/-/g, '+').replace(/_/g, '/') + '='), (character) => character.charCodeAt(0))
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', tokenBytes))
    const expectedHash = `\\x${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
    assert(captured.rpcArgs?.p_token_hash === expectedHash, 'RPC hash must be SHA-256 of the returned token')
  } finally { globalThis.fetch = originalFetch }
})

Deno.test('QR scan hashes the presented token and rejects malformed tokens before database access', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  const originalFetch = globalThis.fetch
  const captured: { rpcArgs?: Record<string, unknown> } = {}
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_scan_qr')) {
      captured.rpcArgs = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ accepted: true, state: 'ACTIVE' })
    }
    throw new Error(`Unexpected test URL: ${url}`)
  }
  const request = (token: string) => new Request('http://localhost/functions/v1/api/matches/63adbd40-4fc6-4d7c-b7a8-1f18f97496a3/qr/scan', {
    method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' }, body: JSON.stringify({ token }),
  })
  try {
    const invalid = await handleRequest(request('not-a-token'))
    assert(invalid.status === 404, 'malformed token should be rejected')
    assert(captured.rpcArgs === undefined, 'malformed token must not reach database')
    const token = 'A'.repeat(43)
    const result = await handleRequest(request(token))
    assert(result.status === 200, 'well-formed token should reach scanner RPC')
    const args = captured.rpcArgs as Record<string, unknown> | undefined
    assert(args?.token === undefined, 'database args must not include raw token')
    assert(typeof args?.p_token_hash === 'string', 'database args must contain token hash')
    assert(!JSON.stringify(await result.json()).includes(token), 'response must not echo token')
  } finally { globalThis.fetch = originalFetch }
})

Deno.test('Runner fallback calls the tag-confirm RPC and exposes only its result', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  const originalFetch = globalThis.fetch
  let rpcCalled = false
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_confirm_tag')) { rpcCalled = true; return Response.json({ accepted: true, state: 'ACTIVE' }) }
    throw new Error(`Unexpected test URL: ${url}`)
  }
  try {
    const response = await handleRequest(new Request('http://localhost/functions/v1/api/matches/63adbd40-4fc6-4d7c-b7a8-1f18f97496a3/tag/confirm', {
      method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' }, body: '{}',
    }))
    assert(response.status === 200 && rpcCalled, 'fallback should call tag RPC')
    assert((await response.json()).accepted === true, 'fallback response should contain safe acceptance state')
  } finally { globalThis.fetch = originalFetch }
})

Deno.test('leave, claim, end, and result routes call only their server-side lifecycle RPCs', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  const originalFetch = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    const name = url.split('/').pop() ?? ''
    if (name.startsWith('xzones_')) calls.push(name)
    if (url.endsWith('/rpc/xzones_cleanup')) return Response.json({ deleted_matches: 0 })
    if (url.endsWith('/rpc/xzones_leave_match')) return Response.json({ accepted: true, state: 'ACTIVE', claim_expires_at: '2026-10-18T13:05:00Z' })
    if (url.endsWith('/rpc/xzones_claim_controller')) return Response.json({ accepted: true, controller_player_id: 'player-new' })
    if (url.endsWith('/rpc/xzones_end_match')) return Response.json({ state: 'ENDED', winner: null, end_reason: 'HOST_END' })
    if (url.endsWith('/rpc/xzones_match_result')) return Response.json({ winner: null, end_reason: 'HOST_END', ended_at: '2026-10-18T13:00:00Z', duration_seconds: 120, tag_count: 1 })
    throw new Error(`Unexpected test URL: ${url} ${String(init?.body ?? '')}`)
  }
  const request = (path: string, body: Record<string, unknown> = {}) => new Request(`http://localhost/functions/v1/api/matches/63adbd40-4fc6-4d7c-b7a8-1f18f97496a3/${path}`, {
    method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  try {
    const leave = await handleRequest(request('leave'))
    assert(leave.status === 200 && (await leave.json()).claim_expires_at, 'leave should return claim-window server time')
    const claim = await handleRequest(request('host-claim'))
    assert(claim.status === 200 && (await claim.json()).controller_player_id === 'player-new', 'claim should return new controller')
    const end = await handleRequest(request('end', { reason: 'HOST_END' }))
    assert(end.status === 200 && (await end.json()).duration_seconds === 120, 'end should return persisted result')
    const result = await handleRequest(request('result'))
    assert(result.status === 200 && (await result.json()).end_reason === 'HOST_END', 'result should return safe outcome')
    assert(calls.join(',') === 'xzones_leave_match,xzones_claim_controller,xzones_end_match,xzones_match_result,xzones_cleanup,xzones_match_result', 'lifecycle paths should use the expected RPCs')
  } finally { globalThis.fetch = originalFetch }
})

Deno.test('location route validates before RPC, stores through the server, and never echoes coordinates', async () => {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  const originalFetch = globalThis.fetch
  const captured: Record<string, unknown>[] = []
  const broadcasts: Array<{ topic: string; event: Record<string, unknown> }> = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.includes('/rest/v1/matches?')) return Response.json([{ revision: 12, state: 'ACTIVE', ends_at: '2026-10-18T18:45:00Z', controller_player_id: 'player-1', claim_expires_at: null }])
    if (url.includes('/rest/v1/players?')) return Response.json([{ id: 'f28cc076-14b5-4553-8d39-86daf01e4cc0', display_name: 'Runner One', role: 'RUNNER' }])
    if (url.includes('/rest/v1/latest_fix?')) return Response.json([{ player_id: 'player-1', lat: 25.6, lon: 85.1, accuracy_m: 5, captured_at: '2026-10-18T12:59:55Z', sequence: 7 }])
    if (url.includes('/realtime/v1/api/broadcast/')) {
      const topic = decodeURIComponent(new URL(url).pathname.split('/api/broadcast/')[1].split('/events/')[0])
      broadcasts.push({ topic, event: JSON.parse(String(init?.body)) as Record<string, unknown> })
      return new Response(null, { status: 202 })
    }
    if (url.endsWith('/rpc/xzones_resolve_match')) return Response.json({ state: 'ACTIVE' })
    if (url.endsWith('/rpc/xzones_zone_at')) return Response.json({ enabled: false })
    if (url.endsWith('/rpc/xzones_update_location')) {
      captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return Response.json({ accepted: true, stale: false, player_id: 'player-1', server_now: '2026-10-18T13:00:00Z' })
    }
    throw new Error(`Unexpected test URL: ${url}`)
  }
  const makeRequest = (body: Record<string, unknown>) => new Request('http://localhost/functions/v1/api/matches/63adbd40-4fc6-4d7c-b7a8-1f18f97496a3/location', {
    method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  try {
    const invalid = await handleRequest(makeRequest({ lat: 95, lon: 85, accuracy_m: 5, captured_at: '2026-10-18T13:00:00Z', sequence: 1 }))
    assert(invalid.status === 400 && captured.length === 0, 'invalid coordinates must not reach location storage')
    const response = await handleRequest(makeRequest({ lat: 25.6, lon: 85.1, accuracy_m: 5, captured_at: '2026-10-18T13:00:00Z', sequence: 7 }))
    const ack = await response.json()
    assert(response.status === 200 && ack.accepted === true, 'valid location should be acknowledged')
    assert(captured[0]?.p_sequence === 7, 'location sequence should reach the storage RPC')
    assert(ack.lat === undefined && ack.lon === undefined, 'acknowledgement must never echo coordinates')
    assert(broadcasts.length === 1 && broadcasts[0].topic.endsWith(':runner:f28cc076-14b5-4553-8d39-86daf01e4cc0'), 'accepted fix should publish only to the verified Runner player topic')
    assert(broadcasts[0].event.type === 'team.location_live' && broadcasts[0].event.server_at === '2026-10-18T13:00:00Z', 'broadcast should use the event type and server acknowledgement time')
    assert((broadcasts[0].event.data as Record<string, unknown>).captured_at === '2026-10-18T12:59:55Z', 'broadcast must use the server-stored clamped timestamp')
    assert((broadcasts[0].event.data as Record<string, unknown>).sequence === 7, 'location event should include sequence for dedupe')
  } finally { globalThis.fetch = originalFetch }
})
