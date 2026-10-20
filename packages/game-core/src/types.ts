export type Role = 'HUNTER' | 'RUNNER'

export type MatchState = 'LOBBY' | 'HEAD_START' | 'ACTIVE' | 'ENDED' | 'CANCELLED'

export type PlayerStatus = 'ACTIVE' | 'TAGGED' | 'LEFT'

export interface ActiveCounts {
  runners: number
  hunters: number
}

export interface TeamBalance {
  hunters: number
  runners: number
}

export interface TeamMember {
  role: Role | null
  status: PlayerStatus
  ready: boolean
}

export type StartBlockReason = 'NEEDS_TWO_PLAYERS' | 'LOBBY_FULL' | 'NEEDS_TEAMS' | 'WAITING_FOR_READY'

export interface StartCheck {
  canStart: boolean
  blockReason?: StartBlockReason
  activeCounts: ActiveCounts
}

export type MatchOutcome =
  | { winner: Role; reason: 'ALL_RUNNERS_TAGGED_OR_LEFT' | 'ALL_HUNTERS_LEFT' | 'TIME_LIMIT' }
  | null

export interface ActivePlayerCounts {
  runnerActive: number
  runnerTotal: number
  hunterActive: number
  hunterTotal: number
}
