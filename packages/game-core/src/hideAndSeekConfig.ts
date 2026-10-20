export interface NumericSetting {
  readonly default: number
  readonly min: number
  readonly max: number
}

export const HIDE_AND_SEEK_MODE = 'HIDE_AND_SEEK' as const

export const HIDE_AND_SEEK_CONFIG = {
  roundTimerOffAllowed: true,
  players: {
    min: { default: 2, min: 2, max: 2 },
    max: { default: 100, min: 2, max: 100 },
    hunterCountDivisor: { default: 10, min: 1, max: 100 },
  },
  match: {
    roundSeconds: { default: 2700, min: 600, max: 10_800 },
    headStartSeconds: { default: 180, min: 0, max: 900 },
    minimumActiveSeconds: { default: 300, min: 300, max: 300 },
    pingSeconds: { default: 300, min: 60, max: 1800 },
  },
  cleanup: {
    throttleSeconds: { default: 60, min: 60, max: 60 },
  },
  sync: {
    fallbackPollMinMs: { default: 30_000, min: 30_000, max: 45_000 },
    fallbackPollMaxMs: { default: 45_000, min: 30_000, max: 45_000 },
  },
  location: {
    maxSpeedMps: { default: 15, min: 1, max: 100 },
    maxDistanceFromZoneM: { default: 10_000, min: 100, max: 10_000 },
    maxFutureFixSeconds: { default: 30, min: 0, max: 300 },
    maxFixAgeSeconds: { default: 60, min: 1, max: 300 },
    uploadMinIntervalSeconds: { default: 2, min: 1, max: 60 },
  },
  tag: {
    rangeM: { default: 20, min: 1, max: 100 },
    accuracyAllowanceM: { default: 25, min: 0, max: 100 },
    runnerDriftMps: { default: 3, min: 0, max: 15 },
    runnerFixAgeCapSeconds: { default: 30, min: 0, max: 60 },
    hunterFixMaxAgeSeconds: { default: 5, min: 1, max: 30 }, // UNSPECIFIED-IN-REFERENCE
    hunterFixMaxAccuracyM: { default: 50, min: 1, max: 100 }, // UNSPECIFIED-IN-REFERENCE
    qrFreshFixMaxAgeSeconds: { default: 30, min: 1, max: 60 }, // UNSPECIFIED-IN-REFERENCE
    attemptCooldownSeconds: { default: 2, min: 1, max: 60 }, // UNSPECIFIED-IN-REFERENCE
    qrMaxDistanceM: { default: 100, min: 1, max: 500 },
  },
  zone: {
    startRadiusM: { default: 500, min: 200, max: 1500 },
    shrinkStages: { default: 0, min: 0, max: 10 },
    shrinkIntervalSeconds: { default: 300, min: 60, max: 3600 }, // UNSPECIFIED-IN-REFERENCE
    finalRadiusM: { default: 50, min: 50, max: 1500 },
    confirmedOutsideSamples: { default: 2, min: 2, max: 2 },
    exitWarningSeconds: { default: 30, min: 1, max: 300 },
    exitEliminateSeconds: { default: 120, min: 30, max: 600 },
  },
  hider: {
    minimumMovementM: { default: 15, min: 1, max: 100 },
    stationarySeconds: { default: 300, min: 60, max: 1800 },
    stationaryWarningFraction: { default: 0.8, min: 0.5, max: 0.95 },
  },
  host: {
    inactiveSeconds: { default: 180, min: 60, max: 900 },
  },
  stealth: {
    exitHoldMs: { default: 1500, min: 500, max: 5000 }, // UNSPECIFIED-IN-REFERENCE
  },
  chat: {
    maxCharacters: { default: 280, min: 1, max: 280 },
    minimumIntervalSeconds: { default: 2, min: 1, max: 60 }, // UNSPECIFIED-IN-REFERENCE
  },
  bugReport: {
    minimumIntervalSeconds: { default: 3600, min: 60, max: 86_400 }, // UNSPECIFIED-IN-REFERENCE
  },
  items: {
    enabledByDefault: false,
    usesPerItem: { default: 1, min: 1, max: 1 },
    hunterScanSeconds: { default: 30, min: 5, max: 120 }, // UNSPECIFIED-IN-REFERENCE
    hunterScanCooldownSeconds: { default: 0, min: 0, max: 0 },
    hunterAlarmRadiusM: { default: 100, min: 10, max: 500 }, // UNSPECIFIED-IN-REFERENCE
    hunterAlarmSeconds: { default: 300, min: 30, max: 1800 }, // UNSPECIFIED-IN-REFERENCE
    hunterAlarmCooldownSeconds: { default: 0, min: 0, max: 0 },
    hunterZoneMoveMaxM: { default: 200, min: 10, max: 1000 }, // UNSPECIFIED-IN-REFERENCE
    hunterZoneMoveCooldownSeconds: { default: 0, min: 0, max: 0 },
    hunterZoneMoveOverlapPercent: { default: 50, min: 50, max: 100 },
    runnerDecoyMaxOffsetM: { default: 50, min: 1, max: 500 }, // UNSPECIFIED-IN-REFERENCE
    runnerDecoyCooldownSeconds: { default: 0, min: 0, max: 0 },
    runnerShieldSeconds: { default: 120, min: 10, max: 600 }, // UNSPECIFIED-IN-REFERENCE
    runnerShieldCooldownSeconds: { default: 0, min: 0, max: 0 },
    runnerCamouflageSeconds: { default: 30, min: 5, max: 180 }, // UNSPECIFIED-IN-REFERENCE
    runnerCamouflageCooldownSeconds: { default: 0, min: 0, max: 0 },
  },
} as const satisfies Record<string, unknown>

export function isWithinSetting(setting: NumericSetting, value: number): boolean {
  return Number.isFinite(value) && value >= setting.min && value <= setting.max
}
