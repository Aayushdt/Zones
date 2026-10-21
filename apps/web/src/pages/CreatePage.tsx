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
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Clock,
  Radar,
  Layers,
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
import { CollapsibleCard } from '../components/ui/CollapsibleCard'

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
  const [fullscreenMapOpen, setFullscreenMapOpen] = useState(false)

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
      setPresetNotice('Preset saved: Quick 10m loaded.')
    } else if (type === 'park') {
      setTimerEnabled(true)
      setDuration(45)
      setPingMinutes(5)
      setHeadStart(180)
      setDiameter(1200)
      setShrinkStages(3)
      setFinalRadius(150)
      setPresetNotice('Preset saved: Park 45m loaded.')
    } else if (type === 'campus') {
      setTimerEnabled(true)
      setDuration(90)
      setPingMinutes(10)
      setHeadStart(300)
      setDiameter(2400)
      setShrinkStages(4)
      setFinalRadius(250)
      setPresetNotice('Preset saved: Campus 90m loaded.')
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
      setPresetNotice('Could not save preset to this browser.')
      return
    }
    setPresets(updated)
    setSelectedPresetId(preset.id)
    setPresetName('')
    setPresetNotice('Preset saved')
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

  // Calculated shrink timeline stages for horizontal circles to scale
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
        {/* Left Column: Setup Controls & Tabs */}
        <div className="create-config-col">
          {/* Header with back button, title, and Save preset shortcut */}
          <header className="create-header">
            <div className="create-header__nav">
              <Link to="/" className="create-back-btn" title="Back to Home" aria-label="Back">
                <ArrowLeft size={20} />
              </Link>
              <div className="create-title-wrap">
                <span className="create-overline font-mono">MATCH OPERATOR</span>
                <h1 className="create-title">Create Match</h1>
              </div>
            </div>
            <p className="create-subtitle">
              Configure private outdoor rules. Seekers will receive scheduled snapshots while Hiders stay concealed.
            </p>
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
            {presets.slice(0, 2).map((p) => (
              <button
                key={p.id}
                type="button"
                className="preset-chip preset-chip--saved font-mono"
                onClick={() => {
                  setSelectedPresetId(p.id)
                  setTimerEnabled(p.timerEnabled)
                  setDuration(p.durationMinutes)
                  setPingMinutes(p.pingMinutes)
                  setHeadStart(p.headStartSeconds)
                  setFixedZone(p.fixedZone)
                  setDiameter(p.diameter)
                  setShrinkStages(p.shrinkStages)
                  setFinalRadius(p.finalRadius)
                  setPresetNotice(`Preset saved: Loaded “${p.name}”.`)
                }}
              >
                ★ {p.name}
              </button>
            ))}
          </div>

          {/* Game Mode Selector Card with arrows and wrapping description */}
          <Card variant="surface" className="game-mode-card">
            <div className="game-mode-header">
              <button
                type="button"
                className="game-mode-nav-btn"
                aria-label="Previous mode"
                title="Hide & Seek is the active game mode"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="game-mode-title-wrap text-center">
                <span className="game-mode-badge font-mono text-xs">ACTIVE MODE</span>
                <h2 className="game-mode-title">Hide & Seek</h2>
              </div>
              <button
                type="button"
                className="game-mode-nav-btn"
                aria-label="Next mode"
                title="Hide & Seek is the active game mode"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <p className="game-mode-desc text-muted text-xs">
              Hiders conceal within the zone boundary while Seekers hunt using scheduled periodic radar snapshots and in-person QR tags.
            </p>
          </Card>

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

            {/* Navigation Tabs with visible labels */}
            <Tabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={(tab) => setActiveTab(tab)}
              className="create-tabs"
            />

            {/* TAB 1: GAMEPLAY */}
            {activeTab === 'gameplay' && (
              <div id="panel-gameplay" role="tabpanel" aria-labelledby="tab-gameplay" className="tab-pane-content">
                {/* Collapsible Card: Timing */}
                <CollapsibleCard
                  title="Timing & Duration"
                  subtitle="Round countdown and hider dispersal window"
                  icon={<Clock size={18} />}
                  defaultOpen={true}
                >
                  <SettingRow
                    title="Round Timer"
                    summary={timerEnabled ? `Match runs up to ${duration} minutes.` : 'No timer; play until all Hiders are tagged.'}
                    helpText="Authoritative server timer that decides match completion."
                    valueDisplay={timerEnabled ? `${duration} min` : 'Off'}
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
                      valueDisplay={`${duration} min`}
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
                    summary={headStart > 0 ? `Hiders get ${headStart}s to disperse before Seekers move.` : 'Seekers start immediately.'}
                    helpText="Seekers remain frozen while Hiders take cover."
                    valueDisplay={headStart > 0 ? `${headStart}s` : 'None'}
                    action={
                      <SegmentedControl
                        options={headStartOptions}
                        value={String(headStart)}
                        onChange={(val) => setHeadStart(Number(val))}
                      />
                    }
                  />
                </CollapsibleCard>

                {/* Collapsible Card: Radar & Tagging */}
                <CollapsibleCard
                  title="Radar & Tagging"
                  subtitle="Snapshot frequency and hunter visibility"
                  icon={<Radar size={18} />}
                  defaultOpen={true}
                >
                  <SettingRow
                    title="Seeker Ping Interval"
                    summary={
                      pingMinutes === null
                        ? 'Ping Off: Seekers receive no periodic radar updates.'
                        : `Seekers receive an updated Hider snapshot every ${pingMinutes} minutes.`
                    }
                    helpText="Controls frequency of periodic radar snapshots sent to Seekers."
                    valueDisplay={pingMinutes === null ? 'Off' : `${pingMinutes} min`}
                    action={
                      <SegmentedControl
                        options={pingOptions}
                        value={pingMinutes === null ? 'off' : String(pingMinutes)}
                        onChange={(val) => setPingMinutes(val === 'off' ? null : Number(val))}
                      />
                    }
                  />
                </CollapsibleCard>
              </div>
            )}

            {/* TAB 2: ZONE */}
            {activeTab === 'zone' && (
              <div id="panel-zone" role="tabpanel" aria-labelledby="tab-zone" className="tab-pane-content">
                <CollapsibleCard
                  title="Boundary Circle"
                  subtitle="Field radius and geographic play center"
                  icon={<MapPin size={18} />}
                  defaultOpen={true}
                >
                  <SettingRow
                    title="Circle Play Zone"
                    summary={fixedZone ? `Bound players to a circular field (${diameter}m diameter).` : 'No boundary; play freely without zone constraints.'}
                    helpText="Enforces circular play area using accuracy-aware GPS checks."
                    valueDisplay={fixedZone ? `${diameter}m` : 'Off'}
                    action={
                      <Toggle
                        label="Circle zone"
                        checked={fixedZone}
                        onChange={(e) => setFixedZone(e.currentTarget.checked)}
                      />
                    }
                  />

                  {fixedZone && (
                    <SettingRow
                      title="Starting Diameter"
                      summary={`Field radius is ${currentRadius}m.`}
                      helpText="Starting circle diameter for the outdoor field."
                      valueDisplay={`${diameter}m`}
                    >
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
                    </SettingRow>
                  )}
                </CollapsibleCard>

                {fixedZone && (
                  <CollapsibleCard
                    title="Zone Shrink Schedule"
                    subtitle="Progressive collapse of safe zone"
                    icon={<Layers size={18} />}
                    defaultOpen={true}
                  >
                    <SettingRow
                      title="Shrink Stages"
                      summary={shrinkStages > 0 ? `Zone collapses in ${shrinkStages} stage(s) every ${shrinkIntervalMinutes} min.` : 'Static zone with no shrinkage.'}
                      helpText="Number of concentric shrink contractions."
                      valueDisplay={shrinkStages > 0 ? `${shrinkStages} stages` : 'Static'}
                    >
                      <Slider
                        label="Shrink Stages"
                        description={shrinkStages > 0 ? `Zone collapses in ${shrinkStages} stage(s) every ${shrinkIntervalMinutes} min.` : 'Static zone with no shrinkage.'}
                        value={shrinkStages}
                        min={0}
                        max={10}
                        step={1}
                        onChange={setShrinkStages}
                      />
                    </SettingRow>

                    {shrinkStages > 0 && (
                      <>
                        <SettingRow
                          title="Shrink Interval"
                          summary={`Zone contracts every ${shrinkIntervalMinutes} minutes.`}
                          helpText="Time between each shrink contraction."
                          valueDisplay={`${shrinkIntervalMinutes} min`}
                        >
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
                        </SettingRow>

                        <SettingRow
                          title="Final Safe Radius"
                          summary={`Final safe area radius: ${finalRadius}m.`}
                          helpText="Minimum circle radius at match endgame."
                          valueDisplay={`${finalRadius}m`}
                        >
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
                        </SettingRow>
                      </>
                    )}

                    {/* Horizontal Shrink Timeline with Scaled Circles */}
                    {shrinkStages > 0 && (
                      <div className="shrink-timeline-box">
                        <span className="shrink-timeline-title font-mono text-xs">SHRINK PROGRESSION TIMELINE</span>
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
                  </CollapsibleCard>
                )}

                {/* Mobile & Tablet Interactive Map Preview */}
                {fixedZone && (
                  <Card variant="raised" className="mobile-zone-map-card">
                    <div className="mobile-map-header">
                      <div className="preview-indicator">
                        <span className="preview-dot" />
                        <span className="preview-title font-mono">ZONE MAP PREVIEW</span>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary-outline"
                        icon={<Maximize2 size={14} />}
                        onClick={() => setFullscreenMapOpen(true)}
                        title="Expand map to fullscreen"
                      >
                        Expand
                      </Button>
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
                )}
              </div>
            )}

            {/* TAB 3: ALERTS */}
            {activeTab === 'alerts' && (
              <div id="panel-alerts" role="tabpanel" aria-labelledby="tab-alerts" className="tab-pane-content">
                <CollapsibleCard
                  title="Sensory Alerts"
                  subtitle="Vibrations and boundary departure warnings"
                  icon={<Bell size={18} />}
                  defaultOpen={true}
                >
                  <SettingRow
                    title="Haptic Vibration"
                    summary="Vibrate phone on new radar ping snapshots and emergency alerts."
                    helpText="Uses device haptic motors for tactile game feedback."
                    valueDisplay={hapticsAlerts ? 'On' : 'Off'}
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
                    helpText="Gives players a 30s grace period to re-enter before live coordinates are exposed."
                    valueDisplay={outOfZoneWarning ? 'On' : 'Off'}
                    action={
                      <Toggle
                        label="Zone exit warning"
                        checked={outOfZoneWarning}
                        onChange={(e) => setOutOfZoneWarning(e.currentTarget.checked)}
                      />
                    }
                  />
                </CollapsibleCard>
              </div>
            )}

            {/* TAB 4: ECONOMY */}
            {activeTab === 'economy' && (
              <div id="panel-economy" role="tabpanel" aria-labelledby="tab-economy" className="tab-pane-content">
                <CollapsibleCard
                  title="Tactical Field Items"
                  subtitle="Scans, alarms, and decoys (100% free)"
                  icon={<Coins size={18} />}
                  defaultOpen={true}
                >
                  <SettingRow
                    title="Tactical Items"
                    summary="Enable Hunter Scans, Alarms, Decoys, and Zone Shields (1 per role)."
                    helpText="Free tactical items. No paywall, locks, or monetization."
                    valueDisplay={itemsEnabled ? 'Enabled' : 'Disabled'}
                    action={
                      <Toggle
                        label="Tactical items"
                        checked={itemsEnabled}
                        onChange={(e) => setItemsEnabled(e.currentTarget.checked)}
                      />
                    }
                  />
                </CollapsibleCard>
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

            {/* Sticky Bottom Action Bar */}
            <div className="create-submit-bar">
              <div className="create-submit-bar__inner">
                <Button
                  type="submit"
                  size="lg"
                  variant="seeker-red"
                  icon={<Play size={20} />}
                  disabled={pending || Boolean(inlineValidationError)}
                  disabledReason={inlineValidationError || undefined}
                  loading={pending}
                  fullWidth
                >
                  CREATE LOBBY
                </Button>
                <Link to="/" className="create-cancel-link text-center text-muted text-xs">
                  Back to Home
                </Link>
              </div>
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

      {/* Fullscreen Map Modal */}
      {fullscreenMapOpen && (
        <div className="modal-backdrop" onClick={() => setFullscreenMapOpen(false)} role="dialog" aria-modal="true">
          <div className="fullscreen-map-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fullscreen-map-header">
              <span className="font-mono text-sm">EXPANDED ZONE MAP</span>
              <Button size="sm" variant="secondary-outline" onClick={() => setFullscreenMapOpen(false)}>
                Close
              </Button>
            </div>
            <div className="fullscreen-map-content">
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
          </div>
        </div>
      )}
    </main>
  )
}
