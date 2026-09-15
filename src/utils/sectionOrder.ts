/**
 * Manuscript order for sections: volume by volume, then each volume's own
 * `order`. `order` restarts at 0 in every volume (each generation run numbers
 * its own chapters), so sorting on it alone interleaves volumes — the
 * timeline, the outline, the export and the shape analysis all read
 * "chapter 3" as the third run's first chapter. Volumes rank by their oldest
 * section, which is creation order; a section with no volume ranks by itself.
 */
export function orderSections<T extends { id: any; order?: number; volumeId?: any }>(
  sections: T[]
): T[] {
  const rank = new Map<string, number>()
  const keyOf = (s: T) => (s.volumeId != null ? `v:${s.volumeId}` : `s:${s.id}`)
  for (const s of sections) {
    const id = Number(s.id) || 0
    rank.set(keyOf(s), Math.min(rank.get(keyOf(s)) ?? Infinity, id))
  }
  const rankOf = (s: T) => rank.get(keyOf(s)) ?? 0
  return [...sections].sort(
    (a, b) =>
      rankOf(a) - rankOf(b) ||
      (a.order || 0) - (b.order || 0) ||
      (Number(a.id) || 0) - (Number(b.id) || 0)
  )
}
