export interface WorldPosition { x: number; z: number }

/** Horizontal distance is intentional: terrain height must not shrink a social radius. */
export function distanceBetween(a: WorldPosition, b: WorldPosition): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function isNearby(a: WorldPosition, b: WorldPosition, radius: number): boolean {
  return distanceBetween(a, b) <= radius;
}

export function nearbyPlayerIds<T extends WorldPosition>(
  players: Iterable<[string, T]>, sourceId: string, radius: number,
): string[] {
  // `Map#entries()` is a one-shot iterator; snapshot it once before looking
  // up the source and filtering recipients.
  const entries = Array.from(players);
  const source = entries.find(([id]) => id === sourceId)?.[1];
  if (!source) return [];
  return entries
    .filter(([id, player]) => id !== sourceId && isNearby(source, player, radius))
    .map(([id]) => id);
}
