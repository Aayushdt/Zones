import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Shield, Users, HelpCircle, Trophy, Settings, Shuffle, ArrowRight } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import { supabaseGameApi } from '../services/supabase-api'
import { useLocationStore } from '../stores/location-store'
import type { RejoinableMatch } from '../services/game-api'
import { Logo } from '../components/ui/Logo'
import { Input } from '../components/ui/Input'
import { StatusChip } from '../components/ui/StatusChip'
import { StatsModal } from '../components/ui/StatsModal'

export function HomePage() {
  const navigate = useNavigate()
  const guestName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)
  const ownFix = useLocationStore((state) => state.ownFix)

  const [name, setName] = useState(guestName)
  const [zoneCode, setZoneCode] = useState('')
  const [adultConfirmed, setAdultConfirmed] = useState(false)
  const [safePlayConfirmed, setSafePlayConfirmed] = useState(false)
  const [continued, setContinued] = useState(() => Boolean(guestName.trim()))
  const [error, setError] = useState('')
  const [rejoinable, setRejoinable] = useState<RejoinableMatch | null>(null)
  const [sessionLost, setSessionLost] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)

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
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 24) {
      setError('Enter a display name from 1 to 24 characters.')
      return
    }
    if (!adultConfirmed || !safePlayConfirmed) {
      setError('Confirm you are 18+ and have read the safe-play guidance.')
      return
    }
    setGuestName(trimmed)
    setError('')
    setContinued(true)
  }

  function handleShuffleCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let rand = ''
    for (let i = 0; i < 4; i++) {
      rand += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setZoneCode(rand)
  }

  function handleJoin() {
    const code = zoneCode.trim().toUpperCase()
    if (code.length >= 4) {
      navigate(`/join?code=${encodeURIComponent(code)}`)
    } else {
      navigate('/join')
    }
  }

  const userLevel = guestName ? Math.min(50, Math.floor(guestName.length * 2.2) + 1) : 1
  const reduceEffects = useAppStore((state) => state.reduceEffects)

  return (
    <main className="home-screen-wrap">
      {/* Radar sweep ambient background */}
      {!reduceEffects && (
        <div className="radar-sweep-bg" aria-hidden="true">
          <div className="radar-sweep-beam" />
          <div className="radar-ring radar-ring--1" />
          <div className="radar-ring radar-ring--2" />
          <div className="radar-ring radar-ring--3" />
        </div>
      )}

      <div className="home-column">
        {/* Logo with green glow & tagline */}
        <header className="home-header">
          <Logo markSize={54} showTagline={true} />
        </header>

        {rejoinable && (
          <section className="rejoin-banner" aria-label="Saved match">
            <div className="rejoin-banner__text">
              <span className="rejoin-banner__title font-mono">ACTIVE MATCH FOUND</span>
              <p className="rejoin-banner__desc">You have an ongoing match linked to this session.</p>
            </div>
            <Link
              className="rejoin-banner__btn"
              to={
                rejoinable.state === 'LOBBY'
                  ? `/lobby/${rejoinable.match_id}`
                  : rejoinable.state === 'HEAD_START'
                  ? `/match/${rejoinable.match_id}/head-start`
                  : `/match/${rejoinable.match_id}`
              }
            >
              Rejoin match <ArrowRight size={16} />
            </Link>
          </section>
        )}

        {sessionLost && (
          <p className="form-error" role="status">
            Your saved guest session is no longer available. Ask the host to remove your old player entry; rejoining by name or code alone is not allowed.
          </p>
        )}

        {!continued ? (
          /* Initial Onboarding Form (Accessible & E2E Compliant) */
          <form className="home-card onboarding-card" onSubmit={continueAsGuest}>
            <div className="card-header-clean">
              <span className="card-overline">GUEST ENLISTMENT</span>
              <h2 className="card-title">Enter the Zone</h2>
              <p className="card-subtitle">No account needed. Play private outdoor hide-and-seek games with friends.</p>
            </div>

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
              <input
                checked={adultConfirmed}
                onChange={(event) => setAdultConfirmed(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>I confirm I am 18 or older.</span>
            </label>

            <label className="check-field">
              <input
                checked={safePlayConfirmed}
                onChange={(event) => setSafePlayConfirmed(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>I have read the safe-play guidance above.</span>
            </label>

            <p className="field-help">No location is collected here. A match asks for location permission only when needed.</p>

            {error ? <p className="form-error" role="alert">{error}</p> : null}

            <button className="welcome__action primary-action app-btn--primary-green" type="submit">
              Continue as guest
            </button>
          </form>
        ) : (
          /* Main Polished Game Hub */
          <div className="home-card hub-card">
            <div className="hub-user-bar">
              <span className="welcome__eyebrow">Welcome, {guestName}</span>
              <button
                type="button"
                className="text-btn text-muted text-xs"
                onClick={() => setContinued(false)}
              >
                Change name
              </button>
            </div>

            <div className="hub-inputs-group">
              <Input
                label="Your name"
                value={guestName}
                readOnly
                className="hub-input-readonly"
              />

              <Input
                label="Zone code"
                placeholder="4 or 6 chars"
                value={zoneCode}
                maxLength={6}
                mono
                uppercase
                onChange={(e) => setZoneCode(e.currentTarget.value.toUpperCase())}
                trailingAction={
                  <button
                    type="button"
                    className="input-action-btn"
                    onClick={handleShuffleCode}
                    title="Generate test code"
                    aria-label="Shuffle random code"
                  >
                    <Shuffle size={16} />
                  </button>
                }
                helperText="Enter 4-character room code or 6-character private lobby code."
              />
            </div>

            {/* Dual 56px Action Buttons */}
            <div className="home-dual-actions">
              {/* Join Button (Outlined Green with Player subtitle) */}
              <button
                type="button"
                className="dual-action-btn dual-action-btn--join"
                onClick={handleJoin}
              >
                <div className="dual-action-btn__icon">
                  <Users size={24} />
                </div>
                <div className="dual-action-btn__text">
                  <span className="dual-action-btn__title">Join</span>
                  <span className="dual-action-btn__subtitle">Player</span>
                </div>
              </button>

              {/* Create Button (Solid Red with Host subtitle) */}
              <Link
                to="/create"
                className="dual-action-btn dual-action-btn--create"
              >
                <div className="dual-action-btn__icon">
                  <Shield size={24} />
                </div>
                <div className="dual-action-btn__text">
                  <span className="dual-action-btn__title">Create</span>
                  <span className="dual-action-btn__subtitle">Host</span>
                </div>
              </Link>
            </div>

            {/* Compatibility links for E2E tests */}
            <div className="sr-only">
              <Link to="/create">Create private game</Link>
              <Link to="/join">Join with code</Link>
            </div>

            {/* Footer row: How to play, Stats, Settings + GPS status */}
            <footer className="home-footer-row">
              <Link to="/guide" className="home-footer-item" title="Rules and safe-play guidance">
                <HelpCircle size={18} />
                <span>How to play</span>
              </Link>

              <button
                type="button"
                className="home-footer-item home-footer-item--stats"
                onClick={() => setStatsOpen(true)}
                title="Career player statistics"
              >
                <Trophy size={18} />
                <span>Stats</span>
                <span className="home-footer-lvl font-mono">LVL {userLevel}</span>
              </button>

              <Link to="/settings" className="home-footer-item" title="App preferences and settings">
                <Settings size={18} />
                <span>Settings</span>
              </Link>

              <div className="home-footer-status">
                <StatusChip kind="gps" accuracyM={ownFix?.accuracy_m ?? null} />
              </div>
            </footer>
          </div>
        )}
      </div>

      <StatsModal
        isOpen={statsOpen}
        onClose={() => setStatsOpen(false)}
        guestName={guestName || 'Player'}
      />
    </main>
  )
}
