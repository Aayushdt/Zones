import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { MatchResult } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'

const resultLabels: Record<string, string> = {
  ALL_RUNNERS_TAGGED: 'All Runners were tagged.',
  ALL_RUNNERS_TAGGED_OR_LEFT: 'All Runners were tagged or left.',
  ALL_HUNTERS_LEFT: 'All Hunters left the match.',
  TIME_EXPIRED: 'Time expired with Runners still active.',
  HOST_END: 'The host ended the match.',
  SAFETY_END: 'The match ended for safety.',
  HOST_LOST: 'No player claimed match controls after the host left.',
  HOST_LEFT_LOBBY: 'The host left before the match started.',
  LOBBY_EXPIRED: 'The lobby expired before play began.',
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
    return () => { active = false }
  }, [matchId])

  return <main className="route-shell">
    <div className="route-shell__heading"><p className="welcome__eyebrow">XZones · Match result</p>
      <h1>{result?.winner ? `${result.winner === 'RUNNER' ? 'Runners' : 'Hunters'} win` : 'Match ended'}</h1>
      <p className="welcome__copy">{result ? resultLabels[result.end_reason] ?? 'The server ended this match.' : error || 'Loading the server-confirmed result…'}</p>
    </div>
    {result ? <section className="state-panel result-panel" aria-label="Match results">
      <dl><div><dt>Duration</dt><dd>{Math.floor(result.duration_seconds / 60)} min</dd></div>
        <div><dt>Accepted tags</dt><dd>{result.tag_count}</dd></div><div><dt>End reason</dt><dd>{result.end_reason.replaceAll('_', ' ').toLowerCase()}</dd></div></dl>
      <nav className="route-shell__nav"><Link className="welcome__action" to="/create">Start a new game</Link><Link className="welcome__secondary" to="/">Home</Link></nav>
    </section> : <section className="state-panel" role={error ? 'alert' : 'status'}>
      <p>{error || 'The final result will appear here once confirmed by the server.'}</p>
      {error ? <button className="welcome__secondary" onClick={() => window.location.reload()} type="button">Retry</button> : null}
    </section>}
  </main>
}
