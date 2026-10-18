import { mergeLatestPings, projectEventForRole } from '@xzones/game-core'
import type { HunterMatchView, RoleSafeMatchView } from './game-api'

/** Bounded per-subscription event-ID and per-player sequence deduplication. */
export function createRealtimeEventGate(role: 'RUNNER' | 'HUNTER', maxEventIds = 512) {
  const eventIds = new Set<string>()
  const sequences = new Map<string, number>()
  return {
    accept(raw: unknown): boolean {
      const event = projectEventForRole(role, raw)
      if (!event || eventIds.has(event.event_id)) return false
      if (event.type === 'team.location_live') {
        const playerId = event.data.player_id
        const sequence = event.data.sequence
        if (typeof playerId === 'string' && typeof sequence === 'number') {
          const previous = sequences.get(playerId)
          if (previous !== undefined && sequence <= previous) return false
          sequences.set(playerId, sequence)
        }
      }
      eventIds.add(event.event_id)
      if (eventIds.size > maxEventIds) eventIds.delete(eventIds.values().next().value as string)
      return true
    },
  }
}

/** Apply the server's already role-projected envelope to the same view used by sync. */
export function applyMatchRealtimeEvent(view: RoleSafeMatchView, raw: unknown): RoleSafeMatchView | null {
  const event = projectEventForRole(view.role, raw)
  if (!event) return null
  const data = event.data
  switch (event.type) {
    case 'match.state':
      if (data.state !== 'ACTIVE' && data.state !== 'ENDED' && data.state !== 'CANCELLED') return null
      if (!data.active_counts || typeof data.active_counts !== 'object') return null
      return { ...view, state: data.state, revision: event.revision,
        active_counts: data.active_counts as RoleSafeMatchView['active_counts'] }
    case 'team.location_live': {
      const id = data.player_id
      if (typeof id !== 'string' || id === view.own_player_id || typeof data.lat !== 'number' || typeof data.lon !== 'number'
        || typeof data.accuracy_m !== 'number' || typeof data.captured_at !== 'string') return null
      const point = { player_id: id, display_name: typeof data.display_name === 'string' ? data.display_name : 'Teammate',
        lat: data.lat, lon: data.lon, accuracy_m: data.accuracy_m, captured_at: data.captured_at,
        age_seconds: typeof data.age_seconds === 'number' ? data.age_seconds : 0,
        is_stale: typeof data.is_stale === 'boolean' ? data.is_stale : false }
      return { ...view, own_team_positions: [...view.own_team_positions.filter((item) => item.player_id !== id), point] }
    }
    case 'hunter.runner_ping':
      if (view.role !== 'HUNTER') return null
      return { ...view, runner_snapshots: mergeLatestPings(view.runner_snapshots, [data as unknown as HunterMatchView['runner_snapshots'][number]]) }
    case 'runner.location_revealed':
      if (view.role !== 'RUNNER' || typeof data.ping_index !== 'number' || typeof data.ping_at !== 'string') return null
      return { ...view, runner_ping_notice: { ping_index: data.ping_index, ping_at: data.ping_at } }
    case 'tag.accepted':
      return data.runner_id === view.own_player_id && data.status === 'TAGGED' ? { ...view, own_status: 'TAGGED' } : null
    case 'match.ended':
      if (data.state !== 'ENDED' && data.state !== 'CANCELLED') return null
      return { ...view, state: data.state, revision: event.revision }
    default:
      return null
  }
}
