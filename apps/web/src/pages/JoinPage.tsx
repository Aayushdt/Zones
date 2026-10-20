import { useState, useEffect, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Users, ArrowLeft } from 'lucide-react'
import { HIDE_AND_SEEK_CONFIG } from '@xzones/game-core'
import { supabaseGameApi } from '../services/supabase-api'
import { useAppStore } from '../stores/app-store'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export function JoinPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const queryCode = searchParams.get('code') || ''

  const savedName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)
  const [name, setName] = useState(savedName)
  const [code, setCode] = useState(queryCode.toUpperCase())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (queryCode) {
      setCode(queryCode.toUpperCase())
    }
  }, [queryCode])

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
    const result = await supabaseGameApi.joinLobby({
      code: normalizedCode,
      display_name: trimmedName,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    try {
      sessionStorage.setItem(`xzones.lobby.${result.data.id}.code`, normalizedCode)
    } catch {
      /* ignore */
    }
    navigate(`/lobby/${result.data.id}`, { state: { lobby: result.data } })
  }

  return (
    <main className="join-screen">
      <div className="join-container">
        <header className="join-header">
          <Link to="/" className="join-back-link">
            <ArrowLeft size={18} />
            <span>Home</span>
          </Link>
          <span className="join-overline font-mono">ENLIST WITH CODE</span>
          <h1 className="join-title">Join Private Match</h1>
          <p className="join-subtitle">
            Enter the private room code provided by your host. Lobbies support {HIDE_AND_SEEK_CONFIG.players.min.default}–{HIDE_AND_SEEK_CONFIG.players.max.default} players.
          </p>
        </header>

        <Card variant="raised" className="join-card">
          <form className="join-form" onSubmit={submit}>
            <Input
              label="Guest name"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.currentTarget.value)}
              required
              placeholder="What teammates will call you"
            />

            <Input
              label="Private lobby code"
              value={code}
              maxLength={6}
              mono
              uppercase
              autoCapitalize="characters"
              autoComplete="one-time-code"
              placeholder="6-character code"
              onChange={(e) => setCode(e.currentTarget.value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
              required
              helperText="Six characters (letters and numbers, omitting easily confused glyphs)."
            />

            {error && (
              <p className="form-error font-mono text-xs" role="alert">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              variant="primary-green"
              icon={<Users size={20} />}
              disabled={pending}
              loading={pending}
              fullWidth
            >
              {pending ? 'Joining private lobby…' : 'Join private lobby'}
            </Button>
          </form>
        </Card>
      </div>
    </main>
  )
}
