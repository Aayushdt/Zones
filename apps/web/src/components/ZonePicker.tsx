import { useEffect, useRef, useState } from 'react'
import type { Feature, Polygon } from 'geojson'
import { Navigation } from 'lucide-react'
import { Button } from './ui/Button'
import 'maplibre-gl/dist/maplibre-gl.css'

export function ZonePicker({
  center,
  radiusM,
  nextRadiusM,
  onCenterChange,
}: {
  center: { lat: number; lon: number } | null
  radiusM: number
  nextRadiusM?: number
  onCenterChange: (center: { lat: number; lon: number }) => void
}) {
  const container = useRef<HTMLDivElement | null>(null)
  const map = useRef<import('maplibre-gl').Map | null>(null)
  const marker = useRef<import('maplibre-gl').Marker | null>(null)
  const callback = useRef(onCenterChange)
  const [message, setMessage] = useState('Click or drag pin to position zone center.')
  const [mapLoaded, setMapLoaded] = useState(false)
  const centerLat = center?.lat
  const centerLon = center?.lon

  useEffect(() => {
    callback.current = onCenterChange
  }, [onCenterChange])

  useEffect(() => {
    if (!container.current) return
    let disposed = false
    let instance: import('maplibre-gl').Map | null = null

    void (async () => {
      try {
        const maplibre = await import('maplibre-gl')
        const workerUrl = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url')).default
        if (disposed || !container.current) return
        maplibre.setWorkerUrl(workerUrl)

        const initialCenter: [number, number] = centerLon !== undefined && centerLat !== undefined
          ? [centerLon, centerLat]
          : [0, 20]

        instance = new maplibre.Map({
          container: container.current,
          style: import.meta.env.VITE_MAP_STYLE_URL?.trim() || 'https://tiles.openfreemap.org/styles/dark',
          center: initialCenter,
          zoom: center ? 14 : 2,
          attributionControl: { compact: true },
        })

        map.current = instance
        instance.once('load', () => {
          if (!disposed) setMapLoaded(true)
        })

        marker.current = new maplibre.Marker({ color: '#38BDF8', draggable: true })
          .setLngLat(initialCenter)
          .addTo(instance)

        marker.current.on('dragend', () => {
          const point = marker.current?.getLngLat()
          if (point) callback.current({ lat: point.lat, lon: point.lng })
        })

        instance.on('click', (event) => {
          marker.current?.setLngLat(event.lngLat)
          callback.current({ lat: event.lngLat.lat, lon: event.lngLat.lng })
        })
      } catch {
        setMessage('Map tiles could not load. You can still enter coordinates.')
      }
    })()

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

  // Sync Current (Blue) & Next (Amber Dashed) Circles
  useEffect(() => {
    const currentMap = map.current
    if (!mapLoaded || !currentMap || centerLat === undefined || centerLon === undefined) return

    function makeCircle(radius: number): Feature<Polygon> {
      const coordinates: [number, number][] = []
      for (let index = 0; index <= 64; index += 1) {
        const angle = (index / 64) * 2 * Math.PI
        const latitude = centerLat! + (Math.cos(angle) * radius) / 111_320
        const longitude = centerLon! + (Math.sin(angle) * radius) / (111_320 * Math.cos((centerLat! * Math.PI) / 180))
        coordinates.push([longitude, latitude])
      }
      return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coordinates] } }
    }

    // Active zone circle (Blue #38BDF8)
    const activeData = makeCircle(radiusM)
    const source = currentMap.getSource('zone-picker-circle') as import('maplibre-gl').GeoJSONSource | undefined
    if (source) {
      source.setData(activeData)
    } else {
      currentMap.addSource('zone-picker-circle', { type: 'geojson', data: activeData })
      currentMap.addLayer({
        id: 'zone-picker-fill',
        type: 'fill',
        source: 'zone-picker-circle',
        paint: { 'fill-color': '#38BDF8', 'fill-opacity': 0.14 },
      })
      currentMap.addLayer({
        id: 'zone-picker-outline',
        type: 'line',
        source: 'zone-picker-circle',
        paint: { 'line-color': '#38BDF8', 'line-width': 2.5 },
      })
    }

    // Next zone shrink preview circle (Amber #FFB020 dashed)
    if (nextRadiusM && nextRadiusM < radiusM) {
      const nextData = makeCircle(nextRadiusM)
      const nextSource = currentMap.getSource('zone-picker-next-circle') as import('maplibre-gl').GeoJSONSource | undefined
      if (nextSource) {
        nextSource.setData(nextData)
      } else {
        currentMap.addSource('zone-picker-next-circle', { type: 'geojson', data: nextData })
        currentMap.addLayer({
          id: 'zone-picker-next-fill',
          type: 'fill',
          source: 'zone-picker-next-circle',
          paint: { 'fill-color': '#FFB020', 'fill-opacity': 0.08 },
        })
        currentMap.addLayer({
          id: 'zone-picker-next-outline',
          type: 'line',
          source: 'zone-picker-next-circle',
          paint: { 'line-color': '#FFB020', 'line-width': 2, 'line-dasharray': [2, 2] },
        })
      }
    } else {
      if (currentMap.getLayer('zone-picker-next-outline')) currentMap.removeLayer('zone-picker-next-outline')
      if (currentMap.getLayer('zone-picker-next-fill')) currentMap.removeLayer('zone-picker-next-fill')
      if (currentMap.getSource('zone-picker-next-circle')) currentMap.removeSource('zone-picker-next-circle')
    }
  }, [centerLat, centerLon, mapLoaded, radiusM, nextRadiusM])

  function useLocation() {
    if (!navigator.geolocation) {
      setMessage('Location is unavailable in this browser.')
      return
    }
    setMessage('Acquiring high-accuracy GPS fix…')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lon: position.coords.longitude }
        callback.current(point)
        marker.current?.setLngLat([point.lon, point.lat])
        map.current?.easeTo({ center: [point.lon, point.lat], zoom: 15 })
        setMessage(`Center set: ${point.lat.toFixed(5)}, ${point.lon.toFixed(5)} (±${Math.round(position.coords.accuracy)}m)`)
      },
      (err) => {
        setMessage(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission denied. Click on the map to set center.'
            : 'Could not acquire GPS fix outdoors.',
        )
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 10_000 },
    )
  }

  return (
    <div className="zone-picker" aria-label="Choose circular zone">
      <div className="zone-picker__map" ref={container} />
      <div className="zone-picker__footer">
        <p className="zone-picker__message font-mono text-xs">{message}</p>
        <Button
          size="sm"
          variant="secondary-outline"
          icon={<Navigation size={14} />}
          onClick={useLocation}
          title="Center zone at my location"
        >
          Use my location
        </Button>
      </div>
    </div>
  )
}
