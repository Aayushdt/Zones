import { createThreePlayerScenario, SIMULATION_EPOCH } from './scenario.ts'

Deno.test('fixed simulator scenario has three fake players balanced 1 Hunter / 2 Runners', () => {
  const first = createThreePlayerScenario('Host', 1)
  const repeat = createThreePlayerScenario('Host', 1)
  if (first.players.length !== 3 || first.active_counts.hunters !== 1 || first.active_counts.runners !== 2) {
    throw new Error('Expected a 3-player 1/2 team split.')
  }
  if (first.players.some((player) => !player.id.startsWith('mock_player_'))
    || !first.match_id.startsWith('mock_match_') || !first.code.startsWith('SIM-')) {
    throw new Error('Scenario IDs and code must be visibly fake.')
  }
  if (JSON.stringify(first) !== JSON.stringify(repeat) || first.server_time_ms !== SIMULATION_EPOCH) {
    throw new Error('Repeated runs must use the same data and deterministic clock.')
  }
})
