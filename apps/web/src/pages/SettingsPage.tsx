import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore, type MapStylePreference } from '../stores/app-store'

export function SettingsPage() {
  const savedName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const mapStyle = useAppStore((state) => state.mapStyle)
  const setMapStyle = useAppStore((state) => state.setMapStyle)
  const hapticsEnabled = useAppStore((state) => state.hapticsEnabled)
  const setHapticsEnabled = useAppStore((state) => state.setHapticsEnabled)
  const [name, setName] = useState(savedName)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = name.trim()
    if (!value || value.length > 24) { setError('Use a guest name from 1 to 24 characters.'); return }
    setGuestName(value); setName(value); setError(''); setNotice('Guest name saved on this device.')
  }

  function testHaptics() {
    if (!hapticsEnabled) { setNotice('Turn on vibration feedback first.'); return }
    if (!('vibrate' in navigator)) { setNotice('Vibration is not available in this browser.'); return }
    navigator.vibrate([35, 40, 35])
    setNotice('Vibration test sent to this device.')
  }

  const mapStyles: Array<{ value: MapStylePreference; label: string }> = [
    { value: 'auto', label: 'Match theme' }, { value: 'dusk', label: 'Dusk' }, { value: 'paper', label: 'Paper' },
  ]

  return <main className="route-shell settings-page">
    <div className="route-shell__heading"><p className="welcome__eyebrow">XZones preferences</p><h1>Settings</h1>
      <p className="welcome__copy">These preferences are saved on this device and do not change match information or player visibility.</p></div>
    <section className="state-panel settings-panel" aria-label="Appearance and device settings">
      <form className="settings-row" onSubmit={saveName}>
        <label className="field" htmlFor="settings-guest-name"><span>Guest name</span>
          <input id="settings-guest-name" className="form-control" autoComplete="nickname" maxLength={24} value={name} onChange={(event) => setName(event.currentTarget.value)} />
        </label>
        <button className="welcome__secondary" type="submit">Save name</button>
      </form>
      <fieldset className="field-set"><legend>Theme</legend><div className="segmented-control">
        {(['dusk', 'paper'] as const).map((item) => <button className={theme === item ? 'segment is-selected' : 'segment'} aria-pressed={theme === item} onClick={() => setTheme(item)} type="button" key={item}>{item === 'dusk' ? 'Dusk · Dark' : 'Paper · Light'}</button>)}
      </div></fieldset>
      <fieldset className="field-set"><legend>Map style</legend><div className="segmented-control">
        {mapStyles.map((item) => <button className={mapStyle === item.value ? 'segment is-selected' : 'segment'} aria-pressed={mapStyle === item.value} onClick={() => setMapStyle(item.value)} type="button" key={item.value}>{item.label}</button>)}
      </div><p className="field-help">Only Dusk topographic and Paper street styles are used. “Match theme” follows the selected theme.</p></fieldset>
      <div className="settings-row"><label className="check-field"><input checked={hapticsEnabled} onChange={(event) => setHapticsEnabled(event.currentTarget.checked)} type="checkbox" /><span>Vibration feedback</span></label>
        <button className="welcome__secondary" onClick={testHaptics} type="button">Test vibration</button></div>
      <section className="settings-guidance" aria-labelledby="privacy-heading"><h2 id="privacy-heading">Privacy</h2>
        <p>Guest name, theme, map style, and vibration preference stay in this browser’s local storage. During a match, the server keeps one replaceable current fix per active player and deletes it at tag, leave, or match end. It does not keep a route history. Scheduled Hunter snapshots and match metadata are removed within seven days.</p>
        <p>Runners never receive Hunter locations. Hunter map updates are scheduled snapshots, not live Runner tracking. Host controls do not add player or location visibility.</p>
      </section>
      <section className="settings-guidance" aria-labelledby="safe-play-heading"><h2 id="safe-play-heading">Safe play</h2>
        <ul><li>Play only in places where games are permitted; stay out of roads, private property, and restricted areas.</li>
          <li>Walk, keep aware of people around you, and stop if a player or bystander feels unsafe.</li>
          <li>Keep your phone with you, use the Runner confirmation if needed, and end the match when anyone asks.</li></ul>
      </section>
      <Link className="welcome__secondary" to="/guide">Hide & Seek rules and guide</Link>
      <Link className="welcome__secondary" to="/bug-report">Report a bug</Link>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {notice ? <p className="field-help" role="status">{notice}</p> : null}
      <p className="field-help">XZones Phase A · version 0.1.0</p>
      <Link className="welcome__secondary" to="/">Back to XZones</Link>
    </section>
  </main>
}
