import { useEffect, useRef, useState, useCallback } from 'react'
import { Navigation, Check, AlertTriangle, Slash, Clock } from 'lucide-react'
import { useLocationStore } from '../stores/location-store'
import './GpsReadinessBadge.css'

export type GpsCalibrationStatus =
  | 'untested'
  | 'warming'
  | 'ready'
  | 'weak'
  | 'stale'
  | 'denied'
  | 'timeout'
  | 'unavailable'

export const GPS_READY_THRESHOLD_METERS = 25
export const GPS_STALE_AGE_MS = 30_000

export function GpsReadinessBadge({
  onStatusChange,
  className = '',
}: {
  onStatusChange?: (status: GpsCalibrationStatus, accuracyM: number | null) => void
  className?: string
}) {
  const currentFix = useLocationStore((state) => state.ownFix)
  const setFix = useLocationStore((state) => state.setFix)
  const [status, setStatus] = useState<GpsCalibrationStatus>('untested')
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [lastFixAt, setLastFixAt] = useState<number | null>(null)
  const watchIdRef = useRef<number | null>(null)
  const timeoutIdRef = useRef<number | null>(null)
  const staleCheckTimerRef = useRef<number | null>(null)

  const clearTimers = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    if (timeoutIdRef.current !== null) {
      window.clearTimeout(timeoutIdRef.current)
      timeoutIdRef.current = null
    }
  }, [])

  const handleFix = useCallback((pos: GeolocationPosition) => {
    clearTimers()
    const acc = pos.coords.accuracy
    const timestamp = pos.timestamp || Date.now()
    setAccuracy(acc)
    setLastFixAt(timestamp)

    setFix({
      player_id: 'local-you',
      display_name: 'You',
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      accuracy_m: acc,
      captured_at: new Date(timestamp).toISOString(),
    })

    const newStatus: GpsCalibrationStatus = acc <= GPS_READY_THRESHOLD_METERS ? 'ready' : 'weak'
    setStatus(newStatus)
    onStatusChange?.(newStatus, acc)
  }, [clearTimers, onStatusChange, setFix])

  const handleError = useCallback((err: GeolocationPositionError) => {
    clearTimers()
    let newStatus: GpsCalibrationStatus = 'unavailable'
    if (err.code === err.PERMISSION_DENIED) {
      newStatus = 'denied'
    } else if (err.code === err.TIMEOUT) {
      newStatus = 'timeout'
    }
    setStatus(newStatus)
    onStatusChange?.(newStatus, null)
  }, [clearTimers, onStatusChange])

  const calibrate = useCallback(() => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setStatus('unavailable')
      onStatusChange?.('unavailable', null)
      return
    }

    clearTimers()
    setStatus('warming')
    onStatusChange?.('warming', null)

    timeoutIdRef.current = window.setTimeout(() => {
      clearTimers()
      setStatus('timeout')
      onStatusChange?.('timeout', null)
    }, 15_000)

    try {
      navigator.geolocation.getCurrentPosition(handleFix, handleError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15_000,
      })
    } catch {
      handleError({ code: 2, message: 'Position unavailable' } as GeolocationPositionError)
    }
  }, [clearTimers, handleError, handleFix, onStatusChange])

  // Track existing store fix if updated externally (e.g. from LocationSharing)
  useEffect(() => {
    if (currentFix) {
      const acc = currentFix.accuracy_m
      const fixTime = Date.parse(currentFix.captured_at)
      setAccuracy(acc)
      setLastFixAt(fixTime)
      const ageMs = Date.now() - fixTime
      if (ageMs > GPS_STALE_AGE_MS) {
        setStatus('stale')
        onStatusChange?.('stale', acc)
      } else {
        const s: GpsCalibrationStatus = acc <= GPS_READY_THRESHOLD_METERS ? 'ready' : 'weak'
        setStatus(s)
        onStatusChange?.(s, acc)
      }
    }
  }, [currentFix, onStatusChange])

  // Periodic check for fix staleness
  useEffect(() => {
    staleCheckTimerRef.current = window.setInterval(() => {
      if (lastFixAt && (status === 'ready' || status === 'weak')) {
        if (Date.now() - lastFixAt > GPS_STALE_AGE_MS) {
          setStatus('stale')
          onStatusChange?.('stale', accuracy)
        }
      }
    }, 5000)

    return () => {
      if (staleCheckTimerRef.current !== null) {
        window.clearInterval(staleCheckTimerRef.current)
      }
      clearTimers()
    }
  }, [accuracy, clearTimers, lastFixAt, onStatusChange, status])

  if (status === 'warming') {
    return (
      <div className={`gps-badge gps-badge--warming font-mono ${className}`} role="status">
        <Navigation size={12} className="gps-badge-spin text-amber" />
        <span>WARMING GPS…</span>
      </div>
    )
  }

  if (status === 'ready' && accuracy !== null) {
    return (
      <button
        type="button"
        onClick={calibrate}
        className={`gps-badge gps-badge--ready font-mono ${className}`}
        title="GPS calibrated. Click to recalibrate."
      >
        <Check size={12} className="text-green" />
        <span>GPS ±{Math.round(accuracy)}m READY</span>
      </button>
    )
  }

  if (status === 'weak' && accuracy !== null) {
    return (
      <button
        type="button"
        onClick={calibrate}
        className={`gps-badge gps-badge--weak font-mono ${className}`}
        title={`GPS accuracy is ±${Math.round(accuracy)}m (ideal ≤25m). Move outdoors and click to retry.`}
      >
        <AlertTriangle size={12} className="text-amber" />
        <span>GPS ±{Math.round(accuracy)}m WEAK</span>
      </button>
    )
  }

  if (status === 'stale') {
    return (
      <button
        type="button"
        onClick={calibrate}
        className={`gps-badge gps-badge--stale font-mono ${className}`}
        title="GPS fix is stale (>30s). Click to acquire fresh fix."
      >
        <Clock size={12} className="text-amber" />
        <span>GPS STALE{accuracy !== null ? ` (±${Math.round(accuracy)}m)` : ''}</span>
      </button>
    )
  }

  if (status === 'denied') {
    return (
      <div
        className={`gps-badge gps-badge--denied font-mono ${className}`}
        title="Location permission denied in browser settings."
        role="status"
      >
        <Slash size={12} className="text-red" />
        <span>GPS BLOCKED</span>
      </div>
    )
  }

  if (status === 'timeout' || status === 'unavailable') {
    return (
      <button
        type="button"
        onClick={calibrate}
        className={`gps-badge gps-badge--timeout font-mono ${className}`}
        title="Could not acquire GPS fix outdoors. Click to retry."
      >
        <AlertTriangle size={12} className="text-red" />
        <span>GPS UNAVAILABLE · RETRY</span>
      </button>
    )
  }

  // Untested default: non-intrusive contextual calibrate action
  return (
    <button
      type="button"
      onClick={calibrate}
      className={`gps-badge gps-badge--untested font-mono ${className}`}
      title="Verify GPS fix before readying."
    >
      <Navigation size={12} />
      <span>CHECK GPS</span>
    </button>
  )
}
