import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './App.css'
import { resolveTheme, useAppStore } from './stores/app-store'
import { LogoMark } from './components/ui/Logo'
import { Sun, Moon, Settings } from 'lucide-react'

function App() {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  )
  const resolvedTheme = resolveTheme(theme, prefersDark)
  const location = useLocation()

  // Hide top header in full-screen HUD mode on /match/:id
  const isMatchScreen = /^\/match\/[^/]+$/.test(location.pathname)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const update = () => setPrefersDark(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedTheme === 'dusk' ? '#000000' : '#F4F8F5')
  }, [resolvedTheme])

  if (isMatchScreen) {
    return null
  }

  const isDark = resolvedTheme === 'dusk'

  return (
    <header className="app-header">
      <Link className="app-header__wordmark" to="/">
        <LogoMark size={26} glow={true} className="app-header__logo" />
        <span className="app-header__brand-text font-mono">
          XZ<span className="text-green">✦</span>NES
        </span>
      </Link>

      <div className="app-header__actions">
        <button
          className="app-header__theme-btn"
          type="button"
          aria-label={`Switch to ${isDark ? 'Paper' : 'Dusk'} theme`}
          onClick={() => setTheme(isDark ? 'paper' : 'dusk')}
          title={`Switch to ${isDark ? 'Paper (Light)' : 'Dusk (Dark)'} theme`}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
          <span className="app-header__theme-label">
            {isDark ? 'Paper' : 'Dusk'} theme
          </span>
        </button>

        <Link
          className="app-header__settings-btn"
          to="/settings"
          title="Settings"
          aria-label="Settings"
        >
          <Settings size={18} />
          <span className="app-header__settings-label">Settings</span>
        </Link>
      </div>
    </header>
  )
}

export default App
