import { mkdir } from 'node:fs/promises'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Player } from './player'
import { assertRolePrivacy, redactTraffic } from './privacy'

export interface Actor { player: Player; role: 'HUNTER' | 'RUNNER'; kind: 'host' | 'hunter' | 'runner' | 'tagged' | 'left' | 'non-member' }
export interface StepEvidence { id: string; name: string; statuses: Record<string, string>; screenshotPaths: string[] }

/** Every action captures the visible client state and checks captured traffic. */
export async function step(id: string, name: string, actors: Record<string, Actor>, action: () => Promise<void>, screenshotRoot: string): Promise<StepEvidence> {
  await action()
  const dir = join(screenshotRoot, id)
  await mkdir(dir, { recursive: true })
  const statuses: Record<string, string> = {}
  const screenshotPaths: string[] = []
  for (const [actorName, actor] of Object.entries(actors)) {
    statuses[actorName] = await actor.player.recordStatus()
    assertRolePrivacy(actor.role, actor.player.traffic)
    const path = join(dir, `${actorName}.png`)
    await actor.player.screenshot(path)
    screenshotPaths.push(path)
    await writeFile(join(dir, `${actorName}.traffic.json`), JSON.stringify(redactTraffic(actor.player.traffic), null, 2))
  }
  return { id, name, statuses, screenshotPaths }
}
