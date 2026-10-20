import { Chip } from './Chip'

export function StatusChip({
  kind,
  value,
  accuracyM,
  isOnline = true,
  isStale = false,
  className = '',
}: {
  kind: 'gps' | 'online' | 'stale'
  value?: string
  accuracyM?: number | null
  isOnline?: boolean
  isStale?: boolean
  className?: string
}) {
  if (kind === 'online') {
    return (
      <Chip
        variant={isOnline ? 'green' : 'red'}
        size="sm"
        pulse={isOnline}
        className={`status-chip status-chip--online ${className}`}
        title={isOnline ? 'Connected to match service' : 'Network connection lost'}
      >
        {isOnline ? 'ONLINE' : 'OFFLINE'}
      </Chip>
    )
  }

  if (kind === 'stale') {
    return (
      <Chip
        variant={isStale ? 'amber' : 'neutral'}
        size="sm"
        className={`status-chip status-chip--stale ${className}`}
        title={isStale ? 'Location data is stale' : 'Location fresh'}
      >
        {isStale ? 'STALE FIX' : 'SYNCED'}
      </Chip>
    )
  }

  // GPS kind
  let variant: 'green' | 'amber' | 'red' | 'neutral' = 'neutral'
  let label = 'GPS: NO FIX'

  if (accuracyM !== null && accuracyM !== undefined && Number.isFinite(accuracyM)) {
    if (accuracyM <= 15) {
      variant = 'green'
      label = `GPS ±${Math.round(accuracyM)}m`
    } else if (accuracyM <= 50) {
      variant = 'amber'
      label = `GPS ±${Math.round(accuracyM)}m`
    } else {
      variant = 'red'
      label = `GPS ±${Math.round(accuracyM)}m POOR`
    }
  } else if (value) {
    label = value
  }

  return (
    <Chip
      variant={variant}
      size="sm"
      className={`status-chip status-chip--gps ${className}`}
      title={label}
    >
      {label}
    </Chip>
  )
}
