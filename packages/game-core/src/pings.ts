export interface PingCursor { runner_id: string; ping_index: number }

/** Keep one latest scheduled snapshot per Runner; equal/older retry payloads cannot duplicate it. */
export function mergeLatestPings<T extends PingCursor>(current: readonly T[], incoming: readonly T[]): T[] {
  const latest = new Map(current.map((ping) => [ping.runner_id, ping]))
  for (const ping of incoming) {
    const previous = latest.get(ping.runner_id)
    if (!previous || ping.ping_index > previous.ping_index) latest.set(ping.runner_id, ping)
  }
  return Array.from(latest.values()).sort((a, b) => a.runner_id.localeCompare(b.runner_id))
}
