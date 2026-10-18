import { balanceTeams } from '../../packages/game-core/src/rules.ts'

export const SIMULATION_EPOCH = Date.parse('2026-10-18T18:00:00.000Z')

export interface FakePlayer {
  id: `mock_player_${string}`
  display_name: string
  role: 'HUNTER' | 'RUNNER'
  ready: boolean
  status: 'ACTIVE'
}

export interface ThreePlayerScenario {
  source: 'SIMULATION'
  seed: 42
  match_id: `mock_match_${string}`
  code: `SIM-${string}`
  state: 'LOBBY'
  players: FakePlayer[]
  host_player_id: FakePlayer['id']
  active_counts: { hunters: number; runners: number }
  server_time_ms: number
}

export function createThreePlayerScenario(hostName: string, sequence: number): ThreePlayerScenario {
  const balance = balanceTeams(3)
  if (!balance) throw new Error('The deterministic simulator requires a valid 3-player balance.')

  const seed = String(sequence).padStart(3, '0')
  const hostId = `mock_player_${seed}_01` as const
  return {
    source: 'SIMULATION',
    seed: 42,
    match_id: `mock_match_${seed}`,
    code: `SIM-${seed}`,
    state: 'LOBBY',
    players: [
      { id: hostId, display_name: hostName, role: 'HUNTER', ready: false, status: 'ACTIVE' },
      { id: `mock_player_${seed}_02`, display_name: 'Demo Runner 1', role: 'RUNNER', ready: false, status: 'ACTIVE' },
      { id: `mock_player_${seed}_03`, display_name: 'Demo Runner 2', role: 'RUNNER', ready: false, status: 'ACTIVE' },
    ],
    host_player_id: hostId,
    active_counts: balance,
    server_time_ms: SIMULATION_EPOCH,
  }
}
