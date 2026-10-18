import { handleRequest } from './index.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

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
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_sync_match')) {
      const args = JSON.parse(String(init?.body)) as Record<string, unknown>
      assert(args.p_last_revision === 4, 'sync should use the client revision cursor')
      return Response.json({
        state: 'ACTIVE', server_now: '2026-10-18T18:08:00.000Z', ends_at: '2026-10-18T18:45:00.000Z',
        revision: 9, role: requestedRole, active_counts: { hunters: 1, runners: 2 },
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

  async function syncAs(role: 'HUNTER' | 'RUNNER') {
    requestedRole = role
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
    assert(!JSON.stringify(runner).includes('hunter_positions'), 'Runner response leaked Hunter metadata')
    assert(!JSON.stringify(runner).includes('fake-runner-1'), 'Runner response leaked Hunter-only snapshot ID')

    const hunterResponse = await syncAs('HUNTER')
    const hunter = await hunterResponse.json()
    assert(hunterResponse.status === 200, 'Hunter sync should succeed')
    assert(hunter.events.some((event: { type: string }) => event.type === 'hunter.runner_ping'), 'Hunter should get scheduled ping snapshot')
    assert(!JSON.stringify(hunter).includes('hunter_coordinates'), 'Hunter response leaked hidden extra metadata')
  } finally {
    globalThis.fetch = originalFetch
  }
})
