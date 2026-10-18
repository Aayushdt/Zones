import { projectEventForRole, type EventEnvelope, type RecipientRole } from './payloads.ts'

/** Best-effort server publishing to one private, role-scoped Realtime topic. */
export async function publishRoleEvents(
  matchId: string,
  events: unknown[],
  roles: RecipientRole[] = ['HUNTER', 'RUNNER'],
): Promise<void> {
  const baseUrl = Deno.env.get('SUPABASE_URL')
  const serverKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!baseUrl || !serverKey) return
  for (const role of roles) {
    const topic = `match:${matchId}:${role.toLowerCase()}`
    const sends = events.map(async (event) => {
      const projected: EventEnvelope | null = projectEventForRole(role, event)
      if (!projected || projected.match_id !== matchId || projected.type === 'team.location_live') return
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
    })
    await Promise.all(sends)
  }
}
