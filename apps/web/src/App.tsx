import { useEffect, useState } from 'react'
import './App.css'
import { balanceTeams } from '@xzones/game-core'

type Theme = 'dusk' | 'paper'

function App() {
  const minimumGame = balanceTeams(3)
  const [theme, setTheme] = useState<Theme>(() => {
    const savedTheme = window.localStorage.getItem('xzones.theme')
    return savedTheme === 'paper' ? 'paper' : 'dusk'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('xzones.theme', theme)
  }, [theme])

  return (
    <main className="welcome">
      <header className="welcome__header">
        <p className="welcome__wordmark" aria-label="XZones">X<span>✳</span>NES</p>
        <button
          className="welcome__theme"
          type="button"
          aria-label={`Switch to ${theme === 'dusk' ? 'Paper' : 'Dusk'} theme`}
          onClick={() => setTheme(theme === 'dusk' ? 'paper' : 'dusk')}
        >
          {theme === 'dusk' ? 'Paper' : 'Dusk'} theme
        </button>
      </header>
      <p className="welcome__eyebrow">Hunter vs Runner</p>
      <h1>Real places. Real games.</h1>
      <p className="welcome__copy">
        A small-group outdoor game built around scheduled clues, clear team
        visibility, and in-person tags.
      </p>
      <a
        className="welcome__action"
        href="https://github.com/Aayushdt/Zones/blob/main/xzones.md"
      >
        Read the implementation plan
      </a>
      <p className="welcome__status" role="status">
        Phase A foundation · 3-player setup: {minimumGame?.hunters} Hunter,{' '}
        {minimumGame?.runners} Runners
      </p>
    </main>
  )
}

export default App
