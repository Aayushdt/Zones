import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export type PanelState = 'loading' | 'empty' | 'error' | 'offline' | 'success'

const labels: Record<PanelState, string> = {
  loading: 'Loading',
  empty: 'Not connected',
  error: 'Something went wrong',
  offline: 'You are offline',
  success: 'Ready',
}

export function StatePanel({
  state,
  children,
  onRetry,
}: {
  state: PanelState
  children: ReactNode
  onRetry?: () => void
}) {
  return (
    <section className="state-panel" aria-live="polite" data-state={state}>
      <p className="welcome__eyebrow">{labels[state]}</p>
      <div>{children}</div>
      <div className="state-panel__actions">
        {state === 'error' && onRetry ? (
          <button type="button" className="welcome__secondary" onClick={onRetry}>
            Retry
          </button>
        ) : null}
        <Link className="welcome__secondary" to="/">
          Home
        </Link>
      </div>
    </section>
  )
}
