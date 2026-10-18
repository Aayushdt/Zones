import { describe, expect, it } from 'vitest'
import { mergeLatestPings } from './pings.ts'

describe('lazy ping list idempotency', () => {
  it('collapses repeated and skipped sync deliveries to one latest snapshot per Runner', () => {
    const first = [{ runner_id: 'a', ping_index: 0 }, { runner_id: 'b', ping_index: 0 }]
    const next = [{ runner_id: 'a', ping_index: 1 }, { runner_id: 'a', ping_index: 2 }, { runner_id: 'b', ping_index: 0 }]
    const merged = mergeLatestPings(first, next)
    expect(merged).toEqual([{ runner_id: 'a', ping_index: 2 }, { runner_id: 'b', ping_index: 0 }])
    expect(mergeLatestPings(merged, next)).toEqual(merged)
  })
})
