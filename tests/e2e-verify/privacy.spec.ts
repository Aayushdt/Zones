import { expect, test } from '@playwright/test'
import { assertRolePrivacy } from './privacy'
import { DbInspector } from './db-inspector'
import { LatencyRecorder, step } from './scenario'
import { shiftMatchTime } from './clock'
import type { TrafficRecord } from './player'

test('privacy capture canary rejects an injected Hunter location leak to a Runner', async () => {
  const leak: TrafficRecord[] = [{
    at: new Date(0).toISOString(), direction: 'ws-receive', url: 'wss://example.invalid',
    payload: { type: 'match.state', hunter_lat: 37.7, hunter_lon: -122.4 },
  }]
  expect(() => assertRolePrivacy('RUNNER', leak)).toThrow(/forbidden Hunter field/)
})

test('verification harness exports player, scenario, DB and clock tools', async () => {
  expect(typeof DbInspector).toBe('function')
  expect(typeof step).toBe('function')
  expect(typeof LatencyRecorder).toBe('function')
  expect(typeof shiftMatchTime).toBe('function')
})
