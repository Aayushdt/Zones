import type { ReactNode } from 'react'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  className = '',
}: {
  options: ReadonlyArray<SegmentOption<T>> | Array<SegmentOption<T>>
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`segmented-control ${disabled ? 'is-disabled' : ''} ${className}`}
    >
      {options.map((option) => {
        const isSelected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`segmented-control__item ${isSelected ? 'is-selected' : ''}`}
          >
            {option.icon && <span className="segmented-control__icon">{option.icon}</span>}
            <span className="segmented-control__label">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
