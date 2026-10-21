import { useEffect } from 'react'
import { Trophy, Target, Shield, Clock, X } from 'lucide-react'
import { Card } from './Card'

export interface StatsModalProps {
  isOpen: boolean
  onClose: () => void
  guestName: string
}

export function StatsModal({ isOpen, onClose, guestName }: StatsModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Deterministic local player stats derived from guest name or defaults
  const isNewPlayer = !guestName || guestName.trim().length === 0
  const seed = (guestName || 'Player').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const matches = isNewPlayer ? 0 : (seed % 18) + 3
  const tags = isNewPlayer ? 0 : ((seed * 3) % 24) + 2
  const escapes = isNewPlayer ? 0 : ((seed * 5) % 15) + 1
  const minutes = isNewPlayer ? 0 : matches * 28 + (seed % 45)
  const level = isNewPlayer ? 1 : Math.min(50, Math.floor(matches * 1.5) + 3)
  const xpCurrent = isNewPlayer ? 0 : (seed * 37) % 800 + 150
  const xpTotal = 1000
  const xpProgress = Math.round((xpCurrent / xpTotal) * 100)

  // Circular ring calculations
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (circumference * xpProgress) / 100

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="stats-modal-title">
      <div className="stats-modal" onClick={(e) => e.stopPropagation()}>
        <div className="stats-modal__header">
          <div>
            <span className="stats-modal__eyebrow">CAREER STATS</span>
            <h2 id="stats-modal-title" className="stats-modal__title">{guestName || 'Player'}</h2>
          </div>
          <button
            type="button"
            className="stats-modal__close"
            onClick={onClose}
            aria-label="Close stats"
          >
            <X size={20} />
          </button>
        </div>

        {/* XP Level Ring */}
        <div className="stats-modal__xp-hero">
          <div className="stats-xp-ring-wrap">
            <svg className="stats-xp-ring" width="108" height="108" viewBox="0 0 108 108">
              <circle
                className="stats-xp-ring__bg"
                cx="54"
                cy="54"
                r={radius}
                strokeWidth="7"
                fill="none"
              />
              <circle
                className="stats-xp-ring__progress"
                cx="54"
                cy="54"
                r={radius}
                strokeWidth="7"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="stats-xp-ring__center font-mono">
              <span className="stats-xp-ring__lvl-label">LVL</span>
              <span className="stats-xp-ring__lvl-val">{level}</span>
            </div>
          </div>

          <div className="stats-modal__xp-info">
            <div className="stats-modal__xp-row">
              <span className="stats-modal__xp-title">XP Progress</span>
              <span className="stats-modal__xp-values font-mono">
                {xpCurrent} / {xpTotal} XP
              </span>
            </div>
            <div className="stats-modal__xp-bar-bg">
              <div className="stats-modal__xp-bar-fill" style={{ width: `${xpProgress}%` }} />
            </div>
            <span className="stats-modal__xp-hint">Earn XP by finishing matches, tagging, and surviving zone shrinks.</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-modal__grid">
          <Card variant="raised" className="stat-card">
            <div className="stat-card__icon text-green"><Shield size={20} /></div>
            <div className="stat-card__data">
              <span className="stat-card__val font-mono">{escapes}</span>
              <span className="stat-card__label">Hider Wins</span>
            </div>
          </Card>

          <Card variant="raised" className="stat-card">
            <div className="stat-card__icon text-red"><Target size={20} /></div>
            <div className="stat-card__data">
              <span className="stat-card__val font-mono">{tags}</span>
              <span className="stat-card__label">Seeker Tags</span>
            </div>
          </Card>

          <Card variant="raised" className="stat-card">
            <div className="stat-card__icon text-blue"><Trophy size={20} /></div>
            <div className="stat-card__data">
              <span className="stat-card__val font-mono">{matches}</span>
              <span className="stat-card__label">Matches Played</span>
            </div>
          </Card>

          <Card variant="raised" className="stat-card">
            <div className="stat-card__icon text-amber"><Clock size={20} /></div>
            <div className="stat-card__data">
              <span className="stat-card__val font-mono">{Math.floor(minutes / 60)}h {minutes % 60}m</span>
              <span className="stat-card__label">Field Time</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
