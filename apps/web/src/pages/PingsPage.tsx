import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeLatestPings } from '@xzones/game-core'
import { Link, useParams } from 'react-router-dom'
import type { HunterMatchView, RoleSafeMatchView } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'
import { useAppStore } from '../stores/app-store'
import { startFallbackSync } from '../services/fallback-sync'
import { applyMatchRealtimeEvent, createRealtimeEventGate } from '../services/realtime-events'

type SeenPing = HunterMatchView['runner_snapshots'][number] & { received_at_mono: number }

function elapsedTo(target: string | null, serverNow: string, anchor: number, now: number): number | null {
  if (!target) return null
  const deadline = Date.parse(target), server = Date.parse(serverNow)
  if (!Number.isFinite(deadline) || !Number.isFinite(server)) return null
  return Math.max(0, Math.ceil((deadline - server - Math.max(0, now - anchor)) / 1000))
}

function showTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function ageText(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${seconds % 60}s ago`
}

export function PingsPage() {
  const { matchId = '' } = useParams()
  const [view, setView] = useState<RoleSafeMatchView | null>(null)
  const [pings, setPings] = useState<SeenPing[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [nowMono, setNowMono] = useState(0)
  const [clockAnchor, setClockAnchor] = useState(0)
  const revision = useRef(0)
  const lastNotifiedPing = useRef(-1)

  const sync = useCallback(async () => {
    setBusy(true)
    const result = await supabaseGameApi.syncMatch(matchId, revision.current)
    const receivedAt = performance.now()
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setError('')
    revision.current = Math.max(revision.current, result.data.revision)
    setClockAnchor(receivedAt)
    setNowMono(receivedAt)
    setView(result.data)
    const pingIndex = result.data.role === 'RUNNER'
      ? result.data.runner_ping_notice?.ping_index ?? -1
      : result.data.runner_snapshots.reduce((latest, ping) => Math.max(latest, ping.ping_index), -1)
    if (pingIndex > lastNotifiedPing.current) {
      lastNotifiedPing.current = pingIndex
      if (pingIndex >= 0 && useAppStore.getState().hapticsEnabled) navigator.vibrate?.(45)
    }
    if (result.data.role === 'HUNTER') {
      const receivedPings = result.data.runner_snapshots
      setPings((current) => {
        return mergeLatestPings(current, receivedPings.map((ping) => ({ ...ping, received_at_mono: receivedAt })))
      })
    }
  }, [matchId])

  useEffect(() => { void sync() }, [sync])
  useEffect(() => {
    if (!view) return
    let active = true
    let unsubscribe: (() => void) | undefined
    const gate = createRealtimeEventGate(view.role)
    void supabaseGameApi.subscribe(matchId, view.role, { onEvent: (received) => {
      if (!active || !gate.accept(received.payload)) return
      const payload = received.payload as { type?: unknown; data?: { ping_index?: unknown } }
      if (payload.type === 'hunter.runner_ping' && typeof payload.data?.ping_index === 'number') {
        const receivedAt = performance.now()
        setPings((current) => mergeLatestPings(current, [{
          ...(payload.data as HunterMatchView['runner_snapshots'][number]), received_at_mono: receivedAt,
        }]))
        if (payload.data.ping_index > lastNotifiedPing.current) {
          lastNotifiedPing.current = payload.data.ping_index
          if (useAppStore.getState().hapticsEnabled) navigator.vibrate?.(45)
        }
      }
      setView((current) => current ? applyMatchRealtimeEvent(current, received.payload) ?? current : current)
    } }).then((stop) => {
      if (active) unsubscribe = stop
      else stop()
    }).catch(() => undefined)
    return () => { active = false; unsubscribe?.() }
  }, [matchId, view?.role])
  useEffect(() => {
    const stopFallback = startFallbackSync(() => sync())
    const clock = window.setInterval(() => setNowMono(performance.now()), 1_000)
    return () => { stopFallback(); window.clearInterval(clock) }
  }, [sync])

  if (!view) return (
    <main className="route-shell"><div className="route-shell__heading"><p className="welcome__eyebrow">Scheduled snapshots</p><h1>Hunter Pings</h1></div>
      <section className="state-panel" aria-live="polite"><p>{error || 'Checking your match role…'}</p><button className="welcome__secondary" disabled={busy} onClick={() => void sync()} type="button">Retry sync</button></section>
    </main>
  )

  if (view.role === 'RUNNER') return (
    <main className="route-shell">
      <div className="route-shell__heading"><p className="welcome__eyebrow">Runner view</p><h1>Pings</h1><p className="welcome__copy">Runner snapshot details are available only to Hunters.</p></div>
      <section className="state-panel ping-list" aria-label="Runner ping privacy">
        <p role="status" aria-live="polite">{view.runner_ping_notice
          ? `Your scheduled ping was processed at ${new Date(view.runner_ping_notice.ping_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
          : 'No new scheduled ping has been processed in this sync.'}</p>
        <p>Your map never receives Runner snapshot payloads, Hunter positions, distances, or directions.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <Link className="welcome__secondary" to={`/match/${matchId}`}>Back to map</Link>
      </section>
    </main>
  )

  const hunter = view as HunterMatchView
  const next = elapsedTo(hunter.next_ping_at, hunter.server_now, clockAnchor, nowMono)
  return (
    <main className="route-shell pings-page">
      <div className="route-shell__heading">
        <p className="welcome__eyebrow">Hunter view · scheduled only</p><h1>Runner Pings</h1>
        <p className="welcome__copy">Each card is the latest server-scheduled snapshot for one Runner. There are no live Runner updates between pings.</p>
      </div>
      <section className="state-panel ping-list" aria-label="Scheduled Runner snapshots">
        <div className="ping-next"><span>Next scheduled ping</span><strong role="timer" aria-live="off">{next === null ? '—:—' : showTime(next)}</strong></div>
        {pings.length ? pings.map((ping) => {
          const age = ping.age_seconds + Math.max(0, Math.floor((nowMono - ping.received_at_mono) / 1000))
          return <article className={`ping-card ping-card--${ping.status.toLowerCase()}`} key={ping.runner_id}>
            <div className="ping-card__heading"><h2>Runner snapshot · ping {ping.ping_index + 1}</h2><span className="ping-status">{ping.status.replace('_', ' ')}</span></div>
            <p>{ping.status === 'OK' ? 'Scheduled location snapshot' : ping.status === 'NO_FIX' ? 'No location fix was available at this ping.' : 'The last location fix was too old to share.'}</p>
            <p className="ping-age">Age: {ageText(age)}</p>
            {ping.ping_at ? <time dateTime={ping.ping_at}>Scheduled {new Date(ping.ping_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time> : null}
          </article>
        }) : <p className="field-help">No scheduled snapshots yet. The first ping arrives after the head start ends and the configured interval passes.</p>}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="welcome__secondary" disabled={busy} onClick={() => void sync()} type="button">{busy ? 'Syncing…' : 'Sync pings'}</button>
        <Link className="welcome__secondary" to={`/match/${matchId}`}>Back to map</Link>
      </section>
    </main>
  )
}
