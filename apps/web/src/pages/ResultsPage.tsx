import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Trophy, Crosshair, EyeOff, RotateCcw, Home, Clock, Target, AlertTriangle } from 'lucide-react'
import type { MatchResult } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

const resultLabels: Record<string, string> = {
  ALL_RUNNERS_TAGGED: 'All Hiders were hunted down and eliminated.',
  ALL_RUNNERS_TAGGED_OR_LEFT: 'All Hiders were tagged or evacuated.',
  ALL_HUNTERS_LEFT: 'All Seekers abandoned the hunt. Hiders claim victory.',
  TIME_EXPIRED: 'Mission clock expired with Hiders still in the safe zone.',
  TIME_LIMIT: 'Mission clock expired with Hiders still in the safe zone.',
  HOST_END: 'Match ended by mission operator.',
  SAFETY_END: 'Match concluded for participant safety.',
  HOST_LOST: 'Host disconnected without claim.',
  HOST_LEFT_LOBBY: 'Host aborted the match before start.',
  LOBBY_EXPIRED: 'Lobby countdown expired before deployment.',
}

export function ResultsPage() {
  const { matchId = '' } = useParams()
  const [result, setResult] = useState<MatchResult | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void supabaseGameApi.getMatchResult(matchId).then((response) => {
      if (!active) return
      if (response.ok) setResult(response.data)
      else setError(response.error.message)
    })
    return () => {
      active = false
    }
  }, [matchId])

  if (!result && !error) {
    return (
      <main className="route-shell">
        <div className="lobby-loading-state font-mono">
          <div className="radar-spinner" aria-hidden="true" />
          <p>Compiling final server match report…</p>
        </div>
      </main>
    )
  }

  const isRunnerWinner = result?.winner === 'RUNNER'
  const isHunterWinner = result?.winner === 'HUNTER'
  const WinnerIcon = isRunnerWinner ? EyeOff : Crosshair
  const winnerTitle = isRunnerWinner ? 'HIDERS WIN' : isHunterWinner ? 'SEEKERS WIN' : 'MATCH CONCLUDED'
  const winnerVariant = isRunnerWinner ? 'green' : isHunterWinner ? 'red' : 'neutral'

  return (
    <main className="results-screen">
      <div className="results-container">
        {/* WINNER HERO BANNER */}
        <div className={`results-hero-banner results-hero-banner--${winnerVariant}`}>
          <div className="results-hero-icon-wrap" aria-hidden="true">
            <WinnerIcon size={44} />
          </div>
          <span className="results-hero-overline font-mono">TACTICAL OUTCOME</span>
          <h1 className="results-hero-title">{winnerTitle}</h1>
          <p className="results-hero-summary">
            {result ? resultLabels[result.end_reason] ?? 'Server concluded the round.' : error}
          </p>
        </div>

        {/* METRICS CARD GRID */}
        {result && (
          <div className="results-stats-grid">
            <Card variant="raised" className="result-metric-card">
              <Clock size={20} className="text-muted" />
              <div className="result-metric-data">
                <span className="result-metric-val font-mono">
                  {Math.floor(result.duration_seconds / 60)}m {result.duration_seconds % 60}s
                </span>
                <span className="result-metric-label">Total Duration</span>
              </div>
            </Card>

            <Card variant="raised" className="result-metric-card">
              <Target size={20} className="text-red" />
              <div className="result-metric-data">
                <span className="result-metric-val font-mono">{result.tag_count}</span>
                <span className="result-metric-label">Confirmed Tags</span>
              </div>
            </Card>

            <Card variant="raised" className="result-metric-card">
              <Trophy size={20} className="text-amber" />
              <div className="result-metric-data">
                <span className="result-metric-val font-mono">
                  {result.end_reason.replaceAll('_', ' ')}
                </span>
                <span className="result-metric-label">Resolution Code</span>
              </div>
            </Card>
          </div>
        )}

        {/* SUSPICIOUS GPS EVENTS (Host-only anti-cheat log) */}
        {result?.suspicious_events && result.suspicious_events.length > 0 && (
          <Card variant="surface" className="suspicious-events-card">
            <div className="suspicious-header">
              <AlertTriangle size={18} className="text-amber" />
              <h3 className="font-mono text-xs">GPS INTEGRITY AUDIT LOG (HOST ONLY)</h3>
            </div>
            <ul className="suspicious-list">
              {result.suspicious_events.map((ev) => (
                <li key={ev.id} className="suspicious-item font-mono text-xs">
                  <span className="text-muted">{new Date(ev.created_at).toLocaleTimeString()}:</span>{' '}
                  <strong>{ev.display_name}</strong> - {ev.reason.replaceAll('_', ' ').toLowerCase()}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* REMATCH & NAVIGATION ACTIONS */}
        <div className="results-actions-row">
          <Link to="/create" className="results-btn-link">
            <Button size="lg" variant="seeker-red" icon={<RotateCcw size={18} />} fullWidth>
              Rematch · New Game
            </Button>
          </Link>
          <Link to="/" className="results-btn-link">
            <Button size="lg" variant="secondary-outline" icon={<Home size={18} />} fullWidth>
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </main>
  )
}
