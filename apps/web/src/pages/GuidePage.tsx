import { Link } from 'react-router-dom'

export function GuidePage() {
  return <main className="route-shell guide-page">
    <div className="route-shell__heading">
      <p className="welcome__eyebrow">Hide & Seek rules</p>
      <h1>How to play</h1>
      <p className="welcome__copy">One Hunter team searches for the Runners. The server controls tags, timers, zone rules, and match results.</p>
    </div>
    <section className="state-panel settings-guidance" aria-label="Hide and Seek guide">
      <h2>Before the round</h2>
      <ul>
        <li>Play only in a permitted outdoor area. Stay out of roads, private property, and restricted places; walk and stay aware of bystanders.</li>
        <li>Choose Hunter or Runner in the lobby, allow location while playing, and wait for the host to start.</li>
        <li>Runners use the head start to move before Hunters begin. Keep the app open in the foreground for reliable GPS updates.</li>
      </ul>
      <h2>During play</h2>
      <ul>
        <li>Hunters see teammates live and receive Runner locations only as scheduled snapshots. Runners never see Hunter locations.</li>
        <li>GPS Tag asks the server to tag the nearest eligible Runner in range using fresh fixes. A miss reveals no Runner identity or distance.</li>
        <li>If GPS is unreliable, a Runner can show a short-lived QR code to a nearby Hunter. A Runner may also confirm a tag on their own device.</li>
        <li>If a shrinking zone is enabled, return inside when warned. Staying outside through the grace period can eliminate a Runner.</li>
        <li>Runners should keep moving. Extended stationary play warns first, then reveals the Runner on a scheduled Hunter ping; it does not itself eliminate them.</li>
        <li>A timer win is awarded to Runners. With no timer, the round ends when a team has no active players or the host ends it.</li>
      </ul>
      <h2>Stop safely</h2>
      <p>Anyone can ask to stop. Use the in-game End or Leave controls when needed. Keep your phone with you and never play while driving or cycling.</p>
      <Link className="welcome__secondary" to="/settings">Back to settings</Link>
    </section>
  </main>
}
