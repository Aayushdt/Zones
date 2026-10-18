import { nextRandomRole, type Role } from '@xzones/game-core'
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
      if (!lobby) return notImplemented()
      if (nextRole === 'RANDOM') {
        const hunterCount = lobby.players.filter((player) => player.role === 'HUNTER').length
        role = nextRandomRole(lobby.players.length, hunterCount) ?? 'RUNNER'
      } else role = nextRole
      const players = lobby.players.map((player) => player.id === lobby?.you.id
        ? { ...player, role, ready: false }
        : player)
      lobby = { ...lobby, you: players.find((player) => player.id === lobby?.you.id)!, players }
      return lobby
        ? { ok: true, data: { role, active_counts: {
            runners: players.filter((player) => player.role === 'RUNNER').length,
            hunters: players.filter((player) => player.role === 'HUNTER').length,
          } } }
        : notImplemented()
    },
    async setReady(_id, ready) {
      if (!lobby) return notImplemented()
      const players = lobby.players.map((player) => player.id === lobby?.you.id ? { ...player, ready } : player)
      lobby = { ...lobby, you: players.find((player) => player.id === lobby?.you.id)!, players }
      const active = players.filter((player) => player.status === 'ACTIVE')
      const hunters = active.filter((player) => player.role === 'HUNTER').length
      const runners = active.filter((player) => player.role === 'RUNNER').length
      const canStart = active.length >= 3 && active.length <= 12 && hunters > 0 && runners > 0 && active.every((player) => player.ready)
      return { ok: true, data: { ready, can_start: canStart, block_reason: canStart ? undefined : 'SIMULATION_ONLY' } }
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
