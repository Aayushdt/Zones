import type { StyleSpecification } from 'maplibre-gl'

/**
 * Creates a lightweight, zero-network MapLibre Style Specification.
 * Requires zero external fonts, sprites, or remote vector tiles.
 * Allows MapLibre's projection engine, boundary GeoJSON layers, and DOM markers
 * to function 100% offline with full panning and zooming.
 */
export function createTacticalFallbackStyle(theme: 'dusk' | 'paper'): StyleSpecification {
  const isDark = theme === 'dusk'
  return {
    version: 8,
    name: 'XZones Tactical Grid',
    sources: {},
    layers: [
      {
        id: 'tactical-bg',
        type: 'background',
        paint: {
          'background-color': isDark ? '#080808' : '#F0F4F1',
        },
      },
    ],
  }
}
