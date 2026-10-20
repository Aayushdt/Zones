import type { HTMLAttributes, ReactNode } from 'react'

export type ChipVariant = 'green' | 'red' | 'amber' | 'blue' | 'neutral'
export type ChipSize = 'sm' | 'md'

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant
  size?: ChipSize
  icon?: ReactNode
  pulse?: boolean
  children: ReactNode
}

export function Chip({
  variant = 'neutral',
  size = 'md',
  icon,
  pulse = false,
  children,
  className = '',
  ...props
}: ChipProps) {
  return (
    <span
      className={`app-chip app-chip--${variant} app-chip--${size} ${pulse ? 'app-chip--pulse' : ''} ${className}`}
      {...props}
    >
      {pulse && <span className="app-chip__dot" aria-hidden="true" />}
      {icon && <span className="app-chip__icon" aria-hidden="true">{icon}</span>}
      <span className="app-chip__label">{children}</span>
    </span>
  )
}

export const Badge = Chip
