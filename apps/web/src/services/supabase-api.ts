import { privateMatchTopic, projectEventForRole, type Role } from '@xzones/game-core'
import {
  apiError,
  type ApiError,
  type ClockView,
  type CreateInput,
  type GameApi,
  type JoinInput,
  type LobbyView,
  type LocationAck,
  type LocationInput,
  type LeaveResult,
  type MatchResult,
  type QrChallenge,
  type ReadyView,
  type Result,
  type RemovePlayerResult,
  type RoleSafeMatchView,
  type SafeHandlers,
  type TagResult,
  type TeamView,
  type Unsubscribe,
} from './game-api'

interface SavedSession {
  access_token: string
  refresh_token: string
  expires_at: number
}

interface ApiLobbyResponse {
  match_id: string
  player_id: string
  code?: string
  role?: Role | null
  revision?: number
}

interface ApiLobbyPlayer {
  id: string
  display_name: string
  role: Role | null
  ready: boolean
  status: 'ACTIVE' | 'TAGGED' | 'LEFT'
}

interface ApiLobbySyncResponse {
  state: string
  own_player_id: string
  host_player_id: string
  controller_player_id: string
  revision: number
  players: ApiLobbyPlayer[]
  active_counts: { hunters: number; runners: number }
  can_start: boolean
  block_reason?: string
}

const SESSION_KEY = 'xzones.guest_session'

function error<T>(code: string, message: string, retryable = false): Result<T> {
  return { ok: false, error: apiError(code, message, retryable) }
}

function settings(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null
  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol)) return null
    return { url: parsed.origin, anonKey }
  } catch {
    return null
  }
}

function validSession(value: unknown): value is SavedSession {
  if (value === null || typeof value !== 'object') return false
  const session = value as Partial<SavedSession>
  return typeof session.access_token === 'string'
    && typeof session.refresh_token === 'string'
    && typeof session.expires_at === 'number'
}

function readSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    return validSession(value) ? value : null
  } catch {
    return null
  }
}

function saveSession(session: SavedSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    throw new Error('This browser cannot save a guest session. Enable local storage and try again.')
  }
}

function asLobby(data: ApiLobbyResponse, displayName: string, code: string): LobbyView {
  const you = {
    id: data.player_id,
    display_name: displayName,
    role: null,
    ready: false,
    status: 'ACTIVE' as const,
  }
  return {
    id: data.match_id,
    source: 'REAL',
    code,
    state: 'LOBBY',
    you,
    players: [you],
    host_player_id: data.player_id,
    controller_player_id: data.player_id,
    revision: data.revision ?? 0,
    active_counts: { hunters: 0, runners: 0 },
    can_start: false,
    block_reason: 'NEEDS_TEAMS',
  }
}

export function parseApiError(value: unknown, status: number, retryAfter: string | null): ApiError {
  const retryAfterSeconds = retryAfter !== null && /^\d+$/.test(retryAfter) ? Math.min(30, Math.max(1, Number(retryAfter))) : undefined
  if (value !== null && typeof value === 'object') {
    const root = value as { error?: unknown }
    if (root.error !== null && typeof root.error === 'object') {
      const detail = root.error as { code?: unknown; message?: unknown }
      if (typeof detail.code === 'string' && typeof detail.message === 'string') {
        return { ...apiError(detail.code, detail.message, status >= 500 || status === 429),
          ...(status === 429 && retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) }
      }
    }
  }
  return apiError('API_ERROR', 'The game service could not complete this request.', status >= 500)
}

class SupabaseGameApi implements GameApi {
  private async getSession(forceRefresh = false): Promise<Result<SavedSession>> {
    const config = settings()
    if (!config) {
      return error('CONFIG_REQUIRED', 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to apps/web/.env.local, then restart Vite.')
    }

    const existing = readSession()
    if (existing && !forceRefresh && existing.expires_at > Date.now() + 30_000) {
      return { ok: true, data: existing }
    }

    try {
      const endpoint = existing?.refresh_token
        ? `${config.url}/auth/v1/token?grant_type=refresh_token`
        : `${config.url}/auth/v1/signup`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { apikey: config.anonKey, 'content-type': 'application/json' },
        body: JSON.stringify(existing?.refresh_token ? { refresh_token: existing.refresh_token } : { data: {} }),
      })
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null
      if (!response.ok || !payload || typeof payload.access_token !== 'string'
        || typeof payload.refresh_token !== 'string') {
        return error('GUEST_AUTH_FAILED', 'Could not start a guest session. Check anonymous sign-ins in Supabase and try again.', response.status >= 500)
      }
      const expiry = typeof payload.expires_at === 'number'
        ? payload.expires_at * 1000
        : Date.now() + (typeof payload.expires_in === 'number' ? payload.expires_in * 1000 : 3600_000)
      const session: SavedSession = {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_at: expiry,
      }
      saveSession(session)
      return { ok: true, data: session }
    } catch {
      return error('NETWORK_ERROR', 'Could not reach guest authentication. Check your connection.', true)
    }
  }

  private async post<T>(path: string, body: object, retry = true, method: 'POST' | 'DELETE' = 'POST'): Promise<Result<T>> {
    const config = settings()
    if (!config) {
      return error('CONFIG_REQUIRED', 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to apps/web/.env.local, then restart Vite.')
    }
    const session = await this.getSession()
    if (!session.ok) return session

    try {
      const response = await fetch(`${config.url}/functions/v1/api${path}`, {
        method,
        headers: {
          apikey: config.anonKey,
          authorization: `Bearer ${session.data.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      const payload: unknown = await response.json().catch(() => null)
      if (response.status === 401 && retry) {
        const refreshed = await this.getSession(true)
        if (!refreshed.ok) return refreshed
        return this.post<T>(path, body, false, method)
      }
      if (!response.ok) return { ok: false, error: parseApiError(payload, response.status, response.headers.get('retry-after')) }
      return { ok: true, data: payload as T }
    } catch {
      return error('NETWORK_ERROR', 'Could not reach the game service. Check your connection.', true)
    }
  }

  async createLobby(input: CreateInput): Promise<Result<LobbyView>> {
    const result = await this.post<ApiLobbyResponse>('/lobbies', input)
    if (!result.ok) return result
    return { ok: true, data: asLobby(result.data, input.display_name, result.data.code ?? '') }
  }

  async joinLobby(input: JoinInput): Promise<Result<LobbyView>> {
    const result = await this.post<ApiLobbyResponse>('/lobbies/join', input)
    if (!result.ok) return result
    return { ok: true, data: asLobby(result.data, input.display_name, input.code.toUpperCase()) }
  }

  async getLobby(id: string): Promise<Result<LobbyView>> {
    const result = await this.post<ApiLobbySyncResponse>(`/matches/${encodeURIComponent(id)}/sync`, { last_revision: 0 })
    if (!result.ok) return result
    if (result.data.state !== 'LOBBY' || !Array.isArray(result.data.players)) {
      return error('INVALID_STATE', 'This lobby is no longer waiting for players.')
    }
    const you = result.data.players.find((player) => player.id === result.data.own_player_id)
    if (!you) return error('NOT_MEMBER', 'This guest is no longer in the lobby.')
    let code = ''
    try { code = sessionStorage.getItem(`xzones.lobby.${id}.code`) ?? '' } catch { /* optional local copy */ }
    return {
      ok: true,
      data: {
        id,
        source: 'REAL',
        code,
        state: 'LOBBY',
        you,
        players: result.data.players,
        host_player_id: result.data.host_player_id,
        controller_player_id: result.data.controller_player_id,
        revision: result.data.revision,
        active_counts: result.data.active_counts,
        can_start: result.data.can_start,
        block_reason: result.data.block_reason,
      },
    }
  }

  async removeLobbyPlayer(id: string, playerId: string): Promise<Result<RemovePlayerResult>> {
    return this.post<RemovePlayerResult>(`/matches/${encodeURIComponent(id)}/players/${encodeURIComponent(playerId)}`, {}, true, 'DELETE')
  }

  async selectTeam(id: string, role: Role | 'RANDOM'): Promise<Result<TeamView>> {
    const result = await this.post<{ role: Role; counts: { hunters: number; runners: number }; can_start: boolean; block_reason?: string }>(
      `/matches/${encodeURIComponent(id)}/team`, { role },
    )
    if (!result.ok) return result
    return { ok: true, data: {
      role: result.data.role,
      active_counts: result.data.counts,
      can_start: result.data.can_start,
      block_reason: result.data.block_reason,
    } }
  }

  async setHunterCount(id: string, count: number): Promise<Result<{ hunters: number; runners: number }>> {
    return this.post<{ counts: { hunters: number; runners: number } }>(
      `/matches/${encodeURIComponent(id)}/hunter-count`, { hunter_count: count },
    ).then((result) => result.ok ? { ok: true, data: result.data.counts } : result)
  }

  async setReady(id: string, ready: boolean): Promise<Result<ReadyView>> {
    return this.post<ReadyView>(`/matches/${encodeURIComponent(id)}/ready`, { ready })
  }

  async startMatch(id: string, expectedRevision = 0): Promise<Result<ClockView>> {
    return this.post<ClockView>(`/matches/${encodeURIComponent(id)}/start`, { expected_revision: expectedRevision })
  }

  async syncClock(id: string): Promise<Result<ClockView>> {
    return this.post<ClockView>(`/matches/${encodeURIComponent(id)}/sync`, { last_revision: 0 })
  }

  async syncMatch(id: string, revision = 0): Promise<Result<RoleSafeMatchView>> {
    const result = await this.post<{
      role: Role
      state: RoleSafeMatchView['state']
      server_now: string
      active_counts: { hunters: number; runners: number }
      can_end?: boolean
      can_claim?: boolean
      claim_expires_at?: string | null
      own_player_id?: string | null
      own_status?: 'ACTIVE' | 'TAGGED'
      revision: number
      next_ping_at?: string | null
      zone?: { enabled?: boolean; center?: { lat?: number; lon?: number }; radius?: number; stage?: number; nextShrinkAt?: string | null; nextRadius?: number | null }
      events: Array<{ type?: unknown; data?: unknown }>
    }>(`/matches/${encodeURIComponent(id)}/sync`, { last_revision: revision })
    if (!result.ok) return result
    const ownStatus: 'ACTIVE' | 'TAGGED' = result.data.own_status === 'TAGGED' ? 'TAGGED' : 'ACTIVE'
    const common = {
      state: result.data.state,
      server_now: result.data.server_now,
      active_counts: result.data.active_counts,
      can_end: result.data.can_end === true,
      can_claim: result.data.can_claim === true,
      claim_expires_at: result.data.claim_expires_at ?? null,
      own_player_id: result.data.own_player_id ?? '',
      own_status: ownStatus,
      revision: result.data.revision,
      next_ping_at: typeof result.data.next_ping_at === 'string' ? result.data.next_ping_at : null,
      zone: result.data.zone?.enabled === true && typeof result.data.zone.center?.lat === 'number'
        && typeof result.data.zone.center.lon === 'number' && typeof result.data.zone.radius === 'number'
        && typeof result.data.zone.stage === 'number'
        ? {
          center: { lat: result.data.zone.center.lat, lon: result.data.zone.center.lon },
          radius: result.data.zone.radius,
          stage: result.data.zone.stage,
          nextShrinkAt: typeof result.data.zone.nextShrinkAt === 'string' ? result.data.zone.nextShrinkAt : null,
          nextRadius: typeof result.data.zone.nextRadius === 'number' ? result.data.zone.nextRadius : null,
        } : null,
      own_team_positions: result.data.events.flatMap((event) => {
        if (event.type !== 'team.location_live' || !event.data || typeof event.data !== 'object') return []
        const data = event.data as Record<string, unknown>
        if (typeof data.player_id !== 'string' || typeof data.display_name !== 'string'
          || typeof data.lat !== 'number' || typeof data.lon !== 'number' || typeof data.accuracy_m !== 'number'
          || typeof data.captured_at !== 'string' || typeof data.age_seconds !== 'number' || typeof data.is_stale !== 'boolean') return []
        return [{ player_id: data.player_id, display_name: data.display_name, lat: data.lat, lon: data.lon,
          accuracy_m: data.accuracy_m, captured_at: data.captured_at, age_seconds: data.age_seconds, is_stale: data.is_stale }]
      }),
    }
    if (result.data.role === 'RUNNER') {
      const notice = result.data.events.find((event) => event.type === 'runner.location_revealed')?.data
      const value = notice && typeof notice === 'object' ? notice as Record<string, unknown> : null
      const runner_ping_notice = value && typeof value.ping_index === 'number' && typeof value.ping_at === 'string'
        ? { ping_index: value.ping_index, ping_at: value.ping_at } : null
      return { ok: true, data: { ...common, role: 'RUNNER', runner_ping_notice } }
    }
    if (result.data.role !== 'HUNTER') return error('INVALID_ROLE', 'The server did not confirm a match role.')
    const snapshots = result.data.events.flatMap((event) => {
      if (event.type !== 'hunter.runner_ping' || !event.data || typeof event.data !== 'object') return []
      const data = event.data as Record<string, unknown>
      if (typeof data.runner_id !== 'string' || !['OK', 'NO_FIX', 'STALE'].includes(String(data.status))
        || typeof data.age_seconds !== 'number' || typeof data.ping_index !== 'number') return []
      const base = { runner_id: data.runner_id, status: data.status as 'OK' | 'NO_FIX' | 'STALE', age_seconds: data.age_seconds, ping_index: data.ping_index,
        ...(typeof data.ping_at === 'string' ? { ping_at: data.ping_at } : {}) }
      if (base.status !== 'OK' || typeof data.lat !== 'number' || typeof data.lon !== 'number') return [base]
      return [{ ...base, lat: data.lat, lon: data.lon,
        ...(typeof data.captured_at === 'string' ? { captured_at: data.captured_at } : {}) }]
    })
    return { ok: true, data: { ...common, role: 'HUNTER', runner_snapshots: snapshots } }
  }

  async updateLocation(id: string, fix: LocationInput): Promise<Result<LocationAck>> {
    return this.post<LocationAck>(`/matches/${encodeURIComponent(id)}/location`, fix)
  }

  async issueQr(id: string): Promise<Result<QrChallenge>> {
    return this.post<QrChallenge>(`/matches/${encodeURIComponent(id)}/qr`, {})
  }

  async scanQr(id: string, token: string): Promise<Result<TagResult>> {
    return this.post<TagResult>(`/matches/${encodeURIComponent(id)}/qr/scan`, { token })
  }

  async gpsTag(id: string, fix: Omit<LocationInput, 'sequence'>): Promise<Result<TagResult>> {
    return this.post<TagResult>(`/matches/${encodeURIComponent(id)}/tag/gps`, fix)
  }

  async confirmTag(id: string): Promise<Result<TagResult>> {
    return this.post<TagResult>(`/matches/${encodeURIComponent(id)}/tag/confirm`, {})
  }

  async leaveMatch(id: string): Promise<Result<LeaveResult>> {
    return this.post<LeaveResult>(`/matches/${encodeURIComponent(id)}/leave`, {})
  }

  async claimController(id: string): Promise<Result<{ accepted: boolean; controller_player_id: string }>> {
    return this.post<{ accepted: boolean; controller_player_id: string }>(`/matches/${encodeURIComponent(id)}/host-claim`, {})
  }

  async getMatchResult(id: string): Promise<Result<MatchResult>> {
    return this.post<MatchResult>(`/matches/${encodeURIComponent(id)}/result`, {})
  }

  async endMatch(id: string, reason: string): Promise<Result<MatchResult>> {
    return this.post<MatchResult>(`/matches/${encodeURIComponent(id)}/end`, { reason })
  }

  async subscribe(id: string, role: Role, handlers: SafeHandlers): Promise<Unsubscribe> {
    const membership = await this.syncMatch(id)
    if (!membership.ok) throw new Error('REALTIME_MEMBERSHIP_REQUIRED: sync the match before joining a private channel.')
    if (membership.data.role !== role) throw new Error('REALTIME_ROLE_MISMATCH: the server confirmed a different role.')
    const config = settings()
    if (!config) throw new Error('CONFIG_REQUIRED: configure the public Supabase URL and anon key.')
    const session = await this.getSession()
    if (!session.ok) throw new Error('REALTIME_AUTH_REQUIRED: guest session could not be refreshed.')

    const { RealtimeClient } = await import('@supabase/realtime-js')
    const client = new RealtimeClient(`${config.url}/realtime/v1`, {
      params: { apikey: config.anonKey },
      accessToken: async () => {
        const current = await this.getSession()
        return current.ok ? current.data.access_token : null
      },
      logLevel: 'error',
    })
    await client.setAuth(session.data.access_token)
    let resyncingAfterReconnect = false
    const channel = client.channel(privateMatchTopic(id, role, membership.data.own_player_id), { config: { private: true } })
      .on('broadcast', { event: 'xzones.event' }, ({ payload }) => {
        if (resyncingAfterReconnect) return
        const safe = projectEventForRole(role, payload)
        if (safe && safe.match_id === id) handlers.onEvent({ type: safe.type, payload: safe })
      })

    await new Promise<void>((resolve, reject) => {
      let settled = false
      let firstSubscribe = true
      let timeout = 0
      const finish = (success: boolean, reason?: string) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        if (success) resolve()
        else reject(new Error(reason ?? 'REALTIME_UNAVAILABLE: private channel subscription failed.'))
      }
      timeout = window.setTimeout(() => finish(false), 15_000)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' && firstSubscribe) {
          firstSubscribe = false
          finish(true)
        } else if (status === 'SUBSCRIBED') {
          resyncingAfterReconnect = true
          void this.syncMatch(id).then((current) => {
            if (!current.ok || current.data.role !== role) {
              void client.removeChannel(channel)
              return
            }
            resyncingAfterReconnect = false
          })
        }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') finish(false)
      })
    }).catch(async (reason: unknown) => {
      await client.removeChannel(channel)
      throw reason
    })

    let removed = false
    return () => {
      if (removed) return
      removed = true
      void client.removeChannel(channel)
      void client.disconnect()
    }
  }
}

export const supabaseGameApi: GameApi = new SupabaseGameApi()
