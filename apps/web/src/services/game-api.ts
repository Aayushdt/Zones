import type { ActiveCounts, Role } from '@xzones/game-core'

export type MatchState = 'LOBBY' | 'HEAD_START' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }
export type ApiError = {
  code: string
  message: string
  retryable: boolean
}

export interface PlayerView {
  id: string
  display_name: string
  role: Role | null
  ready: boolean
  status: 'ACTIVE' | 'TAGGED' | 'LEFT'
}

export interface LobbyView {
  id: string
  source: 'REAL'
  code: string
  state: 'LOBBY'
  you: PlayerView
  players: PlayerView[]
  host_player_id: string
  controller_player_id: string
  revision: number
  active_counts: ActiveCounts
  can_start: boolean
  block_reason?: string
}

export interface SimulationLobbyView extends Omit<LobbyView, 'id' | 'source' | 'code'> {
  id: `mock_${string}`
  source: 'SIMULATION'
  code: `SIM-${string}`
}

export interface CreateInput {
  display_name: string
  zone_diameter_m?: number
  round_seconds: number
  head_start_seconds: number
  ping_seconds: number
}

export interface JoinInput {
  code: string
  display_name: string
}

export interface TeamView {
  role: Role
  active_counts: ActiveCounts
  can_start: boolean
  block_reason?: string
}

export interface ReadyView {
  ready: boolean
  can_start: boolean
  block_reason?: string
}

export interface ClockView {
  state: 'HEAD_START' | 'ACTIVE' | 'ENDED'
  server_now: string
  start_at: string
  head_start_ends_at: string
  ends_at: string
}

interface MatchViewBase {
  state: MatchState
  revision: number
  server_now: string
  active_counts: ActiveCounts
  can_end: boolean
  can_claim: boolean
  claim_expires_at: string | null
  own_player_id: string
  next_ping_at: string | null
  own_team_positions: Array<{ player_id: string; display_name: string; lat: number; lon: number; accuracy_m: number; captured_at: string; age_seconds: number; is_stale: boolean }>
}

export interface RunnerMatchView extends MatchViewBase {
  role: 'RUNNER'
  runner_ping_notice: { ping_index: number; ping_at: string } | null
}

export interface HunterMatchView extends MatchViewBase {
  role: 'HUNTER'
  runner_snapshots: Array<{
    runner_id: string
    status: 'OK' | 'NO_FIX' | 'STALE'
    lat?: number
    lon?: number
    captured_at?: string
    ping_at?: string
    age_seconds: number
    ping_index: number
  }>
}

export type RoleSafeMatchView = RunnerMatchView | HunterMatchView

export interface LocationInput {
  lat: number
  lon: number
  accuracy_m: number
  captured_at: string
  sequence: number
}

export interface LocationAck { accepted: boolean; server_now: string; player_id?: string; stale: boolean; reason?: string }
export interface QrChallenge { token: string; expires_at: string; server_now: string }
export interface TagResult { accepted: boolean; state: MatchState; winner?: Role }
export interface MatchResult { winner: Role | null; end_reason: string; ended_at: string; duration_seconds: number; tag_count: number }
export interface LeaveResult { accepted: boolean; state: MatchState; claim_expires_at?: string }
export type SafeHandlers = {
  onEvent: (event: { type: string; payload: unknown }) => void
}
export type Unsubscribe = () => void

export interface GameApi<Lobby extends LobbyView | SimulationLobbyView = LobbyView> {
  createLobby(input: CreateInput): Promise<Result<Lobby>>
  joinLobby(input: JoinInput): Promise<Result<Lobby>>
  getLobby(id: string): Promise<Result<Lobby>>
  selectTeam(id: string, role: Role | 'RANDOM'): Promise<Result<TeamView>>
  setReady(id: string, ready: boolean): Promise<Result<ReadyView>>
  startMatch(id: string, expectedRevision?: number): Promise<Result<ClockView>>
  syncClock(id: string): Promise<Result<ClockView>>
  syncMatch(id: string, revision?: number): Promise<Result<RoleSafeMatchView>>
  updateLocation(id: string, fix: LocationInput): Promise<Result<LocationAck>>
  issueQr(id: string): Promise<Result<QrChallenge>>
  scanQr(id: string, token: string): Promise<Result<TagResult>>
  confirmTag(id: string): Promise<Result<TagResult>>
  leaveMatch(id: string): Promise<Result<LeaveResult>>
  claimController(id: string): Promise<Result<{ accepted: boolean; controller_player_id: string }>>
  getMatchResult(id: string): Promise<Result<MatchResult>>
  endMatch(id: string, reason: string): Promise<Result<MatchResult>>
  subscribe(id: string, role: Role, handlers: SafeHandlers): Promise<Unsubscribe>
}

export function apiError(code: string, message: string, retryable = false): ApiError {
  return { code, message, retryable }
}
