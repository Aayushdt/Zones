import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './App.css'
import { resolveTheme, useAppStore } from './stores/app-store'

function App() {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const [prefersDark, setPrefersDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true)
  const resolvedTheme = resolveTheme(theme, prefersDark)

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) return
    const update = () => setPrefersDark(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dusk' ? '#0d0d18' : '#f0e7d8')
  }, [resolvedTheme])

  return (
    <header className="app-header">
      <Link className="welcome__wordmark" aria-label="XZones home" to="/">X<span>✳</span>NES</Link>
      <div className="welcome__header">
        <button
          className="welcome__theme"
          type="button"
          aria-label={`Switch to ${resolvedTheme === 'dusk' ? 'Paper' : 'Dusk'} theme`}
          onClick={() => setTheme(resolvedTheme === 'dusk' ? 'paper' : 'dusk')}
        >
          {resolvedTheme === 'dusk' ? 'Paper' : 'Dusk'} theme
        </button>
        <Link className="welcome__theme" to="/settings">Settings</Link>
      </div>
    </header>
  )
}

export default App
