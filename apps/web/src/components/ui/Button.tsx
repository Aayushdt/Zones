import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export type ButtonVariant = 'primary-green' | 'seeker-red' | 'secondary-outline' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  trailingIcon?: ReactNode
  subtitle?: string
  loading?: boolean
  disabledReason?: string
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary-outline',
    size = 'md',
    icon,
    trailingIcon,
    subtitle,
    loading = false,
    disabledReason,
    fullWidth = false,
    disabled,
    children,
    className = '',
    title,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading || Boolean(disabledReason)
  const effectiveTitle = disabledReason || title

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      title={effectiveTitle}
      aria-disabled={isDisabled}
      aria-description={disabledReason}
      className={`app-btn app-btn--${variant} app-btn--${size} ${fullWidth ? 'app-btn--full' : ''} ${
        loading ? 'app-btn--loading' : ''
      } ${className}`}
      {...props}
    >
      {loading ? (
        <span className="app-btn__spinner" aria-hidden="true" />
      ) : (
        icon && <span className="app-btn__icon">{icon}</span>
      )}
      <span className="app-btn__content">
        <span className="app-btn__label">{children}</span>
        {subtitle && <span className="app-btn__subtitle">{subtitle}</span>}
      </span>
      {trailingIcon && !loading && <span className="app-btn__trailing-icon">{trailingIcon}</span>}
    </button>
  )
})
