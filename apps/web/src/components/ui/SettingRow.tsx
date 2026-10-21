import { useState, useRef, useEffect, type ReactNode } from 'react'

export interface SettingRowProps {
  title: string
  helpText: string
  valueDisplay?: ReactNode
  action?: ReactNode
  children?: ReactNode
  disabled?: boolean
  disabledReason?: string
  className?: string
}

export function SettingRow({
  title,
  helpText,
  valueDisplay,
  action,
  children,
  disabled = false,
  disabledReason,
  className = '',
}: SettingRowProps) {
  const [helpOpen, setHelpOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        helpOpen &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setHelpOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [helpOpen])

  return (
    <div
      className={`setting-row ${disabled ? 'is-disabled' : ''} ${className}`}
      title={disabled && disabledReason ? disabledReason : undefined}
    >
      <div className="setting-row__top">
        <div className="setting-row__header">
          <span className="setting-row__title">{title}</span>
          <div className="setting-row__help-wrap">
            <button
              ref={btnRef}
              type="button"
              className="setting-row__help-btn"
              onClick={() => setHelpOpen((prev) => !prev)}
              aria-expanded={helpOpen}
              aria-label={`Explanation for ${title}`}
              title={`Explanation for ${title}`}
            >
              ?
            </button>
            {helpOpen && (
              <div ref={popoverRef} className="setting-row__popover" role="tooltip">
                <p className="setting-row__popover-text">{helpText}</p>
                <button
                  type="button"
                  className="setting-row__popover-close"
                  onClick={() => setHelpOpen(false)}
                  aria-label="Close help"
                >
                  ×
                </button>
              </div>
            )}
          </div>
        </div>

        {(valueDisplay || action) && (
          <div className="setting-row__action">
            {valueDisplay && (
              <span className="setting-row__mono-val font-mono">
                {valueDisplay}
              </span>
            )}
            {action}
          </div>
        )}
      </div>

      {children && (
        <div className="setting-row__bottom">
          {children}
        </div>
      )}

      {disabled && disabledReason && (
        <div className="setting-row__disabled-hint font-mono text-xs" role="note">
          {disabledReason}
        </div>
      )}
    </div>
  )
}
