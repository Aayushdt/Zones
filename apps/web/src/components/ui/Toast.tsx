import { useEffect, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle, Info, X } from 'lucide-react'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastProps {
  message: string
  type?: ToastType
  icon?: ReactNode
  onClose?: () => void
  durationMs?: number
  className?: string
}

export function Toast({
  message,
  type = 'info',
  icon,
  onClose,
  durationMs,
  className = '',
}: ToastProps) {
  useEffect(() => {
    if (!durationMs || !onClose) return
    const timer = window.setTimeout(onClose, durationMs)
    return () => window.clearTimeout(timer)
  }, [durationMs, onClose])

  const defaultIcon =
    type === 'success' ? (
      <CheckCircle size={18} />
    ) : type === 'warning' ? (
      <AlertTriangle size={18} />
    ) : type === 'error' ? (
      <AlertTriangle size={18} />
    ) : (
      <Info size={18} />
    )

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={`app-toast app-toast--${type} ${className}`}
    >
      <span className="app-toast__icon" aria-hidden="true">
        {icon || defaultIcon}
      </span>
      <span className="app-toast__msg">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="app-toast__close"
          aria-label="Dismiss notification"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
