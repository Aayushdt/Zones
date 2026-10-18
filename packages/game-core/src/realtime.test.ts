import { describe, expect, it } from 'vitest'
import { privateMatchTopic, projectEventForRole } from './index.ts'

const matchId = '2ad47d8c-5065-428b-9a4d-59340e9fe836'
const playerId = 'f28cc076-14b5-4553-8d39-86daf01e4cc0'

describe('private Realtime topics and client projection', () => {
  it('constructs only exact player topics from UUID match and player ids', () => {
    expect(privateMatchTopic(matchId, 'HUNTER', playerId)).toBe(`match:${matchId}:hunter:${playerId}`)
    expect(privateMatchTopic(matchId, 'RUNNER', playerId)).toBe(`match:${matchId}:runner:${playerId}`)
    expect(() => privateMatchTopic(`${matchId}:runner`, 'HUNTER', playerId)).toThrow('Invalid match id')
    expect(() => privateMatchTopic(matchId, 'RUNNER', `${playerId}:extra`)).toThrow('Invalid player id')
  })

  it('drops cross-role broadcasts and removes hidden fields before store delivery', () => {
    const ping = { event_id: 'e1', match_id: matchId, revision: 1, server_at: '2026-10-18T18:00:00Z',
      type: 'hunter.runner_ping', data: { runner_id: 'runner-1', status: 'OK', lat: 1, lon: 2,
        accuracy_m: 5, captured_at: '2026-10-18T17:59:59Z', ping_at: '2026-10-18T18:00:00Z',
        age_seconds: 1, ping_index: 0, hunter_direction: 'NE' } }
    expect(projectEventForRole('RUNNER', ping)).toBeNull()
    const hunterView = projectEventForRole('HUNTER', ping)
    expect(hunterView?.data).not.toHaveProperty('hunter_direction')
    expect(hunterView?.data.lat).toBe(1)
  })
})
