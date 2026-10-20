import type { ActiveCounts, Role } from '@xzones/game-core'

export type MatchState = 'LOBBY' | 'HEAD_START' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
export type Result<T> = { ok: true; data: T } | { ok: false; error: ApiError }
export type ApiError = {
  code: string
  message: string
  retryable: boolean
  retryAfterSeconds?: number
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
  zone_lat?: number
  zone_lon?: number
  zone_shrink_stages?: number
  zone_shrink_interval_seconds?: number
  zone_final_radius_m?: number
  round_seconds: number | null
  head_start_seconds: number
  ping_seconds: number | null
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

export interface RemovePlayerResult { accepted: boolean; player_id: string; state: 'LOBBY' }

export interface ClockView {
  state: 'HEAD_START' | 'ACTIVE' | 'ENDED'
  server_now: string
  start_at: string
  head_start_ends_at: string
  ends_at: string | null
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
  own_status: 'ACTIVE' | 'TAGGED'
  next_ping_at: string | null
  zone: ZoneView | null
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

export interface LocationAck { accepted: boolean; server_now: string; player_id?: string; stale: boolean; reason?: string; zone_warning?: boolean; stationary_warning?: boolean; zone_revealed?: boolean; zone_eliminated?: boolean }
export interface ZoneView { center: { lat: number; lon: number }; radius: number; stage: number; nextShrinkAt: string | null; nextRadius: number | null }
export interface QrChallenge { token: string; expires_at: string; server_now: string }
export interface TagResult { accepted: boolean; state: MatchState; winner?: Role; reason?: 'NOTHING_IN_RANGE' }
export interface MatchResult {
  winner: Role | null
  end_reason: string
  ended_at: string
  duration_seconds: number
  tag_count: number
  suspicious_events?: Array<{ id: number; player_id: string; display_name: string; reason: string; created_at: string }>
}
export interface RejoinableMatch { match_id: string; state: 'LOBBY' | 'HEAD_START' | 'ACTIVE' }
export interface ChatMessage { id: number; player_id: string; author: string; role: Role | null; body: string; created_at: string }
export interface LeaveResult { accepted: boolean; state: MatchState; claim_expires_at?: string }
export type SafeHandlers = {
  onEvent: (event: { type: string; payload: unknown }) => void
}
export type Unsubscribe = () => void

export interface GameApi<Lobby extends LobbyView | SimulationLobbyView = LobbyView> {
  createLobby(input: CreateInput): Promise<Result<Lobby>>
  joinLobby(input: JoinInput): Promise<Result<Lobby>>
  getLobby(id: string): Promise<Result<Lobby>>
  removeLobbyPlayer(id: string, playerId: string): Promise<Result<RemovePlayerResult>>
  selectTeam(id: string, role: Role | 'RANDOM'): Promise<Result<TeamView>>
  setHunterCount(id: string, count: number): Promise<Result<{ hunters: number; runners: number }>>
  setReady(id: string, ready: boolean): Promise<Result<ReadyView>>
  startMatch(id: string, expectedRevision?: number): Promise<Result<ClockView>>
  syncClock(id: string): Promise<Result<ClockView>>
  syncMatch(id: string, revision?: number): Promise<Result<RoleSafeMatchView>>
  findRejoinableMatch(): Promise<Result<RejoinableMatch | null>>
  listChat(id: string): Promise<Result<{ messages: ChatMessage[] }>>
  sendChat(id: string, body: string): Promise<Result<ChatMessage>>
  submitBugReport(report: string): Promise<Result<{ accepted: boolean }>>
  setItemsEnabled(id: string, enabled: boolean | null): Promise<Result<{ items_enabled: boolean }>>
  activateItem(id: string, itemKey: string): Promise<Result<{ accepted: boolean; uses_remaining: number }>>
  reportVisibility(id: string, hidden: boolean): Promise<Result<{ accepted: boolean; hidden: boolean }>>
  updateLocation(id: string, fix: LocationInput): Promise<Result<LocationAck>>
  issueQr(id: string): Promise<Result<QrChallenge>>
  scanQr(id: string, token: string): Promise<Result<TagResult>>
  gpsTag(id: string, fix: Omit<LocationInput, 'sequence'>): Promise<Result<TagResult>>
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
