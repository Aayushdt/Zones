import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { HIDE_AND_SEEK_CONFIG } from '@xzones/game-core'
import { supabaseGameApi } from '../services/supabase-api'
import { useAppStore } from '../stores/app-store'

export function JoinPage() {
  const navigate = useNavigate()
  const savedName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    const normalizedCode = code.trim().toUpperCase()
    if (!trimmedName || trimmedName.length > 24) {
      setError('Enter a display name from 1 to 24 characters.')
      return
    }
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalizedCode)) {
      setError('Enter the six-character private lobby code.')
      return
    }

    setPending(true)
    setError('')
    setGuestName(trimmedName)
    const result = await supabaseGameApi.joinLobby({ code: normalizedCode, display_name: trimmedName })
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    try { sessionStorage.setItem(`xzones.lobby.${result.data.id}.code`, normalizedCode) } catch { /* lobby remains usable without a local share-code copy */ }
    navigate(`/lobby/${result.data.id}`, { state: { lobby: result.data } })
  }

  return (
    <main className="route-shell">
      <div className="route-shell__heading">
        <p className="welcome__eyebrow">Private game</p>
        <h1>Join with code</h1>
        <p className="welcome__copy">Ask the host for the six-character code. Lobbies support {HIDE_AND_SEEK_CONFIG.players.min.default}–{HIDE_AND_SEEK_CONFIG.players.max.default} players; XZones does not list public lobbies.</p>
      </div>
      <form className="state-panel screen-form" onSubmit={submit}>
        <label className="field">
          <span>Guest name</span>
          <input className="form-control" maxLength={24} onChange={(event) => setName(event.currentTarget.value)} required value={name} />
        </label>
        <label className="field">
          <span>Private lobby code</span>
          <input
            autoCapitalize="characters"
            autoComplete="one-time-code"
            className="form-control code-input"
            maxLength={6}
            onChange={(event) => setCode(event.currentTarget.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
            placeholder="6 characters"
            required
            value={code}
          />
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="welcome__action primary-action" disabled={pending} type="submit">
          {pending ? 'Joining private lobby…' : 'Join private lobby'}
        </button>
        <Link className="welcome__secondary" to="/">Back</Link>
      </form>
    </main>
  )
}
