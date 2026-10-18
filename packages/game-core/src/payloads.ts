export type RecipientRole = 'HUNTER' | 'RUNNER'
type Data = Record<string, unknown>

export interface EventEnvelope {
  event_id: string
  match_id: string
  revision: number
  server_at: string
  type: string
  data: Data
}

function object(value: unknown): Data | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Data : null
}
function text(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null }
function integer(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) ? value : null }
function finite(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null }

function geoPoint(data: Data): Data | null {
  const lat = finite(data.lat), lon = finite(data.lon), accuracy = finite(data.accuracy_m), capturedAt = text(data.captured_at)
  if (lat === null || lat < -90 || lat > 90 || lon === null || lon < -180 || lon > 180
    || accuracy === null || accuracy < 0 || !capturedAt) return null
  return { lat, lon, accuracy_m: accuracy, captured_at: capturedAt }
}

function projectData(role: RecipientRole, type: string, data: Data): Data | null {
  switch (type) {
    case 'match.state': {
      const counts = object(data.active_counts)
      const hunters = counts && integer(counts.hunters), runners = counts && integer(counts.runners)
      if (!counts || hunters === null || runners === null || hunters < 0 || runners < 0) return null
      return { state: text(data.state), server_now: text(data.server_now), ends_at: text(data.ends_at), active_counts: { hunters, runners } }
    }
    case 'team.location_live': {
      if (data.team_role !== undefined && data.team_role !== role) return null
      const point = geoPoint(data), playerId = text(data.player_id)
      return point && playerId ? { player_id: playerId, ...point } : null
    }
    case 'hunter.runner_ping': {
      if (role !== 'HUNTER') return null
      const runnerId = text(data.runner_id), status = data.status, pingAt = text(data.ping_at)
      const age = integer(data.age_seconds), pingIndex = integer(data.ping_index)
      if (!runnerId || !['OK', 'NO_FIX', 'STALE'].includes(String(status)) || !pingAt
        || age === null || age < 0 || pingIndex === null || pingIndex < 0) return null
      if (status === 'OK') {
        const point = geoPoint(data)
        return point ? { runner_id: runnerId, status, ...point, ping_at: pingAt, age_seconds: age, ping_index: pingIndex } : null
      }
      return { runner_id: runnerId, status, lat: null, lon: null, accuracy_m: null, captured_at: null,
        ping_at: pingAt, age_seconds: age, ping_index: pingIndex }
    }
    case 'runner.location_revealed':
      if (role !== 'RUNNER') return null
      return { ping_index: integer(data.ping_index), ping_at: text(data.ping_at) }
    case 'match.started':
      return { state: text(data.state), start_at: text(data.start_at), head_start_ends_at: text(data.head_start_ends_at), ends_at: text(data.ends_at), revision: integer(data.revision) }
    case 'tag.accepted':
      return { runner_id: text(data.runner_id), status: data.status === 'TAGGED' ? 'TAGGED' : null,
        method: data.method === 'QR' || data.method === 'RUNNER_CONFIRM' ? data.method : null, accepted_at: text(data.accepted_at) }
    case 'match.result':
      return { winner: data.winner === 'HUNTER' || data.winner === 'RUNNER' ? data.winner : null,
        end_reason: text(data.end_reason), ended_at: text(data.ended_at) }
    case 'location.stale':
      if (data.team_role !== undefined && data.team_role !== role) return null
      return { player_id: text(data.player_id), is_stale: typeof data.is_stale === 'boolean' ? data.is_stale : null }
    case 'lobby.created':
      return { match_id: text(data.match_id), code_expires_at: text(data.code_expires_at), revision: integer(data.revision) }
    case 'lobby.player_joined':
      return { player_id: text(data.player_id), display_name: text(data.display_name), status: text(data.status) }
    case 'lobby.teams':
      return { hunter_count: integer(data.hunter_count), runner_count: integer(data.runner_count), own_role: data.own_role === role ? role : null,
        can_start: typeof data.can_start === 'boolean' ? data.can_start : null }
    case 'lobby.readiness':
      return { player_id: text(data.player_id), ready: typeof data.ready === 'boolean' ? data.ready : null,
        can_start: typeof data.can_start === 'boolean' ? data.can_start : null, block_reason: text(data.block_reason) }
    case 'player.left':
      return { player_id: text(data.player_id), status: data.status === 'LEFT' ? 'LEFT' : null }
    case 'match.host_migrated':
      return { controller_player_id: text(data.controller_player_id), claim_expires_at: text(data.claim_expires_at) }
    case 'match.ended':
      return { state: data.state === 'ENDED' || data.state === 'CANCELLED' ? data.state : null,
        winner: data.winner === 'HUNTER' || data.winner === 'RUNNER' ? data.winner : null,
        end_reason: text(data.end_reason), ended_at: text(data.ended_at) }
    default: return null
  }
}

/** All client/store/channel consumers share the same privacy allow-list as the API projector. */
export function projectEventForRole(role: RecipientRole, raw: unknown): EventEnvelope | null {
  const envelope = object(raw), data = envelope && object(envelope.data)
  if (!envelope || !data || (role !== 'HUNTER' && role !== 'RUNNER')) return null
  const eventId = text(envelope.event_id), matchId = text(envelope.match_id), revision = integer(envelope.revision)
  const serverAt = text(envelope.server_at), type = text(envelope.type)
  if (!eventId || !matchId || revision === null || revision < 0 || !serverAt || !type) return null
  const safeData = projectData(role, type, data)
  return safeData ? { event_id: eventId, match_id: matchId, revision, server_at: serverAt, type, data: safeData } : null
}
