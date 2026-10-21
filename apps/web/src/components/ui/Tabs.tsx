import type { ReactNode } from 'react'

export interface TabItem<T extends string> {
  id: T
  label: string
  icon?: ReactNode
  badge?: ReactNode
}

export interface TabsProps<T extends string> {
  tabs: ReadonlyArray<TabItem<T>> | Array<TabItem<T>>
  activeTab: T
  onChange: (tabId: T) => void
  ariaLabel?: string
  orientation?: 'horizontal' | 'vertical' | 'responsive'
  className?: string
}

export function Tabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  ariaLabel = 'Navigation tabs',
  orientation = 'responsive',
  className = '',
}: TabsProps<T>) {
  return (
    <div className={`app-tabs-wrap app-tabs-wrap--${orientation} ${className}`}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
        className={`app-tabs app-tabs--${orientation}`}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`app-tab ${isActive ? 'is-active' : ''}`}
            >
              {tab.icon && <span className="app-tab__icon">{tab.icon}</span>}
              <span className="app-tab__label">{tab.label}</span>
              {tab.badge && <span className="app-tab__badge">{tab.badge}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
