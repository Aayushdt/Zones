const STORAGE_KEY = 'xzones.host-presets'

export interface HostPreset {
  id: string
  name: string
  timerEnabled: boolean
  durationMinutes: 30 | 45 | 60
  pingMinutes: 3 | 5 | 10 | 15 | null
  headStartSeconds: number
  fixedZone: boolean
  diameter: number
  shrinkStages: number
  shrinkIntervalMinutes: number
  finalRadius: number
  latitude: string
  longitude: string
}

function isHostPreset(value: unknown): value is HostPreset {
  if (value === null || typeof value !== 'object') return false
  const preset = value as Partial<HostPreset>
  return typeof preset.id === 'string' && typeof preset.name === 'string'
    && preset.name.trim().length > 0 && preset.name.length <= 32
    && typeof preset.timerEnabled === 'boolean'
    && [30, 45, 60].includes(preset.durationMinutes as number)
    && (preset.pingMinutes === null || [3, 5, 10, 15].includes(preset.pingMinutes as number))
    && Number.isInteger(preset.headStartSeconds) && (preset.headStartSeconds ?? -1) >= 0 && (preset.headStartSeconds ?? 901) <= 900
    && typeof preset.fixedZone === 'boolean'
    && Number.isInteger(preset.diameter) && (preset.diameter ?? 0) >= 400 && (preset.diameter ?? 3001) <= 3000
    && Number.isInteger(preset.shrinkStages) && (preset.shrinkStages ?? -1) >= 0 && (preset.shrinkStages ?? 11) <= 10
    && Number.isInteger(preset.shrinkIntervalMinutes) && (preset.shrinkIntervalMinutes ?? 0) >= 1 && (preset.shrinkIntervalMinutes ?? 61) <= 60
    && Number.isInteger(preset.finalRadius) && (preset.finalRadius ?? 0) >= 50 && (preset.finalRadius ?? 1501) <= 1500
    && typeof preset.latitude === 'string' && typeof preset.longitude === 'string'
}

export function readHostPresets(): HostPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const stored: unknown = JSON.parse(raw)
    return Array.isArray(stored) ? stored.filter(isHostPreset) : []
  } catch {
    return []
  }
}

export function writeHostPresets(presets: HostPreset[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    return true
  } catch {
    return false
  }
}
