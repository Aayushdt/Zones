import { projectEventForRole, type EventEnvelope, type RecipientRole } from './payloads.ts'

/** Best-effort server publishing to active players' private Realtime topics. */
export async function publishRoleEvents(
  matchId: string,
  events: unknown[],
  roles: RecipientRole[] = ['HUNTER', 'RUNNER'],
): Promise<void> {
  const baseUrl = Deno.env.get('SUPABASE_URL')
  const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!baseUrl || !serverKey) return
  const playerQuery = new URLSearchParams({ select: 'id,role', match_id: `eq.${matchId}`, status: 'eq.ACTIVE' })
  let players: Array<{ id?: unknown; role?: unknown }>
  try {
    const response = await fetch(`${baseUrl}/rest/v1/players?${playerQuery}`, {
      headers: { apikey: serverKey, authorization: `Bearer ${serverKey}` },
      signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return
    players = await response.json()
  } catch { return }
  for (const role of roles) {
    const recipients = players.filter((player): player is { id: string; role: string } =>
      typeof player.id === 'string' && player.role === role)
    const sends = recipients.flatMap((player) => events.map(async (event) => {
      const projected: EventEnvelope | null = projectEventForRole(role, event)
      if (!projected || projected.match_id !== matchId) return
      const topic = `match:${matchId}:${role.toLowerCase()}:${player.id}`
      try {
        await fetch(`${baseUrl}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/xzones.event?private=true`, {
          method: 'POST',
          headers: { apikey: serverKey, 'content-type': 'application/json' },
          body: JSON.stringify(projected),
          signal: AbortSignal.timeout(1_500),
        })
      } catch {
        // Polling remains the recovery path; delivery failure never undoes a committed action.
      }
    }))
    await Promise.all(sends)
  }
}
