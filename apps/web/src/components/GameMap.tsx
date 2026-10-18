import { useEffect, useMemo, useRef, useState } from 'react'
import type { Feature, Polygon } from 'geojson'
import { useAppStore } from '../stores/app-store'
import 'maplibre-gl/dist/maplibre-gl.css'
import './GameMap.css'

export interface MapPlayerPoint {
  player_id: string
  display_name: string
  lat: number
  lon: number
  accuracy_m: number
  captured_at: string
}

export type GameMapData =
  | { role: 'RUNNER'; own_position: MapPlayerPoint | null; own_team_positions: MapPlayerPoint[] }
  | { role: 'HUNTER'; own_position: MapPlayerPoint | null; own_team_positions: MapPlayerPoint[]; runner_snapshots: Array<{
      runner_id: string; status: 'OK' | 'NO_FIX' | 'STALE'; lat?: number; lon?: number; age_seconds: number; ping_index: number
    }> }

export interface GameZone { lat: number; lon: number; radius_m: number }

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
  const theme = useAppStore((state) => state.theme)
  const styleOverride = import.meta.env.VITE_MAP_STYLE_URL?.trim()
  const styleUrl = styleOverride || `https://tiles.openfreemap.org/styles/${theme === 'dusk' ? 'dark' : 'bright'}`
  const zoneLat = zone?.lat
  const zoneLon = zone?.lon
  const zoneRadius = zone?.radius_m
  const initial = data.own_position ?? data.own_team_positions[0]
  const [localPosition, setLocalPosition] = useState<MapPlayerPoint | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(initial ? [initial.lon, initial.lat] : null)
  const [mapError, setMapError] = useState('')
  const [mapLoaded, setMapLoaded] = useState(false)
  const mapContainer = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const markersRef = useRef<import('maplibre-gl').Marker[]>([])
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
    void (async () => {
      try {
        const maplibre = await import('maplibre-gl')
        const workerUrl = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')).default
        if (disposed || !mapContainer.current) return
        maplibre.setWorkerUrl(workerUrl)
        map = new maplibre.Map({
          container: mapContainer.current, style: styleUrl, center, zoom: 15,
          attributionControl: { compact: true }, cooperativeGestures: true,
        })
        map.on('load', () => {
          setMapLoaded(true)
          if (!map || zoneLat === undefined || zoneLon === undefined || zoneRadius === undefined) return
          map.addSource('xzones-boundary', { type: 'geojson', data: circleGeoJson({ lat: zoneLat, lon: zoneLon, radius_m: zoneRadius }) })
          map.addLayer({ id: 'xzones-boundary-fill', type: 'fill', source: 'xzones-boundary', paint: { 'fill-color': '#9a72ff', 'fill-opacity': 0.09 } })
          map.addLayer({ id: 'xzones-boundary-ring', type: 'line', source: 'xzones-boundary', paint: { 'line-color': '#a581ff', 'line-width': 2, 'line-opacity': 0.9, 'line-dasharray': [3, 2] } })
        })
        map.on('error', () => setMapError('Map tiles could not load. Check the connection or map style URL.'))
        mapRef.current = map
      } catch {
        setMapError('The interactive map could not start in this browser.')
      }
    })()
    return () => {
      disposed = true
      for (const marker of markersRef.current) marker.remove()
      markersRef.current = []
      map?.remove()
      mapRef.current = null
      setMapLoaded(false)
    }
  }, [center, styleUrl, zoneLat, zoneLon, zoneRadius])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    for (const marker of markersRef.current) marker.remove()
    markersRef.current = []
    void import('maplibre-gl').then(({ Marker }) => {
      if (mapRef.current !== map) return
      if (markerPoints.own) {
        const metersPerPixel = 40_075_016.686 * Math.cos(markerPoints.own.lat * Math.PI / 180)
          / (512 * 2 ** map.getZoom())
        const accuracyPixels = Math.max(6, Math.min(96, markerPoints.own.accuracy_m / Math.max(0.01, metersPerPixel)))
        const marker = new Marker({ element: pointElement('you', `You, accuracy ±${Math.round(markerPoints.own.accuracy_m)} metres`, accuracyPixels), anchor: 'center' })
          .setLngLat([markerPoints.own.lon, markerPoints.own.lat]).addTo(map)
        markersRef.current.push(marker)
      }
      for (const point of markerPoints.teammates) {
        const marker = new Marker({ element: pointElement('teammate', `Teammate ${point.display_name}`), anchor: 'center' })
          .setLngLat([point.lon, point.lat]).addTo(map)
        markersRef.current.push(marker)
      }
      for (const snapshot of markerPoints.snapshots) {
        if (typeof snapshot.lat !== 'number' || typeof snapshot.lon !== 'number') continue
        const marker = new Marker({ element: pointElement('snapshot', `Runner ping snapshot, ${snapshot.age_seconds} seconds old`), anchor: 'center' })
          .setLngLat([snapshot.lon, snapshot.lat]).addTo(map)
        marker.getElement().style.opacity = String(Math.max(0.3, 1 - snapshot.age_seconds / 1800))
        markersRef.current.push(marker)
      }
    })
  }, [mapLoaded, markerPoints])

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
      setMapError('Location is used only to center this map in this build.')
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
      {center ? <div ref={mapContainer} className="game-map-canvas" aria-label={`${data.role === 'RUNNER' ? 'Runner' : 'Hunter'} game map`} /> : (
        <div className="map-empty"><p>Center the map on your current location to load nearby streets.</p><button className="map-control" onClick={locate} type="button">Center on me</button></div>
      )}
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
      <p className="map-status" role="status">{mapError || (center ? 'Map ready. No opponent distances or directions are displayed.' : 'Location is requested only when you choose Center on me.')}</p>
    </section>
  )
}
