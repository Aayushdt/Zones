import type { Role } from './types.ts'

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

/** A role-scoped private topic. IDs are checked to prevent topic injection. */
export function privateMatchTopic(matchId: string, role: Role): string {
  if (!UUID.test(matchId)) throw new Error('Invalid match id for Realtime topic.')
  return `match:${matchId}:${role.toLowerCase()}`
}
