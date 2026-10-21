import { Crosshair, EyeOff, Check, Users } from 'lucide-react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import type { Role } from '@xzones/game-core'
import type { PlayerView } from '../../services/game-api'
import { PlayerRow } from './PlayerRow'
import { EmptyState } from './EmptyState'

export interface TeamCardProps {
  role: 'HUNTER' | 'RUNNER'
  players: PlayerView[]
  currentUserId?: string
  hostId?: string
  isSelected?: boolean
  onSelectTeam: (role: Role) => void
  canRemovePlayer?: boolean
  onRemovePlayer?: (id: string) => void
  disabled?: boolean
  maxCapacity?: number
  className?: string
}

export function TeamCard({
  role,
  players,
  currentUserId,
  hostId,
  isSelected = false,
  onSelectTeam,
  canRemovePlayer = false,
  onRemovePlayer,
  disabled = false,
  maxCapacity,
  className = '',
}: TeamCardProps) {
  const isSeeker = role === 'HUNTER'
  const title = isSeeker ? 'Seekers' : 'Hiders'
  const singularRole = isSeeker ? 'Seeker' : 'Hider'
  const Icon = isSeeker ? Crosshair : EyeOff
  const variant = isSeeker ? 'seeker' : 'hider'
  const [listRef] = useAutoAnimate<HTMLDivElement>()

  return (
    <div
      className={`team-card team-card--${variant} ${isSelected ? 'is-selected' : ''} ${className}`}
    >
      <div className="team-card__header">
        <div className="team-card__role-badge">
          <Icon size={18} className="team-card__icon" />
          <h3 className="team-card__title">{title}</h3>
        </div>

        <div className="team-card__count-wrap font-mono">
          <span className="team-card__count">{players.length}</span>
          {maxCapacity !== undefined && <span className="team-card__max">/{maxCapacity}</span>}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectTeam(role)}
        className={`team-card__join-btn ${isSelected ? 'is-selected' : ''}`}
        aria-pressed={isSelected}
      >
        {isSelected ? (
          <>
            <Check size={16} />
            <span>Joined as {singularRole}</span>
          </>
        ) : (
          <>
            <span>Join {title}</span>
          </>
        )}
      </button>

      <div className="team-card__roster">
        {players.length === 0 ? (
          <EmptyState
            compact
            icon={<Users size={24} />}
            title={`Waiting for ${title.toLowerCase()}`}
            description={`No players on ${title} yet.`}
          />
        ) : (
          <div ref={listRef} className="team-card__list">
            {players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                isCurrentPlayer={player.id === currentUserId}
                isHost={player.id === hostId}
                canRemove={canRemovePlayer}
                onRemove={onRemovePlayer}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
