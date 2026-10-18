import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabaseGameApi } from '../services/supabase-api'

export function HostClaimPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('The previous controller left. Any active player can claim limited match controls during this five-minute window.')
  const [error, setError] = useState('')

  useEffect(() => {
    const check = async () => {
      const current = await supabaseGameApi.syncMatch(matchId)
      if (current.ok && current.data.state === 'ENDED') navigate(`/match/${matchId}/results`, { replace: true })
    }
    void check()
    const interval = window.setInterval(() => { void check() }, 10_000)
    return () => window.clearInterval(interval)
  }, [matchId, navigate])

  const claim = async () => {
    setBusy(true); setError('')
    const result = await supabaseGameApi.claimController(matchId)
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setMessage('You now control host actions. This does not reveal any additional player information.')
    navigate(`/match/${matchId}`, { replace: true })
  }

  return <main className="route-shell">
    <div className="route-shell__heading"><p className="welcome__eyebrow">Host controls</p><h1>Keep the match going?</h1>
      <p className="welcome__copy">{message}</p></div>
    <section className="state-panel" aria-label="Claim match controls">
      <p role={error ? 'alert' : 'status'}>{error || 'Control permissions do not add map or player information.'}</p>
      <div className="state-panel__actions"><button className="welcome__action" disabled={busy} onClick={() => void claim()} type="button">{busy ? 'Claiming…' : 'Claim host controls'}</button>
        <Link className="welcome__secondary" to="/">Leave match</Link></div>
    </section>
  </main>
}
