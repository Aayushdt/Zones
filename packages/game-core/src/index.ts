/** Shared domain vocabulary. Keep this package free of browser and network APIs. */
export type Role = 'HUNTER' | 'RUNNER'

export type MatchState = 'LOBBY' | 'HEAD_START' | 'ACTIVE' | 'ENDED' | 'CANCELLED'

export interface ActiveCounts {
  runners: number
  hunters: number
}

export interface TeamBalance {
  hunters: number
  runners: number
}

/** Evenly balances teams while keeping at least one Runner for 3–12 players. */
export function balanceTeams(playerCount: number): TeamBalance | null {
  if (!Number.isInteger(playerCount) || playerCount < 3 || playerCount > 12) {
    return null
  }

  const hunters = Math.min(Math.ceil(playerCount / 10), Math.floor(playerCount / 2))
  return { hunters, runners: playerCount - hunters }
}
