import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HIDE_AND_SEEK_CONFIG, type Role } from '@xzones/game-core'
import { supabaseGameApi } from '../services/supabase-api'
import { ChatPanel } from '../components/ChatPanel'
import type { LobbyView, PlayerView } from '../services/game-api'
import { useLocationStore } from '../stores/location-store'

const reasonText: Record<string, string> = {
  NEEDS_TWO_PLAYERS: `At least ${HIDE_AND_SEEK_CONFIG.players.min.default} active players are needed.`,
  LOBBY_FULL: `This lobby has reached its ${HIDE_AND_SEEK_CONFIG.players.max.default}-player limit.`,
  NEEDS_TEAMS: 'Choose teams using the required Hunter count and assign everyone before starting.',
  WAITING_FOR_READY: 'Every player must be ready before the host can start.',
}

export function LobbyPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const [lobby, setLobby] = useState<LobbyView | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [hunterCount, setHunterCount] = useState(1)
  const [itemsEnabled, setItemsEnabled] = useState(false)
  const enableLocation = useLocationStore((state) => state.enable)
  const clearLocation = useLocationStore((state) => state.clearMatch)

  const refresh = useCallback(async () => {
    setPending(true)
    const result = await supabaseGameApi.getLobby(matchId)
    setPending(false)
    if (!result.ok) { setError(result.error.message); return }
    setError('')
    setLobby(result.data)
    const items = await supabaseGameApi.setItemsEnabled(matchId, null)
    if (items.ok) setItemsEnabled(items.data.items_enabled)
    setHunterCount(Math.min(Math.max(Math.ceil(result.data.players.length / HIDE_AND_SEEK_CONFIG.players.hunterCountDivisor.default), 1), Math.floor(result.data.players.length / 2)))
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
    let consentedLocation = false
    if (ready && !lobby?.you.ready) {
      if (!window.isSecureContext || !navigator.geolocation) {
        setError('Location permission requires HTTPS on a phone (localhost is allowed for development).')
        return
      }
      setPending(true)
      setError('Allow location to check the GPS permission. Coordinates are not retained by this check.')
      const permission = await new Promise<boolean>((resolve) => navigator.geolocation.getCurrentPosition(
        () => resolve(true), () => resolve(false), { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
      ))
      setPending(false)
      if (!permission) { setError('Location permission or a GPS fix is required before readying. Allow location and try again.'); return }
      consentedLocation = true
    }
    setPending(true)
    const result = await supabaseGameApi.setReady(matchId, ready)
    setPending(false)
    if (!result.ok) { if (ready) clearLocation(matchId); setError(result.error.message); return }
    if (consentedLocation) enableLocation(matchId)
    if (!ready) clearLocation(matchId)
    await refresh()
  }

  async function removePlayer(playerId: string) {
    if (!lobby || lobby.you.id !== lobby.controller_player_id || playerId === lobby.you.id) return
    setPending(true)
    const result = await supabaseGameApi.removeLobbyPlayer(matchId, playerId)
    setPending(false)
    if (!result.ok) { setError(result.error.message); return }
    await refresh()
  }

  async function applyHunterCount() {
    if (!lobby || !isController) return
    setPending(true)
    const result = await supabaseGameApi.setHunterCount(matchId, hunterCount)
    setPending(false)
    if (!result.ok) { setError(result.error.message); return }
    await refresh()
  }

  async function toggleItems(enabled: boolean) {
    setPending(true)
    const result = await supabaseGameApi.setItemsEnabled(matchId, enabled)
    setPending(false)
    if (!result.ok) { setError(result.error.message); return }
    setItemsEnabled(result.data.items_enabled)
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
        <p className="welcome__eyebrow">Private lobby · {lobby.players.length}/{HIDE_AND_SEEK_CONFIG.players.max.default}</p>
        <h1>Lobby</h1>
        <p className="welcome__copy">Choose a team, mark ready, then the host starts the server-timed round.</p>
        <Link className="welcome__secondary" to="/guide">Read Hide & Seek rules</Link>
      </div>
      <section className="state-panel lobby-panel" aria-label="Lobby players">
        <p className="field-help">Readying checks your GPS permission. During the round, your live location is shared with your teammates; Runner locations reach Hunters only in scheduled ping snapshots. GPS does not tag anyone.</p>
        <div className="lobby-code">
          <div><span className="field-help">Private join code</span><strong className="code-input">{lobby.code || 'Stored on creator device'}</strong></div>
          {isController ? <button className="welcome__secondary" onClick={() => void copyCode()} type="button">Copy code</button> : null}
        </div>
        <div className="lobby-counts" aria-label="Active team counts">
          <span className="team-count runner-count">{lobby.active_counts.runners} Runners</span>
          <span className="team-count hunter-count">{lobby.active_counts.hunters} Hunters</span>
        </div>
        {isController ? <div className="field-row">
          <label htmlFor="hunter-count">Hunter count (default {Math.min(Math.max(Math.ceil(lobby.players.length / HIDE_AND_SEEK_CONFIG.players.hunterCountDivisor.default), 1), Math.floor(lobby.players.length / 2))})</label>
          <input id="hunter-count" type="number" min={1} max={Math.floor(lobby.players.length / 2)} value={hunterCount}
            onChange={(event) => setHunterCount(Number(event.currentTarget.value))} disabled={pending || lobby.players.length < 2} />
          <button className="welcome__secondary" type="button" disabled={pending || lobby.players.length < 2 || hunterCount < 1 || hunterCount > Math.floor(lobby.players.length / 2)} onClick={() => void applyHunterCount()}>
            Assign teams
          </button>
        </div> : null}
        {isController ? <label className="check-field"><input type="checkbox" checked={itemsEnabled} disabled={pending} onChange={(event) => void toggleItems(event.currentTarget.checked)} /><span>Items on/off (experimental)</span></label> : <p className="field-help">Items are {itemsEnabled ? 'on' : 'off'} for this lobby.</p>}
        <div className="lobby-teams"><Roster title="Runners" players={runners} youId={lobby.you.id} controllerId={lobby.controller_player_id} onRemove={isController ? removePlayer : undefined} disabled={pending} />
        <Roster title="Hunters" players={hunters} youId={lobby.you.id} controllerId={lobby.controller_player_id} onRemove={isController ? removePlayer : undefined} disabled={pending} /></div>
        {unassigned.length ? <Roster title="Choose a team" players={unassigned} youId={lobby.you.id} controllerId={lobby.controller_player_id} onRemove={isController ? removePlayer : undefined} disabled={pending} /> : null}
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
      <ChatPanel matchId={matchId} />
    </main>
  )
}

function Roster({ title, players, youId, controllerId, onRemove, disabled }: {
  title: string
  players: PlayerView[]
  youId: string
  controllerId: string
  onRemove?: (playerId: string) => void
  disabled: boolean
}) {
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
            {onRemove && player.id !== youId
              ? <button aria-label={`Remove ${player.display_name} from lobby`} className="welcome__secondary" disabled={disabled} onClick={() => onRemove(player.id)} type="button">Remove</button>
              : null}
          </span>
        </div>
      )) : <p className="field-help">No players yet.</p>}
    </section>
  )
}
