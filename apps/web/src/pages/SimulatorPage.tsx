import { useState } from 'react'
import { StatePanel } from '../components/StatePanel'
import type { SimulationLobbyView } from '../services/game-api'
import { createMockApi } from '../services/mock-api'
import { SIMULATION_EPOCH } from '../../../../tools/simulator/scenario'
import { GameMap, type GameMapData, type MapPlayerPoint } from '../components/GameMap'

const mockApi = createMockApi()

export function SimulatorPage() {
  const [lobby, setLobby] = useState<SimulationLobbyView | null>(null)
  const [error, setError] = useState('')
  const [simulationNow, setSimulationNow] = useState(SIMULATION_EPOCH)
  const [previewRole, setPreviewRole] = useState<'RUNNER' | 'HUNTER'>('HUNTER')

  const points: MapPlayerPoint[] = [
    { player_id: 'mock_player_001_01', display_name: 'Demo Hunter', lat: 25.611, lon: 85.141, accuracy_m: 12, captured_at: new Date(simulationNow).toISOString() },
    { player_id: 'mock_player_001_02', display_name: 'Demo Runner 1', lat: 25.614, lon: 85.147, accuracy_m: 16, captured_at: new Date(simulationNow - 300_000).toISOString() },
    { player_id: 'mock_player_001_03', display_name: 'Demo Runner 2', lat: 25.607, lon: 85.136, accuracy_m: 20, captured_at: new Date(simulationNow - 600_000).toISOString() },
  ]
  const mapData: GameMapData = previewRole === 'HUNTER'
    ? { role: 'HUNTER', own_position: points[0], own_team_positions: [], runner_snapshots: [
        { runner_id: points[1].player_id, status: 'OK', lat: points[1].lat, lon: points[1].lon, age_seconds: 310, ping_index: 1 },
        { runner_id: points[2].player_id, status: 'STALE', age_seconds: 620, ping_index: 1 },
      ] }
    : { role: 'RUNNER', own_position: points[1], own_team_positions: points.slice(1) }

  async function createSimulation() {
    const result = await mockApi.createLobby({
      display_name: 'Demo Host',
      round_seconds: 2700,
      head_start_seconds: 180,
      ping_seconds: 300,
    })
    if (result.ok) {
      setLobby(result.data)
      setSimulationNow(SIMULATION_EPOCH)
      setError('')
    } else {
      setError(result.error.message)
    }
  }

  return (
    <main className="route-shell">
      <div className="simulation-banner" role="alert">
        SIMULATION: NOT A REAL MATCH · fake IDs · no match API or GPS tracking
      </div>
      <div className="route-shell__heading">
        <p className="welcome__eyebrow">Development only</p>
        <h1>Simulator</h1>
        <p className="welcome__copy">This isolated MOCK adapter cannot create or join a real match.</p>
      </div>
      <p className="simulator-clock" role="status">
        Simulation clock: {new Date(simulationNow).toISOString()}
        <button className="welcome__secondary" type="button" onClick={() => setSimulationNow((now) => now + 60_000)}>
          Advance 1 minute
        </button>
      </p>
      <StatePanel state={error ? 'error' : lobby ? 'success' : 'empty'} onRetry={createSimulation}>
        {lobby ? (
          <dl className="simulation-details">
            <dt>Simulation match ID</dt><dd>{lobby.id}</dd>
            <dt>Simulation join code</dt><dd>{lobby.code}</dd>
            <dt>Source</dt><dd>{lobby.source}</dd>
            <dt>Fake players</dt><dd>{lobby.players.length} · 1 Hunter / 2 Runners</dd>
          </dl>
        ) : <p>{error || 'Create a fake lobby to inspect the MOCK adapter response.'}</p>}
        {!lobby ? (
          <button className="welcome__action" type="button" onClick={createSimulation}>
            Create simulation lobby
          </button>
        ) : null}
      </StatePanel>
      <section className="state-panel simulator-map-preview">
        <h2>Role-filtered map preview</h2>
        <div className="team-picker" aria-label="Choose simulation map role">
          {(['HUNTER', 'RUNNER'] as const).map((role) => (
            <button className={previewRole === role ? 'segment is-selected' : 'segment'} aria-pressed={previewRole === role} key={role} onClick={() => setPreviewRole(role)} type="button">View as {role === 'HUNTER' ? 'Hunter' : 'Runner'}</button>
          ))}
        </div>
        <GameMap data={mapData} zone={{ lat: 25.611, lon: 85.141, radius_m: 500 }} simulation />
        <p className="field-help">Hunter snapshots are aged and visually distinct. Runner map data has no Hunter field or point.</p>
      </section>
    </main>
  )
}
