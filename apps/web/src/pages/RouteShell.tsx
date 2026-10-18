import { Link, useParams, useSearchParams } from 'react-router-dom'
import { StatePanel, type PanelState } from '../components/StatePanel'

const screenCopy = {
  home: ['Play as guest', 'Create a private lobby or join friends with a six-character code.'],
  create: ['Create a private game', 'Choose a team mode, game duration, and play area.'],
  join: ['Join with a code', 'Enter the private six-character lobby code shared by your host.'],
  lobby: ['Lobby', 'Choose a team, get ready, and wait for the host to start.'],
  'head-start': ['Head start', 'The server-controlled countdown will appear here.'],
  match: ['Hunter vs Runner', 'The role-safe match view will appear here.'],
  pings: ['Hunter Pings', 'Scheduled, age-labelled Runner snapshots will appear here for Hunters.'],
  tag: ['Show tag QR', 'Your single-use Runner tag code will appear here.'],
  results: ['Results', 'The server-confirmed match result will appear here.'],
  settings: ['Settings', 'Theme, map style, and safe-play preferences.'],
  simulator: ['Simulator', 'Development-only fake players and clock.'],
  'not-found': ['Page not found', 'This XZones screen does not exist.'],
} as const

type Screen = keyof typeof screenCopy

const statusMessages: Record<PanelState, string> = {
  loading: 'Loading this screen…',
  empty: 'The real-match API is not connected yet. No match has been created.',
  error: 'A safe error state. No match data is available.',
  offline: 'Offline state preview. Match data is not cached.',
  success: 'Ready-state preview only. This is not a live match.',
}

export function RouteShell({ kind }: { kind: Screen }) {
  const [searchParams] = useSearchParams()
  const params = useParams()
  const selected = searchParams.get('state')
  const state: PanelState = ['loading', 'empty', 'error', 'offline', 'success'].includes(selected ?? '')
    ? (selected as PanelState)
    : 'empty'
  const [title, description] = screenCopy[kind]

  return (
    <main className="route-shell">
      <div className="route-shell__heading">
        <p className="welcome__eyebrow">XZones · Phase A</p>
        <h1>{title}</h1>
        <p className="welcome__copy">{description}</p>
        {params.matchId ? <p className="route-shell__id">Match: {params.matchId}</p> : null}
      </div>
      <StatePanel
        state={state}
        onRetry={() => window.location.reload()}
      >
        <p>{statusMessages[state]}</p>
        {kind === 'home' ? (
          <nav className="route-shell__nav" aria-label="Game navigation">
            <Link className="welcome__action" to="/create">Create private game</Link>
            <Link className="welcome__secondary" to="/join">Join with code</Link>
          </nav>
        ) : null}
        {kind === 'settings' ? <Link className="welcome__secondary" to="/">Back to XZones</Link> : null}
        {kind === 'home' && import.meta.env.DEV ? (
          <Link className="welcome__secondary" to="/dev/sim">Open simulator</Link>
        ) : null}
      </StatePanel>
      <nav className="route-shell__previews" aria-label="State previews">
        {(['loading', 'empty', 'error', 'offline', 'success'] as const).map((preview) => (
          <Link key={preview} to={`?state=${preview}`} aria-current={state === preview ? 'page' : undefined}>
            {preview}
          </Link>
        ))}
      </nav>
    </main>
  )
}
