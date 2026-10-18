import { describe, expect, it } from 'vitest'
import { privateMatchTopic, projectEventForRole } from './index.ts'

const matchId = '2ad47d8c-5065-428b-9a4d-59340e9fe836'

describe('private Realtime topics and client projection', () => {
  it('constructs only exact role topics from UUID match ids', () => {
    expect(privateMatchTopic(matchId, 'HUNTER')).toBe(`match:${matchId}:hunter`)
    expect(privateMatchTopic(matchId, 'RUNNER')).toBe(`match:${matchId}:runner`)
    expect(() => privateMatchTopic(`${matchId}:runner`, 'HUNTER')).toThrow('Invalid match id')
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
