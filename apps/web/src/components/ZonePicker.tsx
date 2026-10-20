import { useEffect, useRef, useState } from 'react'
import type { Feature, Polygon } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'

export function ZonePicker({ center, radiusM, onCenterChange }: {
  center: { lat: number; lon: number } | null
  radiusM: number
  onCenterChange: (center: { lat: number; lon: number }) => void
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const map = useRef<import('maplibre-gl').Map | null>(null)
  const marker = useRef<import('maplibre-gl').Marker | null>(null)
  const callback = useRef(onCenterChange)
  const [message, setMessage] = useState('Click or drag the pin to choose the circle center.')
  const [mapLoaded, setMapLoaded] = useState(false)
  const centerLat = center?.lat
  const centerLon = center?.lon

  useEffect(() => { callback.current = onCenterChange }, [onCenterChange])

  useEffect(() => {
    if (!container.current) return
    let disposed = false
    let instance: import('maplibre-gl').Map | null = null
    void (async () => {
      const maplibre = await import('maplibre-gl')
      const workerUrl = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')).default
      if (disposed || !container.current) return
      maplibre.setWorkerUrl(workerUrl)
      instance = new maplibre.Map({
        container: container.current,
        style: import.meta.env.VITE_MAP_STYLE_URL?.trim() || 'https://tiles.openfreemap.org/styles/bright',
        center: [0, 20],
        zoom: 2,
        attributionControl: { compact: true },
      })
      map.current = instance
      instance.once('load', () => setMapLoaded(true))
      marker.current = new maplibre.Marker({ color: '#9a72ff', draggable: true })
        .setLngLat([0, 20]).addTo(instance)
      marker.current.on('dragend', () => {
        const point = marker.current?.getLngLat()
        if (point) callback.current({ lat: point.lat, lon: point.lng })
      })
      instance.on('click', (event) => {
        marker.current?.setLngLat(event.lngLat)
        callback.current({ lat: event.lngLat.lat, lon: event.lngLat.lng })
      })
    })().catch(() => setMessage('Map tiles could not load. You can still enter coordinates below.'))
    return () => {
      disposed = true
      marker.current?.remove()
      marker.current = null
      map.current?.remove()
      map.current = null
      instance = null
    }
  }, [])

  useEffect(() => {
    if (centerLat === undefined || centerLon === undefined) return
    marker.current?.setLngLat([centerLon, centerLat])
  }, [centerLat, centerLon])

  useEffect(() => {
    const currentMap = map.current
    if (!mapLoaded || !currentMap || centerLat === undefined || centerLon === undefined) return
    const coordinates: [number, number][] = []
    for (let index = 0; index <= 64; index += 1) {
      const angle = index / 64 * 2 * Math.PI
      const latitude = centerLat + Math.cos(angle) * radiusM / 111_320
      const longitude = centerLon + Math.sin(angle) * radiusM / (111_320 * Math.cos(centerLat * Math.PI / 180))
      coordinates.push([longitude, latitude])
    }
    const data: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } }
    const source = currentMap.getSource('zone-picker-circle') as import('maplibre-gl').GeoJSONSource | undefined
    if (source) source.setData(data)
    else {
      currentMap.addSource('zone-picker-circle', { type: 'geojson', data })
      currentMap.addLayer({ id: 'zone-picker-fill', type: 'fill', source: 'zone-picker-circle', paint: { 'fill-color': '#9a72ff', 'fill-opacity': .12 } })
      currentMap.addLayer({ id: 'zone-picker-outline', type: 'line', source: 'zone-picker-circle', paint: { 'line-color': '#9a72ff', 'line-width': 2 } })
    }
  }, [centerLat, centerLon, mapLoaded, radiusM])

  function useLocation() {
    if (!navigator.geolocation) { setMessage('Location is unavailable in this browser.'); return }
    setMessage('Waiting for location permission…')
    navigator.geolocation.getCurrentPosition((position) => {
      const point = { lat: position.coords.latitude, lon: position.coords.longitude }
      callback.current(point)
      marker.current?.setLngLat([point.lon, point.lat])
      map.current?.easeTo({ center: [point.lon, point.lat], zoom: 15 })
      setMessage('Center set to your current location.')
    }, (error) => setMessage(error.code === error.PERMISSION_DENIED
      ? 'Location permission denied. Select a center on the map or enter coordinates.'
      : 'Could not get a location fix. Try again outdoors.'), { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 })
  }

  return <div className="zone-picker" aria-label="Choose circular zone">
    <div className="zone-picker__map" ref={container} />
    <div className="zone-picker__details">
      <button className="welcome__secondary" onClick={useLocation} type="button">Use my location</button>
      <span>Circle radius: {radiusM} m</span>
      <span role="status">{message}</span>
    </div>
  </div>
}
