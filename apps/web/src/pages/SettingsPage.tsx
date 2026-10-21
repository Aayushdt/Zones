import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  User,
  SunMoon,
  Shield,
  BookOpen,
  Bug,
  ArrowLeft,
} from 'lucide-react'
import { useAppStore, type MapStylePreference } from '../stores/app-store'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SettingRow } from '../components/ui/SettingRow'
import { Toggle } from '../components/ui/Toggle'
import { Input } from '../components/ui/Input'
import { playSound } from '../utils/feedback'

export function SettingsPage() {
  const savedName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const mapStyle = useAppStore((state) => state.mapStyle)
  const setMapStyle = useAppStore((state) => state.setMapStyle)
  const hapticsEnabled = useAppStore((state) => state.hapticsEnabled)
  const setHapticsEnabled = useAppStore((state) => state.setHapticsEnabled)
  const soundEnabled = useAppStore((state) => state.soundEnabled)
  const setSoundEnabled = useAppStore((state) => state.setSoundEnabled)
  const reduceEffects = useAppStore((state) => state.reduceEffects)
  const setReduceEffects = useAppStore((state) => state.setReduceEffects)

  const [name, setName] = useState(savedName)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = name.trim()
    if (!value || value.length > 24) {
      setError('Use a guest name from 1 to 24 characters.')
      return
    }
    setGuestName(value)
    setName(value)
    setError('')
    setNotice('Guest name saved on this device.')
  }

  function testHaptics() {
    if (!hapticsEnabled) {
      setNotice('Turn on vibration feedback first.')
      return
    }
    if (!('vibrate' in navigator)) {
      setNotice('Vibration is not available in this browser.')
      return
    }
    navigator.vibrate([35, 40, 35])
    setNotice('Vibration test sent to this device.')
  }

  function testSound() {
    if (!soundEnabled) {
      setNotice('Turn on audio cues first.')
      return
    }
    playSound('ping')
    setNotice('Synthesized radar tone played.')
  }

  const mapStyles: Array<{ value: MapStylePreference; label: string }> = [
    { value: 'auto', label: 'Match theme' },
    { value: 'dusk', label: 'Dusk' },
    { value: 'paper', label: 'Paper' },
  ]

  return (
    <main className="settings-screen">
      <div className="settings-container">
        <header className="settings-header">
          <Link to="/" className="settings-back-link">
            <ArrowLeft size={18} />
            <span>Home</span>
          </Link>
          <span className="settings-overline font-mono">PREFERENCES</span>
          <h1 className="settings-title">Settings</h1>
          <p className="settings-subtitle">
            Local preferences are stored on this device. They do not alter server match rules or player visibility.
          </p>
        </header>

        {/* Guest Profile Section */}
        <Card variant="raised" className="settings-section-card">
          <div className="settings-section-header">
            <User size={18} className="text-green" />
            <span className="settings-section-title font-mono">GUEST IDENTITY</span>
          </div>

          <form className="settings-name-form" onSubmit={saveName}>
            <Input
              id="settings-guest-name"
              label="Guest name"
              autoComplete="nickname"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              trailingAction={
                <Button size="sm" variant="primary-green" type="submit">
                  Save name
                </Button>
              }
            />
          </form>
        </Card>

        {/* Theme & Map Preferences */}
        <Card variant="raised" className="settings-section-card">
          <div className="settings-section-header">
            <SunMoon size={18} className="text-amber" />
            <span className="settings-section-title font-mono">APPEARANCE</span>
          </div>

          <SettingRow
            title="Theme Palette"
            summary="Dark neon OLED mode or light high-contrast daylight mode."
            action={
              <div className="segmented-control" role="group" aria-label="Theme selection">
                {(['system', 'dusk', 'paper'] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`segment ${theme === item ? 'is-selected' : ''}`}
                    aria-pressed={theme === item}
                    onClick={() => setTheme(item)}
                  >
                    {item === 'system' ? 'System' : item === 'dusk' ? 'Dusk · Dark' : 'Paper · Light'}
                  </button>
                ))}
              </div>
            }
          />

          <SettingRow
            title="Map Cartography"
            summary="Follows theme or selects specific dark topographic / light street tiles."
            action={
              <div className="segmented-control" role="group" aria-label="Map style selection">
                {mapStyles.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={`segment ${mapStyle === item.value ? 'is-selected' : ''}`}
                    aria-pressed={mapStyle === item.value}
                    onClick={() => setMapStyle(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            }
          />

          <SettingRow
            title="Vibration Feedback"
            summary="Haptic pulses on radar snapshots and match alerts."
            action={
              <div className="settings-haptics-row">
                <Toggle
                  label="Vibration feedback"
                  checked={hapticsEnabled}
                  onChange={(e) => setHapticsEnabled(e.currentTarget.checked)}
                />
                <Button size="sm" variant="secondary-outline" onClick={testHaptics} type="button">
                  Test vibration
                </Button>
              </div>
            }
          />

          <SettingRow
            title="Audio Cues"
            summary="Synthesized Web Audio tones for radar pings, tag alerts, and countdowns."
            action={
              <div className="settings-haptics-row">
                <Toggle
                  label="Sound effects"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.currentTarget.checked)}
                />
                <Button size="sm" variant="secondary-outline" onClick={testSound} type="button">
                  Test sound
                </Button>
              </div>
            }
          />

          <SettingRow
            title="Reduce Effects"
            summary="Disables ambient radar sweeps, confetti, and motion pulses for longer battery runtime."
            action={
              <Toggle
                label="Reduce motion and visual effects"
                checked={reduceEffects}
                onChange={(e) => setReduceEffects(e.currentTarget.checked)}
              />
            }
          />
        </Card>

        {/* Privacy & Safe Play Cards */}
        <div className="settings-info-grid">
          <Card variant="surface" className="settings-info-card">
            <div className="settings-info-header">
              <Shield size={18} className="text-blue" />
              <h2 id="privacy-heading" className="settings-info-title font-mono">
                PRIVACY ARCHITECTURE
              </h2>
            </div>
            <p className="text-xs text-muted">
              Preferences remain in browser storage. The server keeps exactly one active location fix per player and deletes it immediately upon tag, departure, or match end. Hiders never receive Seeker locations.
            </p>
          </Card>

          <Card variant="surface" className="settings-info-card">
            <div className="settings-info-header">
              <Shield size={18} className="text-amber" />
              <h2 id="safe-play-heading" className="settings-info-title font-mono">
                OUTDOOR SAFETY
              </h2>
            </div>
            <ul className="text-xs text-muted settings-safe-list">
              <li>Stay on public footpaths, parks, and legal pedestrian zones.</li>
              <li>Remain aware of roads, traffic, and your surroundings at all times.</li>
              <li>Stop or surrender immediately if anyone feels unsafe.</li>
            </ul>
          </Card>
        </div>

        {/* Direct Links */}
        <div className="settings-links-row">
          <Link to="/guide" className="settings-nav-btn">
            <BookOpen size={16} />
            <span>Hide &amp; Seek rules and guide</span>
          </Link>
          <Link to="/bug-report" className="settings-nav-btn">
            <Bug size={16} />
            <span>Report a bug</span>
          </Link>
        </div>

        {/* Feedback Messages */}
        {error && <p className="form-error font-mono text-xs" role="alert">{error}</p>}
        {notice && <p className="field-help font-mono text-xs text-green" role="status">{notice}</p>}

        <footer className="settings-footer font-mono text-xs text-muted text-center">
          XZones · v0.1.0 · Open Source GPS Hide &amp; Seek
        </footer>
      </div>
    </main>
  )
}
