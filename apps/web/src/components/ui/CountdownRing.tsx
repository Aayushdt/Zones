export interface CountdownRingProps {
  secondsRemaining: number
  totalSeconds?: number
  label?: string
  size?: number
  strokeWidth?: number
  className?: string
}

export function CountdownRing({
  secondsRemaining,
  totalSeconds = 300,
  label = 'RADAR PING',
  size = 54,
  strokeWidth = 4,
  className = '',
}: CountdownRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  const fraction = Math.max(0, Math.min(1, secondsRemaining / totalSeconds))
  const dashoffset = circumference * (1 - fraction)

  // Color dynamics: Green (>60s) -> Amber (30s-60s) -> Red (<30s)
  let ringColor = 'var(--color-green)'
  let statusClass = 'ring-green'
  if (secondsRemaining <= 30) {
    ringColor = 'var(--color-red)'
    statusClass = 'ring-red'
  } else if (secondsRemaining <= 60) {
    ringColor = 'var(--color-amber)'
    statusClass = 'ring-amber'
  }

  const isCritical = secondsRemaining <= 10 && secondsRemaining > 0

  const mins = Math.floor(secondsRemaining / 60)
  const secs = Math.max(0, secondsRemaining % 60)
  const formatted = `${mins}:${secs.toString().padStart(2, '0')}`

  return (
    <div className={`countdown-ring-wrap ${statusClass} ${isCritical ? 'is-critical-pulse' : ''} ${className}`}>
      <div className="countdown-ring__svg-container" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="countdown-ring__svg">
          {/* Background track circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
            fill="none"
            opacity={0.35}
          />
          {/* Progress animated circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
            className="countdown-ring__progress"
            style={{
              transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
            }}
          />
        </svg>

        {/* Center mono time string */}
        <div className="countdown-ring__digits font-mono">
          {formatted}
        </div>
      </div>

      {label && <span className="countdown-ring__label font-mono text-xs">{label}</span>}
    </div>
  )
}
