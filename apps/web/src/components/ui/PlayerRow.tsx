import { Crown, Check, X } from 'lucide-react'
import type { PlayerView } from '../../services/game-api'

export interface PlayerRowProps {
  player: PlayerView
  isCurrentPlayer?: boolean
  isHost?: boolean
  canRemove?: boolean
  onRemove?: (id: string) => void
}

export function PlayerRow({
  player,
  isCurrentPlayer = false,
  isHost = false,
  canRemove = false,
  onRemove,
}: PlayerRowProps) {
  const initial = player.display_name.charAt(0).toUpperCase() || '?'
  const level = Math.min(99, Math.max(1, (player.display_name.length * 3) % 45 + 5))

  return (
    <div className={`player-row ${isCurrentPlayer ? 'is-self' : ''}`}>
      <div className="player-row__avatar-wrap">
        <div className="player-row__avatar" aria-hidden="true">
          {initial}
        </div>
        {isHost && (
          <span className="player-row__crown" title="Lobby Host">
            <Crown size={12} />
          </span>
        )}
      </div>

      <div className="player-row__info">
        <div className="player-row__name-line">
          <span className="player-row__name">{player.display_name}</span>
          {isCurrentPlayer && <span className="player-row__you-badge">YOU</span>}
        </div>
        <div className="player-row__sub-line">
          <span className="player-row__level font-mono">LVL {level}</span>
          {player.status === 'TAGGED' && (
            <span className="player-row__status player-row__status--tagged">TAGGED</span>
          )}
        </div>
      </div>

      <div className="player-row__actions">
        <div
          className={`player-row__ready-dot ${player.ready ? 'is-ready' : 'is-not-ready'}`}
          title={player.ready ? 'Ready to play' : 'Not ready'}
          aria-label={player.ready ? 'Ready' : 'Not ready'}
        >
          {player.ready ? <Check size={14} /> : <span className="player-row__dot" />}
        </div>

        {canRemove && !isCurrentPlayer && onRemove && (
          <button
            type="button"
            className="player-row__remove-btn"
            onClick={() => onRemove(player.id)}
            title={`Remove ${player.display_name} from lobby`}
            aria-label={`Remove ${player.display_name}`}
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
