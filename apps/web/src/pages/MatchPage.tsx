import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ClockView, RoleSafeMatchView } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'
import { GameMap, type GameMapData } from '../components/GameMap'
import { useLocationStore } from '../stores/location-store'
import { maintainScreenWakeLock } from '../services/device-lifecycle'
import { applyMatchRealtimeEvent, createRealtimeEventGate } from '../services/realtime-events'
import { startFallbackSync } from '../services/fallback-sync'
import { HIDE_AND_SEEK_CONFIG } from '@xzones/game-core'
import { ChatPanel } from '../components/ChatPanel'

function timeLeft(clock: ClockView, anchor: number): number | null {
  if (clock.ends_at === null) return null
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
  const [zoneSeconds, setZoneSeconds] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [itemsEnabled, setItemsEnabled] = useState(false)
  const [scanPositions, setScanPositions] = useState<Array<{ runner_id: string; lat: number; lon: number; age_seconds: number; ping_index: number }>>([])
  const [scanExpiry, setScanExpiry] = useState<number | null>(null)
  const [scanAvailable, setScanAvailable] = useState(true)
  const [alarmAvailable, setAlarmAvailable] = useState(true)
  const [alarmNotice, setAlarmNotice] = useState('')
  const [alarmExpiresAt, setAlarmExpiresAt] = useState<number | null>(null)
  const [zoneNotice, setZoneNotice] = useState('')
  const [zoneMoverAvailable, setZoneMoverAvailable] = useState(true)
  const [decoyAvailable, setDecoyAvailable] = useState(true)
  const [stealth, setStealth] = useState(false)
  const [liveStatus, setLiveStatus] = useState('Waiting for server role confirmation.')
  const anchor = useRef(0)
  const stealthExitTimer = useRef<number | null>(null)
  const currentFix = useLocationStore((state) => state.ownFix)
  const locationStatus = useLocationStore((state) => state.status)
  const stopSharing = useLocationStore((state) => state.stopSharing)

  const sync = useCallback(async () => {
    setBusy(true)
    const [matchResult, clockResult, itemStatus] = await Promise.all([
      supabaseGameApi.syncMatch(matchId), supabaseGameApi.syncClock(matchId), supabaseGameApi.setItemsEnabled(matchId, null),
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
    if (itemStatus.ok) setItemsEnabled(itemStatus.data.items_enabled)
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
      const envelope = received.payload as { type?: unknown } | null
      if (envelope && envelope.type === 'zone.moved') {
        setZoneNotice('The Hunter moved the play zone. Updating your map.')
        void sync()
        return
      }
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
  useEffect(() => {
    const nextShrinkAt = view?.zone?.nextShrinkAt
    if (!nextShrinkAt) { setZoneSeconds(null); return }
    const update = () => setZoneSeconds(Math.max(0, Math.ceil((Date.parse(nextShrinkAt) - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [view?.zone?.nextShrinkAt])
  useEffect(() => startFallbackSync(() => sync()), [sync])
  useEffect(() => {
    if (scanExpiry === null) return
    const remaining = Math.max(0, scanExpiry - Date.now())
    const timer = window.setTimeout(() => { setScanPositions([]); setScanExpiry(null) }, remaining)
    return () => window.clearTimeout(timer)
  }, [scanExpiry])
  useEffect(() => {
    if (!itemsEnabled || view?.role !== 'HUNTER' || alarmExpiresAt === null) return
    let active = true
    const check = async () => {
      const result = await supabaseGameApi.listItemAlerts(matchId)
      if (!active || !result.ok || result.data.alerts.length === 0) return
      setAlarmNotice('A Runner entered your proximity alarm range.')
    }
    void check()
    const timer = window.setInterval(() => void check(), HIDE_AND_SEEK_CONFIG.items.hunterAlarmPollSeconds.default * 1000)
    const expiryTimer = window.setTimeout(() => setAlarmExpiresAt(null), Math.max(0, alarmExpiresAt - Date.now()))
    return () => { active = false; window.clearInterval(timer); window.clearTimeout(expiryTimer) }
  }, [alarmExpiresAt, itemsEnabled, matchId, view?.role])
  useEffect(() => {
    if (!view || view.state !== 'ACTIVE') return
    const wakeLockApi = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ released: boolean; release: () => Promise<void> }> } }).wakeLock
    return maintainScreenWakeLock(true, wakeLockApi, document)
  }, [view?.state])

  const ownPosition = currentFix ? { ...currentFix, player_id: view?.own_player_id ?? currentFix.player_id } : null
  const mapData: GameMapData | null = view ? view.role === 'RUNNER'
    ? { role: 'RUNNER', own_position: ownPosition, own_team_positions: view.own_team_positions }
    : { role: 'HUNTER', own_position: ownPosition, own_team_positions: view.own_team_positions, runner_snapshots: [
      ...view.runner_snapshots,
      ...scanPositions.map((position) => ({ runner_id: position.runner_id, status: 'OK' as const, lat: position.lat, lon: position.lon, age_seconds: position.age_seconds, ping_index: position.ping_index })),
    ] }
    : null

  async function activateScan() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'HUNTER_SCAN')
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setScanAvailable(false)
    const positions = result.data.runner_positions ?? []
    setScanPositions(positions.map((position) => ({ ...position, ping_index: -1 })))
    setScanExpiry(Date.now() + HIDE_AND_SEEK_CONFIG.items.hunterScanSeconds.default * 1000)
    setError(positions.length ? `Scan reveals ${positions.length} fresh Runner fix${positions.length === 1 ? '' : 'es'} temporarily.` : 'Scan found no fresh Runner fixes.')
  }

  async function placeAlarm() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'HUNTER_ALARM')
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setAlarmAvailable(false)
    setAlarmExpiresAt(result.data.active_until ? Date.parse(result.data.active_until) : Date.now() + HIDE_AND_SEEK_CONFIG.items.hunterAlarmSeconds.default * 1000)
    setError('Proximity alarm placed at your latest server-accepted location.')
  }

  async function moveZone() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'HUNTER_ZONE_MOVER')
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setZoneMoverAvailable(false)
    setZoneNotice('The play zone moved. Updating your map.')
    await sync()
  }

  async function activateDecoy() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'RUNNER_DECOY')
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setDecoyAvailable(false)
    setError('Decoy is armed for the next Hunter ping.')
  }

  const cancelStealthExit = () => {
    if (stealthExitTimer.current !== null) window.clearTimeout(stealthExitTimer.current)
    stealthExitTimer.current = null
  }
  const holdToExitStealth = () => {
    cancelStealthExit()
    stealthExitTimer.current = window.setTimeout(() => setStealth(false), HIDE_AND_SEEK_CONFIG.stealth.exitHoldMs.default)
  }

  if (!view || !mapData) return (
    <main className="route-shell"><div className="route-shell__heading"><p className="welcome__eyebrow">XZones match</p><h1>Loading map</h1></div>
      <section className="state-panel" aria-live="polite"><p>{error || (busy ? 'Syncing your role-safe match view…' : 'Waiting for match data.')}</p>
        <button className="welcome__secondary" disabled={busy} onClick={() => void sync()} type="button">Retry sync</button></section>
    </main>
  )

  const roleLabel = view.role === 'RUNNER' ? 'Runner' : 'Hunter'
  return (
    <main className={`match-page${stealth ? ' match-page--stealth' : ''}`}>
      {!stealth && <button className="match-stealth-toggle" onClick={() => setStealth(true)} type="button">Stealth screen</button>}
      <header className="match-hud">
        <Link className="match-menu" aria-label="Back to lobby" to={`/lobby/${matchId}`}>☰</Link>
        <div><strong>Hide and Seek</strong><span>{roleLabel} · ACTIVE</span></div>
        <div className="match-timer"><strong>{seconds === null ? 'No timer' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</strong><span>{seconds === null ? 'Until match outcome' : 'Time left'}</span></div>
        <div className="match-counts"><span className="runner-count">{view.active_counts.runners} Runners</span><span className="hunter-count">{view.active_counts.hunters} Hunters</span></div>
      </header>
      <section className="match-map-area">
        <GameMap data={mapData} zone={view.zone ? {
          lat: view.zone.center.lat, lon: view.zone.center.lon, radius_m: view.zone.radius,
          ...(view.zone.nextRadius !== null ? { next_radius_m: view.zone.nextRadius } : {}),
        } : undefined} />
        <div className="match-status-card" role="status" aria-live="polite">
          <div><strong>You are a {roleLabel}</strong><p>{view.role === 'RUNNER'
            ? view.own_status === 'TAGGED' ? 'You are tagged. Location sharing has stopped; your map displays active teammates only.' : 'Stay hidden. Your map displays your own team only.'
            : 'Hunter teammate positions and scheduled Runner ping snapshots are shown separately.'}</p></div>
          <div className="match-status-actions">
            {view.role === 'HUNTER' ? <Link className="welcome__secondary" to={`/match/${matchId}/pings`}>Pings</Link> : null}
            {view.role === 'HUNTER' && itemsEnabled ? <button className="welcome__secondary" disabled={busy || !scanAvailable} onClick={() => void activateScan()} type="button">{scanAvailable ? 'Hunter Scan' : 'Hunter Scan used'}</button> : null}
            {view.role === 'HUNTER' && itemsEnabled ? <button className="welcome__secondary" disabled={busy || !alarmAvailable} onClick={() => void placeAlarm()} type="button">{alarmAvailable ? 'Place proximity alarm' : 'Alarm placed'}</button> : null}
            {view.role === 'HUNTER' && itemsEnabled && view.zone ? <button className="welcome__secondary" disabled={busy || !zoneMoverAvailable} onClick={() => void moveZone()} type="button">{zoneMoverAvailable ? 'Hunter Zone Mover' : 'Zone Mover used'}</button> : null}
            {view.role === 'RUNNER' && itemsEnabled ? <button className="welcome__secondary" disabled={busy || !decoyAvailable} onClick={() => void activateDecoy()} type="button">{decoyAvailable ? 'Runner Decoy' : 'Decoy armed'}</button> : null}
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
      {alarmNotice ? <p className="match-text-status" role="alert">{alarmNotice}</p> : null}
      {zoneNotice ? <p className="match-text-status" role="status">{zoneNotice}</p> : null}
      <p className="match-text-status" role="status" aria-live="polite">Active players: {view.active_counts.runners} Runners and {view.active_counts.hunters} Hunters. {liveStatus} The map never displays opponent distances or directions.</p>
      {view.zone ? <p className="match-text-status" role="status">Zone stage {view.zone.stage} · radius {Math.round(view.zone.radius)} m{view.zone.nextRadius !== null && zoneSeconds !== null ? ` · next shrink in ${Math.floor(zoneSeconds / 60)}:${String(zoneSeconds % 60).padStart(2, '0')} to ${Math.round(view.zone.nextRadius)} m` : ''}</p> : null}
      <p className="match-text-status" role="status" aria-live="polite">{locationStatus}</p>
      <ChatPanel matchId={matchId} />
      {stealth && <section className="stealth-overlay" aria-label="Stealth screen">
        <p>Stealth screen is on. Your match stays active.</p>
        <p>Keeping the screen awake uses extra battery.</p>
        <button className="welcome__action" onPointerDown={holdToExitStealth} onPointerUp={cancelStealthExit}
          onPointerCancel={cancelStealthExit} onPointerLeave={cancelStealthExit} type="button">Press and hold to exit</button>
      </section>}
    </main>
  )
}
