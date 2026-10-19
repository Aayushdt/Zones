/** Fixture-only time controls. Server shifting requires an explicitly installed test RPC. */
export async function shiftMatchTime(matchId: string, shiftSeconds: number, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const url = env.TEST_CLOCK_FUNCTION_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Accelerated server clock is blocked: test-only clock endpoint/key is not configured.')
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify({ match_id: matchId, shift_seconds: shiftSeconds }),
  })
  if (!response.ok) throw new Error(`Test clock fixture returned HTTP ${response.status}`)
}
