import { useState, type ReactNode } from 'react'

export interface SettingRowProps {
  title: string
  summary: string
  helpText?: string
  valueDisplay?: ReactNode
  action?: ReactNode
  children?: ReactNode
  disabled?: boolean
  disabledReason?: string
  className?: string
}

export function SettingRow({
  title,
  summary,
  helpText,
  valueDisplay,
  action,
  children,
  disabled = false,
  disabledReason,
  className = '',
}: SettingRowProps) {
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div
      className={`setting-row ${disabled ? 'is-disabled' : ''} ${className}`}
      title={disabled && disabledReason ? disabledReason : undefined}
    >
      <div className="setting-row__top">
        <div className="setting-row__main">
          <div className="setting-row__header">
            <span className="setting-row__title">{title}</span>
            {helpText && (
              <div className="setting-row__help-wrap">
                <button
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
                  <div className="setting-row__popover" role="tooltip">
                    <p>{helpText}</p>
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
            )}
          </div>
          <p className="setting-row__summary">{summary}</p>
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
