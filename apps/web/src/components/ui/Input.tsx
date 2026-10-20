import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  leadingIcon?: ReactNode
  trailingAction?: ReactNode
  error?: string
  helperText?: string
  mono?: boolean
  uppercase?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    leadingIcon,
    trailingAction,
    error,
    helperText,
    mono = false,
    uppercase = false,
    className = '',
    id,
    value,
    onChange,
    disabled,
    ...props
  },
  ref,
) {
  const inputId = id || `input-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

  return (
    <div className={`form-field ${error ? 'has-error' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}>
      <label htmlFor={inputId} className="form-field__label">
        {label}
      </label>
      <div className="form-field__control-wrap">
        {leadingIcon && <span className="form-field__leading-icon" aria-hidden="true">{leadingIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            if (uppercase && event.currentTarget.value) {
              event.currentTarget.value = event.currentTarget.value.toUpperCase()
            }
            onChange?.(event)
          }}
          className={`form-field__input ${mono ? 'font-mono' : ''} ${uppercase ? 'uppercase' : ''} ${
            leadingIcon ? 'has-leading' : ''
          } ${trailingAction ? 'has-trailing' : ''}`}
          {...props}
        />
        {trailingAction && <div className="form-field__trailing-action">{trailingAction}</div>}
      </div>
      {error && <p className="form-field__error" role="alert">{error}</p>}
      {helperText && !error && <p className="form-field__helper">{helperText}</p>}
    </div>
  )
})
