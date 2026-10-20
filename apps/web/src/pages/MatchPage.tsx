import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ClockView, RoleSafeMatchView } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'
import { GameMap, type GameMapData } from '../components/GameMap'
import { useLocationStore } from '../stores/location-store'
import { maintainScreenWakeLock } from '../services/device-lifecycle'
import { applyMatchRealtimeEvent, createRealtimeEventGate } from '../services/realtime-events'
import { startFallbackSync } from '../services/fallback-sync'

function timeLeft(clock: ClockView, anchor: number): number {
  const deadline = Date.parse(clock.ends_at)
  const serverAt = Date.parse(clock.server_now)
  return Number.isFinite(deadline) && Number.isFinite(serverAt)
    ? Math.max(0, Math.ceil((deadline - serverAt - (performance.now() - anchor)) / 1000)) : 0
}

export function MatchPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState<RoleSafeMatchView | null>(null)
  const [clock, setClock] = useState<ClockView | null>(null)
  const [seconds, setSeconds] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [liveStatus, setLiveStatus] = useState('Waiting for server role confirmation.')
  const anchor = useRef(0)
  const currentFix = useLocationStore((state) => state.ownFix)
  const locationStatus = useLocationStore((state) => state.status)
  const stopSharing = useLocationStore((state) => state.stopSharing)

  const sync = useCallback(async () => {
    setBusy(true)
    const [matchResult, clockResult] = await Promise.all([
      supabaseGameApi.syncMatch(matchId), supabaseGameApi.syncClock(matchId),
    ])
    setBusy(false)
    if (!matchResult.ok) { setError(matchResult.error.message); return }
    if (!clockResult.ok) { setError(clockResult.error.message); return }
    if (matchResult.data.state === 'HEAD_START') { navigate(`/match/${matchId}/head-start`, { replace: true }); return }
    if (matchResult.data.state === 'ENDED') { navigate(`/match/${matchId}/results`, { replace: true }); return }
    if (matchResult.data.state !== 'ACTIVE') { setError('The server says this match is not active.'); return }
    if (matchResult.data.own_status === 'TAGGED') {
      stopSharing(matchId, 'You are tagged. Location sharing and GPS watcher are stopped.')
    }
    setError('')
    setView(matchResult.data)
    setClock(clockResult.data)
    anchor.current = performance.now()
    setSeconds(timeLeft(clockResult.data, anchor.current))
  }, [matchId, navigate, stopSharing])

  useEffect(() => { void sync() }, [sync])
  useEffect(() => {
    if (!view || view.own_status === 'TAGGED') return
    let active = true
    let unsubscribe: (() => void) | undefined
    const gate = createRealtimeEventGate(view.role)
    setLiveStatus('Connecting to your private team channel…')
    void supabaseGameApi.subscribe(matchId, view.role, { onEvent: (received) => {
      if (!gate.accept(received.payload)) return
      setView((current) => {
        if (!current) return current
        const updated = applyMatchRealtimeEvent(current, received.payload)
        if (!updated) return current
        if (updated.own_status === 'TAGGED') stopSharing(matchId, 'You are tagged. Location sharing and GPS watcher are stopped.')
        if (updated.state === 'ENDED' || updated.state === 'CANCELLED') navigate(`/match/${matchId}/results`, { replace: true })
        return updated
      })
    } })
      .then((stop) => {
        if (!active) { stop(); return }
        unsubscribe = stop
        setLiveStatus('Private team channel connected. Role-safe fallback sync runs every 30–45 seconds.')
      })
      .catch(() => {
        if (active) setLiveStatus('Private channel unavailable; role-safe sync retries every 30–45 seconds.')
      })
    return () => { active = false; unsubscribe?.() }
  }, [matchId, navigate, stopSharing, view?.role, view?.own_status])
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (clock) setSeconds(timeLeft(clock, anchor.current))
    }, 250)
    return () => window.clearInterval(timer)
  }, [clock])
  useEffect(() => startFallbackSync(() => sync()), [sync])
  useEffect(() => {
    if (!view || view.state !== 'ACTIVE') return
    const wakeLockApi = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ released: boolean; release: () => Promise<void> }> } }).wakeLock
    return maintainScreenWakeLock(true, wakeLockApi, document)
  }, [view?.state])

  const ownPosition = currentFix ? { ...currentFix, player_id: view?.own_player_id ?? currentFix.player_id } : null
  const mapData: GameMapData | null = view ? view.role === 'RUNNER'
    ? { role: 'RUNNER', own_position: ownPosition, own_team_positions: view.own_team_positions }
    : { role: 'HUNTER', own_position: ownPosition, own_team_positions: view.own_team_positions, runner_snapshots: view.runner_snapshots }
    : null

  if (!view || !mapData) return (
    <main className="route-shell"><div className="route-shell__heading"><p className="welcome__eyebrow">XZones match</p><h1>Loading map</h1></div>
      <section className="state-panel" aria-live="polite"><p>{error || (busy ? 'Syncing your role-safe match view…' : 'Waiting for match data.')}</p>
        <button className="welcome__secondary" disabled={busy} onClick={() => void sync()} type="button">Retry sync</button></section>
    </main>
  )

  const roleLabel = view.role === 'RUNNER' ? 'Runner' : 'Hunter'
  return (
    <main className="match-page">
      <header className="match-hud">
        <Link className="match-menu" aria-label="Back to lobby" to={`/lobby/${matchId}`}>☰</Link>
        <div><strong>Hide and Seek</strong><span>{roleLabel} · ACTIVE</span></div>
        <div className="match-timer"><strong>{seconds === null ? '—:—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</strong><span>Time left</span></div>
        <div className="match-counts"><span className="runner-count">{view.active_counts.runners} Runners</span><span className="hunter-count">{view.active_counts.hunters} Hunters</span></div>
      </header>
      <section className="match-map-area">
        <GameMap data={mapData} />
        <div className="match-status-card" role="status" aria-live="polite">
          <div><strong>You are a {roleLabel}</strong><p>{view.role === 'RUNNER'
            ? view.own_status === 'TAGGED' ? 'You are tagged. Location sharing has stopped; your map displays active teammates only.' : 'Stay hidden. Your map displays your own team only.'
            : 'Hunter teammate positions and scheduled Runner ping snapshots are shown separately.'}</p></div>
          <div className="match-status-actions">
            {view.role === 'HUNTER' ? <Link className="welcome__secondary" to={`/match/${matchId}/pings`}>Pings</Link> : null}
            {view.can_end ? <button className="welcome__secondary" onClick={() => {
              if (window.confirm('End the match for everyone? This cannot be undone.')) {
                void supabaseGameApi.endMatch(matchId, 'HOST_END').then((result) => {
                  if (result.ok) navigate(`/match/${matchId}/results`, { replace: true })
                  else setError(result.error.message)
                })
              }
            }} type="button">End match</button> : null}
            {view.can_claim ? <Link className="welcome__secondary" to={`/match/${matchId}/host-claim`}>Claim host controls</Link> : null}
            <button className="welcome__secondary" onClick={() => {
              if (window.confirm('Leave this match? You cannot rejoin.')) {
                void supabaseGameApi.leaveMatch(matchId).then((result) => {
                  if (!result.ok) { setError(result.error.message); return }
                  if (result.data.state === 'ENDED' || result.data.state === 'CANCELLED') navigate(`/match/${matchId}/results`, { replace: true })
                  else navigate('/', { replace: true })
                })
              }
            }} type="button">Leave match</button>
            <button className="welcome__secondary" disabled={busy} onClick={() => void sync()} type="button">{busy ? 'Syncing…' : 'Sync now'}</button>
          </div>
        </div>
      </section>
      {error ? <p className="form-error match-error" role="alert">{error}</p> : null}
      <p className="match-text-status" role="status" aria-live="polite">Active players: {view.active_counts.runners} Runners and {view.active_counts.hunters} Hunters. {liveStatus} The map never displays opponent distances or directions.</p>
      <p className="match-text-status" role="status" aria-live="polite">{locationStatus}</p>
    </main>
  )
}
