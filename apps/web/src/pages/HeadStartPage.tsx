import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ClockView } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'

function remaining(clock: ClockView, monotonicAtResponse: number): number {
  const deadline = Date.parse(clock.head_start_ends_at)
  const serverAtResponse = Date.parse(clock.server_now)
  if (!Number.isFinite(deadline) || !Number.isFinite(serverAtResponse)) return 0
  const estimatedServerNow = serverAtResponse + Math.max(0, performance.now() - monotonicAtResponse)
  return Math.max(0, Math.ceil((deadline - estimatedServerNow) / 1000))
}

function format(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function HeadStartPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const [clock, setClock] = useState<ClockView | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const [syncError, setSyncError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const anchor = useRef<{ clock: ClockView; at: number } | null>(null)

  const sync = useCallback(async () => {
    setSyncing(true)
    const result = await supabaseGameApi.syncClock(matchId)
    const receivedAt = performance.now()
    setSyncing(false)
    if (!result.ok) { setSyncError(result.error.message); return }
    setSyncError('')
    setClock(result.data)
    if (result.data.state === 'ACTIVE') { navigate(`/match/${matchId}`, { replace: true }); return }
    if (result.data.state === 'ENDED') { navigate(`/match/${matchId}/results`, { replace: true }); return }
    anchor.current = { clock: result.data, at: receivedAt }
    setRemainingSeconds(remaining(result.data, receivedAt))
  }, [matchId, navigate])

  useEffect(() => { void sync() }, [sync])
  useEffect(() => {
    if (!clock) return
    const tick = () => {
      const latest = anchor.current
      if (latest) setRemainingSeconds(remaining(latest.clock, latest.at))
    }
    const timer = window.setInterval(tick, 250)
    const resync = window.setInterval(() => { void sync() }, 10_000)
    return () => { window.clearInterval(timer); window.clearInterval(resync) }
  }, [clock, sync])

  return (
    <main className="route-shell countdown-page">
      <div className="route-shell__heading">
        <p className="welcome__eyebrow">Server-timed round</p>
        <h1>Head start</h1>
        <p className="welcome__copy">Runners have time to move before Hunters begin. The server controls when this countdown ends.</p>
      </div>
      <section className="state-panel countdown-panel" aria-label="Head-start countdown">
        <p className="countdown-value" role="timer" aria-live="off">{remainingSeconds === null ? '—:—' : format(remainingSeconds)}</p>
        <p className="countdown-state" role="status">{syncError || (syncing ? 'Checking server time…' : clock ? `Server state: ${clock.state}` : 'Connecting to match…')}</p>
        <button className="welcome__secondary" disabled={syncing} onClick={() => void sync()} type="button">{syncing ? 'Syncing…' : 'Sync match clock'}</button>
        <Link className="welcome__secondary" to="/">Return home</Link>
      </section>
    </main>
  )
}
