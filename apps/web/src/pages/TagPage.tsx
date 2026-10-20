import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Crosshair, QrCode, Camera, ShieldAlert, ArrowLeft, CheckCircle2, Clock } from 'lucide-react'
import QRCode from 'qrcode'
import type { QrChallenge, RoleSafeMatchView, TagResult } from '../services/game-api'
import { supabaseGameApi } from '../services/supabase-api'
import { useLocationStore } from '../stores/location-store'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { StatusChip } from '../components/ui/StatusChip'

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
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setView(result.data)
    if (result.data.own_status === 'TAGGED') {
      stopSharing(matchId, 'You are tagged. Location sharing and GPS watcher are stopped.')
    }
    if (result.data.state === 'ENDED') navigate(`/match/${matchId}/results`, { replace: true })
  }, [matchId, navigate, stopSharing])

  useEffect(() => {
    void sync()
  }, [sync])

  useEffect(() => {
    if (!challenge || !anchor) return
    const tick = () =>
      setSeconds(
        Math.max(
          0,
          Math.ceil(
            (Date.parse(challenge.expires_at) -
              (anchor.serverNow + performance.now() - anchor.monotonic)) /
              1000,
          ),
        ),
      )
    tick()
    const timer = window.setInterval(tick, 250)
    return () => window.clearInterval(timer)
  }, [challenge, anchor])

  const issue = async () => {
    setBusy(true)
    setError('')
    setStatus('')
    const result = await supabaseGameApi.issueQr(matchId)
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setChallenge(result.data)
    setAnchor({ serverNow: Date.parse(result.data.server_now), monotonic: performance.now() })
    setQrDataUrl(
      await QRCode.toDataURL(result.data.token, {
        width: 280,
        margin: 2,
        color: { dark: '#00FF89', light: '#060606' },
      }),
    )
    setStatus('Show this one-time QR to a Seeker. It expires in 60 seconds.')
  }

  const confirm = async () => {
    setBusy(true)
    setError('')
    const result = await supabaseGameApi.confirmTag(matchId)
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    handleTagged(result.data)
  }

  function handleTagged(result: TagResult) {
    setChallenge(null)
    setQrDataUrl('')
    setStatus(
      result.accepted
        ? 'Tag accepted by server!'
        : result.reason === 'NOTHING_IN_RANGE'
        ? 'Nothing in range.'
        : 'No tag was recorded.',
    )
    if (result.state === 'ENDED') navigate(`/match/${matchId}/results`, { replace: true })
    else void sync()
  }

  async function scan(token: string) {
    setScannerOpen(false)
    setBusy(true)
    setError('')
    const result = await supabaseGameApi.scanQr(matchId, token)
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    handleTagged(result.data)
  }

  const gpsTag = async () => {
    const fixAgeMs = currentFix ? Date.now() - Date.parse(currentFix.captured_at) : Infinity
    if (
      !currentFix ||
      !Number.isFinite(fixAgeMs) ||
      fixAgeMs < 0 ||
      fixAgeMs > 5_000 ||
      currentFix.accuracy_m > 50
    ) {
      setStatus('Waiting for fresh GPS fix with accuracy ±50m or better.')
      return
    }
    setBusy(true)
    setError('')
    setStatus('Searching for nearest Hider on server…')
    const result = await supabaseGameApi.gpsTag(matchId, {
      lat: currentFix.lat,
      lon: currentFix.lon,
      accuracy_m: currentFix.accuracy_m,
      captured_at: currentFix.captured_at,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    handleTagged(result.data)
  }

  const role = view?.role
  const isSeeker = role === 'HUNTER'

  return (
    <main className="tag-screen">
      <div className="tag-container">
        <header className="tag-header">
          <Link to={`/match/${matchId}`} className="tag-back-link">
            <ArrowLeft size={18} />
            <span>Back to Map</span>
          </Link>
          <span className="tag-overline font-mono">TACTICAL PROXIMITY</span>
          <h1 className="tag-title">
            {isSeeker ? 'Tag a Hider' : 'Tag Resolution'}
          </h1>
          <p className="tag-subtitle">
            {isSeeker
              ? 'Tag closest Hider with a high-accuracy GPS fix or scan their QR token.'
              : 'Show your single-use QR token to a Seeker, or self-confirm your elimination.'}
          </p>
        </header>

        {/* SEEKER CONTROLS */}
        {isSeeker && (
          <div className="tag-seeker-section">
            <Card variant="raised" className="tag-action-card">
              <div className="tag-action-card__header">
                <Crosshair size={24} className="text-red" />
                <div>
                  <h3 className="tag-action-title">GPS Proximity Tag</h3>
                  <p className="tag-action-desc">
                    Tags nearest Hider within range. Never reveals misses or opponent distance.
                  </p>
                </div>
              </div>

              <div className="tag-gps-status-row">
                <StatusChip kind="gps" accuracyM={currentFix?.accuracy_m ?? null} />
                <span className="text-xs text-muted font-mono">
                  {currentFix ? `Fix age: ${Math.max(0, Math.round((Date.now() - Date.parse(currentFix.captured_at)) / 1000))}s` : 'Acquiring satellites…'}
                </span>
              </div>

              <Button
                variant="seeker-red"
                size="lg"
                icon={<Crosshair size={20} />}
                disabled={busy}
                loading={busy}
                onClick={gpsTag}
                fullWidth
              >
                TAG NEAREST HIDER
              </Button>
            </Card>

            <Card variant="surface" className="tag-qr-scan-card">
              <div className="tag-action-card__header">
                <Camera size={24} className="text-green" />
                <div>
                  <h3 className="tag-action-title">Scan Hider QR</h3>
                  <p className="tag-action-desc">
                    Use your device camera to scan a Hider’s token directly.
                  </p>
                </div>
              </div>

              {!scannerOpen ? (
                <Button
                  variant="secondary-outline"
                  icon={<Camera size={18} />}
                  onClick={() => setScannerOpen(true)}
                  disabled={busy}
                  fullWidth
                >
                  Open Camera Scanner
                </Button>
              ) : (
                <div className="camera-box">
                  <Suspense fallback={<p className="font-mono text-xs">Initializing camera feed…</p>}>
                    <CameraScanner onToken={scan} onClose={() => setScannerOpen(false)} />
                  </Suspense>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setScannerOpen(false)}
                    className="mt-2"
                  >
                    Cancel Scan
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* HIDER CONTROLS */}
        {!isSeeker && (
          <div className="tag-hider-section">
            <Card variant="raised" className="tag-token-card">
              <div className="tag-action-card__header">
                <QrCode size={24} className="text-green" />
                <div>
                  <h3 className="tag-action-title">One-Time Hider QR Token</h3>
                  <p className="tag-action-desc">
                    Presents a cryptographically signed token valid for 60 seconds.
                  </p>
                </div>
              </div>

              {qrDataUrl ? (
                <div className="qr-display-box">
                  <img src={qrDataUrl} alt="One-time tag QR" className="tag-qr-img" />
                  <div className="qr-countdown-badge font-mono">
                    <Clock size={16} />
                    <span>EXPIRES IN {seconds}s</span>
                  </div>
                </div>
              ) : (
                <Button
                  variant="primary-green"
                  size="lg"
                  icon={<QrCode size={20} />}
                  onClick={issue}
                  disabled={busy}
                  loading={busy}
                  fullWidth
                >
                  SHOW MY TAG QR
                </Button>
              )}
            </Card>

            {/* Self-Surrender Fallback */}
            <Card variant="surface" className="tag-surrender-card">
              <div className="tag-action-card__header">
                <ShieldAlert size={24} className="text-amber" />
                <div>
                  <h3 className="tag-action-title">Runner Self-Confirmation</h3>
                  <p className="tag-action-desc">
                    Physical tag confirmed without camera or GPS alignment.
                  </p>
                </div>
              </div>
              <Button
                variant="destructive"
                disabled={busy}
                loading={busy}
                onClick={confirm}
                fullWidth
              >
                I WAS TAGGED (CONFIRM ELIMINATION)
              </Button>
            </Card>
          </div>
        )}

        {/* Status / Error alerts */}
        {status && (
          <div className="tag-feedback-banner font-mono text-xs" role="status">
            <CheckCircle2 size={16} className="text-green" />
            <span>{status}</span>
          </div>
        )}
        {error && (
          <p className="form-error font-mono text-xs" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
