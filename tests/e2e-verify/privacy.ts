import type { TrafficRecord } from './player'

const hunterKeys = /hunter.*(lat|lon|lng|coord|position|heading|distance)|(?:lat|lon|lng|heading|distance).*hunter/i
const coordinateKeys = /^(lat|latitude|lon|lng|longitude|heading|bearing|distance_m|distance)$/i

/** Role privacy guard used on every recorded HTTP and websocket payload. */
export function assertRolePrivacy(role: 'HUNTER' | 'RUNNER', records: TrafficRecord[]): void {
  for (const record of records) {
    if (record.direction !== 'response' && record.direction !== 'ws-receive') continue
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
    url: redactUrl(record.url),
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
  if (typeof value === 'string') return '[TEXT REDACTED]'
  if (typeof value === 'number') return '[NUMBER REDACTED]'
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    result[key] = coordinateKeys.test(key) || /code|token|secret|authorization|id|name|location|position|message|fix/i.test(key)
      ? '[REDACTED]' : scrub(child)
  }
  return result
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|code|auth|secret/i.test(key)) url.searchParams.set(key, '[REDACTED]')
    }
    url.pathname = url.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '[ID]')
    return url.toString()
  } catch { return '[URL REDACTED]' }
}
