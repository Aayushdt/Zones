import './App.css'
import { balanceTeams } from '@xzones/game-core'

function App() {
  const minimumGame = balanceTeams(3)

  return (
    <main className="welcome">
      <p className="welcome__eyebrow">XZones · Hunter vs Runner</p>
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
