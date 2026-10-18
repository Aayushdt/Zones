import { projectEventForRole } from './payloads.ts'
type JsonObject = Record<string, unknown>

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

const fail = (status: number, code: string, message: string): Response =>
  Response.json({ error: { code, message } }, { status, headers: corsHeaders })

const ok = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: corsHeaders })

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing server configuration: ${name}`)
  return value
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytea(bytes: Uint8Array): string {
  return `\\x${hex(bytes)}`
}

async function hmac(secret: string, value: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  const stableBytes = new Uint8Array(value.byteLength)
  stableBytes.set(value)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', stableBytes.buffer as ArrayBuffer))
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function makeJoinCode(): string {
  return Array.from(randomBytes(6), (byte) => codeAlphabet[byte & 31]).join('')
}

async function authenticate(request: Request): Promise<{ id: string } | null> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const response = await fetch(`${requiredEnv('SUPABASE_URL')}/auth/v1/user`, {
    headers: {
      apikey: requiredEnv('SUPABASE_ANON_KEY'),
      authorization,
    },
  })
  if (!response.ok) return null
  const user = await response.json() as { id?: unknown }
  return typeof user.id === 'string' ? { id: user.id } : null
}

async function callRpc(name: string, args: JsonObject): Promise<JsonObject> {
  const baseUrl = requiredEnv('SUPABASE_URL')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  })
  if (!response.ok) return { error: 'INTERNAL' }
  const result = await response.json()
  return result && typeof result === 'object' && !Array.isArray(result)
    ? result as JsonObject
    : { error: 'INTERNAL' }
}

function rpcResponse(result: JsonObject): Response {
  const error = result.error
  if (typeof error !== 'string') return ok(result)
  if (error === 'INVALID_CONFIG' || error === 'INVALID_INPUT' || error === 'INVALID_ROLE') {
    return fail(400, error, 'Check the supplied lobby details and try again.')
  }
  if (error === 'INVALID_CODE') return fail(404, error, 'That private lobby code is invalid or expired.')
  if (error === 'RATE_LIMITED') return fail(429, error, 'Too many attempts. Wait a little and try again.')
  if (error === 'LOBBY_FULL') return fail(409, error, 'This lobby already has 12 players.')
  if (error === 'MATCH_STARTED') return fail(409, error, 'This match has already started.')
  if (error === 'ALREADY_MEMBER') return fail(409, error, 'This guest is already in the lobby.')
  if (error === 'INVALID_STATE') return fail(409, error, 'This action is not available in the current match state.')
  if (error === 'NOT_MEMBER') return fail(403, error, 'Join this private lobby before changing it.')
  if (error === 'TEAM_NOT_SELECTED') return fail(409, error, 'Choose a team before this match can sync.')
  if (error === 'NOT_FOUND') return fail(404, error, 'The lobby could not be found.')
  return fail(503, 'INTERNAL', 'The game service could not complete this request.')
}

async function parseBody(request: Request): Promise<JsonObject | null> {
  try {
    const raw = await request.arrayBuffer()
    if (raw.byteLength > 16_384) return null
    const body: unknown = JSON.parse(new TextDecoder().decode(raw))
    return body !== null && typeof body === 'object' && !Array.isArray(body) ? body as JsonObject : null
  } catch {
    return null
  }
}

function isText(value: unknown, max = 24): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
}

function numberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (request.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST for game actions.')

  let user: { id: string } | null
  try {
    user = await authenticate(request)
  } catch {
    return fail(503, 'AUTH_UNAVAILABLE', 'Guest authentication is temporarily unavailable.')
  }
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Start a guest session and try again.')

  const body = await parseBody(request)
  if (!body) return fail(400, 'INVALID_JSON', 'Send a JSON object no larger than 16 KB.')

  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/functions\/v1\/api/, '').replace(/^\/api/, '')

  try {
    if (path === '/lobbies') {
      if (!isText(body.display_name) || !numberIn(body.round_seconds, 600, 10800)
        || !numberIn(body.head_start_seconds, 0, 900) || !numberIn(body.ping_seconds, 60, 1800)
        || (body.zone_diameter_m !== undefined
          && (!numberIn(body.zone_diameter_m, 400, 3000) || body.zone_diameter_m % 2 !== 0))) {
        return fail(400, 'INVALID_CONFIG', 'Check the name, duration, head start, ping, and zone size.')
      }
      const zoneLat = body.zone_lat
      const zoneLon = body.zone_lon
      if ((zoneLat === undefined) !== (zoneLon === undefined)
        || (zoneLat !== undefined && (typeof zoneLat !== 'number' || zoneLat < -90 || zoneLat > 90
          || typeof zoneLon !== 'number' || zoneLon < -180 || zoneLon > 180))) {
        return fail(400, 'INVALID_CONFIG', 'Choose both valid zone coordinates or leave the zone off.')
      }
      const address = request.headers.get('cf-connecting-ip')
        ?? request.headers.get('x-real-ip')
        ?? request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
        ?? user.id
      const rateKey = await hmac(requiredEnv('RATE_LIMIT_HASH_SECRET'), `create:${address}`)
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const code = makeJoinCode()
        const codeHash = await hmac(requiredEnv('JOIN_CODE_HMAC_SECRET'), code)
        const capHash = await sha256(randomBytes(32))
        const result = await callRpc('xzones_create_lobby', {
          p_auth_user_id: user.id,
          p_bucket_key: bytea(rateKey),
          p_display_name: body.display_name.trim(),
          p_code_hash: bytea(codeHash),
          p_session_cap_hash: bytea(capHash),
          p_round_seconds: body.round_seconds,
          p_head_start_seconds: body.head_start_seconds,
          p_ping_seconds: body.ping_seconds,
          p_zone_lat: zoneLat ?? null,
          p_zone_lon: zoneLon ?? null,
          p_zone_diameter_m: body.zone_diameter_m ?? null,
        })
        if (result.error !== 'CODE_COLLISION') return rpcResponse({ ...result, code })
      }
      return fail(503, 'RETRY_CREATE', 'Could not reserve a lobby code. Please try again.')
    }

    if (path === '/lobbies/join') {
      if (!isText(body.display_name) || typeof body.code !== 'string'
        || !/^[A-HJ-NP-Z2-9]{6}$/i.test(body.code.trim())) {
        return fail(404, 'INVALID_CODE', 'That private lobby code is invalid or expired.')
      }
      const normalizedCode = body.code.trim().toUpperCase()
      const address = request.headers.get('cf-connecting-ip')
        ?? request.headers.get('x-real-ip')
        ?? request.headers.get('x-forwarded-for')?.split(',').pop()?.trim()
        ?? user.id
      const rateSecret = requiredEnv('RATE_LIMIT_HASH_SECRET')
      const userBucket = await hmac(rateSecret, `join-user:${user.id}`)
      const failedBucket = await hmac(rateSecret, `join-failed:${address}`)
      const codeHash = await hmac(requiredEnv('JOIN_CODE_HMAC_SECRET'), normalizedCode)
      const capHash = await sha256(randomBytes(32))
      return rpcResponse(await callRpc('xzones_join_lobby', {
        p_auth_user_id: user.id,
        p_user_bucket_key: bytea(userBucket),
        p_failed_bucket_key: bytea(failedBucket),
        p_display_name: body.display_name.trim(),
        p_code_hash: bytea(codeHash),
        p_session_cap_hash: bytea(capHash),
      }))
    }

    const syncMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/sync$/i)
    if (syncMatch) {
      const lastRevision = body.last_revision === undefined ? 0 : body.last_revision
      if (!numberIn(lastRevision, 0, Number.MAX_SAFE_INTEGER)) {
        return fail(400, 'INVALID_INPUT', 'last_revision must be a non-negative integer.')
      }
      const result = await callRpc('xzones_sync_match', {
        p_auth_user_id: user.id,
        p_match_id: syncMatch[1],
        p_last_revision: lastRevision,
      })
      if (typeof result.error === 'string') return rpcResponse(result)
      if (result.role !== 'HUNTER' && result.role !== 'RUNNER') {
        return fail(409, 'TEAM_NOT_SELECTED', 'Choose a team before this match can sync.')
      }

      const role = result.role
      const revision = typeof result.revision === 'number' ? result.revision : null
      const serverNow = typeof result.server_now === 'string' ? result.server_now : null
      const matchState = typeof result.state === 'string' ? result.state : null
      const counts = result.active_counts
      if (revision === null || serverNow === null || matchState === null
        || counts === null || typeof counts !== 'object' || Array.isArray(counts)) {
        return fail(503, 'INTERNAL', 'The game service could not complete this request.')
      }

      const events = []
      const matchEvent = projectEventForRole(role, {
        event_id: `match:${syncMatch[1]}:revision:${revision}:state`,
        match_id: syncMatch[1], revision, server_at: serverNow, type: 'match.state',
        data: { state: matchState, server_now: serverNow, ends_at: result.ends_at, active_counts: counts },
      })
      if (!matchEvent) return fail(503, 'INTERNAL', 'The game service could not complete this request.')
      events.push(matchEvent)

      if (role === 'HUNTER' && Array.isArray(result.due_pings)) {
        for (const ping of result.due_pings) {
          const pingData = ping !== null && typeof ping === 'object' ? ping as JsonObject : null
          if (!pingData) continue
          const runnerId = typeof pingData.runner_id === 'string' ? pingData.runner_id : 'unknown'
          const pingIndex = typeof pingData.ping_index === 'number' ? pingData.ping_index : -1
          const projected = projectEventForRole(role, {
            event_id: `match:${syncMatch[1]}:runner:${runnerId}:ping:${pingIndex}`,
            match_id: syncMatch[1], revision, server_at: serverNow, type: 'hunter.runner_ping', data: pingData,
          })
          if (projected) events.push(projected)
        }
      }

      if (role === 'RUNNER' && result.runner_notice !== null && typeof result.runner_notice === 'object') {
        const notice = projectEventForRole(role, {
          event_id: `match:${syncMatch[1]}:revision:${revision}:runner-notice`,
          match_id: syncMatch[1], revision, server_at: serverNow,
          type: 'runner.location_revealed', data: result.runner_notice,
        })
        if (notice) events.push(notice)
      }

      return ok({
        role,
        state: matchState,
        server_now: serverNow,
        active_counts: matchEvent.data.active_counts,
        revision,
        events,
        next_ping_at: typeof result.next_ping_at === 'string' ? result.next_ping_at : null,
      })
    }

    const teamMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/team$/i)
    if (teamMatch) {
      if (typeof body.role !== 'string') return fail(400, 'INVALID_ROLE', 'Choose Hunter, Runner, or Random.')
      return rpcResponse(await callRpc('xzones_select_team', {
        p_auth_user_id: user.id, p_match_id: teamMatch[1], p_role: body.role.toUpperCase(),
      }))
    }

    const readyMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/ready$/i)
    if (readyMatch) {
      if (typeof body.ready !== 'boolean') return fail(400, 'INVALID_INPUT', 'Ready must be true or false.')
      return rpcResponse(await callRpc('xzones_set_ready', {
        p_auth_user_id: user.id, p_match_id: readyMatch[1], p_ready: body.ready,
      }))
    }

    return fail(501, 'NOT_IMPLEMENTED', 'This game action is not available yet.')
  } catch {
    return fail(503, 'INTERNAL', 'The game service could not complete this request.')
  }
}

if (import.meta.main) Deno.serve(handleRequest)
