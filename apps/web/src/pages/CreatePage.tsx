import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Gamepad2,
  MapPin,
  Bell,
  Coins,
  Play,
  Save,
  Trash2,
  Download,
  AlertTriangle,
} from 'lucide-react'
import { supabaseGameApi } from '../services/supabase-api'
import { useAppStore } from '../stores/app-store'
import { ZonePicker } from '../components/ZonePicker'
import { readHostPresets, writeHostPresets, type HostPreset } from '../services/host-presets'
import { Tabs } from '../components/ui/Tabs'
import { SettingRow } from '../components/ui/SettingRow'
import { SegmentedControl } from '../components/ui/SegmentedControl'
import { Toggle } from '../components/ui/Toggle'
import { Slider } from '../components/ui/Slider'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

const durationOptions = [
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '60 min' },
] as const

const pingOptions = [
  { value: 'off', label: 'Off' },
  { value: '3', label: '3 min' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
  { value: '15', label: '15 min' },
] as const

const headStartOptions = [
  { value: '0', label: 'None' },
  { value: '30', label: '30 s' },
  { value: '60', label: '1 min' },
  { value: '180', label: '3 min' },
  { value: '300', label: '5 min' },
] as const

type SetupTabId = 'gameplay' | 'zone' | 'alerts' | 'economy'

export function CreatePage() {
  const navigate = useNavigate()
  const savedName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)

  // Form State
  const [activeTab, setActiveTab] = useState<SetupTabId>('gameplay')
  const [name, setName] = useState(savedName)
  const [timerEnabled, setTimerEnabled] = useState(true)
  const [duration, setDuration] = useState<number>(45)
  const [pingMinutes, setPingMinutes] = useState<number | null>(5)
  const [headStart, setHeadStart] = useState<number>(180)

  // Zone Settings
  const [fixedZone, setFixedZone] = useState(true)
  const [diameter, setDiameter] = useState(1000)
  const [shrinkStages, setShrinkStages] = useState(2)
  const [shrinkIntervalMinutes, setShrinkIntervalMinutes] = useState(5)
  const [finalRadius, setFinalRadius] = useState(150)
  const [latitude, setLatitude] = useState('37.7749')
  const [longitude, setLongitude] = useState('-122.4194')

  // Economy / Items
  const [itemsEnabled, setItemsEnabled] = useState(false)
  const [hapticsAlerts, setHapticsAlerts] = useState(true)
  const [outOfZoneWarning, setOutOfZoneWarning] = useState(true)

  // Presets
  const [presets, setPresets] = useState<HostPreset[]>(readHostPresets)
  const [presetName, setPresetName] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presetNotice, setPresetNotice] = useState('')

  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  // Built-in presets
  function applyPresetChip(type: 'quick' | 'park' | 'campus') {
    if (type === 'quick') {
      setTimerEnabled(true)
      setDuration(10)
      setPingMinutes(3)
      setHeadStart(30)
      setDiameter(600)
      setShrinkStages(1)
      setFinalRadius(100)
      setPresetNotice('Applied "Quick 10 min" setup.')
    } else if (type === 'park') {
      setTimerEnabled(true)
      setDuration(45)
      setPingMinutes(5)
      setHeadStart(180)
      setDiameter(1200)
      setShrinkStages(3)
      setFinalRadius(150)
      setPresetNotice('Applied "Park 45 min" setup.')
    } else if (type === 'campus') {
      setTimerEnabled(true)
      setDuration(90)
      setPingMinutes(10)
      setHeadStart(300)
      setDiameter(2400)
      setShrinkStages(4)
      setFinalRadius(250)
      setPresetNotice('Applied "Campus 90 min" setup.')
    }
  }

  function savePreset() {
    const trimmed = presetName.trim()
    if (!trimmed || trimmed.length > 32) {
      setPresetNotice('Name the preset using 1 to 32 characters.')
      return
    }
    const preset: HostPreset = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: trimmed,
      timerEnabled,
      durationMinutes: (duration === 30 || duration === 60 ? duration : 45) as 30 | 45 | 60,
      pingMinutes: (pingMinutes === 3 || pingMinutes === 10 || pingMinutes === 15 ? pingMinutes : 5) as 3 | 5 | 10 | 15 | null,
      headStartSeconds: headStart,
      fixedZone,
      diameter,
      shrinkStages,
      shrinkIntervalMinutes,
      finalRadius,
      latitude,
      longitude,
    }
    const updated = [...presets, preset]
    if (!writeHostPresets(updated)) {
      setPresetNotice('Could not save presets in this browser. Check storage settings.')
      return
    }
    setPresets(updated)
    setSelectedPresetId(preset.id)
    setPresetName('')
    setPresetNotice('Preset saved on this device.')
  }

  function loadPreset() {
    const preset = presets.find((p) => p.id === selectedPresetId)
    if (!preset) return
    setTimerEnabled(preset.timerEnabled)
    setDuration(preset.durationMinutes)
    setPingMinutes(preset.pingMinutes)
    setHeadStart(preset.headStartSeconds)
    setFixedZone(preset.fixedZone)
    setDiameter(preset.diameter)
    setShrinkStages(preset.shrinkStages)
    setShrinkIntervalMinutes(preset.shrinkIntervalMinutes)
    setFinalRadius(preset.finalRadius)
    setLatitude(preset.latitude)
    setLongitude(preset.longitude)
    setPresetNotice(`Loaded “${preset.name}”.`)
  }

  function deletePreset() {
    const updated = presets.filter((p) => p.id !== selectedPresetId)
    if (updated.length === presets.length) return
    if (!writeHostPresets(updated)) {
      setPresetNotice('Could not update presets in this browser.')
      return
    }
    setPresets(updated)
    setSelectedPresetId('')
    setPresetNotice('Preset deleted from this device.')
  }

  // Inline Validations
  const activeRoundSeconds = timerEnabled ? duration * 60 - headStart : null
  const currentRadius = Math.round(diameter / 2)
  const nextRadiusPreview = shrinkStages > 0
    ? Math.max(50, Math.round(currentRadius - ((currentRadius - finalRadius) / shrinkStages)))
    : undefined

  let inlineValidationError = ''
  if (timerEnabled && activeRoundSeconds !== null && activeRoundSeconds < 300) {
    inlineValidationError = 'Head start must leave at least 5 minutes of active round play.'
  } else if (timerEnabled && pingMinutes !== null && pingMinutes * 60 > (activeRoundSeconds ?? Infinity)) {
    inlineValidationError = 'Ping interval cannot exceed the active match duration.'
  } else if (fixedZone && finalRadius > currentRadius) {
    inlineValidationError = 'Final zone radius cannot be larger than the starting radius.'
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 24) {
      setError('Enter a display name from 1 to 24 characters.')
      return
    }
    if (
      fixedZone &&
      (!Number.isFinite(Number(latitude)) ||
        !Number.isFinite(Number(longitude)) ||
        latitude.trim() === '' ||
        longitude.trim() === '' ||
        Number(latitude) < -90 ||
        Number(latitude) > 90 ||
        Number(longitude) < -180 ||
        Number(longitude) > 180)
    ) {
      setError('Enter a valid latitude and longitude on the map or disable the zone.')
      return
    }
    if (inlineValidationError) {
      setError(inlineValidationError)
      return
    }

    setPending(true)
    setError('')
    setGuestName(trimmedName)

    const result = await supabaseGameApi.createLobby({
      display_name: trimmedName,
      round_seconds: timerEnabled ? duration * 60 : null,
      head_start_seconds: headStart,
      ping_seconds: pingMinutes === null ? null : pingMinutes * 60,
      ...(fixedZone
        ? {
            zone_diameter_m: diameter,
            zone_lat: Number(latitude),
            zone_lon: Number(longitude),
          }
        : {}),
      zone_shrink_stages: shrinkStages,
      zone_shrink_interval_seconds: shrinkIntervalMinutes * 60,
      zone_final_radius_m: fixedZone ? finalRadius : 50,
    })

    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }

    try {
      sessionStorage.setItem(`xzones.lobby.${result.data.id}.code`, result.data.code)
    } catch {
      /* ignore */
    }

    navigate(`/lobby/${result.data.id}`, { state: { lobby: result.data } })
  }

  const tabs = [
    { id: 'gameplay' as const, label: 'Gameplay', icon: <Gamepad2 size={16} /> },
    { id: 'zone' as const, label: 'Zone', icon: <MapPin size={16} /> },
    { id: 'alerts' as const, label: 'Alerts', icon: <Bell size={16} /> },
    { id: 'economy' as const, label: 'Economy', icon: <Coins size={16} /> },
  ]

  // Calculated shrink timeline stages
  const timelineStages = []
  if (fixedZone) {
    timelineStages.push({ stage: 0, radius: currentRadius, label: 'Start' })
    for (let i = 1; i <= shrinkStages; i++) {
      const rad = Math.round(currentRadius - ((currentRadius - finalRadius) / shrinkStages) * i)
      timelineStages.push({ stage: i, radius: rad, label: `Stage ${i}` })
    }
  }

  return (
    <main className="create-screen">
      <div className="create-layout">
        {/* Left Column: Settings & Tabs */}
        <div className="create-config-col">
          <header className="create-header">
            <span className="create-overline font-mono">MATCH OPERATOR</span>
            <h1 className="create-title">Create Match</h1>
            <p className="create-subtitle">Configure private outdoor rules. Seekers will receive scheduled snapshots while Hiders stay concealed.</p>
          </header>

          {/* Quick Presets Row */}
          <div className="create-presets-chips">
            <span className="presets-label text-xs text-muted">PRESETS:</span>
            <button
              type="button"
              className="preset-chip font-mono"
              onClick={() => applyPresetChip('quick')}
            >
              Quick 10m
            </button>
            <button
              type="button"
              className="preset-chip font-mono"
              onClick={() => applyPresetChip('park')}
            >
              Park 45m
            </button>
            <button
              type="button"
              className="preset-chip font-mono"
              onClick={() => applyPresetChip('campus')}
            >
              Campus 90m
            </button>
          </div>

          {/* Form */}
          <form id="create-match-form" onSubmit={submit} className="create-form-content">
            <div className="host-name-row">
              <Input
                label="Host name"
                value={name}
                maxLength={24}
                onChange={(e) => setName(e.currentTarget.value)}
                required
                placeholder="Name teammates will see"
              />
            </div>

            {/* Navigation Tabs */}
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={(tab) => setActiveTab(tab)}
              className="create-tabs"
            />

            {/* TAB 1: GAMEPLAY */}
            {activeTab === 'gameplay' && (
              <div id="panel-gameplay" role="tabpanel" aria-labelledby="tab-gameplay" className="tab-pane-content">
                <SettingRow
                  title="Round Timer"
                  summary={timerEnabled ? `Match runs up to ${duration} minutes.` : 'No timer; play until all Hiders are tagged.'}
                  action={
                    <Toggle
                      label="Round timer"
                      checked={timerEnabled}
                      onChange={(e) => setTimerEnabled(e.currentTarget.checked)}
                    />
                  }
                />

                {timerEnabled && (
                  <SettingRow
                    title="Match Duration"
                    summary={`Active field play lasts ${duration} minutes total.`}
                    helpText="Defines total match length including head start."
                    action={
                      <div className="button-group-row">
                        {durationOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            aria-pressed={duration === Number(opt.value)}
                            onClick={() => setDuration(Number(opt.value))}
                            className={`mini-segment-btn ${duration === Number(opt.value) ? 'is-selected' : ''}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    }
                  />
                )}

                <SettingRow
                  title="Hider Head Start"
                  summary={headStart > 0 ? `Hiders get ${headStart} seconds to disperse before Seekers move.` : 'Seekers start immediately.'}
                  helpText="During head start, Seekers remain frozen at spawn while Hiders take cover."
                  action={
                    <SegmentedControl
                      options={headStartOptions}
                      value={String(headStart)}
                      onChange={(val) => setHeadStart(Number(val))}
                    />
                  }
                />

                <SettingRow
                  title="Seeker Ping Interval"
                  summary={
                    pingMinutes === null
                      ? 'Ping Off: Seekers receive no periodic radar updates.'
                      : `Seekers receive an updated Hider snapshot every ${pingMinutes} minutes.`
                  }
                  helpText="Controls frequency of periodic radar snapshots sent to Seekers."
                  action={
                    <SegmentedControl
                      options={pingOptions}
                      value={pingMinutes === null ? 'off' : String(pingMinutes)}
                      onChange={(val) => setPingMinutes(val === 'off' ? null : Number(val))}
                    />
                  }
                />
              </div>
            )}

            {/* TAB 2: ZONE */}
            {activeTab === 'zone' && (
              <div id="panel-zone" role="tabpanel" aria-labelledby="tab-zone" className="tab-pane-content">
                <SettingRow
                  title="Circle Play Zone"
                  summary={fixedZone ? `Bound players to a circular field (${diameter}m diameter).` : 'No boundary; play freely without zone constraints.'}
                  action={
                    <Toggle
                      label="Circle zone"
                      checked={fixedZone}
                      onChange={(e) => setFixedZone(e.currentTarget.checked)}
                    />
                  }
                />

                {fixedZone && (
                  <>
                    <Slider
                      label="Starting Diameter"
                      description={`Radius: ${currentRadius}m`}
                      value={diameter}
                      min={400}
                      max={3000}
                      step={100}
                      unit="m"
                      onChange={(val) => setDiameter(val % 2 === 0 ? val : val + 1)}
                    />

                    <Slider
                      label="Shrink Stages"
                      description={shrinkStages > 0 ? `Zone collapses in ${shrinkStages} stage(s) every ${shrinkIntervalMinutes} min.` : 'Static zone with no shrinkage.'}
                      value={shrinkStages}
                      min={0}
                      max={10}
                      step={1}
                      onChange={setShrinkStages}
                    />

                    {shrinkStages > 0 && (
                      <>
                        <Slider
                          label="Shrink Interval"
                          description={`Zone shrinks every ${shrinkIntervalMinutes} minutes.`}
                          value={shrinkIntervalMinutes}
                          min={2}
                          max={30}
                          step={1}
                          unit="min"
                          onChange={setShrinkIntervalMinutes}
                        />

                        <Slider
                          label="Final Circle Radius"
                          description={`Final safe area radius: ${finalRadius}m.`}
                          value={finalRadius}
                          min={50}
                          max={currentRadius}
                          step={25}
                          unit="m"
                          onChange={setFinalRadius}
                        />
                      </>
                    )}

                    {/* Shrink Timeline Visual */}
                    {shrinkStages > 0 && (
                      <div className="shrink-timeline-box">
                        <span className="shrink-timeline-title font-mono text-xs">SHRINK TIMELINE</span>
                        <div className="shrink-timeline-stages">
                          {timelineStages.map((st) => (
                            <div key={st.stage} className="timeline-stage-item">
                              <div
                                className="timeline-stage-circle"
                                style={{
                                  width: `${Math.max(22, (st.radius / currentRadius) * 44)}px`,
                                  height: `${Math.max(22, (st.radius / currentRadius) * 44)}px`,
                                }}
                              />
                              <span className="timeline-stage-label font-mono text-xs">{st.label}</span>
                              <span className="timeline-stage-radius font-mono text-xs">{st.radius}m</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB 3: ALERTS */}
            {activeTab === 'alerts' && (
              <div id="panel-alerts" role="tabpanel" aria-labelledby="tab-alerts" className="tab-pane-content">
                <SettingRow
                  title="Haptic Vibration"
                  summary="Vibrate phone on new radar ping snapshots and emergency alerts."
                  action={
                    <Toggle
                      label="Haptic feedback"
                      checked={hapticsAlerts}
                      onChange={(e) => setHapticsAlerts(e.currentTarget.checked)}
                    />
                  }
                />

                <SettingRow
                  title="Zone Exit Warning"
                  summary="Warn players at 30 s outside boundary before ping reveal."
                  action={
                    <Toggle
                      label="Zone exit warning"
                      checked={outOfZoneWarning}
                      onChange={(e) => setOutOfZoneWarning(e.currentTarget.checked)}
                    />
                  }
                />
              </div>
            )}

            {/* TAB 4: ECONOMY */}
            {activeTab === 'economy' && (
              <div id="panel-economy" role="tabpanel" aria-labelledby="tab-economy" className="tab-pane-content">
                <SettingRow
                  title="Tactical Items"
                  summary="Enable Hunter Scans, Alarms, Decoys, and Zone Shields (1 per role)."
                  helpText="Free tactical items. No paywall or monetization."
                  action={
                    <Toggle
                      label="Tactical items"
                      checked={itemsEnabled}
                      onChange={(e) => setItemsEnabled(e.currentTarget.checked)}
                    />
                  }
                />
              </div>
            )}

            {/* Browser Presets Manager (Persistent & Compatible with E2E) */}
            <Card variant="raised" className="presets-manager-card">
              <span className="presets-manager-title font-mono text-xs">SAVED HOST PRESETS</span>
              <div className="presets-manager-row">
                <label className="field presets-name-field">
                  <span>New preset name</span>
                  <input
                    className="form-control"
                    value={presetName}
                    maxLength={32}
                    onChange={(e) => setPresetName(e.currentTarget.value)}
                    placeholder="e.g. Campus hideout"
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary-outline"
                  icon={<Save size={14} />}
                  onClick={savePreset}
                >
                  Save current settings
                </Button>
              </div>

              <div className="presets-select-row">
                <label className="field presets-dropdown-field">
                  <span>Saved presets</span>
                  <select
                    className="form-control"
                    value={selectedPresetId}
                    onChange={(e) => setSelectedPresetId(e.currentTarget.value)}
                  >
                    <option value="">Select a saved preset…</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="presets-btn-pair">
                  <Button
                    type="button"
                    variant="secondary-outline"
                    icon={<Download size={14} />}
                    disabled={!selectedPresetId}
                    onClick={loadPreset}
                  >
                    Load preset
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    icon={<Trash2 size={14} />}
                    disabled={!selectedPresetId}
                    onClick={deletePreset}
                  >
                    Delete preset
                  </Button>
                </div>
              </div>
              {presetNotice && <p className="field-help" role="status">{presetNotice}</p>}
            </Card>

            {/* Validation alerts */}
            {inlineValidationError && (
              <div className="form-inline-warning" role="alert">
                <AlertTriangle size={16} />
                <span>{inlineValidationError}</span>
              </div>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            {/* Submit button */}
            <div className="create-submit-row">
              <Button
                type="submit"
                size="lg"
                variant="seeker-red"
                icon={<Play size={20} />}
                disabled={pending || Boolean(inlineValidationError)}
                loading={pending}
                fullWidth
              >
                CREATE LOBBY
              </Button>
              <Link to="/" className="create-cancel-link text-center text-muted text-xs">
                Back to Home
              </Link>
            </div>
          </form>
        </div>

        {/* Right Column (Desktop >=1024px: Sticky Live Map Preview) */}
        <div className="create-preview-col">
          <Card variant="raised" className="create-preview-card">
            <div className="preview-card-header">
              <div className="preview-indicator">
                <span className="preview-dot" />
                <span className="preview-title font-mono">LIVE ZONE PREVIEW</span>
              </div>
              <span className="preview-badge font-mono">
                {currentRadius}M RADIUS
              </span>
            </div>

            <div className="preview-map-container">
              <ZonePicker
                center={
                  latitude && longitude
                    ? { lat: Number(latitude), lon: Number(longitude) }
                    : null
                }
                radiusM={currentRadius}
                nextRadiusM={nextRadiusPreview}
                onCenterChange={(pt) => {
                  setLatitude(String(pt.lat.toFixed(6)))
                  setLongitude(String(pt.lon.toFixed(6)))
                }}
              />
            </div>

            <div className="preview-legend">
              <div className="legend-item">
                <span className="legend-color legend-color--blue" />
                <span>Active Boundary ({currentRadius}m)</span>
              </div>
              {nextRadiusPreview && (
                <div className="legend-item">
                  <span className="legend-color legend-color--amber" />
                  <span>Next Shrink ({nextRadiusPreview}m dashed)</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </main>
  )
}
