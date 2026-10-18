import { useState } from 'react'
import { StatePanel } from '../components/StatePanel'
import type { SimulationLobbyView } from '../services/game-api'
import { createMockApi } from '../services/mock-api'
import { SIMULATION_EPOCH } from '../../../../tools/simulator/scenario'

const mockApi = createMockApi()

export function SimulatorPage() {
  const [lobby, setLobby] = useState<SimulationLobbyView | null>(null)
  const [error, setError] = useState('')
  const [simulationNow, setSimulationNow] = useState(SIMULATION_EPOCH)

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
        SIMULATION: NOT A REAL MATCH · fake IDs · no network or GPS
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
    </main>
  )
}
