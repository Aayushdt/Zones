import type { TrafficRecord } from './player'

const hunterKeys = /hunter.*(lat|lon|lng|coord|position|heading|distance)|(?:lat|lon|lng|heading|distance).*hunter/i
const coordinateKeys = /^(lat|latitude|lon|lng|longitude|heading|bearing|distance_m|distance)$/i

/** Role privacy guard used on every recorded HTTP and websocket payload. */
export function assertRolePrivacy(role: 'HUNTER' | 'RUNNER', records: TrafficRecord[]): void {
  for (const record of records) {
    if (record.direction !== 'request' && record.direction !== 'ws-receive') continue
    for (const value of walk(record.payload)) {
      const key = value.key
      const event = value.event
      if (role === 'RUNNER' && hunterKeys.test(key)) throw new Error(`Runner received forbidden Hunter field: ${key}`)
      if (role === 'HUNTER' && event !== 'hunter.runner_ping' && coordinateKeys.test(key)) {
        throw new Error(`Hunter received a coordinate outside an authorized ping snapshot: ${key}`)
      }
    }
  }
}

/** Remove coordinate/code/token values before compact logs are written to git. */
export function redactTraffic(records: TrafficRecord[]): TrafficRecord[] {
  return records.map((record) => ({
    ...record,
    payload: scrub(record.payload),
  }))
}

function* walk(input: unknown, parentEvent = ''): Generator<{ key: string; event: string }> {
  if (Array.isArray(input)) { for (const item of input) yield* walk(item, parentEvent); return }
  if (!input || typeof input !== 'object') return
  const object = input as Record<string, unknown>
  const event = typeof object.type === 'string' ? object.type : typeof object.event === 'string' ? object.event : parentEvent
  for (const [key, value] of Object.entries(object)) {
    yield { key, event }
    yield* walk(value, event)
  }
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    result[key] = coordinateKeys.test(key) || /code|token|secret|authorization/i.test(key) ? '[REDACTED]' : scrub(child)
  }
  return result
}
