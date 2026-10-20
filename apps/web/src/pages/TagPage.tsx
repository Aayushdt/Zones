import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import type { QrChallenge, RoleSafeMatchView, TagResult } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'
import { useLocationStore } from '../stores/location-store'

const CameraScanner = lazy(() => import('../components/CameraScanner'))

export function TagPage() {
  const { matchId = '' } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState<RoleSafeMatchView | null>(null)
  const [challenge, setChallenge] = useState<QrChallenge | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [anchor, setAnchor] = useState<{ serverNow: number; monotonic: number } | null>(null)
  const stopSharing = useLocationStore((state) => state.stopSharing)
  const currentFix = useLocationStore((state) => state.ownFix)

  const sync = useCallback(async () => {
    const result = await supabaseGameApi.syncMatch(matchId)
    if (!result.ok) { setError(result.error.message); return }
    setView(result.data)
    if (result.data.own_status === 'TAGGED') {
      stopSharing(matchId, 'You are tagged. Location sharing and GPS watcher are stopped.')
    }
    if (result.data.state === 'ENDED') navigate(`/match/${matchId}/results`, { replace: true })
  }, [matchId, navigate, stopSharing])

  useEffect(() => { void sync() }, [sync])
  useEffect(() => {
    if (!challenge || !anchor) return
    const tick = () => setSeconds(Math.max(0, Math.ceil((Date.parse(challenge.expires_at) - (anchor.serverNow + performance.now() - anchor.monotonic)) / 1000)))
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [challenge, anchor])

  const issue = async () => {
    setBusy(true); setError(''); setStatus('')
    const result = await supabaseGameApi.issueQr(matchId)
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    setChallenge(result.data)
    setAnchor({ serverNow: Date.parse(result.data.server_now), monotonic: performance.now() })
    setQrDataUrl(await QRCode.toDataURL(result.data.token, { width: 280, margin: 2, color: { dark: '#111321', light: '#fffaf0' } }))
    setStatus('Show this one-time QR to a Hunter. It expires in 60 seconds.')
  }

  const confirm = async () => {
    setBusy(true); setError('')
    const result = await supabaseGameApi.confirmTag(matchId)
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    handleTagged(result.data)
  }

  function handleTagged(result: TagResult) {
    setChallenge(null); setQrDataUrl('')
    setStatus(result.accepted ? 'Tag confirmed by the server.' : result.reason === 'NOTHING_IN_RANGE' ? 'Nothing in range.' : 'No tag was recorded.')
    if (result.state === 'ENDED') navigate(`/match/${matchId}/results`, { replace: true })
    else void sync()
  }

  async function scan(token: string) {
    setScannerOpen(false); setBusy(true); setError('')
    const result = await supabaseGameApi.scanQr(matchId, token)
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    handleTagged(result.data)
  }

  const gpsTag = async () => {
    const fixAgeMs = currentFix ? Date.now() - Date.parse(currentFix.captured_at) : Infinity
    if (!currentFix || !Number.isFinite(fixAgeMs) || fixAgeMs < 0 || fixAgeMs > 5_000 || currentFix.accuracy_m > 50) {
      setStatus('Waiting for a fresh GPS fix with accuracy of 50 m or better.')
      return
    }
    setBusy(true); setError(''); setStatus('Checking the nearest Runner on the server…')
    const result = await supabaseGameApi.gpsTag(matchId, {
      lat: currentFix.lat, lon: currentFix.lon, accuracy_m: currentFix.accuracy_m, captured_at: currentFix.captured_at,
    })
    setBusy(false)
    if (!result.ok) { setError(result.error.message); return }
    handleTagged(result.data)
  }

  const role = view?.role
  return <main className="route-shell tag-page">
    <div className="route-shell__heading">
      <p className="welcome__eyebrow">Match tagging</p>
      <h1>{role === 'RUNNER' ? 'Show your tag QR' : role === 'HUNTER' ? 'Scan a Runner' : 'Connecting…'}</h1>
      <p className="welcome__copy">Hunters can tag the nearest eligible Runner with a fresh GPS fix or use the QR fallback. The server decides every tag; a miss reveals no Runner identity or distance.</p>
    </div>
    <section className="state-panel tag-panel" aria-label="Tag controls">
      {role === 'RUNNER' && <>
        {view?.own_status === 'TAGGED' ? <p role="status">You are tagged. Your location sharing has stopped.</p> : <>
        <p role="status">{status || 'Keep this screen ready if a Hunter tags you.'}</p>
        {qrDataUrl && seconds > 0 ? <div className="tag-qr"><img src={qrDataUrl} alt="One-time Runner tag QR code" /><span>{seconds}s remaining</span></div> : <button className="welcome__action" disabled={busy} onClick={() => void issue()} type="button">{busy ? 'Preparing…' : 'Generate tag QR'}</button>}
        <button className="welcome__secondary" disabled={busy} onClick={() => void confirm()} type="button">I was tagged</button>
        </>}
      </>}
      {role === 'HUNTER' && <>
        <p role="status">{status || 'Use GPS Tag for the nearest Runner in range, or scan the Runner’s QR as a fallback.'}</p>
        <button className="welcome__action" disabled={busy || !currentFix} onClick={() => void gpsTag()} type="button">{busy ? 'Checking…' : 'GPS Tag'}</button>
        {!scannerOpen ? <button className="welcome__action" disabled={busy} onClick={() => setScannerOpen(true)} type="button">{busy ? 'Checking…' : 'Open camera scanner'}</button> : <Suspense fallback={<p>Loading scanner…</p>}><CameraScanner onToken={(token) => void scan(token)} onClose={() => setScannerOpen(false)} /></Suspense>}
      </>}
      {!role && <p role="status">Loading your role from the match service…</p>}
      {error && <p className="tag-error" role="alert">{error}</p>}
      <Link className="welcome__secondary" to={`/match/${matchId}`}>Back to match</Link>
    </section>
  </main>
}
