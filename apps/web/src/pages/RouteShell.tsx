import { Link, useParams, useSearchParams } from 'react-router-dom'
import { StatePanel, type PanelState } from '../components/StatePanel'

const screenCopy = {
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
