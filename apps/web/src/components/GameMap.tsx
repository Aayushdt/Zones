import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, Polygon } from 'geojson'
import { Radio } from 'lucide-react'
import { HIDE_AND_SEEK_CONFIG, interpolateMapCoordinate } from '@xzones/game-core'
import { resolveTheme, useAppStore } from '../stores/app-store'
import { createTacticalFallbackStyle } from '../utils/map-tactical-style'
import 'maplibre-gl/dist/maplibre-gl.css'
import './GameMap.css'

export interface MapPlayerPoint {
  player_id: string
  display_name: string
  lat: number
  lon: number
  accuracy_m: number
  captured_at: string
  age_seconds?: number
  is_stale?: boolean
}

export type GameMapData =
  | { role: 'RUNNER'; own_position: MapPlayerPoint | null; own_team_positions: MapPlayerPoint[] }
  | { role: 'HUNTER'; own_position: MapPlayerPoint | null; own_team_positions: MapPlayerPoint[]; runner_snapshots: Array<{
      runner_id: string; status: 'OK' | 'NO_FIX' | 'STALE'; lat?: number; lon?: number; age_seconds: number; ping_index: number
    }> }

export interface GameZone { lat: number; lon: number; radius_m: number; next_radius_m?: number }

function syncZoneLayer(map: import('maplibre-gl').Map, zone: GameZone | undefined) {
  const source = map.getSource('xzones-boundary') as import('maplibre-gl').GeoJSONSource | undefined
  if (!zone) {
    if (map.getLayer('xzones-boundary-ring')) map.removeLayer('xzones-boundary-ring')
    if (map.getLayer('xzones-boundary-fill')) map.removeLayer('xzones-boundary-fill')
    if (source) map.removeSource('xzones-boundary')
    for (const id of ['xzones-next-boundary-line', 'xzones-next-boundary-fill']) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource('xzones-next-boundary')) map.removeSource('xzones-next-boundary')
    return
  }
  if (source) source.setData(circleGeoJson(zone))
  else {
    map.addSource('xzones-boundary', { type: 'geojson', data: circleGeoJson(zone) })
    map.addLayer({ id: 'xzones-boundary-fill', type: 'fill', source: 'xzones-boundary', paint: { 'fill-color': '#38BDF8', 'fill-opacity': 0.12 } })
    map.addLayer({ id: 'xzones-boundary-ring', type: 'line', source: 'xzones-boundary', paint: { 'line-color': '#38BDF8', 'line-width': 2.5, 'line-opacity': 0.95 } })
  }
  const nextSource = map.getSource('xzones-next-boundary') as import('maplibre-gl').GeoJSONSource | undefined
  if (zone.next_radius_m !== undefined) {
    const nextZone = { ...zone, radius_m: zone.next_radius_m }
    if (nextSource) nextSource.setData(circleGeoJson(nextZone))
    else {
      map.addSource('xzones-next-boundary', { type: 'geojson', data: circleGeoJson(nextZone) })
      map.addLayer({ id: 'xzones-next-boundary-fill', type: 'fill', source: 'xzones-next-boundary', paint: { 'fill-color': '#FFB020', 'fill-opacity': 0.04 } })
      map.addLayer({ id: 'xzones-next-boundary-line', type: 'line', source: 'xzones-next-boundary', paint: { 'line-color': '#FFB020', 'line-width': 2, 'line-dasharray': [2, 2] } })
    }
  } else {
    if (map.getLayer('xzones-next-boundary-line')) map.removeLayer('xzones-next-boundary-line')
    if (map.getLayer('xzones-next-boundary-fill')) map.removeLayer('xzones-next-boundary-fill')
    if (nextSource) map.removeSource('xzones-next-boundary')
  }
}

function pointElement(kind: 'you' | 'teammate' | 'snapshot', label: string, accuracyPixels?: number): HTMLElement {
  const element = document.createElement('div')
  element.className = `game-marker game-marker--${kind}`
  element.setAttribute('role', 'img')
  element.setAttribute('aria-label', label)
  element.textContent = kind === 'snapshot' ? '⌖' : kind === 'you' ? '●' : '✦'
  if (accuracyPixels !== undefined) element.style.setProperty('--accuracy-px', `${accuracyPixels}px`)
  return element
}

function circleGeoJson(zone: GameZone): Feature<Polygon> {
  const coordinates: [number, number][] = []
  for (let index = 0; index <= 64; index += 1) {
    const angle = (index / 64) * 2 * Math.PI
    const north = Math.cos(angle) * zone.radius_m
    const east = Math.sin(angle) * zone.radius_m
    const lat = zone.lat + north / 111_320
    const lon = zone.lon + east / (111_320 * Math.cos(zone.lat * Math.PI / 180))
    coordinates.push([lon, lat])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } }
}

export function GameMap({ data, zone, simulation = false }: { data: GameMapData; zone?: GameZone; simulation?: boolean }) {
  const themePreference = useAppStore((state) => state.theme)
  const mapStyle = useAppStore((state) => state.mapStyle)
  const styleOverride = import.meta.env.VITE_MAP_STYLE_URL?.trim()
  const resolvedMapStyle = mapStyle === 'auto' ? resolveTheme(themePreference) : mapStyle
  const styleUrl = styleOverride || `https://tiles.openfreemap.org/styles/${resolvedMapStyle === 'dusk' ? 'dark' : 'bright'}`
  const ownMarkerSmoothingMs: number = HIDE_AND_SEEK_CONFIG.map.ownMarkerSmoothingMs.default
  const styleUrlRef = useRef(styleUrl)
  const zoneLat = zone?.lat
  const zoneLon = zone?.lon
  const zoneRadius = zone?.radius_m
  const nextZoneRadius = zone?.next_radius_m
  const initial = data.own_position ?? data.own_team_positions[0]
  const [localPosition, setLocalPosition] = useState<MapPlayerPoint | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(initial ? [initial.lon, initial.lat] : null)
  const [mapError, setMapError] = useState('')
  const [mapLoaded, setMapLoaded] = useState(false)
  const isInitiallyOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
  const [isTacticalOffline, setIsTacticalOffline] = useState(!isInitiallyOnline)
  const fallbackTriggeredRef = useRef(!isInitiallyOnline)
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const markersRef = useRef(new Map<string, import('maplibre-gl').Marker>())
  const markerFramesRef = useRef(new Map<string, number>())
  const zoneRef = useRef(zone)

  useEffect(() => {
    const fix = data.own_position ?? data.own_team_positions[0]
    if (fix) setCenter((current) => current ?? [fix.lon, fix.lat])
  }, [data.own_position?.lat, data.own_position?.lon, data.own_team_positions])

  const markerPoints = useMemo(() => {
    const own = data.own_position ?? localPosition
    const teammates = data.own_team_positions.filter((point) => point.player_id !== own?.player_id)
    const snapshots = data.role === 'HUNTER' ? data.runner_snapshots.filter((point) => point.status === 'OK'
      && typeof point.lat === 'number' && typeof point.lon === 'number') : []
    return { own, teammates, snapshots }
  }, [data, localPosition])

  useEffect(() => {
    if (!mapContainer.current || !center) return
    let disposed = false
    let map: import('maplibre-gl').Map | null = null
    const markers = markersRef.current

    const switchToFallback = () => {
      if (disposed || fallbackTriggeredRef.current) return
      fallbackTriggeredRef.current = true
      setIsTacticalOffline(true)
      try {
        map?.setStyle(createTacticalFallbackStyle(resolvedMapStyle))
      } catch {
        // MapLibre already disposing
      }
    }

    void (async () => {
      try {
        const maplibre = await import('maplibre-gl')
        const workerUrl = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')).default
        if (disposed || !mapContainer.current) return
        maplibre.setWorkerUrl(workerUrl)

        const initialStyle = fallbackTriggeredRef.current
          ? createTacticalFallbackStyle(resolvedMapStyle)
          : styleUrlRef.current

        map = new maplibre.Map({
          container: mapContainer.current,
          style: initialStyle,
          center,
          zoom: 15,
          attributionControl: { compact: true },
          cooperativeGestures: true,
        })

        map.on('load', () => {
          if (!disposed) {
            setMapLoaded(true)
            if (map) syncZoneLayer(map, zoneRef.current)
          }
        })

        map.on('style.load', () => {
          if (map && !disposed) syncZoneLayer(map, zoneRef.current)
        })

        map.on('error', (e) => {
          if (disposed) return
          // If style or initial fetch failed, switch gracefully to tactical fallback without infinite error loops
          if (!mapLoaded || !navigator.onLine || e.error?.message?.includes('style') || e.error?.message?.includes('fetch')) {
            switchToFallback()
          } else {
            setMapError('Map tiles could not load. Check the connection or map style URL.')
          }
        })

        mapRef.current = map
      } catch {
        setMapError('The interactive map could not start in this browser.')
      }
    })()

    return () => {
      disposed = true
      for (const marker of markers.values()) marker.remove()
      markers.clear()
      map?.remove()
      mapRef.current = null
      setMapLoaded(false)
    }
  }, [center, resolvedMapStyle])

  // Listen to network changes for graceful online recovery / offline fallback
  useEffect(() => {
    const handleOnline = () => {
      fallbackTriggeredRef.current = false
      setIsTacticalOffline(false)
      setMapError('')
      if (mapRef.current) {
        try {
          mapRef.current.setStyle(styleUrlRef.current)
        } catch {
          // ignore
        }
      }
    }
    const handleOffline = () => {
      fallbackTriggeredRef.current = true
      setIsTacticalOffline(true)
      if (mapRef.current) {
        try {
          mapRef.current.setStyle(createTacticalFallbackStyle(resolvedMapStyle))
        } catch {
          // ignore
        }
      }
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [resolvedMapStyle])

  useEffect(() => {
    const map = mapRef.current
    styleUrlRef.current = styleUrl
    if (map && !fallbackTriggeredRef.current) map.setStyle(styleUrl)
  }, [styleUrl])

  useEffect(() => {
    const map = mapRef.current
    const currentZone = zoneLat !== undefined && zoneLon !== undefined && zoneRadius !== undefined
      ? { lat: zoneLat, lon: zoneLon, radius_m: zoneRadius, ...(nextZoneRadius !== undefined ? { next_radius_m: nextZoneRadius } : {}) } : undefined
    zoneRef.current = currentZone
    if (map && mapLoaded) syncZoneLayer(map, currentZone)
  }, [mapLoaded, zoneLat, zoneLon, zoneRadius, nextZoneRadius])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    const markerFrames = markerFramesRef.current
    void import('maplibre-gl').then(({ Marker }) => {
      if (mapRef.current !== map) return
      const points = new Map<string, { kind: 'you' | 'teammate' | 'snapshot'; label: string; coordinates: [number, number]; opacity?: number; accuracyPixels?: number }>()
      if (markerPoints.own) {
        const metersPerPixel = 40_075_016.686 * Math.cos(markerPoints.own.lat * Math.PI / 180)
          / (512 * 2 ** map.getZoom())
        const accuracyPixels = Math.max(6, Math.min(96, markerPoints.own.accuracy_m / Math.max(0.01, metersPerPixel)))
        points.set('you', { kind: 'you', label: `You, accuracy ±${Math.round(markerPoints.own.accuracy_m)} metres`, coordinates: [markerPoints.own.lon, markerPoints.own.lat], accuracyPixels })
      }
      for (const point of markerPoints.teammates) {
        points.set(`team:${point.player_id}`, { kind: 'teammate', label: `Teammate ${point.display_name}, ${point.is_stale ? 'stale' : `${point.age_seconds ?? 0} seconds old`}`, coordinates: [point.lon, point.lat], opacity: point.is_stale ? 0.4 : 1 })
      }
      for (const snapshot of markerPoints.snapshots) {
        if (typeof snapshot.lat !== 'number' || typeof snapshot.lon !== 'number') continue
        points.set(`snapshot:${snapshot.runner_id}`, { kind: 'snapshot', label: `Runner ping snapshot, ${snapshot.age_seconds} seconds old`, coordinates: [snapshot.lon, snapshot.lat], opacity: Math.max(0.3, 1 - snapshot.age_seconds / 1800) })
      }
      for (const [key, marker] of markersRef.current) {
        if (!points.has(key)) {
          const frame = markerFrames.get(key)
          if (frame !== undefined) cancelAnimationFrame(frame)
          markerFrames.delete(key)
          marker.remove()
          markersRef.current.delete(key)
        }
      }
      for (const [key, point] of points) {
        let marker = markersRef.current.get(key)
        const isNewMarker = !marker
        if (!marker) {
          marker = new Marker({ element: pointElement(point.kind, point.label, point.accuracyPixels), anchor: 'center' })
            .setLngLat(point.coordinates)
            .addTo(map)
          markersRef.current.set(key, marker)
        }
        const previousFrame = markerFrames.get(key)
        if (previousFrame !== undefined) cancelAnimationFrame(previousFrame)
        markerFrames.delete(key)
        if (isNewMarker || point.kind !== 'you' || ownMarkerSmoothingMs === 0) {
          marker.setLngLat(point.coordinates)
        } else {
          const startCoordinate = marker.getLngLat()
          const from: [number, number] = [startCoordinate.lng, startCoordinate.lat]
          const startedAt = performance.now()
          const animate = (now: number) => {
            const progress = (now - startedAt) / ownMarkerSmoothingMs
            marker.setLngLat(interpolateMapCoordinate(from, point.coordinates, progress))
            if (progress < 1) markerFrames.set(key, requestAnimationFrame(animate))
            else markerFrames.delete(key)
          }
          markerFrames.set(key, requestAnimationFrame(animate))
        }
        const element = marker.getElement()
        element.className = `game-marker game-marker--${point.kind}`
        element.setAttribute('aria-label', point.label)
        element.textContent = point.kind === 'snapshot' ? '⌖' : point.kind === 'you' ? '●' : '✦'
        element.style.opacity = point.opacity === undefined || point.opacity === 1 ? '' : String(point.opacity)
        if (point.accuracyPixels === undefined) element.style.removeProperty('--accuracy-px')
        else element.style.setProperty('--accuracy-px', `${point.accuracyPixels}px`)
      }
    })
    return () => {
      for (const frame of markerFrames.values()) cancelAnimationFrame(frame)
      markerFrames.clear()
    }
  }, [mapLoaded, markerPoints, ownMarkerSmoothingMs])

  function locate() {
    if (!navigator.geolocation) { setMapError('Location is unavailable in this browser.'); return }
    setMapError('Waiting for location permission…')
    navigator.geolocation.getCurrentPosition((position) => {
      const point: MapPlayerPoint = {
        player_id: 'local-you', display_name: 'You', lat: position.coords.latitude,
        lon: position.coords.longitude, accuracy_m: position.coords.accuracy,
        captured_at: new Date(position.timestamp).toISOString(),
      }
      setLocalPosition(point)
      setCenter((current) => current ?? [point.lon, point.lat])
      mapRef.current?.easeTo({ center: [point.lon, point.lat], zoom: 16 })
      setMapError('Centered on your latest fix. Team sharing status appears below the map.')
    }, (error) => {
      setMapError(error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. Enable it in browser settings, or continue without a centered map.'
        : 'Could not get a location fix. Try again outdoors with location enabled.')
    }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 })
  }

  function zoom(delta: number) { mapRef.current?.setZoom(Math.max(2, Math.min(20, (mapRef.current.getZoom() ?? 12) + delta))) }

  return (
    <section className="game-map-shell" aria-label="Game map">
      {simulation ? <div className="map-simulation-stamp">SIMULATION: NOT A REAL MATCH</div> : null}
      {center ? (
        <div
          ref={mapContainer}
          className={`game-map-canvas ${isTacticalOffline ? 'game-map-canvas--tactical' : ''}`}
          aria-label={`${data.role === 'RUNNER' ? 'Runner' : 'Hunter'} game map`}
        />
      ) : (
        <div className="map-empty"><p>Center the map on your current location to load nearby streets.</p><button className="map-control" onClick={locate} type="button">Center on me</button></div>
      )}
      {center && isTacticalOffline ? (
        <div className="map-tactical-badge font-mono" role="status" aria-live="polite">
          <Radio size={12} className="text-amber" /> OFFLINE TACTICAL GRID
        </div>
      ) : null}
      {center ? <div className="map-controls" aria-label="Map controls">
        <button className="map-control" aria-label="Zoom in" onClick={() => zoom(1)} type="button">+</button>
        <button className="map-control" aria-label="Zoom out" onClick={() => zoom(-1)} type="button">−</button>
        <button className="map-control" aria-label="Center on me" onClick={locate} type="button">⌖</button>
      </div> : null}
      <div className="map-key" aria-label="Map legend">
        <span><i className="legend-dot legend-dot--you" />You</span>
        <span><i className="legend-dot legend-dot--team" />Teammate</span>
        {data.role === 'HUNTER' ? <span><i className="legend-dot legend-dot--ping" />Scheduled Runner snapshot</span> : null}
        {zone ? <span><i className="legend-ring" />Game boundary</span> : null}
      </div>
      <p className="map-status" role="status">
        {mapError && !isTacticalOffline
          ? mapError
          : center
          ? (isTacticalOffline
            ? 'Offline tactical grid active. Zones and GPS tracking fully functional.'
            : 'Map ready. No opponent distances or directions are displayed.')
          : 'Location is requested only when you choose Center on me.'}
      </p>
    </section>
  )
}
