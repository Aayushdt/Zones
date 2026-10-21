import { useState, useEffect, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  User,
  SunMoon,
  Shield,
  BookOpen,
  Bug,
  ArrowLeft,
  MapPin,
  Trash2,
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
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric')
  const [permissionState, setPermissionState] = useState<string>('checking')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          setPermissionState(status.state)
          status.onchange = () => setPermissionState(status.state)
        })
        .catch(() => setPermissionState('prompt'))
    } else {
      setPermissionState('unknown')
    }
  }, [])

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

  function clearLocalData() {
    try {
      localStorage.clear()
      sessionStorage.clear()
      setNotice('All local preferences, saved presets, and match tokens cleared.')
      setClearConfirmOpen(false)
      setName('')
    } catch {
      setError('Could not clear browser storage.')
    }
  }

  const mapStyles: Array<{ value: MapStylePreference; label: string }> = [
    { value: 'auto', label: 'Match theme' },
    { value: 'dusk', label: 'Dusk' },
    { value: 'paper', label: 'Paper' },
  ]

  return (
    <main className="settings-screen">
      <div className="settings-container">
        {/* Header pattern with back link and title */}
        <header className="settings-header">
          <Link to="/" className="settings-back-link" title="Back to Home" aria-label="Back to Home">
            <ArrowLeft size={18} />
            <span>Home</span>
          </Link>
          <span className="settings-overline font-mono">PREFERENCES &amp; SYSTEM</span>
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
            <span className="settings-section-title font-mono">APPEARANCE &amp; MAP</span>
          </div>

          <SettingRow
            title="Theme Palette"
            summary="Dark neon OLED mode or light high-contrast daylight mode."
            valueDisplay={theme === 'system' ? 'System' : theme === 'dusk' ? 'Dusk' : 'Paper'}
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
            valueDisplay={mapStyle === 'auto' ? 'Auto' : mapStyle === 'dusk' ? 'Dusk' : 'Paper'}
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
            title="Measurement Units"
            summary="Distance display in meters (metric) or feet (imperial)."
            valueDisplay={units === 'metric' ? 'Metric (m)' : 'Imperial (ft)'}
            action={
              <div className="segmented-control" role="group" aria-label="Units selection">
                <button
                  type="button"
                  className={`segment ${units === 'metric' ? 'is-selected' : ''}`}
                  aria-pressed={units === 'metric'}
                  onClick={() => setUnits('metric')}
                >
                  Metric (m)
                </button>
                <button
                  type="button"
                  className={`segment ${units === 'imperial' ? 'is-selected' : ''}`}
                  aria-pressed={units === 'imperial'}
                  onClick={() => setUnits('imperial')}
                >
                  Imperial (ft)
                </button>
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

        {/* Location Permission Status & Guidance Card */}
        <Card variant="raised" className="settings-section-card">
          <div className="settings-section-header">
            <MapPin size={18} className="text-blue" />
            <span className="settings-section-title font-mono">LOCATION PERMISSIONS</span>
          </div>

          <div className="permission-status-banner">
            <div className="permission-status-dot-wrap">
              <span
                className={`permission-status-dot ${
                  permissionState === 'granted'
                    ? 'is-granted'
                    : permissionState === 'denied'
                    ? 'is-denied'
                    : 'is-prompt'
                }`}
              />
              <span className="permission-status-label font-mono">
                STATUS:{' '}
                {permissionState === 'granted'
                  ? 'PRECISION GPS ACTIVE'
                  : permissionState === 'denied'
                  ? 'PERMISSION DENIED'
                  : 'PROMPT ON MATCH JOIN'}
              </span>
            </div>

            <p className="text-xs text-muted">
              {permissionState === 'granted'
                ? 'Your device is configured for high-accuracy outdoor field tracking.'
                : permissionState === 'denied'
                ? 'Location is blocked. To fix: tap the padlock/tune icon in your browser address bar, select Site Permissions, allow Location, and reload.'
                : 'XZones requests GPS access only when you ready up in a match lobby.'}
            </p>
          </div>
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

        {/* Clear Local Data & Reset Card */}
        <Card variant="surface" className="settings-danger-card">
          <div className="danger-card-header">
            <Trash2 size={18} className="text-red" />
            <span className="font-mono text-sm text-red">STORAGE &amp; CACHE RESET</span>
          </div>
          <p className="text-xs text-muted">
            Clears saved player names, local match history tokens, and custom presets from this browser.
          </p>
          {!clearConfirmOpen ? (
            <Button
              size="sm"
              variant="destructive"
              icon={<Trash2 size={14} />}
              onClick={() => setClearConfirmOpen(true)}
            >
              Clear local data
            </Button>
          ) : (
            <div className="clear-confirm-box">
              <span className="text-xs text-red font-mono">Confirm clearing all device storage?</span>
              <div className="clear-confirm-actions">
                <Button size="sm" variant="destructive" onClick={clearLocalData}>
                  Yes, clear all
                </Button>
                <Button size="sm" variant="secondary-outline" onClick={() => setClearConfirmOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>

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
