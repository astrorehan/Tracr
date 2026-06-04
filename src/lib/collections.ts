/** Build an id→entity map for O(1) lookups in lists. */
export function indexById<T extends { id: string }>(items: T[]): Record<string, T> {
  const map: Record<string, T> = {}
  for (const item of items) map[item.id] = item
  return map
}
