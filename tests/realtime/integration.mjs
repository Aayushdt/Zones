import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { RealtimeClient } from '../../apps/web/node_modules/@supabase/realtime-js/dist/module/index.js'

const base = process.env.SUPABASE_API_URL
const anonKey = process.env.SUPABASE_ANON_KEY
const dbUrl = process.env.SUPABASE_DB_URL
assert.ok(base && anonKey && dbUrl, 'Supabase integration env is incomplete')
const captures = []
const tokenRoles = new Map()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(path, token, body, method = 'POST') {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { apikey: anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let payload
  try { payload = JSON.parse(text) } catch { payload = text }
  captures.push({ path, status: response.status, payload, role: tokenRoles.get(token) ?? 'UNKNOWN' })
  assert.ok(response.ok, `${method} ${path} returned ${response.status}`)
  return payload
}

async function guest() {
  const response = await fetch(`${base}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' }, body: JSON.stringify({ data: {} }),
  })
  const data = await response.json()
  assert.ok(response.ok && data.access_token, 'anonymous auth signup failed')
  return data.access_token
}

async function startClient(token) {
  const client = new RealtimeClient(`${base}/realtime/v1`, {
    params: { apikey: anonKey }, accessToken: async () => token, logLevel: 'error',
  })
  const events = []
  const receivedAt = new Map()
  const channels = []
  await client.setAuth(token)
  return {
    events, channels, client, receivedAt,
    async subscribe(topic) {
      const channel = client.channel(topic, { config: { private: true } })
        .on('broadcast', { event: 'xzones.event' }, (message) => {
          events.push(message.payload)
          receivedAt.set(message.payload.event_id, Date.now())
        })
      channels.push(channel)
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Realtime subscribe timed out: ${topic}`)), 12_000)
        channel.subscribe((status, error) => {
          if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve() }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            clearTimeout(timer); reject(error ?? new Error(`Realtime rejected: ${status}`))
          }
        })
      })
      return channel
    },
    async close() { await Promise.all(channels.map((channel) => client.removeChannel(channel))) },
  }
}

async function expectRejectedSubscription(client, topic) {
  const channel = client.client.channel(topic, { config: { private: true } })
  try {
    const status = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve('TIMEOUT'), 6_000)
      channel.subscribe((state) => {
        if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'SUBSCRIBED') {
          clearTimeout(timer); resolve(state)
        }
      })
    })
    assert.notEqual(status, 'SUBSCRIBED', `unexpectedly joined private topic ${topic}`)
  } finally { await client.client.removeChannel(channel) }
}

function unauthenticatedClient() {
  const client = new RealtimeClient(`${base}/realtime/v1`, { params: { apikey: anonKey }, logLevel: 'error' })
  return { client, channels: [] }
}

const tokens = await Promise.all([guest(), guest(), guest(), guest()])
const [host, hunter, runner, runner2] = tokens
tokenRoles.set(host, 'RUNNER'); tokenRoles.set(hunter, 'HUNTER'); tokenRoles.set(runner, 'RUNNER'); tokenRoles.set(runner2, 'RUNNER')
const created = await request('/functions/v1/api/lobbies', host, {
  display_name: 'Integration Host', round_seconds: 600, head_start_seconds: 0, ping_seconds: 60,
})
const matchId = created.match_id
assert.ok(matchId && created.player_id && created.code, 'create response missing lobby identity')
const second = await request('/functions/v1/api/lobbies/join', hunter, { display_name: 'Integration Hunter', code: created.code })
const third = await request('/functions/v1/api/lobbies/join', runner, { display_name: 'Integration Runner', code: created.code })
const fourth = await request('/functions/v1/api/lobbies/join', runner2, { display_name: 'Runner Leaving', code: created.code })
assert.equal(second.match_id, matchId); assert.equal(third.match_id, matchId); assert.equal(fourth.match_id, matchId)
await request(`/functions/v1/api/matches/${matchId}/team`, host, { role: 'RUNNER' })
await request(`/functions/v1/api/matches/${matchId}/team`, hunter, { role: 'HUNTER' })
await request(`/functions/v1/api/matches/${matchId}/team`, runner, { role: 'RUNNER' })
await request(`/functions/v1/api/matches/${matchId}/team`, runner2, { role: 'RUNNER' })
for (const token of tokens) await request(`/functions/v1/api/matches/${matchId}/ready`, token, { ready: true })
const lobby = await request(`/functions/v1/api/matches/${matchId}/sync`, host, { last_revision: 0 })
await request(`/functions/v1/api/matches/${matchId}/start`, host, { expected_revision: lobby.revision })

const hostClient = await startClient(host), hunterClient = await startClient(hunter)
const runnerClient = await startClient(runner), runner2Client = await startClient(runner2)
await Promise.all([
  hostClient.subscribe(`match:${matchId}:runner`),
  hunterClient.subscribe(`match:${matchId}:hunter`),
  runnerClient.subscribe(`match:${matchId}:runner`),
  runner2Client.subscribe(`match:${matchId}:runner`),
])
await expectRejectedSubscription(hostClient, `match:${matchId}:hunter`)
const anonymousRealtime = unauthenticatedClient()
await expectRejectedSubscription(anonymousRealtime, `match:${matchId}:runner`)
await anonymousRealtime.client.disconnect()

// A valid Hunter in a different match still cannot join this match's Hunter topic.
const [otherHostToken, otherHunterToken] = await Promise.all([guest(), guest()])
tokenRoles.set(otherHostToken, 'RUNNER'); tokenRoles.set(otherHunterToken, 'HUNTER')
const otherCreated = await request('/functions/v1/api/lobbies', otherHostToken, {
  display_name: 'Other Host', round_seconds: 600, head_start_seconds: 0, ping_seconds: null,
})
await request('/functions/v1/api/lobbies/join', otherHunterToken, { display_name: 'Other Hunter', code: otherCreated.code })
await request(`/functions/v1/api/matches/${otherCreated.match_id}/team`, otherHunterToken, { role: 'HUNTER' })
const otherMatchClient = await startClient(otherHunterToken)
await expectRejectedSubscription(otherMatchClient, `match:${matchId}:hunter`)
await otherMatchClient.close()

const uniqueLat = 12.34567, uniqueLon = 67.89123
const fix = (sequence, lat = uniqueLat) => ({ lat, lon: uniqueLon, accuracy_m: 8, captured_at: new Date().toISOString(), sequence })
const sentAt = Date.now()
await request(`/functions/v1/api/matches/${matchId}/location`, host, fix(1))
const hunterLat = 42.76543
await request(`/functions/v1/api/matches/${matchId}/location`, hunter, fix(1, hunterLat))
await sleep(1000)
const deliveredLocation = runnerClient.events.find((event) => event.type === 'team.location_live' && event.data.player_id === created.player_id)
assert.ok(deliveredLocation, 'Runner teammate event was not delivered')
const deliveryMs = runnerClient.receivedAt.get(deliveredLocation.event_id) - sentAt
assert.ok(deliveryMs >= 0 && deliveryMs < 5_000, `Realtime delivery took ${deliveryMs}ms (expected under 5000ms)`)
assert.ok(!hunterClient.events.some((event) => event.type === 'team.location_live'
  && (event.data.player_id === created.player_id || event.data.player_id === third.player_id)), 'Runner coordinate leaked into Hunter topic')
assert.ok(!runnerClient.events.some((event) => JSON.stringify(event).includes(String(hunterLat))), 'Hunter coordinate leaked into Runner topic')

// Runner sync responses and Runner Realtime payloads are captured and checked for hidden Hunter fields.
const runnerSync = await request(`/functions/v1/api/matches/${matchId}/sync`, host, { last_revision: lobby.revision })
assert.ok(!JSON.stringify(runnerSync).includes('runner_snapshots'), 'Runner response contains Hunter ping snapshots')
await request(`/functions/v1/api/matches/${matchId}/sync`, hunter, { last_revision: 0 })
await sleep(500)
assert.ok(hunterClient.events.some((event) => event.type === 'hunter.runner_ping'), 'Hunter scheduled ping was not delivered')
assert.ok(!hostClient.events.some((event) => event.type === 'hunter.runner_ping'), 'Hunter ping leaked to Runner')

// A tag removes the Runner's channel authorization; subsequent teammate updates reach only active teammates.
const qr = await request(`/functions/v1/api/matches/${matchId}/qr`, runner, {})
await request(`/functions/v1/api/matches/${matchId}/qr/scan`, hunter, { token: qr.token })
await sleep(300)
const taggedEventCount = runnerClient.events.filter((event) => event.type === 'team.location_live').length
const leftEventCount = runner2Client.events.filter((event) => event.type === 'team.location_live').length
await sleep(2100)
await request(`/functions/v1/api/matches/${matchId}/location`, host, fix(2, 12.34568))
await sleep(800)
assert.equal(runnerClient.events.filter((event) => event.type === 'team.location_live').length, taggedEventCount,
  'tagged Runner continued receiving team events')
assert.ok(hostClient.events.filter((event) => event.type === 'team.location_live').length > taggedEventCount,
  'active Runner teammate did not receive the follow-up location')
assert.ok(runner2Client.events.filter((event) => event.type === 'team.location_live').length > leftEventCount,
  'other active Runner teammate did not receive location before leaving')
await request(`/functions/v1/api/matches/${matchId}/leave`, runner2, {})
const leftAtCount = runner2Client.events.filter((event) => event.type === 'team.location_live').length
await sleep(2100)
await request(`/functions/v1/api/matches/${matchId}/location`, host, fix(3, 12.34569))
await sleep(800)
assert.equal(runner2Client.events.filter((event) => event.type === 'team.location_live').length, leftAtCount,
  'LEFT player continued receiving team events')
assert.ok(!JSON.stringify(runnerSync).includes(String(hunterLat)), 'Runner HTTP response exposed Hunter coordinates')
for (const item of captures.filter((entry) => entry.role === 'RUNNER')) {
  assert.ok(!JSON.stringify(item.payload).includes(String(hunterLat)), `Hunter coordinates leaked in Runner HTTP response: ${item.path}`)
}
assert.ok(!runnerClient.events.some((event) => event.type === 'hunter.runner_ping'), 'Runner received a Hunter ping snapshot')

const persisted = execFileSync('psql', [dbUrl, '-Atc', `select exists (select 1 from realtime.messages where payload::text like '%${uniqueLat}%')`], { encoding: 'utf8' }).trim()
assert.equal(persisted, 'f', 'a coordinate-bearing REST broadcast persisted in realtime.messages')
await Promise.all([hostClient.close(), hunterClient.close(), runnerClient.close(), runner2Client.close()])
console.log(`PASS: role privacy, scheduled pings, tag revocation, HTTP payloads, ephemeral storage; location delivery ${deliveryMs}ms`)
