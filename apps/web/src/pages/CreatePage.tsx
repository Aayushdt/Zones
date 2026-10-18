import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabaseGameApi } from '../services/supabase-api'
import { useAppStore } from '../stores/app-store'

const durations = [30, 45, 60] as const
const pingOptions = [3, 5, 10, 15] as const

export function CreatePage() {
  const navigate = useNavigate()
  const savedName = useAppStore((state) => state.guestName)
  const setGuestName = useAppStore((state) => state.setGuestName)
  const [name, setName] = useState(savedName)
  const [duration, setDuration] = useState<(typeof durations)[number]>(45)
  const [pingMinutes, setPingMinutes] = useState<(typeof pingOptions)[number] | null>(5)
  const [headStart, setHeadStart] = useState(180)
  const [fixedZone, setFixedZone] = useState(false)
  const [diameter, setDiameter] = useState(1000)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

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
      round_seconds: duration * 60,
      head_start_seconds: headStart,
      ping_seconds: pingMinutes === null ? null : pingMinutes * 60,
      ...(fixedZone ? {
        zone_diameter_m: diameter,
        zone_lat: Number(latitude),
        zone_lon: Number(longitude),
      } : {}),
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
    <main className="route-shell">
      <div className="route-shell__heading">
        <p className="welcome__eyebrow">Private lobby</p>
        <h1>Create game</h1>
        <p className="welcome__copy">Set the round, head start, and optional game boundary. Only people with your private code can join.</p>
      </div>
      <form className="state-panel screen-form" onSubmit={submit}>
        <label className="field">
          <span>Guest name</span>
          <input className="form-control" maxLength={24} onChange={(event) => setName(event.currentTarget.value)} required value={name} />
        </label>

        <fieldset className="field-set">
          <legend>Game duration</legend>
          <div className="segmented-control">
            {durations.map((minutes) => (
              <button
                aria-pressed={duration === minutes}
                className={duration === minutes ? 'segment is-selected' : 'segment'}
                key={minutes}
                onClick={() => setDuration(minutes)}
                type="button"
              >{minutes} min</button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span>Head start <strong>{Math.floor(headStart / 60)}:{String(headStart % 60).padStart(2, '0')}</strong></span>
          <input max={900} min={0} onChange={(event) => setHeadStart(Number(event.currentTarget.value))} step={30} type="range" value={headStart} />
        </label>

        <fieldset className="field-set">
          <legend>Runner ping interval</legend>
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
            <p className="field-help">Enter a center now. Map selection will be available in the gameplay map step.</p>
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
