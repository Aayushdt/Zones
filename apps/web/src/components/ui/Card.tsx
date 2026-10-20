import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'surface' | 'raised' | 'glow-green' | 'glow-red' | 'outline'
  interactive?: boolean
  children?: ReactNode
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'surface', interactive = false, className = '', children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`app-card app-card--${variant} ${interactive ? 'app-card--interactive' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
})
