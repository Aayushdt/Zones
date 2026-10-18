import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../stores/app-store'

export function HomePage() {
  const guestName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)
  const [name, setName] = useState(guestName)
  const [adultConfirmed, setAdultConfirmed] = useState(false)
  const [safePlayConfirmed, setSafePlayConfirmed] = useState(false)
  const [continued, setContinued] = useState(false)
  const [error, setError] = useState('')

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
    <main className="route-shell">
      <div className="route-shell__heading">
        <p className="welcome__eyebrow">Hunter vs Runner</p>
        <h1>Real places.<br />Real games.</h1>
        <p className="welcome__copy">Play a private outdoor hide-and-seek game with friends. Stay aware, keep your phone with you, and play only where it is permitted.</p>
      </div>
      {!continued ? (
        <form className="state-panel screen-form" onSubmit={continueAsGuest}>
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
        <section className="state-panel">
          <p className="welcome__eyebrow">Welcome, {guestName}</p>
          <p className="welcome__copy">You are playing as a guest. No account or sign-in is needed.</p>
          <nav className="route-shell__nav" aria-label="Game actions">
            <Link className="welcome__action" to="/create">Create private game</Link>
            <Link className="welcome__secondary" to="/join">Join with code</Link>
          </nav>
        </section>
      )}
    </main>
  )
}
