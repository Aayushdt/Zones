/**
 * Review-only invariant probe. A caller supplies a privileged, read-only SQL
 * query adapter connected to a test database; this module never mutates data.
 * It is not a substitute for running it against the real Supabase schema.
 */
export interface ReadOnlySql {
  query<T extends Record<string, unknown>>(sql: string, params: readonly unknown[]): Promise<T[]>
}

export interface InvariantOptions {
  now: Date
  previousState?: string
  clientCounts?: Array<{ hunters: number; runners: number }>
  /** Indices committed by each processed lazy-sync; missed slots are coalesced. */
  processedPingIndices?: number[]
}

const rank: Record<string, number> = { LOBBY: 0, HEAD_START: 1, ACTIVE: 2, ENDED: 3, CANCELLED: 3 }
function invariant(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`Invariant failed: ${message}`)
}

export async function assertInvariants(db: ReadOnlySql, matchId: string, options: InvariantOptions): Promise<void> {
  const matches = await db.query<{
    id: string; state: string; round_seconds: number; head_start_seconds: number; ping_seconds: number | null
    started_at: string | null; head_start_ends_at: string | null; ends_at: string | null
    last_ping_index: number; expires_at: string
  }>('select id,state,round_seconds,head_start_seconds,ping_seconds,started_at,head_start_ends_at,ends_at,last_ping_index,expires_at from public.matches where id=$1', [matchId])
  invariant(matches.length === 1, 'match row exists exactly once')
  const match = matches[0]
  const players = await db.query<{ id: string; role: string | null; status: string }>(
    'select id,role,status from public.players where match_id=$1', [matchId])
  const fixes = await db.query<{ player_id: string }>(
    'select player_id from public.latest_fix where match_id=$1', [matchId])
  const snapshots = await db.query<{ runner_id: string; ping_index: number; ping_at: string; captured_at: string }>(
    'select runner_id,ping_index,ping_at,captured_at from public.ping_snapshots where match_id=$1', [matchId])
  const tags = await db.query<{ runner_id: string; method: string; accepted_at: string }>(
    'select runner_id,method,accepted_at from public.tags where match_id=$1', [matchId])
  const challenges = await db.query<{ id: string; runner_id: string; used_at: string | null }>(
    'select id,runner_id,used_at from public.qr_challenges where match_id=$1', [matchId])

  const shouldHaveFixes = match.state === 'ACTIVE' || match.state === 'HEAD_START'
  const eligible = new Set(players.filter(p => p.status === 'ACTIVE').map(p => p.id))
  const fixIds = fixes.map(f => f.player_id)
  invariant(new Set(fixIds).size === fixIds.length, 'at most one latest_fix row per player')
  if (shouldHaveFixes) {
    invariant(fixIds.length === eligible.size && fixIds.every(id => eligible.has(id)), 'one latest_fix per active participant')
  } else invariant(fixes.length === 0, 'no latest_fix outside an active match')
  if (['ENDED', 'CANCELLED'].includes(match.state)) invariant(fixes.length === 0, 'ended match has no live fixes')

  const hunterTotal = players.filter(p => p.role === 'HUNTER').length
  const runnerTotal = players.filter(p => p.role === 'RUNNER').length
  const hunterActive = players.filter(p => p.role === 'HUNTER' && p.status === 'ACTIVE').length
  const runnerActive = players.filter(p => p.role === 'RUNNER' && p.status === 'ACTIVE').length
  if (match.state !== 'LOBBY' && ['HEAD_START', 'ACTIVE', 'ENDED'].includes(match.state)) {
    invariant(hunterTotal > 0 && runnerTotal > 0 && hunterTotal === Math.min(Math.ceil(players.filter(p => p.status !== 'REMOVED').length / 10), Math.floor(players.filter(p => p.status !== 'REMOVED').length / 2)), 'started teams follow exact balance')
  }
  for (const counts of options.clientCounts ?? []) {
    invariant(counts.hunters === hunterActive && counts.runners === runnerActive, 'client-visible active counts match database counts')
  }

  if (options.previousState) {
    invariant(rank[match.state] !== undefined && rank[options.previousState] !== undefined, 'state names are known')
    invariant(rank[match.state] >= rank[options.previousState], `state does not move backward (${options.previousState} → ${match.state})`)
    if (rank[options.previousState] === 3) invariant(match.state === options.previousState, 'terminal state cannot change')
  }
  for (const snapshot of snapshots) {
    invariant(new Date(snapshot.ping_at).getTime() >= new Date(match.head_start_ends_at ?? match.started_at ?? 0).getTime(), 'snapshot is not before head start ends')
    if (match.ends_at) invariant(new Date(snapshot.ping_at).getTime() < new Date(match.ends_at).getTime(), 'snapshot is before deadline')
  }
  const duplicateSlots = snapshots.map(s => `${s.runner_id}:${s.ping_index}`)
  invariant(new Set(duplicateSlots).size === duplicateSlots.length, 'no duplicate runner/slot snapshots')
  if (match.ping_seconds !== null && match.head_start_ends_at) {
    for (const snapshot of snapshots) {
      const offset = new Date(snapshot.ping_at).getTime() - new Date(match.head_start_ends_at).getTime()
      invariant(offset >= 0 && offset % (match.ping_seconds * 1000) === 0, 'snapshot matches deterministic ping slot')
      invariant(snapshot.ping_index <= match.last_ping_index, 'snapshot index was committed by match cursor')
    }
    // Section 22 coalesces missed syncs. Validate unique delivered indices and
    // never demand one row for every elapsed slot after a long offline gap.
    if (options.processedPingIndices) {
      invariant(new Set(options.processedPingIndices).size === options.processedPingIndices.length, 'one processed row per committed sync index')
    }
  }
  if (match.ends_at) {
    for (const tag of tags) invariant(new Date(tag.accepted_at).getTime() < new Date(match.ends_at).getTime(), 'tag timestamp is before match deadline')
  }
  for (const tag of tags.filter(t => t.method === 'QR')) {
    invariant(challenges.filter(c => c.runner_id === tag.runner_id && c.used_at !== null).length === 1,
      `QR tag for Runner ${tag.runner_id} has exactly one consumed challenge`)
  }
  invariant(!players.some(p => p.status !== 'ACTIVE' && fixIds.includes(p.id)), 'tagged/left/removed players have no latest_fix')
  invariant(new Date(match.expires_at).getTime() >= options.now.getTime() || ['ENDED', 'CANCELLED'].includes(match.state), 'expired match metadata is cleaned or terminal')

  const locationColumns = await db.query<{ table_name: string; column_name: string }>(
    `select table_name,column_name from information_schema.columns
       where table_schema='public' and column_name in ('lat','lon','latitude','longitude','coordinates')`, [])
  const allowedLocationTables = new Set(['latest_fix', 'ping_snapshots'])
  for (const column of locationColumns) {
    // Zone center is match configuration (zone_lat/zone_lon) and intentionally
    // excluded from this exact-name query; raw player fixes belong only here.
    invariant(allowedLocationTables.has(column.table_name), `location column ${column.table_name}.${column.column_name} is not permitted`)
  }

  const oldMetadata = await db.query<{ count: number }>(
    `select count(*)::int as count from public.matches m
      left join public.match_results r on r.match_id=m.id
      where m.id=$1 and coalesce(r.cleanup_after, m.expires_at) < $2`, [matchId, options.now.toISOString()])
  invariant(Number(oldMetadata[0]?.count ?? 0) === 0, 'metadata row older than its cleanup deadline is absent')
}
