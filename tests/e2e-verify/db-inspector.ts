export type DbRow = Record<string, unknown>

/** Read-only PostgREST inspector. Requires a local/CI service-role key in env. */
export class DbInspector {
  private readonly root: string
  private readonly key: string
  constructor(env: NodeJS.ProcessEnv = process.env) {
    const root = env.SUPABASE_URL
    const key = env.SUPABASE_SERVICE_ROLE_KEY
    if (!root || !key) throw new Error('DB inspection blocked: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the local test environment.')
    this.root = `${root.replace(/\/$/, '')}/rest/v1`
    this.key = key
  }

  async rows(table: string, filters: Record<string, string> = {}): Promise<DbRow[]> {
    const url = new URL(`${this.root}/${encodeURIComponent(table)}`)
    url.searchParams.set('select', '*')
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value)
    const response = await fetch(url, { headers: { apikey: this.key, authorization: `Bearer ${this.key}` } })
    if (!response.ok) throw new Error(`DB inspection failed for ${table}: HTTP ${response.status}`)
    return await response.json() as DbRow[]
  }

  async match(matchId: string): Promise<Record<string, DbRow[]>> {
    const filter = { match_id: `eq.${matchId}` }
    const tables = ['matches', 'players', 'latest_fix', 'ping_snapshots', 'tags', 'qr_challenges', 'rate_limits']
    const result: Record<string, DbRow[]> = {}
    for (const table of tables) result[table] = await this.rows(table, table === 'matches' ? { id: `eq.${matchId}` } : filter)
    return result
  }

  async assertInvariants(matchId: string): Promise<void> {
    const data = await this.match(matchId)
    const match = data.matches[0]
    assert(match, 'match row exists')
    const players = data.players
    const active = players.filter((player) => player.status === 'ACTIVE')
    const expectedFixes = ['ACTIVE', 'HEAD_START'].includes(String(match.state)) ? active.length : 0
    assert(data.latest_fix.length === expectedFixes, 'latest_fix exists only once for each active sharing player')
    assert(new Set(data.latest_fix.map((row) => row.player_id)).size === data.latest_fix.length, 'no duplicate latest_fix rows')
    assert(!data.latest_fix.some((row) => !active.some((player) => player.id === row.player_id)), 'no fix for inactive player')
    const slots = data.ping_snapshots.map((row) => `${row.runner_id}:${row.ping_index}`)
    assert(new Set(slots).size === slots.length, 'no duplicate Runner ping slot')
    for (const tag of data.tags) {
      if (tag.method === 'QR') assert(data.qr_challenges.filter((challenge) => challenge.runner_id === tag.runner_id && challenge.used_at).length === 1, 'QR tag consumes exactly one challenge')
    }
    if (['ENDED', 'CANCELLED'].includes(String(match.state))) assert(data.latest_fix.length === 0, 'ended match has no latest_fix rows')
  }
}

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`DB invariant failed: ${message}`) }
