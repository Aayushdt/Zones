import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
  tooltip?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'outline' | 'filled'
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, tooltip, size = 'md', variant = 'ghost', className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={tooltip || label}
      className={`icon-btn icon-btn--${size} icon-btn--${variant} ${className}`}
      {...props}
    >
      <span className="icon-btn__icon" aria-hidden="true">{icon}</span>
    </button>
  )
})
