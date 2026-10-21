import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { ClockView } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

function remaining(clock: ClockView, monotonicAtResponse: number): number {
  const deadline = Date.parse(clock.head_start_ends_at)
  const serverAtResponse = Date.parse(clock.server_now)
  if (!Number.isFinite(deadline) || !Number.isFinite(serverAtResponse)) return 0
  const estimatedServerNow =
    serverAtResponse + Math.max(0, performance.now() - monotonicAtResponse)
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
    if (!result.ok) {
      setSyncError(result.error.message)
      return
    }
    setSyncError('')
    setClock(result.data)
    if (result.data.state === 'ACTIVE') {
      navigate(`/match/${matchId}`, { replace: true })
      return
    }
    if (result.data.state === 'ENDED') {
      navigate(`/match/${matchId}/results`, { replace: true })
      return
    }
    anchor.current = { clock: result.data, at: receivedAt }
    setRemainingSeconds(remaining(result.data, receivedAt))
  }, [matchId, navigate])

  useEffect(() => {
    void sync()
  }, [sync])

  useEffect(() => {
    if (!clock) return
    const tick = () => {
      const latest = anchor.current
      if (latest) {
        const secs = remaining(latest.clock, latest.at)
        setRemainingSeconds(secs)
        if (secs <= 0) {
          void sync()
        }
      }
    }
    const timer = window.setInterval(tick, 250)
    const resync = window.setInterval(() => {
      void sync()
    }, 10_000)
    return () => {
      window.clearInterval(timer)
      window.clearInterval(resync)
    }
  }, [clock, sync])

  return (
    <main className="head-start-screen">
      <div className="head-start-card-wrap">
        <Card variant="glow-green" className="head-start-card">
          <div className="head-start-header">
            <h1 className="head-start-title">Hider Head Start</h1>
          </div>

          <div className="head-start-countdown-box">
            <div className="head-start-pulse-ring" aria-hidden="true" />
            <div className="head-start-digits font-mono">
              {remainingSeconds === null ? '--:--' : format(remainingSeconds)}
            </div>
            <span className="head-start-label font-mono text-xs">TIME UNTIL SEEKERS UNLEASHED</span>
          </div>

          <div className="head-start-footer">
            <Button
              size="sm"
              variant="secondary-outline"
              disabled={syncing}
              onClick={() => void sync()}
            >
              {syncing ? 'Syncing…' : 'Sync Clock'}
            </Button>
            <Link to={`/match/${matchId}`} className="text-muted text-xs font-mono">
              View map preview <ArrowRight size={14} className="inline ml-1" />
            </Link>
          </div>

          {syncError && <p className="form-error font-mono text-xs mt-3" role="alert">{syncError}</p>}
        </Card>
      </div>
    </main>
  )
}
