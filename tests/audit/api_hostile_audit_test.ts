import { handleRequest } from '../../backend/supabase/functions/api/index.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function setupEnv() {
  Deno.env.set('SUPABASE_URL', 'https://unit.test')
  Deno.env.set('SUPABASE_ANON_KEY', 'public-test-key')
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'server-test-key')
  Deno.env.set('JOIN_CODE_HMAC_SECRET', 'join-hmac-test-secret')
  Deno.env.set('RATE_LIMIT_HASH_SECRET', 'rate-hmac-test-secret')
}

Deno.test('F-03: Create lobby accepts Ping Off (null or omitted)', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  let createArgs: Record<string, unknown> | undefined
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_cleanup')) return Response.json({ ok: true })
    if (url.endsWith('/rest/v1/rpc/xzones_create_lobby')) {
      createArgs = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ match_id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc', player_id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bd' })
    }
    throw new Error(`Unexpected URL: ${url}`)
  }

  try {
    // Spec section 19-25: "ping 1-30 min or Off (default 5)".
    // Client sends ping_seconds as null (Ping Off)
    const resNull = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies', {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: 'Host',
        round_seconds: 2700,
        head_start_seconds: 180,
        ping_seconds: null, // Ping Off
      }),
    }))
    assert(resNull.status === 200, `Ping Off null should succeed; got ${resNull.status}`)
    assert(createArgs?.p_ping_seconds === null, 'Ping Off should reach the create RPC as null')

    // Client omits ping_seconds (Ping Off)
    const resOmitted = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies', {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: 'Host',
        round_seconds: 2700,
        head_start_seconds: 180,
      }),
    }))
    assert(resOmitted.status === 200, `Omitted ping Off should succeed; got ${resOmitted.status}`)
    assert(createArgs?.p_ping_seconds === null, 'omitted ping should normalize to null')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('F-04: Create lobby rejects a head start at or beyond round duration', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  let rpcArgs: Record<string, unknown> | undefined
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_create_lobby')) {
      rpcArgs = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ match_id: 'm-1', player_id: 'p-1', code_expires_at: '2026-10-19T00:00:00Z' })
    }
    throw new Error(`Unexpected URL: ${url}`)
  }

  try {
    // 10 min round (600s), 15 min head start (900s): head start > round!
    const res = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies', {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: 'Host',
        round_seconds: 600,
        head_start_seconds: 900,
        ping_seconds: 300,
      }),
    }))
    assert(res.status === 400, `Inconsistent head start must be rejected; got ${res.status}`)
    assert(rpcArgs === undefined, 'Invalid configuration must not reach the database RPC')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('AUDIT A3: Started/full join responses are returned only behind the server IP/session limiter', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  let rpcToReturn: Record<string, unknown> = {}
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: '23b8b0de-1fc4-4d57-b9e0-a98a2bd349bc' })
    if (url.endsWith('/rest/v1/rpc/xzones_join_lobby')) {
      return Response.json(rpcToReturn)
    }
    throw new Error(`Unexpected URL: ${url}`)
  }

  try {
    // 1) Invalid code returns 404 INVALID_CODE
    rpcToReturn = { error: 'INVALID_CODE' }
    const r1 = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies/join', {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: 'Bob', code: 'ABCDEF' }),
    }))
    assert(r1.status === 404, 'invalid code returns 404')
    const b1 = await r1.json()
    assert(b1.error.code === 'INVALID_CODE', 'code is INVALID_CODE')

    // 2) The DB distinguishes this error, but every attempt consumes the same server-side IP bucket first.
    rpcToReturn = { error: 'MATCH_STARTED' }
    const r2 = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies/join', {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: 'Bob', code: 'ABCDEF' }),
    }))
    assert(r2.status === 409, 'started match returns 409')
    const b2 = await r2.json()
    assert(b2.error.code === 'MATCH_STARTED', 'code reveals match exists and has started')

    // 3) A full lobby is likewise checked only after server-side rate limiting.
    rpcToReturn = { error: 'LOBBY_FULL' }
    const r3 = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies/join', {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: 'Bob', code: 'ABCDEF' }),
    }))
    assert(r3.status === 409, 'full lobby returns 409')
    const b3 = await r3.json()
    assert(b3.error.code === 'LOBBY_FULL', 'code reveals match exists and is full')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('F-10: Location uploads return 429 and Retry-After when the DB throttles a player', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  let rpcCalls = 0
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-1' })
    if (url.endsWith('/rest/v1/rpc/xzones_cleanup')) return Response.json({})
    if (url.endsWith('/rest/v1/rpc/xzones_resolve_match')) return Response.json({ state: 'ACTIVE' })
    if (url.endsWith('/rest/v1/rpc/xzones_zone_at')) return Response.json({ enabled: false })
    if (url.endsWith('/rest/v1/rpc/xzones_update_location')) {
      rpcCalls += 1
      return rpcCalls === 1
        ? Response.json({ accepted: true, stale: false, player_id: 'p-1', server_now: new Date().toISOString() })
        : Response.json({ error: 'RATE_LIMITED', retry_after_seconds: 2 })
    }
    throw new Error(`Unexpected URL: ${url}`)
  }

  try {
    const upload = (sequence: number) => handleRequest(new Request('http://localhost/functions/v1/api/matches/11111111-1111-1111-1111-111111111111/location', {
        method: 'POST',
        headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
        body: JSON.stringify({
          lat: 51.5,
          lon: -0.1,
          accuracy_m: 10,
          captured_at: new Date().toISOString(),
          sequence,
        }),
      }))
    const accepted = await upload(1)
    const limited = await upload(2)
    assert(accepted.status === 200, 'first location upload is accepted')
    assert(limited.status === 429, 'throttled upload returns HTTP 429')
    assert(limited.headers.get('retry-after') === '2', '429 includes the database retry delay')
    const body = await limited.json()
    assert(body.error.code === 'RATE_LIMITED', '429 uses the stable rate-limit error code')
    assert(rpcCalls === 2, 'each attempt is checked by the atomic existing-row throttle')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('Step 10: lobby names reject empty, overlong, and control-character input before database lookup', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  let rpcCalls = 0
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-1' })
    if (url.endsWith('/rest/v1/rpc/xzones_cleanup')) return Response.json({ ok: true })
    if (url.endsWith('/rest/v1/rpc/xzones_create_lobby') || url.endsWith('/rest/v1/rpc/xzones_join_lobby')) rpcCalls += 1
    throw new Error(`Unexpected URL: ${url}`)
  }
  try {
    for (const display_name of ['', ' '.repeat(3), 'x'.repeat(25), 'name\nforged']) {
      const create = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies', {
        method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
        body: JSON.stringify({ display_name, round_seconds: 2700, head_start_seconds: 180, ping_seconds: null }),
      }))
      assert(create.status === 400, `unsafe create name should be rejected: ${JSON.stringify(display_name)}`)
      const join = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies/join', {
        method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
        body: JSON.stringify({ display_name, code: 'ABCDEF' }),
      }))
      assert(join.status === 400, `unsafe join name should be rejected: ${JSON.stringify(display_name)}`)
    }
    assert(rpcCalls === 0, 'invalid names must be rejected before RPCs')
  } finally { globalThis.fetch = originalFetch }
})

Deno.test('Step 10: join codes normalize case/whitespace and reject characters outside the code alphabet', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  const codeHashes: string[] = []
  let joinCalls = 0
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'user-1' })
    if (url.endsWith('/rest/v1/rpc/xzones_join_lobby')) {
      joinCalls += 1
      codeHashes.push((JSON.parse(String(init?.body)) as Record<string, string>).p_code_hash)
      return Response.json({ error: 'INVALID_CODE' })
    }
    throw new Error(`Unexpected URL: ${url}`)
  }
  try {
    for (const code of ['abc234', ' ABC234 ']) {
      const result = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies/join', {
        method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: 'Guest', code }),
      }))
      assert(result.status === 404, 'normalized unknown code must be indistinguishable from missing code')
    }
    assert(joinCalls === 2 && codeHashes[0] === codeHashes[1], 'case and surrounding whitespace must normalize before HMAC')
    for (const code of ['ABC01I', 'IIIIII', 'ABC2345']) {
      const invalid = await handleRequest(new Request('http://localhost/functions/v1/api/lobbies/join', {
        method: 'POST', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: 'Guest', code }),
      }))
      assert(invalid.status === 404, 'invalid alphabet or code length should return generic invalid code')
    }
    assert(joinCalls === 2, 'malformed codes must not reach the database lookup')
  } finally { globalThis.fetch = originalFetch }
})

Deno.test('AUDIT C2: Location endpoint rejects oversized body and invalid coordinates/accuracy', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ id: 'user-1' })

  try {
    const matchId = '11111111-1111-1111-1111-111111111111'

    // 1) Oversized body (>16KB)
    const hugeBody = JSON.stringify({ lat: 51.5, lon: -0.1, accuracy_m: 10, captured_at: new Date().toISOString(), sequence: 1, junk: 'x'.repeat(20000) })
    const rOversized = await handleRequest(new Request(`http://localhost/functions/v1/api/matches/${matchId}/location`, {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: hugeBody,
    }))
    assert(rOversized.status === 400, 'oversized body returns 400')
    const bOversized = await rOversized.json()
    assert(bOversized.error.code === 'INVALID_JSON', 'oversized body code is INVALID_JSON')

    // 2) Invalid lat (>90)
    const rLat = await handleRequest(new Request(`http://localhost/functions/v1/api/matches/${matchId}/location`, {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ lat: 91, lon: 0, accuracy_m: 10, captured_at: new Date().toISOString(), sequence: 1 }),
    }))
    assert(rLat.status === 400, 'invalid lat returns 400 INVALID_FIX')

    // 3) NaN coordinate
    const rNaN = await handleRequest(new Request(`http://localhost/functions/v1/api/matches/${matchId}/location`, {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: '{"lat": "NaN", "lon": 0, "accuracy_m": 10, "captured_at": "2026-10-19T00:00:00Z", "sequence": 1}',
    }))
    assert(rNaN.status === 400, 'NaN coordinate returns 400 INVALID_FIX')

    // 4) Negative accuracy
    const rAcc = await handleRequest(new Request(`http://localhost/functions/v1/api/matches/${matchId}/location`, {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ lat: 51, lon: 0, accuracy_m: -5, captured_at: new Date().toISOString(), sequence: 1 }),
    }))
    assert(rAcc.status === 400, 'negative accuracy returns 400 INVALID_FIX')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('AUDIT D1: QR scan fuzzing and token validation', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ id: 'user-1' })

  try {
    const matchId = '11111111-1111-1111-1111-111111111111'

    // Malformed token (not 43 base64url characters)
    const rShort = await handleRequest(new Request(`http://localhost/functions/v1/api/matches/${matchId}/qr/scan`, {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'too-short' }),
    }))
    assert(rShort.status === 404, 'short token rejected with 404 INVALID_QR before database')
    const bShort = await rShort.json()
    assert(bShort.error.code === 'INVALID_QR', 'code is INVALID_QR')

    // Token with special injection characters
    const rInj = await handleRequest(new Request(`http://localhost/functions/v1/api/matches/${matchId}/qr/scan`, {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ token: "'; DROP TABLE matches;--" }),
    }))
    assert(rInj.status === 404, 'injection token rejected with 404 INVALID_QR')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('AUDIT G1: Host-only endpoints reject non-host players', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'non-host-user' })
    if (url.endsWith('/rest/v1/rpc/xzones_start_match')) return Response.json({ error: 'NOT_HOST' })
    if (url.endsWith('/rest/v1/rpc/xzones_end_match')) return Response.json({ error: 'NOT_HOST' })
    throw new Error(`Unexpected URL: ${url}`)
  }

  try {
    const matchId = '11111111-1111-1111-1111-111111111111'

    // Non-host attempts to start match
    const rStart = await handleRequest(new Request(`http://localhost/functions/v1/api/matches/${matchId}/start`, {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ expected_revision: 0 }),
    }))
    assert(rStart.status === 403, 'non-host start returns 403 NOT_HOST')
    const bStart = await rStart.json()
    assert(bStart.error.code === 'NOT_HOST', 'error code is NOT_HOST')

    // Non-host attempts to end match
    const rEnd = await handleRequest(new Request(`http://localhost/functions/v1/api/matches/${matchId}/end`, {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'HOST_END' }),
    }))
    assert(rEnd.status === 403, 'non-host end returns 403 NOT_HOST')
    const bEnd = await rEnd.json()
    assert(bEnd.error.code === 'NOT_HOST', 'error code is NOT_HOST')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('AUDIT G2: Mass assignment attack on start endpoint fails', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  let rpcBody: Record<string, unknown> | undefined
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'host-user' })
    if (url.endsWith('/rest/v1/rpc/xzones_start_match')) {
      rpcBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ state: 'HEAD_START', start_at: '2026-10-19T00:00:00Z', revision: 1 })
    }
    throw new Error(`Unexpected URL: ${url}`)
  }

  try {
    const matchId = '11111111-1111-1111-1111-111111111111'
    // Attacker sends malicious properties trying to hijack match state
    await handleRequest(new Request(`http://localhost/functions/v1/api/matches/${matchId}/start`, {
      method: 'POST',
      headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        expected_revision: 0,
        state: 'ENDED',
        winner: 'RUNNER',
        ends_at: '2026-01-01T00:00:00Z',
        role: 'HUNTER',
      }),
    }))
    assert(rpcBody?.state === undefined, 'state must not be mass-assigned')
    assert(rpcBody?.winner === undefined, 'winner must not be mass-assigned')
    assert(rpcBody?.ends_at === undefined, 'ends_at must not be mass-assigned')
    assert(rpcBody?.role === undefined, 'role must not be mass-assigned')
  } finally {
    globalThis.fetch = originalFetch
  }
})

Deno.test('F-11: host can remove a player from an unstarted lobby', async () => {
  setupEnv()
  const originalFetch = globalThis.fetch
  let rpcArgs: Record<string, unknown> | undefined
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'host-user' })
    if (url.endsWith('/rest/v1/rpc/xzones_remove_lobby_player')) {
      rpcArgs = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ accepted: true, player_id: '22222222-2222-2222-2222-222222222222', state: 'LOBBY' })
    }
    throw new Error(`Unexpected URL: ${url}`)
  }

  try {
    const response = await handleRequest(new Request(
      'http://localhost/functions/v1/api/matches/11111111-1111-1111-1111-111111111111/players/22222222-2222-2222-2222-222222222222',
      { method: 'DELETE', headers: { authorization: 'Bearer guest-token', 'content-type': 'application/json' }, body: '{}' },
    ))
    assert(response.status === 200, `host player removal should succeed; got ${response.status}`)
    assert(rpcArgs?.p_auth_user_id === 'host-user', 'removal is authorized against the authenticated host')
    assert(rpcArgs?.p_match_id === '11111111-1111-1111-1111-111111111111', 'removal is scoped to the route match')
    assert(rpcArgs?.p_player_id === '22222222-2222-2222-2222-222222222222', 'removal is scoped to the route player')
  } finally {
    globalThis.fetch = originalFetch
  }
})
