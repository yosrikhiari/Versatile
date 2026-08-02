/**
 * The volume swatch palette.
 *
 * Rendered directly as a volume's background in `ChapterManager.vue`, so these
 * are design-system values, not arbitrary data. They lived inside
 * `stores/volumeStore.ts`, which meant the db layer could not reach them —
 * `db-core` (first-run seed), `db-structure` (create default) and `sync-mapper`
 * (round-trip fallback) each hardcoded `#6366f1` instead, and a store importing
 * a store is the wrong direction anyway.
 *
 * One definition here; every layer imports it.
 */
export const VOLUME_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6'
] as const

/** Used where no palette rotation is possible — a first volume, or a fallback. */
export const DEFAULT_VOLUME_COLOR = VOLUME_COLORS[0]

/**
 * First colour not already taken, cycling once the palette is exhausted.
 *
 * Pure so both the store and any non-store caller can use the same rule — the
 * generator hardcoded `VOLUME_COLORS[0]` in a loop and produced five
 * identically-coloured volumes for a five-volume story.
 */
export function nextVolumeColor(usedColors: readonly (string | undefined)[]): string {
  const used = new Set(usedColors.filter(Boolean) as string[])
  const available = VOLUME_COLORS.filter((c) => !used.has(c))
  return available[0] || VOLUME_COLORS[used.size % VOLUME_COLORS.length]
}
