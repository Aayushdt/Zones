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
