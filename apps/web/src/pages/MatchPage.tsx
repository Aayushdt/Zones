import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Crosshair,
  EyeOff,
  Radio,
  Clock,
  Shield,
  Zap,
  Bell,
  MapPin,
  AlertTriangle,
  Menu,
  X,
} from 'lucide-react'
import type { ClockView, RoleSafeMatchView } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'
import { GameMap, type GameMapData } from '../components/GameMap'
import { useLocationStore } from '../stores/location-store'
import { maintainScreenWakeLock } from '../services/device-lifecycle'
import { applyMatchRealtimeEvent, createRealtimeEventGate } from '../services/realtime-events'
import { startFallbackSync } from '../services/fallback-sync'
import { HIDE_AND_SEEK_CONFIG } from '@xzones/game-core'
import { ChatPanel } from '../components/ChatPanel'
import { Button } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { StatusChip } from '../components/ui/StatusChip'
import { BottomSheet } from '../components/ui/BottomSheet'
import { HoldButton } from '../components/ui/HoldButton'
import { CountdownRing } from '../components/ui/CountdownRing'
import { playSound, triggerHaptic } from '../utils/feedback'
import './MatchPage.css'

function timeLeft(clock: ClockView, anchor: number): number | null {
  if (clock.ends_at === null) return null
  const deadline = Date.parse(clock.ends_at)
  const serverAt = Date.parse(clock.server_now)
  return Number.isFinite(deadline) && Number.isFinite(serverAt)
    ? Math.max(0, Math.ceil((deadline - serverAt - (performance.now() - anchor)) / 1000))
    : 0
}

export function MatchPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()

  // Match & Clocks
  const [view, setView] = useState<RoleSafeMatchView | null>(null)
  const [clock, setClock] = useState<ClockView | null>(null)
  const [seconds, setSeconds] = useState<number | null>(null)
  const [zoneSeconds, setZoneSeconds] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Items
  const [itemsEnabled, setItemsEnabled] = useState(false)
  const [scanPositions, setScanPositions] = useState<
    Array<{ runner_id: string; lat: number; lon: number; age_seconds: number; ping_index: number }>
  >([])
  const [scanExpiry, setScanExpiry] = useState<number | null>(null)
  const [scanAvailable, setScanAvailable] = useState(true)
  const [alarmAvailable, setAlarmAvailable] = useState(true)
  const [alarmNotice, setAlarmNotice] = useState('')
  const [alarmExpiresAt, setAlarmExpiresAt] = useState<number | null>(null)
  const [zoneNotice, setZoneNotice] = useState('')
  const [zoneMoverAvailable, setZoneMoverAvailable] = useState(true)
  const [decoyAvailable, setDecoyAvailable] = useState(true)
  const [shieldAvailable, setShieldAvailable] = useState(true)
  const [camouflageAvailable, setCamouflageAvailable] = useState(true)
  const [camouflageExpiresAt, setCamouflageExpiresAt] = useState<number | null>(null)

  // UI state
  const [stealth, setStealth] = useState(false)
  const [radioOpen, setRadioOpen] = useState(false)
  const [liveStatus, setLiveStatus] = useState('Syncing role confirmation…')

  const anchor = useRef(0)
  const stealthExitTimer = useRef<number | null>(null)

  const currentFix = useLocationStore((state) => state.ownFix)
  const stopSharing = useLocationStore((state) => state.stopSharing)

  const sync = useCallback(async () => {
    setBusy(true)
    const [matchResult, clockResult, itemStatus] = await Promise.all([
      supabaseGameApi.syncMatch(matchId),
      supabaseGameApi.syncClock(matchId),
      supabaseGameApi.setItemsEnabled(matchId, null),
    ])
    setBusy(false)
    if (!matchResult.ok) {
      setError(matchResult.error.message)
      return
    }
    if (!clockResult.ok) {
      setError(clockResult.error.message)
      return
    }
    if (matchResult.data.state === 'HEAD_START') {
      navigate(`/match/${matchId}/head-start`, { replace: true })
      return
    }
    if (matchResult.data.state === 'ENDED') {
      navigate(`/match/${matchId}/results`, { replace: true })
      return
    }
    if (matchResult.data.state !== 'ACTIVE') {
      setError('The server reports this match is not active.')
      return
    }
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

  useEffect(() => {
    void sync()
  }, [sync])

  const syncRef = useRef(sync)
  useEffect(() => {
    syncRef.current = sync
  }, [sync])
  const currentRole = view?.role
  const currentOwnStatus = view?.own_status

  useEffect(() => {
    if (!currentRole || currentOwnStatus === 'TAGGED') return
    let active = true
    let unsubscribe: (() => void) | undefined
    const gate = createRealtimeEventGate(currentRole)
    setLiveStatus('Connected to private team channel.')
    void supabaseGameApi
      .subscribe(matchId, currentRole, {
        onEvent: (received) => {
          if (!gate.accept(received.payload)) return
          const envelope = received.payload as { type?: unknown } | null
          if (envelope && envelope.type === 'zone.moved') {
            setZoneNotice('Play zone moved by Seeker. Updating radar.')
            playSound('warning')
            triggerHaptic([40, 40, 40])
            void syncRef.current()
            return
          }
          setView((current) => {
            if (!current) return current
            const updated = applyMatchRealtimeEvent(current, received.payload)
            if (!updated) return current
            if (updated.own_status === 'TAGGED') {
              playSound('warning')
              triggerHaptic([60, 60, 60])
              stopSharing(matchId, 'You are tagged. Location sharing and GPS watcher are stopped.')
            }
            if (updated.state === 'ENDED' || updated.state === 'CANCELLED')
              navigate(`/match/${matchId}/results`, { replace: true })
            return updated
          })
        },
      })
      .then((stop) => {
        if (!active) {
          stop()
          return
        }
        unsubscribe = stop
        setLiveStatus('Realtime channel active. Fallback sync 30–45s.')
      })
      .catch(() => {
        if (active) setLiveStatus('Role-safe sync retrying every 30–45s.')
      })
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [matchId, navigate, stopSharing, currentRole, currentOwnStatus])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (clock) setSeconds(timeLeft(clock, anchor.current))
    }, 250)
    return () => window.clearInterval(timer)
  }, [clock])

  useEffect(() => {
    const nextShrinkAt = view?.zone?.nextShrinkAt
    if (!nextShrinkAt) {
      setZoneSeconds(null)
      return
    }
    const update = () =>
      setZoneSeconds(Math.max(0, Math.ceil((Date.parse(nextShrinkAt) - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [view?.zone?.nextShrinkAt])

  useEffect(() => startFallbackSync(() => sync()), [sync])

  useEffect(() => {
    if (scanExpiry === null) return
    const remaining = Math.max(0, scanExpiry - Date.now())
    const timer = window.setTimeout(() => {
      setScanPositions([])
      setScanExpiry(null)
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [scanExpiry])

  useEffect(() => {
    if (!itemsEnabled || view?.role !== 'HUNTER' || alarmExpiresAt === null) return
    let active = true
    let previouslyAlerted = false
    const check = async () => {
      const result = await supabaseGameApi.listItemAlerts(matchId)
      if (!active || !result.ok || result.data.alerts.length === 0) return
      if (!previouslyAlerted) {
        previouslyAlerted = true
        playSound('warning')
        triggerHaptic([60, 40, 60, 40, 100])
      }
      setAlarmNotice('A Hider entered your proximity alarm radius!')
    }
    void check()
    const timer = window.setInterval(
      () => void check(),
      HIDE_AND_SEEK_CONFIG.items.hunterAlarmPollSeconds.default * 1000,
    )
    const expiryTimer = window.setTimeout(() => {
      setAlarmExpiresAt(null)
      playSound('click')
      triggerHaptic([20, 20])
      setError('Proximity Alarm expired.')
    }, Math.max(0, alarmExpiresAt - Date.now()))
    return () => {
      active = false
      window.clearInterval(timer)
      window.clearTimeout(expiryTimer)
    }
  }, [alarmExpiresAt, itemsEnabled, matchId, view?.role])

  useEffect(() => {
    if (camouflageExpiresAt === null) return
    const remaining = Math.max(0, camouflageExpiresAt - Date.now())
    const timer = window.setTimeout(() => {
      setCamouflageExpiresAt(null)
      playSound('click')
      triggerHaptic([20, 20])
      setError('Thermal Camouflage expired. You are visible to upcoming pings.')
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [camouflageExpiresAt])

  const isMatchActive = view?.state === 'ACTIVE'
  useEffect(() => {
    if (!isMatchActive) return
    const wakeLockApi = (
      navigator as Navigator & {
        wakeLock?: {
          request: (type: 'screen') => Promise<{ released: boolean; release: () => Promise<void> }>
        }
      }
    ).wakeLock
    return maintainScreenWakeLock(true, wakeLockApi, document)
  }, [isMatchActive])

  const executeTagRef = useRef<(() => Promise<void>) | undefined>(undefined)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 't' || e.key === 'T') {
        const active = document.activeElement
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
        if (currentRole === 'HUNTER' && currentOwnStatus !== 'TAGGED') {
          e.preventDefault()
          void executeTagRef.current?.()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentRole, currentOwnStatus])



  const executeTag = useCallback(async () => {
    // If high accuracy GPS fix available, attempt immediate GPS Tag; otherwise open Tag Page
    const fixAgeMs = currentFix ? Date.now() - Date.parse(currentFix.captured_at) : Infinity
    if (currentFix && Number.isFinite(fixAgeMs) && fixAgeMs <= 5000 && currentFix.accuracy_m <= 50) {
      setBusy(true)
      const res = await supabaseGameApi.gpsTag(matchId, {
        lat: currentFix.lat,
        lon: currentFix.lon,
        accuracy_m: currentFix.accuracy_m,
        captured_at: currentFix.captured_at,
      })
      setBusy(false)
      if (res.ok) {
        if (res.data.accepted) {
          setError('TAG CONFIRMED! Target eliminated.')
          void sync()
        } else if (res.data.reason === 'NOTHING_IN_RANGE') {
          setError('No Hider in proximity. Move closer or use QR scan.')
        }
      } else {
        navigate(`/match/${matchId}/tag`)
      }
    } else {
      navigate(`/match/${matchId}/tag`)
    }
  }, [matchId, currentFix, sync, navigate])
  useEffect(() => {
    executeTagRef.current = executeTag
  }, [executeTag])

  // Tactical Item Handlers
  async function activateScan() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'HUNTER_SCAN')
    setBusy(false)
    if (!result.ok) {
      playSound('warning')
      triggerHaptic(30)
      setError(result.error.message)
      return
    }
    setScanAvailable(false)
    const positions = result.data.runner_positions ?? []
    setScanPositions(positions.map((p) => ({ ...p, ping_index: -1 })))
    setScanExpiry(Date.now() + HIDE_AND_SEEK_CONFIG.items.hunterScanSeconds.default * 1000)
    playSound('ping')
    triggerHaptic([30, 20, 30])
    setError(
      positions.length
        ? `Radar Scan active: ${positions.length} Hider fix${positions.length === 1 ? '' : 'es'} revealed.`
        : 'Scan found no active Hider fixes.',
    )
  }

  async function placeAlarm() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'HUNTER_ALARM')
    setBusy(false)
    if (!result.ok) {
      playSound('warning')
      triggerHaptic(30)
      setError(result.error.message)
      return
    }
    setAlarmAvailable(false)
    const expires = result.data.active_until
      ? Date.parse(result.data.active_until)
      : Date.now() + HIDE_AND_SEEK_CONFIG.items.hunterAlarmSeconds.default * 1000
    setAlarmExpiresAt(expires)
    playSound('ping')
    triggerHaptic(40)
    setError('Proximity Alarm deployed at your coordinates.')
  }

  async function moveZone() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'HUNTER_ZONE_MOVER')
    setBusy(false)
    if (!result.ok) {
      playSound('warning')
      triggerHaptic(30)
      setError(result.error.message)
      return
    }
    setZoneMoverAvailable(false)
    setZoneNotice('Play zone shifted by 50%. Updating satellite tracking.')
    playSound('warning')
    triggerHaptic([40, 40, 40])
    await sync()
  }

  async function activateDecoy() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'RUNNER_DECOY')
    setBusy(false)
    if (!result.ok) {
      playSound('warning')
      triggerHaptic(30)
      setError(result.error.message)
      return
    }
    setDecoyAvailable(false)
    playSound('ping')
    triggerHaptic(30)
    setError('Decoy ghost signature armed for the next Seeker radar ping.')
  }

  async function activateShield() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'RUNNER_ZONE_SHIELD')
    setBusy(false)
    if (!result.ok) {
      playSound('warning')
      triggerHaptic(30)
      setError(result.error.message)
      return
    }
    setShieldAvailable(false)
    playSound('ping')
    triggerHaptic(30)
    setError('Zone Shield deployed: out-of-zone penalties suspended temporarily.')
  }

  async function activateCamouflage() {
    setBusy(true)
    const result = await supabaseGameApi.activateItem(matchId, 'RUNNER_CAMOUFLAGE')
    setBusy(false)
    if (!result.ok) {
      playSound('warning')
      triggerHaptic(30)
      setError(result.error.message)
      return
    }
    setCamouflageAvailable(false)
    const expires = result.data.active_until
      ? Date.parse(result.data.active_until)
      : Date.now() + HIDE_AND_SEEK_CONFIG.items.runnerCamouflageSeconds.default * 1000
    setCamouflageExpiresAt(expires)
    playSound('ping')
    triggerHaptic(40)
    setError('Thermal Camouflage active: concealed from next ping & scan.')
  }

  // Stealth mode exit
  const cancelStealthExit = () => {
    if (stealthExitTimer.current !== null) window.clearTimeout(stealthExitTimer.current)
    stealthExitTimer.current = null
  }
  const holdToExitStealth = () => {
    cancelStealthExit()
    stealthExitTimer.current = window.setTimeout(
      () => setStealth(false),
      HIDE_AND_SEEK_CONFIG.stealth.exitHoldMs.default,
    )
  }

  if (!view) {
    return (
      <main className="hud-screen-loading">
        <div className="radar-spinner" aria-hidden="true" />
        <p className="font-mono">{error || 'Locking onto tactical satellite feed…'}</p>
        <Button size="sm" variant="secondary-outline" onClick={() => void sync()}>
          Retry Link
        </Button>
      </main>
    )
  }

  const ownPosition = currentFix
    ? { ...currentFix, player_id: view.own_player_id ?? currentFix.player_id }
    : null

  const mapData: GameMapData =
    view.role === 'RUNNER'
      ? { role: 'RUNNER', own_position: ownPosition, own_team_positions: view.own_team_positions }
      : {
          role: 'HUNTER',
          own_position: ownPosition,
          own_team_positions: view.own_team_positions,
          runner_snapshots: [
            ...view.runner_snapshots,
            ...scanPositions.map((p) => ({
              runner_id: p.runner_id,
              status: 'OK' as const,
              lat: p.lat,
              lon: p.lon,
              age_seconds: p.age_seconds,
              ping_index: p.ping_index,
            })),
          ],
        }

  const isSeeker = view.role === 'HUNTER'
  const roleName = isSeeker ? 'Seeker' : 'Hider'
  const RoleIcon = isSeeker ? Crosshair : EyeOff

  const timerText =
    seconds === null
      ? 'NO LIMIT'
      : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

  const isTagged = view.own_status === 'TAGGED'

  return (
    <main className={`hud-screen ${stealth ? 'hud-screen--stealth' : ''}`}>
      {/* FULL-SCREEN MAP CANVAS */}
      <div className="hud-map-layer">
        <GameMap
          data={mapData}
          zone={
            view.zone
              ? {
                  lat: view.zone.center.lat,
                  lon: view.zone.center.lon,
                  radius_m: view.zone.radius,
                  ...(view.zone.nextRadius !== null ? { next_radius_m: view.zone.nextRadius } : {}),
                }
              : undefined
          }
        />
      </div>

      {/* TOP FLOATING HUD BAR */}
      <header className="hud-top-bar">
        <div className="hud-top-left">
          <Link to={`/lobby/${matchId}`} className="hud-btn-icon" aria-label="Lobby menu">
            <Menu size={20} />
          </Link>
          <Chip variant={isSeeker ? 'red' : 'green'} icon={<RoleIcon size={14} />} pulse>
            {isTagged ? 'TAGGED' : roleName.toUpperCase()}
          </Chip>
        </div>

        {/* Large Mono Timer */}
        <div className="hud-top-center">
          <div className="hud-timer-badge font-mono" title="Match time remaining">
            <Clock size={16} className="text-muted" />
            <span className="hud-timer-val">{timerText}</span>
          </div>
        </div>

        <div className="hud-top-right">
          <button
            type="button"
            className="hud-btn-icon"
            onClick={() => setRadioOpen((prev) => !prev)}
            title="Team Radio & Chat"
            aria-label="Toggle team radio"
          >
            <Radio size={20} />
          </button>
          <button
            type="button"
            className="hud-btn-stealth font-mono text-xs"
            onClick={() => setStealth(true)}
            title="Black screen battery saver"
          >
            STEALTH
          </button>
        </div>
      </header>

      {/* SYSTEM WARNING / STALE FIX BANNERS */}
      <div className="hud-alerts-stack">
        {error && (
          <div className="hud-banner hud-banner--danger" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )}
        {alarmNotice && (
          <div className="hud-banner hud-banner--warning" role="alert">
            <Bell size={16} />
            <span>{alarmNotice}</span>
            <button type="button" onClick={() => setAlarmNotice('')} aria-label="Dismiss alert">
              <X size={14} />
            </button>
          </div>
        )}
        {zoneNotice && (
          <div className="hud-banner hud-banner--info" role="status">
            <MapPin size={16} />
            <span>{zoneNotice}</span>
          </div>
        )}
      </div>

      {/* BOTTOM SHEET HUD */}
      <BottomSheet
        isOpen={true}
        dragHandle={true}
        className="hud-bottom-sheet"
      >
        <div className="hud-sheet-summary">
          {/* Role & Status Card */}
          <div className="hud-role-summary">
            <div className={`hud-role-icon-box ${isSeeker ? 'is-seeker' : 'is-hider'}`}>
              <RoleIcon size={24} />
            </div>
            <div className="hud-role-text">
              <span className="hud-role-title">
                {roleName} · {view.state}
              </span>
              <p className="hud-role-guidance text-xs text-muted">
                {isSeeker
                  ? 'Hunt concealed Hiders. Scheduled radar pings show latest fixes.'
                  : isTagged
                  ? 'You were tagged! Location sharing stopped.'
                  : 'Stay hidden within the safe zone circle.'}
              </p>
            </div>
          </div>

          {/* Quick HUD Metrics & Countdown Rings */}
          <div className="hud-metrics-row">
            {/* Zone Shrink Countdown Ring */}
            {zoneSeconds !== null && (
              <CountdownRing
                secondsRemaining={zoneSeconds}
                totalSeconds={300}
                label="SHRINK"
                size={48}
              />
            )}

            {/* Zone Stage Info */}
            {view.zone && (
              <div className="hud-metric-pill font-mono">
                <span className="hud-metric-label">STAGE {view.zone.stage}</span>
                <span className="hud-metric-val">{Math.round(view.zone.radius)}m</span>
              </div>
            )}

            {/* Active Tactical Item Status Pills */}
            {camouflageExpiresAt !== null && (
              <div className="hud-metric-pill font-mono hud-item-pill--camo" title="Thermal Camouflage active">
                <EyeOff size={14} className="text-green" />
                <span className="hud-metric-label">CAMO</span>
                <span className="hud-metric-val">{Math.max(0, Math.ceil((camouflageExpiresAt - Date.now()) / 1000))}s</span>
              </div>
            )}
            {alarmExpiresAt !== null && (
              <div className="hud-metric-pill font-mono hud-item-pill--alarm" title="Proximity Alarm armed">
                <Bell size={14} className="text-amber" />
                <span className="hud-metric-label">ALARM</span>
                <span className="hud-metric-val">{Math.max(0, Math.ceil((alarmExpiresAt - Date.now()) / 1000))}s</span>
              </div>
            )}

            {/* GPS & Connection Chips */}
            <div className="hud-status-chips">
              <StatusChip kind="gps" accuracyM={currentFix?.accuracy_m ?? null} />
              <StatusChip kind="online" isOnline={navigator.onLine} />
            </div>
          </div>

          <div className="hud-live-status-bar font-mono text-xs text-muted">
            <span>● {liveStatus}</span>
          </div>

          {/* PRIMARY ACTION: BIG HOLD-TO-CONFIRM TAG BUTTON (Seeker) OR REVEAL CODE (Hider) */}
          {isSeeker && !isTagged && (
            <div className="hud-tag-action-wrap">
              <HoldButton
                onConfirm={executeTag}
                label="HOLD TO TAG"
                subtitle="GPS PROXIMITY OR QR SCAN (OR PRESS 'T')"
                icon={<Crosshair size={22} />}
                variant="seeker-red"
              />
            </div>
          )}

          {/* Hider QR Tag Helper Button */}
          {!isSeeker && (
            <div className="hud-tag-action-wrap">
              <Button
                variant="secondary-outline"
                size="lg"
                fullWidth
                icon={<Crosshair size={20} />}
                onClick={() => navigate(`/match/${matchId}/tag`)}
              >
                {isTagged ? 'View Tag Status' : 'Show / Scan Tag QR'}
              </Button>
            </div>
          )}

          {/* Collapsible Tactical Items & Host Controls */}
          <div className="hud-expanded-controls">
            {/* Tactical Items Tray */}
            {itemsEnabled && (
              <div className="hud-items-tray">
                <span className="hud-tray-title font-mono text-xs">TACTICAL ITEMS</span>
                <div className="hud-items-grid">
                  {isSeeker && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary-outline"
                        icon={<Zap size={14} />}
                        disabled={busy || !scanAvailable}
                        onClick={activateScan}
                      >
                        {scanAvailable ? 'Hunter Scan' : 'Scan Expended'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary-outline"
                        icon={<Bell size={14} />}
                        disabled={busy || !alarmAvailable}
                        onClick={placeAlarm}
                      >
                        {alarmAvailable ? 'Place Alarm' : 'Alarm Set'}
                      </Button>
                      {view.zone && (
                        <Button
                          size="sm"
                          variant="secondary-outline"
                          icon={<MapPin size={14} />}
                          disabled={busy || !zoneMoverAvailable}
                          onClick={moveZone}
                        >
                          {zoneMoverAvailable ? 'Zone Mover' : 'Mover Used'}
                        </Button>
                      )}
                    </>
                  )}
                  {!isSeeker && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary-outline"
                        icon={<Zap size={14} />}
                        disabled={busy || !decoyAvailable}
                        onClick={activateDecoy}
                      >
                        {decoyAvailable ? 'Runner Decoy' : 'Decoy Armed'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary-outline"
                        icon={<Shield size={14} />}
                        disabled={busy || !shieldAvailable}
                        onClick={activateShield}
                      >
                        {shieldAvailable ? 'Zone Shield' : 'Shield Active'}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary-outline"
                        icon={<EyeOff size={14} />}
                        disabled={busy || !camouflageAvailable}
                        onClick={activateCamouflage}
                      >
                        {camouflageAvailable ? 'Camouflage' : 'Camo Active'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* End / Leave Match Buttons */}
            <div className="hud-footer-actions">
              {view.can_end && (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm('End match for everyone? This cannot be undone.')) {
                      void supabaseGameApi.endMatch(matchId, 'HOST_END').then((res) => {
                        if (res.ok) navigate(`/match/${matchId}/results`, { replace: true })
                        else setError(res.error.message)
                      })
                    }
                  }}
                >
                  End Match
                </Button>
              )}
              {view.can_claim && (
                <Link to={`/match/${matchId}/host-claim`} className="btn-link text-xs font-mono">
                  Claim Host
                </Link>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm('Leave match? You cannot rejoin.')) {
                    void supabaseGameApi.leaveMatch(matchId).then((res) => {
                      if (!res.ok) {
                        setError(res.error.message)
                        return
                      }
                      if (res.data.state === 'ENDED' || res.data.state === 'CANCELLED')
                        navigate(`/match/${matchId}/results`, { replace: true })
                      else navigate('/', { replace: true })
                    })
                  }
                }}
              >
                Leave Match
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void sync()}>
                {busy ? 'Syncing…' : 'Sync'}
              </Button>
            </div>
          </div>
        </div>
      </BottomSheet>

      {/* TEAM RADIO / CHAT DRAWER */}
      {radioOpen && (
        <div className="hud-radio-drawer">
          <div className="hud-radio-header">
            <div className="hud-radio-title font-mono">
              <Radio size={16} />
              <span>TEAM RADIO (SECURE)</span>
            </div>
            <button
              type="button"
              className="hud-btn-icon"
              onClick={() => setRadioOpen(false)}
              aria-label="Close radio"
            >
              <X size={18} />
            </button>
          </div>
          <div className="hud-radio-body">
            <ChatPanel matchId={matchId} />
          </div>
        </div>
      )}

      {/* STEALTH SCREEN OVERLAY */}
      {stealth && (
        <div className="stealth-screen-overlay" aria-label="Stealth blackout active">
          <div className="stealth-content">
            <span className="stealth-title font-mono text-xs">STEALTH MODE ACTIVE</span>
            <p className="stealth-desc text-muted text-xs">
              Screen dimmed. Location updates continue in background.
            </p>
            <p className="stealth-warning text-xs text-amber">
              Wake lock maintains screen power; slight battery draw.
            </p>
            <button
              type="button"
              className="stealth-exit-btn font-mono"
              onPointerDown={holdToExitStealth}
              onPointerUp={cancelStealthExit}
              onPointerCancel={cancelStealthExit}
              onPointerLeave={cancelStealthExit}
            >
              PRESS &amp; HOLD TO EXIT
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
