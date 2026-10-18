import type { Role } from '@xzones/game-core'
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
  type MatchResult,
  type QrChallenge,
  type ReadyView,
  type Result,
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

function parseApiError(value: unknown, status: number): ApiError {
  if (value !== null && typeof value === 'object') {
    const root = value as { error?: unknown }
    if (root.error !== null && typeof root.error === 'object') {
      const detail = root.error as { code?: unknown; message?: unknown }
      if (typeof detail.code === 'string' && typeof detail.message === 'string') {
        return apiError(detail.code, detail.message, status >= 500)
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

  private async post<T>(path: string, body: object, retry = true): Promise<Result<T>> {
    const config = settings()
    if (!config) {
      return error('CONFIG_REQUIRED', 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to apps/web/.env.local, then restart Vite.')
    }
    const session = await this.getSession()
    if (!session.ok) return session

    try {
      const response = await fetch(`${config.url}/functions/v1/api${path}`, {
        method: 'POST',
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
        return this.post<T>(path, body, false)
      }
      if (!response.ok) return { ok: false, error: parseApiError(payload, response.status) }
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
    return this.post<RoleSafeMatchView>(`/matches/${encodeURIComponent(id)}/sync`, { last_revision: revision })
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

  async confirmTag(id: string): Promise<Result<TagResult>> {
    return this.post<TagResult>(`/matches/${encodeURIComponent(id)}/tag/confirm`, {})
  }

  async leaveMatch(id: string): Promise<Result<void>> {
    return this.post<void>(`/matches/${encodeURIComponent(id)}/leave`, {})
  }

  async endMatch(id: string, reason: string): Promise<Result<MatchResult>> {
    return this.post<MatchResult>(`/matches/${encodeURIComponent(id)}/end`, { reason })
  }

  async subscribe(_id: string, _role: Role, _handlers: SafeHandlers): Promise<Unsubscribe> {
    throw new Error('REALTIME_NOT_READY: a live subscription is unavailable until server channel authorization is configured.')
  }
}

export const supabaseGameApi: GameApi = new SupabaseGameApi()
