import type { Role } from '@xzones/game-core'
import {
  apiError,
  type CreateInput,
  type GameApi,
  type Result,
  type SimulationLobbyView,
} from './game-api'

let mockSequence = 0

export function createMockApi(): GameApi<SimulationLobbyView> {
  if (!import.meta.env.DEV) {
    throw new Error('MOCK API is development-only.')
  }

  let lobby: SimulationLobbyView | undefined
  let role: Role = 'RUNNER'
  let isReady = false

  const notImplemented = <T>(): Result<T> => ({
    ok: false,
    error: apiError('SIMULATION_ONLY', 'This simulator action is not implemented yet.', false),
  })

  return {
    async createLobby(input: CreateInput) {
      mockSequence += 1
      const playerId = `mock_player_${mockSequence}`
      lobby = {
        id: `mock_match_${mockSequence}`,
        source: 'SIMULATION',
        code: `SIM-${String(mockSequence).padStart(3, '0')}`,
        state: 'LOBBY',
        you: { id: playerId, display_name: input.display_name, role, ready: false, status: 'ACTIVE' },
        players: [{ id: playerId, display_name: input.display_name, role, ready: false, status: 'ACTIVE' }],
        host_player_id: playerId,
      }
      return { ok: true, data: lobby }
    },
    async joinLobby() {
      return {
        ok: false,
        error: apiError('SIM_CODE_ONLY', 'Simulator join codes are isolated from real matches.', false),
      }
    },
    async selectTeam(_id, nextRole) {
      role = nextRole === 'RANDOM' ? 'RUNNER' : nextRole
      return lobby
        ? { ok: true, data: { role, active_counts: { runners: role === 'RUNNER' ? 1 : 0, hunters: role === 'HUNTER' ? 1 : 0 } } }
        : notImplemented()
    },
    async setReady() {
      isReady = !isReady
      return { ok: true, data: { ready: isReady, can_start: false, block_reason: 'SIMULATION — add players to continue.' } }
    },
    async startMatch() { return notImplemented() },
    async syncMatch() { return notImplemented() },
    async updateLocation() { return notImplemented() },
    async issueQr() { return notImplemented() },
    async scanQr() { return notImplemented() },
    async confirmTag() { return notImplemented() },
    async leaveMatch() { return { ok: true, data: undefined } },
    async endMatch() { return notImplemented() },
    async subscribe() { return () => undefined },
  }
}
