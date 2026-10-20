import { useState, type ReactNode } from 'react'

export interface SettingRowProps {
  title: string
  summary: string
  helpText?: string
  action?: ReactNode
  children?: ReactNode
  disabled?: boolean
  className?: string
}

export function SettingRow({
  title,
  summary,
  helpText,
  action,
  children,
  disabled = false,
  className = '',
}: SettingRowProps) {
  const [helpOpen, setHelpOpen] = useState(false)

  return (
    <div className={`setting-row ${disabled ? 'is-disabled' : ''} ${className}`}>
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
                aria-label={`Help for ${title}`}
                title={`Help for ${title}`}
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
      <div className="setting-row__action">
        {action || children}
      </div>
    </div>
  )
}
