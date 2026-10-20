import { useEffect, type ReactNode } from 'react'

export interface BottomSheetProps {
  isOpen?: boolean
  onClose?: () => void
  children: ReactNode
  title?: string
  dragHandle?: boolean
  className?: string
}

export function BottomSheet({
  isOpen = true,
  onClose,
  children,
  title,
  dragHandle = true,
  className = '',
}: BottomSheetProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className={`bottom-sheet-container ${className}`}>
      <div className="bottom-sheet" role="region" aria-label={title || 'Game HUD Sheet'}>
        {dragHandle && (
          <div className="bottom-sheet__handle-wrap">
            <span className="bottom-sheet__handle" aria-hidden="true" />
          </div>
        )}
        {title && (
          <div className="bottom-sheet__header">
            <h3 className="bottom-sheet__title">{title}</h3>
            {onClose && (
              <button
                type="button"
                className="bottom-sheet__close"
                onClick={onClose}
                aria-label="Close panel"
              >
                ×
              </button>
            )}
          </div>
        )}
        <div className="bottom-sheet__body">{children}</div>
      </div>
    </div>
  )
}
