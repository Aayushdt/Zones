import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import './App.css'
import { useAppStore } from './stores/app-store'

function App() {
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <header className="app-header">
      <Link className="welcome__wordmark" aria-label="XZones home" to="/">X<span>✳</span>NES</Link>
      <div className="welcome__header">
        <button
          className="welcome__theme"
          type="button"
          aria-label={`Switch to ${theme === 'dusk' ? 'Paper' : 'Dusk'} theme`}
          onClick={() => setTheme(theme === 'dusk' ? 'paper' : 'dusk')}
        >
          {theme === 'dusk' ? 'Paper' : 'Dusk'} theme
        </button>
      </div>
    </header>
  )
}

export default App
