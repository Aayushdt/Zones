import { useState, useRef, useEffect, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react'
import { triggerHaptic, playSound } from '../../utils/feedback'

export interface HoldButtonProps {
  onConfirm: () => void
  label: string
  subtitle?: string
  icon?: ReactNode
  holdDurationMs?: number
  disabled?: boolean
  className?: string
  variant?: 'seeker-red' | 'primary-green'
}

export function HoldButton({
  onConfirm,
  label,
  subtitle = 'HOLD TO CONFIRM',
  icon,
  holdDurationMs = 1200,
  disabled = false,
  className = '',
  variant = 'seeker-red',
}: HoldButtonProps) {
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const hasTriggeredRef = useRef(false)

  function cancelHold() {
    setHolding(false)
    setProgress(0)
    startTimeRef.current = null
    hasTriggeredRef.current = false
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  function startHold() {
    if (disabled || holding) return
    setHolding(true)
    startTimeRef.current = performance.now()
    hasTriggeredRef.current = false
    triggerHaptic(15)
    playSound('click')

    function step(now: number) {
      if (!startTimeRef.current) return
      const elapsed = now - startTimeRef.current
      const pct = Math.min(100, (elapsed / holdDurationMs) * 100)
      setProgress(pct)

      if (pct >= 100 && !hasTriggeredRef.current) {
        hasTriggeredRef.current = true
        setHolding(false)
        setProgress(0)
        triggerHaptic([40, 60, 40])
        playSound('tag')
        onConfirm()
        return
      }

      if (pct < 100) {
        rafRef.current = requestAnimationFrame(step)
      }
    }

    rafRef.current = requestAnimationFrame(step)
  }

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  function handlePointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    startHold()
  }

  function handlePointerUp(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    cancelHold()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === ' ' || e.key === 'Enter') {
      if (!holding) startHold()
    }
  }

  function handleKeyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === ' ' || e.key === 'Enter') {
      cancelHold()
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      className={`hold-btn hold-btn--${variant} ${holding ? 'is-holding' : ''} ${className}`}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelHold}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      aria-label={`${label} (${subtitle})`}
    >
      {/* Background Fill Progress Bar */}
      <div
        className="hold-btn__fill"
        style={{ width: `${progress}%` }}
        aria-hidden="true"
      />

      <div className="hold-btn__content">
        {icon && <span className="hold-btn__icon" aria-hidden="true">{icon}</span>}
        <div className="hold-btn__text-stack">
          <span className="hold-btn__title">{label}</span>
          <span className="hold-btn__subtitle font-mono">
            {holding ? `HOLDING ${(progress).toFixed(0)}%` : subtitle}
          </span>
        </div>
      </div>
    </button>
  )
}
