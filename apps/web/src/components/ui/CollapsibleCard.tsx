import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Card } from './Card'

export interface CollapsibleCardProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

export function CollapsibleCard({
  title,
  subtitle,
  icon,
  badge,
  defaultOpen = true,
  children,
  className = '',
}: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <Card variant="surface" className={`collapsible-card ${isOpen ? 'is-open' : 'is-closed'} ${className}`}>
      <button
        type="button"
        className="collapsible-card__header"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div className="collapsible-card__title-wrap">
          {icon && <span className="collapsible-card__icon">{icon}</span>}
          <div>
            <div className="collapsible-card__title-line">
              <span className="collapsible-card__title">{title}</span>
              {badge && <span className="collapsible-card__badge">{badge}</span>}
            </div>
            {subtitle && <p className="collapsible-card__subtitle">{subtitle}</p>}
          </div>
        </div>
        <div className="collapsible-card__chevron-btn" aria-hidden="true">
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {isOpen && (
        <div className="collapsible-card__content">
          {children}
        </div>
      )}
    </Card>
  )
}
