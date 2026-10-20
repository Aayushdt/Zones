import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabaseGameApi } from '../services/supabase-api'
import { useAppStore } from '../stores/app-store'
import { ZonePicker } from '../components/ZonePicker'
import { readHostPresets, writeHostPresets, type HostPreset } from '../services/host-presets'

const durations = [30, 45, 60] as const
const pingOptions = [3, 5, 10, 15] as const

export function CreatePage() {
  const navigate = useNavigate()
  const savedName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)
  const [name, setName] = useState(savedName)
  const [duration, setDuration] = useState<(typeof durations)[number]>(45)
  const [timerEnabled, setTimerEnabled] = useState(true)
  const [pingMinutes, setPingMinutes] = useState<(typeof pingOptions)[number] | null>(5)
  const [headStart, setHeadStart] = useState(180)
  const [fixedZone, setFixedZone] = useState(false)
  const [diameter, setDiameter] = useState(1000)
  const [shrinkStages, setShrinkStages] = useState(0)
  const [shrinkIntervalMinutes, setShrinkIntervalMinutes] = useState(5)
  const [finalRadius, setFinalRadius] = useState(50)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [presets, setPresets] = useState<HostPreset[]>(readHostPresets)
  const [presetName, setPresetName] = useState('')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presetNotice, setPresetNotice] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  function savePreset() {
    const trimmedPresetName = presetName.trim()
    if (!trimmedPresetName || trimmedPresetName.length > 32) { setPresetNotice('Name the preset using 1 to 32 characters.'); return }
    const preset: HostPreset = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: trimmedPresetName,
      timerEnabled, durationMinutes: duration, pingMinutes, headStartSeconds: headStart, fixedZone,
      diameter, shrinkStages, shrinkIntervalMinutes, finalRadius, latitude, longitude,
    }
    const updated = [...presets, preset]
    if (!writeHostPresets(updated)) { setPresetNotice('Could not save presets in this browser. Check its storage settings.'); return }
    setPresets(updated); setSelectedPresetId(preset.id); setPresetName(''); setPresetNotice('Preset saved on this device.')
  }

  function loadPreset() {
    const preset = presets.find((item) => item.id === selectedPresetId)
    if (!preset) return
    setTimerEnabled(preset.timerEnabled); setDuration(preset.durationMinutes); setPingMinutes(preset.pingMinutes)
    setHeadStart(preset.headStartSeconds); setFixedZone(preset.fixedZone); setDiameter(preset.diameter)
    setShrinkStages(preset.shrinkStages); setShrinkIntervalMinutes(preset.shrinkIntervalMinutes)
    setFinalRadius(preset.finalRadius); setLatitude(preset.latitude); setLongitude(preset.longitude)
    setPresetNotice(`Loaded “${preset.name}”.`)
  }

  function deletePreset() {
    const updated = presets.filter((item) => item.id !== selectedPresetId)
    if (updated.length === presets.length) return
    if (!writeHostPresets(updated)) { setPresetNotice('Could not update presets in this browser.'); return }
    setPresets(updated); setSelectedPresetId(''); setPresetNotice('Preset deleted from this device.')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 24) {
      setError('Enter a display name from 1 to 24 characters.')
      return
    }
    if (fixedZone && (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))
      || latitude.trim() === '' || longitude.trim() === ''
      || Number(latitude) < -90 || Number(latitude) > 90
      || Number(longitude) < -180 || Number(longitude) > 180)) {
      setError('Enter a valid latitude and longitude, or switch the zone off.')
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
      ...(fixedZone ? {
        zone_diameter_m: diameter,
        zone_lat: Number(latitude),
        zone_lon: Number(longitude),
      } : {}),
      zone_shrink_stages: shrinkStages,
      zone_shrink_interval_seconds: shrinkIntervalMinutes * 60,
      zone_final_radius_m: fixedZone ? finalRadius : 50,
    })
    setPending(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    try { sessionStorage.setItem(`xzones.lobby.${result.data.id}.code`, result.data.code) } catch { /* lobby remains usable without a local share-code copy */ }
    navigate(`/lobby/${result.data.id}`, { state: { lobby: result.data } })
  }

  return (
    <main className="route-shell create-page">
      <div className="route-shell__heading">
        <p className="welcome__eyebrow">Private lobby</p>
        <h1>Create game</h1>
        <p className="welcome__copy">Set the round, head start, and optional game boundary. Only people with your private code can join.</p>
      </div>
      <form className="state-panel screen-form create-form" onSubmit={submit}>
        <label className="field">
          <span>Guest name</span>
          <input className="form-control" maxLength={24} onChange={(event) => setName(event.currentTarget.value)} required value={name} />
        </label>

        <fieldset className="field-set">
          <legend>Host presets</legend>
          <div className="settings-row">
            <label className="field"><span>New preset name</span><input className="form-control" maxLength={32} value={presetName}
              onChange={(event) => setPresetName(event.currentTarget.value)} /></label>
            <button className="welcome__secondary" disabled={!presetName.trim()} onClick={savePreset} type="button">Save current settings</button>
          </div>
          <label className="field"><span>Saved presets</span><select className="form-control" value={selectedPresetId}
            onChange={(event) => setSelectedPresetId(event.currentTarget.value)}>
            <option value="">Choose a preset</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select></label>
          <div className="settings-row">
            <button className="welcome__secondary" disabled={!selectedPresetId} onClick={loadPreset} type="button">Load preset</button>
            <button className="welcome__secondary" disabled={!selectedPresetId} onClick={deletePreset} type="button">Delete preset</button>
          </div>
          {presetNotice && <p className="field-help" role="status">{presetNotice}</p>}
        </fieldset>

        <fieldset className="field-set">
          <legend>Game duration <span className="field-legend-note">Server timed</span></legend>
          <div className="segmented-control">
            <button aria-pressed={!timerEnabled} className={!timerEnabled ? 'segment is-selected' : 'segment'} onClick={() => setTimerEnabled(false)} type="button">No timer</button>
            {durations.map((minutes) => (
              <button
                aria-pressed={timerEnabled && duration === minutes}
                className={timerEnabled && duration === minutes ? 'segment is-selected' : 'segment'}
                key={minutes}
                onClick={() => { setDuration(minutes); setTimerEnabled(true) }}
                type="button"
              >{minutes} min</button>
            ))}
          </div>
        </fieldset>
        {!timerEnabled ? <p className="field-help">No time limit. The match ends only when a team has no active players or the host ends it; Runners cannot win by waiting out a clock.</p> : null}

        <label className="field">
          <span>Head start <strong>{Math.floor(headStart / 60)}:{String(headStart % 60).padStart(2, '0')}</strong></span><small className="field-help">Hunters receive no Runner snapshots during this time.</small>
          <input max={900} min={0} onChange={(event) => setHeadStart(Number(event.currentTarget.value))} step={30} type="range" value={headStart} />
        </label>

        <fieldset className="field-set">
          <legend>Runner ping interval <span className="field-legend-note">Hunters only</span></legend>
          <div className="segmented-control">
            {pingOptions.map((minutes) => (
              <button
                aria-pressed={pingMinutes === minutes}
                className={pingMinutes === minutes ? 'segment is-selected' : 'segment'}
                key={minutes}
                onClick={() => setPingMinutes(minutes)}
                type="button"
              >{minutes} min</button>
            ))}
            <button
              aria-pressed={pingMinutes === null}
              className={pingMinutes === null ? 'segment is-selected' : 'segment'}
              onClick={() => setPingMinutes(null)}
              type="button"
            >Off</button>
          </div>
        </fieldset>

        <label className="check-field">
          <input checked={fixedZone} onChange={(event) => setFixedZone(event.currentTarget.checked)} type="checkbox" />
          <span>Use a fixed game boundary</span>
        </label>
        {fixedZone ? (
          <div className="zone-fields">
            <label className="field">
              <span>Zone diameter · {diameter} m</span>
              <input max={3000} min={400} onChange={(event) => setDiameter(Number(event.currentTarget.value))} step={100} type="range" value={diameter} />
            </label>
            <label className="field">
              <span>Shrink stages · {shrinkStages}</span>
              <input max={10} min={0} onChange={(event) => setShrinkStages(Number(event.currentTarget.value))} step={1} type="range" value={shrinkStages} />
            </label>
            {shrinkStages > 0 ? <>
              <label className="field">
                <span>Interval per stage · {shrinkIntervalMinutes} min</span>
                <input max={60} min={1} onChange={(event) => setShrinkIntervalMinutes(Number(event.currentTarget.value))} step={1} type="range" value={shrinkIntervalMinutes} />
              </label>
              <label className="field">
                <span>Final radius · {finalRadius} m</span>
                <input max={diameter / 2} min={50} onChange={(event) => setFinalRadius(Number(event.currentTarget.value))} step={10} type="range" value={Math.min(finalRadius, diameter / 2)} />
              </label>
            </> : null}
            <p className="field-help">Choose a circular boundary by selecting a center on the map or entering coordinates.</p>
            <ZonePicker
              center={latitude.trim() && longitude.trim() && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude))
                ? { lat: Number(latitude), lon: Number(longitude) } : null}
              radiusM={diameter / 2}
              onCenterChange={(point) => { setLatitude(String(point.lat)); setLongitude(String(point.lon)) }}
            />
            <div className="coordinate-fields">
              <label className="field"><span>Center latitude</span><input className="form-control" inputMode="decimal" onChange={(event) => setLatitude(event.currentTarget.value)} placeholder="e.g. 25.61" value={latitude} /></label>
              <label className="field"><span>Center longitude</span><input className="form-control" inputMode="decimal" onChange={(event) => setLongitude(event.currentTarget.value)} placeholder="e.g. 85.14" value={longitude} /></label>
            </div>
          </div>
        ) : <p className="field-help">Boundary is off. You can create the private lobby without sharing your location.</p>}

        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="welcome__action primary-action" disabled={pending} type="submit">
          {pending ? 'Creating private lobby…' : 'Create private lobby'}
        </button>
        <Link className="welcome__secondary" to="/">Back</Link>
      </form>
    </main>
  )
}
