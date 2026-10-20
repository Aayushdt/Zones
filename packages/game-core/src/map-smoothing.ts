export function interpolateMapCoordinate(
  from: readonly [number, number],
  to: readonly [number, number],
  progress: number,
): [number, number] {
  const amount = Math.min(1, Math.max(0, progress))
  const eased = amount * amount * (3 - 2 * amount)
  return [from[0] + (to[0] - from[0]) * eased, from[1] + (to[1] - from[1]) * eased]
}
