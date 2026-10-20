import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../stores/app-store'
import { supabaseGameApi } from '../services/supabase-api'
import type { RejoinableMatch } from '../services/game-api'

export function HomePage() {
  const guestName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)
  const [name, setName] = useState(guestName)
  const [adultConfirmed, setAdultConfirmed] = useState(false)
  const [safePlayConfirmed, setSafePlayConfirmed] = useState(false)
  const [continued, setContinued] = useState(false)
  const [error, setError] = useState('')
  const [rejoinable, setRejoinable] = useState<RejoinableMatch | null>(null)
  const [sessionLost, setSessionLost] = useState(false)

  useEffect(() => {
    let active = true
    void supabaseGameApi.findRejoinableMatch().then((result) => {
      if (!active) return
      if (result.ok) setRejoinable(result.data)
      else if (result.error.code === 'SESSION_LOST') setSessionLost(true)
    })
    return () => { active = false }
  }, [])

  function continueAsGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!name.trim() || name.trim().length > 24) {
      setError('Enter a display name from 1 to 24 characters.')
      return
    }
    if (!adultConfirmed || !safePlayConfirmed) {
      setError('Confirm you are 18+ and have read the safe-play guidance.')
      return
    }
    setGuestName(name.trim())
    setError('')
    setContinued(true)
  }

  return (
    <main className="route-shell home-page">
      <div className="route-shell__heading home-page__hero">
        <p className="welcome__eyebrow">Hunter vs Runner</p>
        <p className="home-page__brand" aria-label="XZones">X<span>✦</span>ZONES</p>
        <h1>Hide. Seek.<br />Survive.</h1>
        <p className="welcome__copy">Play a private outdoor hide-and-seek game with friends. Stay aware, keep your phone with you, and play only where it is permitted.</p>
      </div>
      {rejoinable && <section className="state-panel rejoin-panel" aria-label="Saved match">
        <p className="welcome__copy">An active match is linked to this guest session.</p>
        <Link className="welcome__action" to={rejoinable.state === 'LOBBY' ? `/lobby/${rejoinable.match_id}`
          : rejoinable.state === 'HEAD_START' ? `/match/${rejoinable.match_id}/head-start` : `/match/${rejoinable.match_id}`}>
          Rejoin active match
        </Link>
      </section>}
      {sessionLost && <p className="form-error" role="status">Your saved guest session is no longer available. Ask the host to remove your old player entry; rejoining by name or code alone is not allowed.</p>}
      {!continued ? (
        <form className="state-panel screen-form entry-card" onSubmit={continueAsGuest}>
          <label className="field">
            <span>Guest name</span>
            <input
              autoComplete="nickname"
              className="form-control"
              maxLength={24}
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="What should teammates call you?"
              required
              value={name}
            />
          </label>
          <label className="check-field">
            <input checked={adultConfirmed} onChange={(event) => setAdultConfirmed(event.currentTarget.checked)} type="checkbox" />
            <span>I confirm I am 18 or older.</span>
          </label>
          <label className="check-field">
            <input checked={safePlayConfirmed} onChange={(event) => setSafePlayConfirmed(event.currentTarget.checked)} type="checkbox" />
            <span>I have read the safe-play guidance above.</span>
          </label>
          <p className="field-help">No location is collected here. A match asks for location permission only when needed.</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="welcome__action primary-action" type="submit">Continue as guest</button>
        </form>
      ) : (
        <section className="state-panel game-hub-card">
          <p className="welcome__eyebrow">Welcome, {guestName}</p>
          <div className="game-hub-card__art" aria-hidden="true"><span>↗</span></div>
          <h2>Hide and Seek</h2>
          <p className="welcome__copy">You are playing as a guest. No account or sign-in is needed. Runners stay hidden; Hunters receive only scheduled pings.</p>
          <nav className="route-shell__nav" aria-label="Game actions">
            <Link className="welcome__action" to="/create">Create private game</Link>
            <Link className="welcome__secondary" to="/join">Join with code</Link>
          </nav>
          <Link className="how-to-play" to="/guide">⌑ <span><strong>How to play</strong><small>Read the rules and safe-play guidance.</small></span><b>›</b></Link>
        </section>
      )}
    </main>
  )
}
