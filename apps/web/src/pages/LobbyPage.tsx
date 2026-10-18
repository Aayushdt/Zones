import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Role } from '@xzones/game-core'
import { supabaseGameApi } from '../services/supabase-api'
import type { LobbyView, PlayerView } from '../services/game-api'

const reasonText: Record<string, string> = {
  NEEDS_THREE_PLAYERS: 'At least three active players are needed.',
  LOBBY_FULL: 'This lobby has reached its 12-player limit.',
  NEEDS_TEAMS: 'Assign every player to a team. Keep at least one Runner and one Hunter.',
  WAITING_FOR_READY: 'Every player must be ready before the host can start.',
}

export function LobbyPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const [lobby, setLobby] = useState<LobbyView | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setPending(true)
    const result = await supabaseGameApi.getLobby(matchId)
    setPending(false)
    if (!result.ok) { setError(result.error.message); return }
    setError('')
    setLobby(result.data)
  }, [matchId])

  useEffect(() => { void refresh() }, [refresh])

  async function selectTeam(role: Role | 'RANDOM') {
    if (!lobby) return
    setPending(true)
    const result = await supabaseGameApi.selectTeam(matchId, role)
    setPending(false)
    if (!result.ok) { setError(result.error.message); return }
    await refresh()
  }

  async function setReady(ready: boolean) {
    setPending(true)
    const result = await supabaseGameApi.setReady(matchId, ready)
    setPending(false)
    if (!result.ok) { setError(result.error.message); return }
    await refresh()
  }

  async function start() {
    if (!lobby?.can_start || lobby.you.id !== lobby.controller_player_id) return
    setPending(true)
    const result = await supabaseGameApi.startMatch(matchId, lobby.revision)
    setPending(false)
    if (!result.ok) { setError(result.error.message); await refresh(); return }
    navigate(`/match/${matchId}/head-start`, { state: { clock: result.data } })
  }

  async function copyCode() {
    if (!lobby?.code) { setError('The code is not available on this device. Ask the host to share it again.'); return }
    try { await navigator.clipboard.writeText(lobby.code); setError('Lobby code copied.') }
    catch { setError('Could not copy the code. Share it manually: ' + lobby.code) }
  }

  if (!lobby) return (
    <main className="route-shell">
      <div className="route-shell__heading"><p className="welcome__eyebrow">Private lobby</p><h1>Lobby</h1></div>
      <section className="state-panel" aria-live="polite">
        <p>{error || (pending ? 'Loading private lobby…' : 'Could not load lobby.')}</p>
        <button className="welcome__secondary" disabled={pending} onClick={() => void refresh()} type="button">Try again</button>
        <Link className="welcome__secondary" to="/">Home</Link>
      </section>
    </main>
  )

  const isController = lobby.you.id === lobby.controller_player_id
  const ownRole = lobby.you.role
  const hunters = lobby.players.filter((player) => player.role === 'HUNTER')
  const runners = lobby.players.filter((player) => player.role === 'RUNNER')
  const unassigned = lobby.players.filter((player) => player.role === null)

  return (
    <main className="route-shell lobby-page">
      <div className="route-shell__heading">
        <p className="welcome__eyebrow">Private lobby · {lobby.players.length}/12</p>
        <h1>Lobby</h1>
        <p className="welcome__copy">Choose a team, mark ready, then the host starts the server-timed round.</p>
      </div>
      <section className="state-panel lobby-panel" aria-label="Lobby players">
        <div className="lobby-code">
          <div><span className="field-help">Private join code</span><strong className="code-input">{lobby.code || 'Stored on creator device'}</strong></div>
          {isController ? <button className="welcome__secondary" onClick={() => void copyCode()} type="button">Copy code</button> : null}
        </div>
        <div className="lobby-counts" aria-label="Active team counts">
          <span className="team-count runner-count">{lobby.active_counts.runners} Runners</span>
          <span className="team-count hunter-count">{lobby.active_counts.hunters} Hunters</span>
        </div>
        <Roster title="Runners" players={runners} youId={lobby.you.id} controllerId={lobby.controller_player_id} />
        <Roster title="Hunters" players={hunters} youId={lobby.you.id} controllerId={lobby.controller_player_id} />
        {unassigned.length ? <Roster title="Choose a team" players={unassigned} youId={lobby.you.id} controllerId={lobby.controller_player_id} /> : null}
        <div className="team-picker" aria-label="Choose team">
          {(['RUNNER', 'HUNTER', 'RANDOM'] as const).map((role) => (
            <button key={role} className={ownRole === role ? 'segment is-selected' : 'segment'} aria-pressed={ownRole === role} disabled={pending} onClick={() => void selectTeam(role)} type="button">
              {role === 'RANDOM' ? 'Random' : role === 'RUNNER' ? 'Runner' : 'Hunter'}
            </button>
          ))}
        </div>
        <div className="lobby-actions">
          <button className="welcome__secondary" disabled={pending || !ownRole} onClick={() => void setReady(!lobby.you.ready)} type="button">
            {lobby.you.ready ? 'Cancel ready' : 'I’m ready'}
          </button>
          {isController ? <button className="welcome__action primary-action" disabled={pending || !lobby.can_start} onClick={() => void start()} type="button">Start game</button> : <p className="field-help">Waiting for the host to start.</p>}
        </div>
        <p className="field-help" aria-live="polite">{lobby.can_start ? 'All players ready.' : reasonText[lobby.block_reason ?? ''] ?? 'Waiting for lobby updates.'}</p>
        {error ? <p className="form-error" role="status">{error}</p> : null}
        <button className="welcome__secondary refresh-button" disabled={pending} onClick={() => void refresh()} type="button">{pending ? 'Updating…' : 'Refresh lobby'}</button>
      </section>
    </main>
  )
}

function Roster({ title, players, youId, controllerId }: { title: string; players: PlayerView[]; youId: string; controllerId: string }) {
  return (
    <section className="roster" aria-label={title}>
      <h2>{title} <span>{players.length}</span></h2>
      {players.length ? players.map((player) => (
        <div className="roster-row" key={player.id}>
          <span>{player.display_name}{player.id === youId ? ' (You)' : ''}</span>
          <span className="roster-badges">
            {player.id === controllerId ? <span className="ready-chip host-chip">Host</span> : null}
            {player.id === youId && player.id !== controllerId ? <span className="ready-chip">You</span> : null}
            {player.ready ? <span className="ready-chip">Ready</span> : <span className="not-ready-chip">Not ready</span>}
          </span>
        </div>
      )) : <p className="field-help">No players yet.</p>}
    </section>
  )
}
