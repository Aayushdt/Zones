import { useState, type ChangeEvent } from 'react'

export interface SliderProps {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  ticks?: number[]
  disabled?: boolean
  hideHeader?: boolean
  className?: string
}

export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
  ticks,
  disabled = false,
  hideHeader = false,
  className = '',
}: SliderProps) {
  const [editing, setEditing] = useState(false)
  const [tempValue, setTempValue] = useState(String(value))

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value)
    if (Number.isFinite(next)) {
      const clamped = Math.max(min, Math.min(max, next))
      onChange(clamped)
    }
  }

  const handleManualBlur = () => {
    setEditing(false)
    const parsed = Number(tempValue)
    if (Number.isFinite(parsed)) {
      const clamped = Math.max(min, Math.min(max, parsed))
      onChange(clamped)
      setTempValue(String(clamped))
    } else {
      setTempValue(String(value))
    }
  }

  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))

  return (
    <div className={`slider-control ${disabled ? 'is-disabled' : ''} ${className}`}>
      {!hideHeader && (
        <div className="slider-control__header">
          <label className="slider-control__label">{label}</label>
          <div className="slider-control__value-wrap">
            {editing ? (
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={tempValue}
                onChange={(e) => setTempValue(e.currentTarget.value)}
                onBlur={handleManualBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleManualBlur()
                }}
                autoFocus
                className="slider-control__value-input font-mono"
              />
            ) : (
              <button
                type="button"
                className="slider-control__value-badge font-mono"
                onClick={() => {
                  setTempValue(String(value))
                  setEditing(true)
                }}
                title="Click to edit exact number"
              >
                {value}
                {unit && <span className="slider-control__unit">{unit}</span>}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="slider-control__track-wrap">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={handleInputChange}
          className="slider-control__range"
          style={{ '--progress': `${percentage}%` } as React.CSSProperties}
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${value} ${unit}`}
        />
        {ticks && ticks.length > 0 && (
          <div className="slider-control__ticks" aria-hidden="true">
            {ticks.map((tick) => {
              const tickPct = ((tick - min) / (max - min)) * 100
              return (
                <span
                  key={tick}
                  className={`slider-control__tick ${value >= tick ? 'is-active' : ''}`}
                  style={{ left: `${tickPct}%` }}
                >
                  <span className="slider-control__tick-label">{tick}</span>
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
