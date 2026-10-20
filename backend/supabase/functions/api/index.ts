import { projectEventForRole } from './payloads.ts'
import { publishRoleEvents } from './broadcast.ts'
import { isValidMatchConfig, isValidZoneConfig } from '../../../../packages/game-core/src/config.ts'
import { HIDE_AND_SEEK_CONFIG } from '../../../../packages/game-core/src/hideAndSeekConfig.ts'
type JsonObject = Record<string, unknown>

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, DELETE, OPTIONS',
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

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64UrlToken(token: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  try {
    const binary = atob(token.replace(/-/g, '+').replace(/_/g, '/') + '=')
    if (binary.length !== 32) return null
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch { return null }
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

async function matchContext(matchId: string): Promise<{ revision: number; state: string; ends_at: string | null; controller_player_id: string | null; claim_expires_at: string | null } | null> {
  try {
    const baseUrl = requiredEnv('SUPABASE_URL'), key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const query = new URLSearchParams({ select: 'revision,state,ends_at,controller_player_id,claim_expires_at', id: `eq.${matchId}`, limit: '1' })
    const response = await fetch(`${baseUrl}/rest/v1/matches?${query}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return null
    const rows = await response.json() as Array<{ revision?: unknown; state?: unknown; ends_at?: unknown; controller_player_id?: unknown; claim_expires_at?: unknown }>
    const row = rows[0]
    return row && typeof row.revision === 'number' && typeof row.state === 'string'
      ? { revision: row.revision, state: row.state, ends_at: typeof row.ends_at === 'string' ? row.ends_at : null,
        controller_player_id: typeof row.controller_player_id === 'string' ? row.controller_player_id : null,
        claim_expires_at: typeof row.claim_expires_at === 'string' ? row.claim_expires_at : null } : null
  } catch { return null }
}

async function ownPlayerId(matchId: string, authUserId: string): Promise<string | null> {
  try {
    const baseUrl = requiredEnv('SUPABASE_URL'), key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const query = new URLSearchParams({ select: 'id', match_id: `eq.${matchId}`, auth_user_id: `eq.${authUserId}`, limit: '1' })
    const response = await fetch(`${baseUrl}/rest/v1/players?${query}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return null
    const rows = await response.json() as Array<{ id?: unknown }>
    return typeof rows[0]?.id === 'string' ? rows[0].id : null
  } catch { return null }
}

async function publishLatestLocation(matchId: string, playerId: string, serverAt: string) {
  try {
    const baseUrl = requiredEnv('SUPABASE_URL'), key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const playerQuery = new URLSearchParams({ select: 'display_name,role', match_id: `eq.${matchId}`, id: `eq.${playerId}`, status: 'eq.ACTIVE', limit: '1' })
    const fixQuery = new URLSearchParams({ select: 'lat,lon,accuracy_m,captured_at,sequence', match_id: `eq.${matchId}`, player_id: `eq.${playerId}`, limit: '1' })
    const [playerResponse, fixResponse, context] = await Promise.all([
      fetch(`${baseUrl}/rest/v1/players?${playerQuery}`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(1_500) }),
      fetch(`${baseUrl}/rest/v1/latest_fix?${fixQuery}`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(1_500) }),
      matchContext(matchId),
    ])
    if (!playerResponse.ok || !fixResponse.ok || !context || !['HEAD_START', 'ACTIVE'].includes(context.state)) return
    const players = await playerResponse.json() as Array<{ display_name?: unknown; role?: unknown }>
    const fixes = await fixResponse.json() as Array<{ lat?: unknown; lon?: unknown; accuracy_m?: unknown; captured_at?: unknown; sequence?: unknown }>
    const player = players[0], fix = fixes[0]
    if (!player || !fix || typeof player.display_name !== 'string' || (player.role !== 'HUNTER' && player.role !== 'RUNNER')
      || typeof fix.lat !== 'number' || typeof fix.lon !== 'number' || typeof fix.accuracy_m !== 'number'
      || typeof fix.captured_at !== 'string' || typeof fix.sequence !== 'number' || !Number.isSafeInteger(fix.sequence)) return
    const age = Math.max(0, Math.floor((Date.parse(serverAt) - Date.parse(fix.captured_at)) / 1000))
    const event = eventEnvelope(matchId, context.revision, serverAt, 'team.location_live', {
      player_id: playerId, display_name: player.display_name, team_role: player.role,
      lat: fix.lat, lon: fix.lon, accuracy_m: fix.accuracy_m, captured_at: fix.captured_at,
      age_seconds: age, is_stale: age > 30, sequence: fix.sequence,
    }, `location:${playerId}:${fix.sequence}`)
    await publishRoleEvents(matchId, [event], [player.role])
  } catch {
    // Location storage succeeded; a missed ephemeral event is recovered by the next sync.
  }
}

function eventEnvelope(matchId: string, revision: number, serverAt: string, type: string, data: JsonObject, suffix: string) {
  return { event_id: `${matchId}:${revision}:${type}:${suffix}`, match_id: matchId, revision, server_at: serverAt, type, data }
}

async function publishActionEvent(matchId: string, type: string, data: JsonObject, suffix: string, serverAt?: string) {
  const context = await matchContext(matchId)
  if (!context) return
  const at = serverAt ?? new Date().toISOString()
  const event = eventEnvelope(matchId, context.revision, at, type, data, suffix)
  await publishRoleEvents(matchId, [event])
}

async function publishLobbyEvent(authUserId: string, matchId: string, type: string, data: JsonObject, suffix: string) {
  try {
    const snapshot = await callRpc('xzones_sync_lobby', { p_auth_user_id: authUserId, p_match_id: matchId })
    if (snapshot.error || snapshot.state !== 'LOBBY' || typeof snapshot.revision !== 'number') return
    const eventData = type === 'lobby.readiness' && typeof snapshot.own_player_id === 'string'
      ? { ...data, player_id: snapshot.own_player_id } : data
    const envelope = eventEnvelope(matchId, snapshot.revision, new Date().toISOString(), type, eventData, suffix)
    await publishRoleEvents(matchId, [envelope])
  } catch {
    // Read-after-write publication metadata is best-effort; the committed lobby mutation stays successful.
  }
}

async function publishTagResult(matchId: string, tagResult: JsonObject) {
  if (tagResult.accepted !== true || typeof tagResult.tag_id !== 'string') return
  try {
    const baseUrl = requiredEnv('SUPABASE_URL'), key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const query = new URLSearchParams({ select: 'runner_id,method,accepted_at', id: `eq.${tagResult.tag_id}`, match_id: `eq.${matchId}`, limit: '1' })
    const response = await fetch(`${baseUrl}/rest/v1/tags?${query}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return
    const rows = await response.json() as Array<{ runner_id?: unknown; method?: unknown; accepted_at?: unknown }>
    const tag = rows[0]
    if (!tag || typeof tag.runner_id !== 'string' || typeof tag.method !== 'string' || typeof tag.accepted_at !== 'string') return
    await publishActionEvent(matchId, 'tag.accepted', {
      runner_id: tag.runner_id, status: 'TAGGED', method: tag.method, accepted_at: tag.accepted_at,
    }, tagResult.tag_id, tag.accepted_at)
    if (tagResult.state === 'ENDED') {
      await publishActionEvent(matchId, 'match.ended', {
        state: 'ENDED', winner: tagResult.winner, end_reason: 'ALL_RUNNERS_TAGGED_OR_LEFT', ended_at: tag.accepted_at,
      }, `tag:${tagResult.tag_id}`, tag.accepted_at)
    }
  } catch {
    // A committed tag remains successful even when Realtime or the event lookup is unavailable.
  }
}

function rpcResponse(result: JsonObject): Response {
  const error = result.error
  if (typeof error !== 'string') return ok(result)
  if (error === 'INVALID_CONFIG' || error === 'INVALID_INPUT' || error === 'INVALID_ROLE' || error === 'INVALID_HUNTER_COUNT') {
    return fail(400, error, 'Check the supplied lobby details and try again.')
  }
  if (error === 'INVALID_CODE') return fail(404, error, 'That private lobby code is invalid or expired.')
  if (error === 'RATE_LIMITED') return fail(429, error, 'Too many attempts. Wait a little and try again.')
  if (error === 'LOBBY_FULL') return fail(409, error, `This lobby already has ${HIDE_AND_SEEK_CONFIG.players.max.default} players.`)
  if (error === 'MATCH_STARTED') return fail(409, error, 'This match has already started.')
  if (error === 'ALREADY_MEMBER') return fail(409, error, 'This guest is already in the lobby.')
  if (error === 'REMOVED_FROM_LOBBY') return fail(403, error, 'The host removed this guest from the lobby.')
  if (error === 'CANNOT_REMOVE_SELF') return fail(400, error, 'The host cannot remove themself from the lobby.')
  if (error === 'INVALID_STATE') return fail(409, error, 'This action is not available in the current match state.')
  if (error === 'NOT_MEMBER') return fail(403, error, 'Join this private lobby before changing it.')
  if (error === 'TEAM_NOT_SELECTED') return fail(409, error, 'Choose a team before this match can sync.')
  if (error === 'NOT_FOUND') return fail(404, error, 'The lobby could not be found.')
  if (error === 'WRONG_ROLE') return fail(403, error, 'This tag action is not available for your role.')
  if (error === 'INVALID_QR' || error === 'WRONG_MATCH') return fail(404, error, 'That QR is invalid for this match.')
  if (error === 'QR_USED' || error === 'QR_EXPIRED' || error === 'ALREADY_TAGGED') return fail(409, error, 'That tag code is expired, already used, or no longer valid.')
  if (error === 'QR_RELAY_BLOCKED') return fail(409, error, 'QR fallback is unavailable while fresh GPS fixes are too far apart.')
  if (error === 'DEADLINE_PASSED') return fail(409, error, 'The server deadline has passed.')
  if (error === 'INACTIVE') return fail(409, error, 'Tagging is available only during the active match.')
  if (error === 'NOT_HOST') return fail(403, error, 'Only the current match controller can end this match.')
  if (error === 'CLAIM_UNAVAILABLE' || error === 'CLAIM_EXPIRED' || error === 'CLAIM_TAKEN') return fail(409, error, 'Host controls are no longer available to claim.')
  if (error === 'NOT_ENDED') return fail(409, error, 'This match has no final result yet.')
  if (error === 'INVALID_FIX') return fail(400, error, 'The location fix is invalid or too old to accept.')
  if (error === 'INVALID_HUNTER_FIX') return fail(400, error, 'A fresh, accurate Hunter location is required.')
  if (error === 'OLD_SEQUENCE') return fail(409, error, 'A newer location update was already received.')
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

function isDisplayName(value: unknown): value is string {
  return isText(value) && !/[\u0000-\u001f\u007f]/.test(value)
}

function numberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function finiteIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

export async function handleRequest(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/functions\/v1\/api/, '').replace(/^\/api/, '')
  const removePlayerPath = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/players\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i)
  const isRemovePlayer = request.method === 'DELETE' && removePlayerPath !== null
  if (request.method !== 'POST' && !isRemovePlayer) return fail(405, 'METHOD_NOT_ALLOWED', 'Use a supported game action method.')

  let user: { id: string } | null
  try {
    user = await authenticate(request)
  } catch {
    return fail(503, 'AUTH_UNAVAILABLE', 'Guest authentication is temporarily unavailable.')
  }
  if (!user) return fail(401, 'UNAUTHENTICATED', 'Start a guest session and try again.')

  const body = isRemovePlayer ? {} : await parseBody(request)
  if (!body) return fail(400, 'INVALID_JSON', 'Send a JSON object no larger than 16 KB.')

  try {
    const syncPath = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/sync$/i)
    if (path === '/lobbies' || path === '/lobbies/join' || syncPath || /\/matches\/[0-9a-f-]+\/result$/i.test(path)) {
      await callRpc('xzones_cleanup', {}).catch(() => ({ error: 'INTERNAL' }))
    }
    if (path === '/lobbies') {
      const pingSeconds = body.ping_seconds === undefined ? null : body.ping_seconds
      if (!isDisplayName(body.display_name)) return fail(400, 'INVALID_INPUT', 'Choose a name between 1 and 24 characters without control characters.')
      if (!isValidMatchConfig({
        roundSeconds: body.round_seconds as number,
        headStartSeconds: body.head_start_seconds as number,
        pingSeconds: pingSeconds as number | null,
      })
        || !isValidZoneConfig({
          shrinkStages: (body.zone_shrink_stages ?? 0) as number,
          shrinkIntervalSeconds: (body.zone_shrink_interval_seconds ?? 300) as number,
          finalRadiusM: (body.zone_final_radius_m ?? 50) as number,
        }, body.zone_diameter_m === undefined ? null : (body.zone_diameter_m as number) / 2)
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
          p_ping_seconds: pingSeconds,
          p_zone_lat: zoneLat ?? null,
          p_zone_lon: zoneLon ?? null,
          p_zone_diameter_m: body.zone_diameter_m ?? null,
          p_zone_shrink_stages: body.zone_shrink_stages ?? 0,
          p_zone_shrink_interval_seconds: body.zone_shrink_interval_seconds ?? 300,
          p_zone_final_radius_m: body.zone_final_radius_m ?? 50,
        })
        if (result.error !== 'CODE_COLLISION') {
          if (!result.error && typeof result.match_id === 'string' && typeof result.code_expires_at === 'string') {
            const context = await matchContext(result.match_id)
            if (context) await publishRoleEvents(result.match_id, [eventEnvelope(result.match_id, context.revision,
              new Date().toISOString(), 'lobby.created', { match_id: result.match_id, code_expires_at: result.code_expires_at, revision: context.revision }, 'created')])
          }
          return rpcResponse({ ...result, code })
        }
      }
      return fail(503, 'RETRY_CREATE', 'Could not reserve a lobby code. Please try again.')
    }

    if (path === '/lobbies/join') {
      if (!isDisplayName(body.display_name)) return fail(400, 'INVALID_INPUT', 'Choose a name between 1 and 24 characters without control characters.')
      if (typeof body.code !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/i.test(body.code.trim())) {
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
      const joined = await callRpc('xzones_join_lobby', {
        p_auth_user_id: user.id,
        p_user_bucket_key: bytea(userBucket),
        p_failed_bucket_key: bytea(failedBucket),
        p_display_name: body.display_name.trim(),
        p_code_hash: bytea(codeHash),
        p_session_cap_hash: bytea(capHash),
      })
      if (!joined.error && typeof joined.match_id === 'string' && typeof joined.player_id === 'string') {
        await publishActionEvent(joined.match_id, 'lobby.player_joined', {
          player_id: joined.player_id, display_name: body.display_name.trim(), status: 'ACTIVE',
        }, joined.player_id)
      }
      return rpcResponse(joined)
    }

    const syncMatch = syncPath
    if (syncMatch) {
      const lastRevision = body.last_revision === undefined ? 0 : body.last_revision
      if (!numberIn(lastRevision, 0, Number.MAX_SAFE_INTEGER)) {
        return fail(400, 'INVALID_INPUT', 'last_revision must be a non-negative integer.')
      }
      const outcome = await callRpc('xzones_resolve_match', {
        p_auth_user_id: user.id, p_match_id: syncMatch[1],
      })
      if (typeof outcome.error === 'string') return rpcResponse(outcome)
      const lobby = await callRpc('xzones_sync_lobby', {
        p_auth_user_id: user.id, p_match_id: syncMatch[1],
      })
      if (lobby.state === 'LOBBY') {
        if (!Array.isArray(lobby.players)) return fail(503, 'INTERNAL', 'The game service could not complete this request.')
        const players = lobby.players.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const player = item as JsonObject
          if (typeof player.id !== 'string' || typeof player.display_name !== 'string'
            || (player.role !== null && player.role !== 'HUNTER' && player.role !== 'RUNNER')
            || typeof player.ready !== 'boolean' || player.status !== 'ACTIVE') return []
          return [{ id: player.id, display_name: player.display_name, role: player.role, ready: player.ready, status: 'ACTIVE' }]
        })
        if (typeof lobby.own_player_id !== 'string' || typeof lobby.host_player_id !== 'string'
          || typeof lobby.controller_player_id !== 'string'
          || typeof lobby.revision !== 'number' || !lobby.active_counts || typeof lobby.active_counts !== 'object') {
          return fail(503, 'INTERNAL', 'The game service could not complete this request.')
        }
        return ok({
          state: 'LOBBY', role: lobby.role, own_player_id: lobby.own_player_id,
          host_player_id: lobby.host_player_id, revision: lobby.revision, players,
          controller_player_id: lobby.controller_player_id,
          active_counts: lobby.active_counts, can_start: lobby.can_start === true,
          block_reason: typeof lobby.block_reason === 'string' ? lobby.block_reason : undefined,
        })
      }
      if (lobby.error !== 'NOT_LOBBY') return rpcResponse(lobby)
      const result = await callRpc('xzones_sync_match', {
        p_auth_user_id: user.id,
        p_match_id: syncMatch[1],
        p_last_revision: lastRevision,
      })
      if (typeof result.error === 'string') return rpcResponse(result)
      const zone = await callRpc('xzones_zone_at', { p_match_id: syncMatch[1], p_now: result.server_now })
      if (typeof zone.error === 'string') return rpcResponse(zone)
      const controls = await callRpc('xzones_match_controls', {
        p_auth_user_id: user.id, p_match_id: syncMatch[1],
      })
      if (typeof controls.error === 'string') return rpcResponse(controls)
      const ownStatus = result.own_status === 'TAGGED' ? 'TAGGED' : 'ACTIVE'
      const team = ownStatus === 'ACTIVE' ? await callRpc('xzones_team_positions', {
        p_auth_user_id: user.id, p_match_id: syncMatch[1],
      }) : { role: result.role, own_player_id: result.own_player_id, positions: [] }
      if (typeof team.error === 'string') return rpcResponse(team)
      if (team.role !== result.role || !Array.isArray(team.positions)) {
        return fail(503, 'INTERNAL', 'The game service could not complete this request.')
      }
      const clock = await callRpc('xzones_match_clock', {
        p_auth_user_id: user.id, p_match_id: syncMatch[1],
      })
      if (typeof clock.error === 'string') return rpcResponse(clock)
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

      for (const item of team.positions) {
        if (!item || typeof item !== 'object') continue
        const position = item as JsonObject
        if (typeof position.player_id !== 'string' || position.player_id === team.own_player_id
          || position.team_role !== role
          || typeof position.display_name !== 'string' || typeof position.lat !== 'number' || typeof position.lon !== 'number'
          || typeof position.accuracy_m !== 'number' || typeof position.captured_at !== 'string'
          || typeof position.age_seconds !== 'number' || typeof position.is_stale !== 'boolean') continue
        const projected = projectEventForRole(role, {
          event_id: `match:${syncMatch[1]}:revision:${revision}:team:${position.player_id}`,
          match_id: syncMatch[1], revision, server_at: serverNow, type: 'team.location_live',
          data: position,
        })
        if (projected) events.push(projected)
        if (position.is_stale === true && typeof position.captured_at === 'string') {
          const staleEvent = projectEventForRole(role, {
            // A fix becomes stale once; keying the event to its capture time lets clients
            // deduplicate repeated syncs without retaining or broadcasting its coordinates.
            event_id: `match:${syncMatch[1]}:team:${position.player_id}:stale:${position.captured_at}`,
            match_id: syncMatch[1], revision, server_at: serverNow, type: 'location.stale',
            data: { team_role: role, player_id: position.player_id, is_stale: true },
          })
          if (staleEvent) events.push(staleEvent)
        }
      }

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

      const broadcastableEvents = events.filter((event) => event.type !== 'team.location_live' && event.type !== 'location.stale')
      await publishRoleEvents(syncMatch[1], broadcastableEvents)
      // Staleness applies only to the syncing player's own team; unlike match-wide
      // events it must never be fanned out to the opposing role.
      await publishRoleEvents(syncMatch[1], events.filter((event) => event.type === 'location.stale'), [role])
      return ok({
        role,
        state: matchState,
        server_now: serverNow,
        start_at: clock.start_at,
        head_start_ends_at: clock.head_start_ends_at,
        ends_at: clock.ends_at,
        active_counts: matchEvent.data.active_counts,
        can_end: controls.can_end === true,
        can_claim: controls.can_claim === true,
        claim_expires_at: typeof controls.claim_expires_at === 'string' ? controls.claim_expires_at : null,
        own_player_id: typeof team.own_player_id === 'string' ? team.own_player_id : null,
        zone: zone,
        own_status: ownStatus,
        revision,
        events,
        next_ping_at: typeof result.next_ping_at === 'string' ? result.next_ping_at : null,
      })
    }

    const teamMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/team$/i)
    if (teamMatch) {
      if (typeof body.role !== 'string') return fail(400, 'INVALID_ROLE', 'Choose Hunter, Runner, or Random.')
      const result = await callRpc('xzones_select_team', {
        p_auth_user_id: user.id, p_match_id: teamMatch[1], p_role: body.role.toUpperCase(),
      })
      if (!result.error && result.counts && typeof result.counts === 'object') {
        const counts = result.counts as JsonObject
        await publishLobbyEvent(user.id, teamMatch[1], 'lobby.teams', {
          hunter_count: counts.hunters, runner_count: counts.runners,
          own_role: result.role, can_start: result.can_start === true,
        }, `teams:${String(result.role)}`)
      }
      return rpcResponse(result)
    }

    const hunterCountMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/hunter-count$/i)
    if (hunterCountMatch) {
      if (!Number.isInteger(body.hunter_count)) return fail(400, 'INVALID_HUNTER_COUNT', 'Choose a valid Hunter count.')
      const result = await callRpc('xzones_set_hunter_count', {
        p_auth_user_id: user.id, p_match_id: hunterCountMatch[1], p_hunter_count: body.hunter_count,
      })
      return rpcResponse(result)
    }

    const readyMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/ready$/i)
    if (readyMatch) {
      if (typeof body.ready !== 'boolean') return fail(400, 'INVALID_INPUT', 'Ready must be true or false.')
      const result = await callRpc('xzones_set_ready', {
        p_auth_user_id: user.id, p_match_id: readyMatch[1], p_ready: body.ready,
      })
      if (!result.error) {
        await publishLobbyEvent(user.id, readyMatch[1], 'lobby.readiness', {
          ready: body.ready,
          can_start: result.can_start === true, block_reason: result.block_reason,
        }, `ready:${body.ready}`)
      }
      return rpcResponse(result)
    }

    const qrMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/qr$/i)
    if (qrMatch) {
      const bytes = randomBytes(32)
      const token = encodeBase64Url(bytes)
      const tokenHash = await sha256(bytes)
      const result = await callRpc('xzones_issue_qr', {
        p_auth_user_id: user.id, p_match_id: qrMatch[1], p_token_hash: bytea(tokenHash),
      })
      if (typeof result.error === 'string') return rpcResponse(result)
      if (typeof result.expires_at !== 'string' || typeof result.server_now !== 'string') {
        return fail(503, 'INTERNAL', 'The game service could not complete this request.')
      }
      return ok({ token, expires_at: result.expires_at, server_now: result.server_now })
    }

    const scanMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/qr\/scan$/i)
    if (scanMatch) {
      if (typeof body.token !== 'string') return fail(404, 'INVALID_QR', 'That QR is invalid for this match.')
      const tokenBytes = decodeBase64UrlToken(body.token)
      if (!tokenBytes) return fail(404, 'INVALID_QR', 'That QR is invalid for this match.')
      const result = await callRpc('xzones_scan_qr', {
        p_auth_user_id: user.id, p_match_id: scanMatch[1], p_token_hash: bytea(await sha256(tokenBytes)),
      })
      if (!result.error) await publishTagResult(scanMatch[1], result)
      return rpcResponse(result)
    }

    const gpsTagMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/tag\/gps$/i)
    if (gpsTagMatch) {
      if (!finiteIn(body.lat, -90, 90) || !finiteIn(body.lon, -180, 180)
        || !finiteIn(body.accuracy_m, 0, 50) || typeof body.captured_at !== 'string'
        || !Number.isFinite(Date.parse(body.captured_at))) {
        return fail(400, 'INVALID_HUNTER_FIX', 'A fresh, accurate Hunter location is required.')
      }
      const bucket = await hmac(requiredEnv('RATE_LIMIT_HASH_SECRET'), `gps-tag:${gpsTagMatch[1]}:${user.id}`)
      const result = await callRpc('xzones_gps_tag', {
        p_auth_user_id: user.id, p_match_id: gpsTagMatch[1], p_bucket_key: bytea(bucket),
        p_lat: body.lat, p_lon: body.lon, p_accuracy_m: body.accuracy_m, p_captured_at: body.captured_at,
      })
      if (!result.error) await publishTagResult(gpsTagMatch[1], result)
      return rpcResponse(result)
    }

    const confirmTagMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/tag\/confirm$/i)
    if (confirmTagMatch) {
      const result = await callRpc('xzones_confirm_tag', {
        p_auth_user_id: user.id, p_match_id: confirmTagMatch[1],
      })
      if (!result.error) await publishTagResult(confirmTagMatch[1], result)
      return rpcResponse(result)
    }

    const leaveMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/leave$/i)
    if (leaveMatch) {
      const playerId = await ownPlayerId(leaveMatch[1], user.id)
      const result = await callRpc('xzones_leave_match', {
        p_auth_user_id: user.id, p_match_id: leaveMatch[1],
      })
      if (!result.error && playerId) await publishActionEvent(leaveMatch[1], 'player.left', { player_id: playerId, status: 'LEFT' }, `left:${playerId}`)
      return rpcResponse(result)
    }

    if (isRemovePlayer && removePlayerPath) {
      const removed = await callRpc('xzones_remove_lobby_player', {
        p_auth_user_id: user.id, p_match_id: removePlayerPath[1], p_player_id: removePlayerPath[2],
      })
      if (!removed.error && typeof removed.player_id === 'string') {
        await publishLobbyEvent(user.id, removePlayerPath[1], 'player.left', { player_id: removed.player_id, status: 'LEFT' }, `left:${removed.player_id}`)
      }
      return rpcResponse(removed)
    }

    const claimMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/host-claim$/i)
    if (claimMatch) {
      const claimed = await callRpc('xzones_claim_controller', {
        p_auth_user_id: user.id, p_match_id: claimMatch[1],
      })
      if (!claimed.error && typeof claimed.controller_player_id === 'string') {
        const context = await matchContext(claimMatch[1])
        if (context) await publishRoleEvents(claimMatch[1], [eventEnvelope(claimMatch[1], context.revision,
          new Date().toISOString(), 'match.host_migrated', {
            controller_player_id: claimed.controller_player_id, claim_expires_at: context.claim_expires_at,
          }, `host:${claimed.controller_player_id}`)])
      }
      return rpcResponse(claimed)
    }

    const endMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/end$/i)
    if (endMatch) {
      if (body.reason !== 'HOST_END' && body.reason !== 'SAFETY_END') {
        return fail(400, 'INVALID_INPUT', 'Choose a supported match end reason.')
      }
      const ended = await callRpc('xzones_end_match', {
        p_auth_user_id: user.id, p_match_id: endMatch[1], p_reason: body.reason,
      })
      if (typeof ended.error === 'string') return rpcResponse(ended)
      const result = await callRpc('xzones_match_result', {
        p_auth_user_id: user.id, p_match_id: endMatch[1],
      })
      if (!result.error) await publishActionEvent(endMatch[1], 'match.ended', {
        state: ended.state, winner: result.winner, end_reason: result.end_reason, ended_at: result.ended_at,
      }, `end:${String(result.ended_at)}`, typeof result.ended_at === 'string' ? result.ended_at : undefined)
      return rpcResponse(result)
    }

    const resultMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/result$/i)
    if (resultMatch) {
      const result = await callRpc('xzones_match_result', {
        p_auth_user_id: user.id, p_match_id: resultMatch[1],
      })
      if (typeof result.error === 'string') return rpcResponse(result)
      const suspicious = await callRpc('xzones_host_suspicious_events', {
        p_auth_user_id: user.id, p_match_id: resultMatch[1],
      })
      if (typeof suspicious.error === 'string') return rpcResponse(suspicious)
      return rpcResponse({ ...result, suspicious_events: Array.isArray(suspicious.events) ? suspicious.events : [] })
    }

    const locationMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/location$/i)
    if (locationMatch) {
      if (!finiteIn(body.lat, -90, 90) || !finiteIn(body.lon, -180, 180)
        || !finiteIn(body.accuracy_m, 0, 10_000) || typeof body.captured_at !== 'string'
        || !Number.isFinite(Date.parse(body.captured_at)) || !numberIn(body.sequence, 0, Number.MAX_SAFE_INTEGER)) {
        return fail(400, 'INVALID_FIX', 'Send valid coordinates, accuracy, capture time, and sequence.')
      }
      const zone = await callRpc('xzones_zone_at', { p_match_id: locationMatch[1] })
      if (typeof zone.error === 'string') return rpcResponse(zone)
      const outcome = await callRpc('xzones_resolve_match', { p_auth_user_id: user.id, p_match_id: locationMatch[1] })
      if (typeof outcome.error === 'string') return rpcResponse(outcome)
      const result = await callRpc('xzones_update_location', {
        p_auth_user_id: user.id, p_match_id: locationMatch[1], p_lat: body.lat, p_lon: body.lon,
        p_accuracy_m: body.accuracy_m, p_captured_at: body.captured_at, p_sequence: body.sequence,
      })
      if (!result.error && result.accepted === true) {
        const zoneStatus = await callRpc('xzones_zone_status', { p_auth_user_id: user.id, p_match_id: locationMatch[1] })
        if (typeof zoneStatus.error === 'string') return rpcResponse(zoneStatus)
        if (zoneStatus.eliminated === true) {
          const resolved = await callRpc('xzones_resolve_match', { p_auth_user_id: user.id, p_match_id: locationMatch[1] })
          if (typeof resolved.error === 'string') return rpcResponse(resolved)
        }
        result.zone_warning = zoneStatus.zone_warning === true
        result.stationary_warning = zoneStatus.stationary_warning === true
        result.zone_revealed = zoneStatus.revealed === true
        result.zone_eliminated = zoneStatus.eliminated === true
      }
      if (!result.error && result.accepted === true && typeof result.player_id === 'string' && typeof result.server_now === 'string') {
        await publishLatestLocation(locationMatch[1], result.player_id, result.server_now)
      }
      if (result.error === 'RATE_LIMITED') {
        const seconds = typeof result.retry_after_seconds === 'number' && Number.isInteger(result.retry_after_seconds)
          ? Math.max(1, Math.min(30, result.retry_after_seconds)) : 2
        return Response.json({ error: { code: 'RATE_LIMITED', message: 'Location updates are arriving too quickly.' } }, {
          status: 429, headers: { ...corsHeaders, 'retry-after': String(seconds) },
        })
      }
      return rpcResponse(result)
    }

    const startMatch = path.match(/^\/matches\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/start$/i)
    if (startMatch) {
      if (!numberIn(body.expected_revision, 0, Number.MAX_SAFE_INTEGER)) {
        return fail(400, 'INVALID_INPUT', 'expected_revision must be a non-negative integer.')
      }
      const result = await callRpc('xzones_start_match', {
        p_auth_user_id: user.id, p_match_id: startMatch[1], p_expected_revision: body.expected_revision,
      })
      if (result.error === 'REVISION_CONFLICT') return fail(409, 'REVISION_CONFLICT', 'The lobby changed. Refresh before starting.')
      if (result.error === 'NOT_READY') return fail(409, 'NOT_READY', 'Every player must choose a team and be ready before starting.')
      if (result.error === 'NOT_HOST') return fail(403, 'NOT_HOST', 'Only the current host can start this match.')
      if (!result.error && typeof result.revision === 'number' && typeof result.start_at === 'string') {
        const envelope = eventEnvelope(startMatch[1], result.revision, result.start_at, 'match.started', {
          state: result.state, start_at: result.start_at, head_start_ends_at: result.head_start_ends_at,
          ends_at: result.ends_at, revision: result.revision,
        }, `started:${result.revision}`)
        await publishRoleEvents(startMatch[1], [envelope])
      }
      return rpcResponse(result)
    }

    return fail(501, 'NOT_IMPLEMENTED', 'This game action is not available yet.')
  } catch {
    return fail(503, 'INTERNAL', 'The game service could not complete this request.')
  }
}

if (import.meta.main) Deno.serve(handleRequest)
