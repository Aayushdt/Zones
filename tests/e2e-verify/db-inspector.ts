import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

export type DbRow = Record<string, unknown>
const execFileAsync = promisify(execFile)

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
    if (match.state !== 'LOBBY') {
      const eligible = players.filter((player) => player.status !== 'REMOVED').length
      const expectedHunters = Math.min(Math.ceil(eligible / 10), Math.floor(eligible / 2))
      assert(players.filter((player) => player.role === 'HUNTER').length === expectedHunters, 'Hunter team size follows the balance rule')
      assert(players.filter((player) => player.role === 'RUNNER').length === eligible - expectedHunters, 'Runner team size follows the balance rule')
    }
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

  /** Uses the local/CI Postgres connection because realtime.messages is not a public REST table. */
  async realtimeMessages(matchId: string): Promise<DbRow[]> {
    const dbUrl = process.env.SUPABASE_DB_URL
    if (!dbUrl) throw new Error('Realtime DB inspection blocked: set SUPABASE_DB_URL from supabase status -o env.')
    if (!/^[0-9a-f-]{36}$/i.test(matchId)) throw new Error('Expected a UUID match id.')
    const sql = `select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from realtime.messages m where topic like '%${matchId}%'`
    const { stdout } = await execFileAsync('psql', [dbUrl, '-XAtq', '-c', sql], { maxBuffer: 4 * 1024 * 1024 })
    return JSON.parse(stdout.trim() || '[]') as DbRow[]
  }

  async assertNoCoordinateMessages(matchId: string): Promise<void> {
    const rows = await this.realtimeMessages(matchId)
    const coordinateField = /"(?:lat|latitude|lon|lng|longitude|heading|coordinates|position)"\s*:/i
    assert(!rows.some((row) => coordinateField.test(JSON.stringify(row.payload ?? row))), 'realtime.messages contains no coordinate-bearing payload')
  }
}

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`DB invariant failed: ${message}`) }
