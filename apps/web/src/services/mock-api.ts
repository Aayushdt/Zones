import { canStartLobby, nextRandomRole, type Role } from '@xzones/game-core'
import {
  apiError,
  type CreateInput,
  type GameApi,
  type Result,
  type SimulationLobbyView,
} from './game-api'
import { createThreePlayerScenario } from '../../../../tools/simulator/scenario'

let mockSequence = 0

export function createMockApi(): GameApi<SimulationLobbyView> {
  if (!import.meta.env.DEV) {
    throw new Error('MOCK API is development-only.')
  }

  let lobby: SimulationLobbyView | undefined
  let role: Role = 'HUNTER'

  const notImplemented = <T>(): Result<T> => ({
    ok: false,
    error: apiError('SIMULATION_ONLY', 'This simulator action is not implemented yet.', false),
  })

  return {
    async createLobby(input: CreateInput) {
      mockSequence += 1
      const scenario = createThreePlayerScenario(input.display_name, mockSequence)
      lobby = {
        id: scenario.match_id,
        source: 'SIMULATION',
        code: scenario.code,
        state: 'LOBBY',
        you: { ...scenario.players[0] },
        players: scenario.players,
        host_player_id: scenario.host_player_id,
        controller_player_id: scenario.host_player_id,
        revision: 0,
        active_counts: scenario.active_counts,
        can_start: false,
        block_reason: 'WAITING_FOR_READY',
      }
      return { ok: true, data: lobby }
    },
    async joinLobby() {
      return {
        ok: false,
        error: apiError('SIM_CODE_ONLY', 'Simulator join codes are isolated from real matches.', false),
      }
    },
    async getLobby(id) {
      return lobby && lobby.id === id
        ? { ok: true, data: lobby }
        : { ok: false, error: apiError('SIMULATION_ONLY', 'Create the fake lobby inside the simulator first.', false) }
    },
    async removeLobbyPlayer() {
      return { ok: false, error: apiError('SIMULATION_ONLY', 'Player removal is available only in real lobbies.', false) }
    },
    async selectTeam(_id, nextRole) {
      if (!lobby) return notImplemented()
      if (nextRole === 'RANDOM') {
        const hunterCount = lobby.players.filter((player) => player.role === 'HUNTER').length
        role = nextRandomRole(lobby.players.length, hunterCount) ?? 'RUNNER'
      } else role = nextRole
      const players = lobby.players.map((player) => player.id === lobby?.you.id
        ? { ...player, role, ready: false }
        : player)
      const check = canStartLobby(players)
      const activeCounts = {
        runners: players.filter((player) => player.status === 'ACTIVE' && player.role === 'RUNNER').length,
        hunters: players.filter((player) => player.status === 'ACTIVE' && player.role === 'HUNTER').length,
      }
      lobby = { ...lobby, you: players.find((player) => player.id === lobby?.you.id)!, players,
        revision: lobby.revision + 1, active_counts: activeCounts, can_start: check.canStart, block_reason: check.blockReason }
      return lobby
        ? { ok: true, data: { role, active_counts: {
            runners: players.filter((player) => player.role === 'RUNNER').length,
            hunters: players.filter((player) => player.role === 'HUNTER').length,
          }, can_start: check.canStart, block_reason: check.blockReason } }
        : notImplemented()
    },
    async setHunterCount() { return notImplemented() },
    async setReady(_id, ready) {
      if (!lobby) return notImplemented()
      const players = lobby.players.map((player) => player.id === lobby?.you.id ? { ...player, ready } : player)
      lobby = { ...lobby, you: players.find((player) => player.id === lobby?.you.id)!, players }
      const active = players.filter((player) => player.status === 'ACTIVE')
      const check = canStartLobby(active)
      lobby = { ...lobby, revision: lobby.revision + 1, can_start: check.canStart,
        active_counts: check.activeCounts, block_reason: check.blockReason }
      return { ok: true, data: { ready, can_start: check.canStart, block_reason: check.blockReason } }
    },
    async startMatch() { return notImplemented() },
    async syncClock() { return notImplemented() },
    async syncMatch() { return notImplemented() },
    async updateLocation() { return notImplemented() },
    async issueQr() { return notImplemented() },
    async scanQr() { return notImplemented() },
    async gpsTag() { return notImplemented() },
    async confirmTag() { return notImplemented() },
    async leaveMatch() { return { ok: true, data: { accepted: true, state: 'LOBBY' as const } } },
    async claimController() { return notImplemented() },
    async getMatchResult() { return notImplemented() },
    async endMatch() { return notImplemented() },
    async subscribe() { return () => undefined },
  }
}
