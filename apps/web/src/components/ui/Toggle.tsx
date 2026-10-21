import { forwardRef, type InputHTMLAttributes } from 'react'

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  description?: string
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { label, description, checked, onChange, disabled, id, className = '', ...props },
  ref,
) {
  const toggleId = id || `toggle-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`

  return (
    <label htmlFor={toggleId} className={`switch-toggle ${disabled ? 'is-disabled' : ''} ${className}`}>
      <div className="switch-toggle__text">
        <span className="switch-toggle__label">{label}</span>
        {description && <span className="switch-toggle__desc">{description}</span>}
      </div>
      <div className="switch-toggle__control">
        <input
          ref={ref}
          id={toggleId}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="switch-toggle__input sr-only"
          {...props}
        />
        <span className="switch-toggle__track" aria-hidden="true">
          <span className={`switch-toggle__state-text font-mono ${checked ? 'is-on' : 'is-off'}`}>
            {checked ? 'ON' : 'OFF'}
          </span>
          <span className="switch-toggle__thumb" />
        </span>
      </div>
    </label>
  )
})
