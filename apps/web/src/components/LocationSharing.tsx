import { useEffect } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { haversineDistanceMeters } from '@xzones/game-core'
import { supabaseGameApi } from '../services/supabase-api'
import { useLocationStore } from '../stores/location-store'
import { watchDeviceLocation } from '../services/device-lifecycle'
import { createLocationSendState } from '../services/location-send-state'

export function LocationSharing() {
  const { matchId = '' } = useParams()
  const location = useLocation()
  const enabledMatchId = useLocationStore((state) => state.enabledMatchId)
  const clearMatch = useLocationStore((state) => state.clearMatch)
  const setFix = useLocationStore((state) => state.setFix)
  const setStatus = useLocationStore((state) => state.setStatus)

  useEffect(() => {
    const allowedPath = matchId && [
      `/lobby/${matchId}`, `/match/${matchId}`, `/match/${matchId}/head-start`,
      `/match/${matchId}/pings`, `/match/${matchId}/tag`, `/match/${matchId}/host-claim`,
    ].includes(location.pathname)
    if (!allowedPath && enabledMatchId) clearMatch(enabledMatchId)
  }, [location.pathname, matchId, enabledMatchId, clearMatch])

  useEffect(() => {
    if (!matchId || enabledMatchId !== matchId) return
    if (!window.isSecureContext || !navigator.geolocation) {
      setStatus('Secure HTTPS is required for GPS sharing on a phone. Use localhost only for development.')
      return
    }
    let disposed = false
    let sending = false
    let retryAfterAt = 0
    const sendState = createLocationSendState()
    const syncOnResume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void supabaseGameApi.syncMatch(matchId)
    }
    const upload = async (fix: GeolocationPosition) => {
      const coords = fix.coords
      const point = { lat: coords.latitude, lon: coords.longitude }
      if (disposed) return
      setFix({ player_id: 'local-you', display_name: 'You', ...point, accuracy_m: coords.accuracy, captured_at: new Date(fix.timestamp).toISOString() })
      if (coords.accuracy > 100) { setStatus('GPS accuracy is over 100 m; waiting for a clearer fix.') ; return }
      if (document.visibilityState !== 'visible' || !navigator.onLine) {
        setStatus('Background or offline; uploads paused. Your last fix becomes stale.')
        return
      }
      if (Date.now() < retryAfterAt) {
        setStatus(`Location update paced by the server; retrying in ${Math.ceil((retryAfterAt - Date.now()) / 1000)} seconds.`)
        return
      }
      const moved = sendState.sentFix ? haversineDistanceMeters(sendState.sentFix.lat, sendState.sentFix.lon, point.lat, point.lon) ?? 0 : Infinity
      if (sending || (sendState.sentAt && Date.now() - sendState.sentAt < 10_000 && moved < 10)) return
      sending = true
      const sequence = Math.max(Date.now() * 1000, sendState.sequence + 1)
      sendState.sequence = sequence
      const result = await supabaseGameApi.updateLocation(matchId, {
        ...point, accuracy_m: coords.accuracy, captured_at: new Date(fix.timestamp).toISOString(), sequence,
      })
      sending = false
      if (disposed) return
      if (!result.ok) {
        if (result.error.code === 'RATE_LIMITED') {
          const delay = result.error.retryAfterSeconds ?? 2
          retryAfterAt = Date.now() + delay * 1000
          setStatus(`Location update paced by the server; retrying in ${delay} seconds.`)
          return
        }
        setStatus(result.error.message); return
      }
      if (!result.data.accepted) {
        setStatus(result.data.reason === 'POOR_ACCURACY' ? 'GPS accuracy is over 100 m; waiting for a clearer fix.'
          : result.data.reason === 'IMPLAUSIBLE_MOVEMENT' || result.data.reason === 'OUTSIDE_ZONE_RANGE'
            ? 'The server rejected an implausible location fix.' : 'The server rejected this stale location fix.')
        return
      }
      sendState.sentAt = Date.now()
      sendState.sentFix = point
      setStatus(result.data.zone_eliminated
        ? 'You were outside the active zone for too long and have been eliminated.'
        : result.data.zone_warning
          ? 'Zone warning: return inside the boundary now or you will be eliminated.'
          : 'Location shared with your team. Opposing Runner positions are only sent to Hunters on scheduled pings.')
    }
    const onError = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        setStatus('Location permission was denied. Sharing stopped; allow location in browser settings and ready again.')
        clearMatch(matchId)
        void supabaseGameApi.setReady(matchId, false)
      } else setStatus('Waiting for GPS. Move outdoors or retry after the signal improves.')
    }
    const stopWatching = watchDeviceLocation(true, navigator.geolocation, (fix) => void upload(fix), onError)
    const onOnline = () => { setStatus('Connection restored; syncing match.'); syncOnResume() }
    const onOffline = () => setStatus('Offline; location uploads paused and match data is not cached.')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', syncOnResume)
    return () => {
      disposed = true
      stopWatching()
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', syncOnResume)
    }
  }, [matchId, enabledMatchId, clearMatch, setFix, setStatus])
  return null
}
