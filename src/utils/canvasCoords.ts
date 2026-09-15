/**
 * Pure coordinate helpers for the Story Canvas map view (Obsidian Canvas +
 * Maps analog, roadmap Phase 8). Pins live in each entity's `metadata`
 * (`mapX` / `mapY`, both 0..1 of the image), so nothing here needs a schema
 * and a pin survives any image resize.
 */

export interface PinnedEntity {
  kind: 'character' | 'location' | 'plotThread'
  id: string
  name: string
  x: number
  y: number
  color?: string
}

/** Clamp a fraction to 0..1; anything unparseable is `null`. */
export function normalizeCoord(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return Math.min(1, Math.max(0, n))
}

/** Pixel position inside an element → normalized 0..1 coordinates. */
export function toNormalized(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number }
): { x: number; y: number } | null {
  if (!rect.width || !rect.height) return null
  return {
    x: normalizeCoord((clientX - rect.left) / rect.width) ?? 0,
    y: normalizeCoord((clientY - rect.top) / rect.height) ?? 0
  }
}

export function entityHasCoords(entity: any): boolean {
  return (
    normalizeCoord(entity?.metadata?.mapX) !== null &&
    normalizeCoord(entity?.metadata?.mapY) !== null
  )
}

/** Every pinned entity as a pin, with its kind's colour. */
export function buildPins(
  entities: { characters?: any[]; locations?: any[]; plotThreads?: any[] },
  colors: Partial<Record<PinnedEntity['kind'], string>> = {}
): PinnedEntity[] {
  const pins: PinnedEntity[] = []
  const add = (kind: PinnedEntity['kind'], rows: any[] | undefined) => {
    for (const e of rows || []) {
      if (!entityHasCoords(e)) continue
      pins.push({
        kind,
        id: String(e.id),
        name: String(e.name || e.title || ''),
        x: normalizeCoord(e.metadata.mapX) as number,
        y: normalizeCoord(e.metadata.mapY) as number,
        color: colors[kind]
      })
    }
  }
  add('character', entities.characters)
  add('location', entities.locations)
  add('plotThread', entities.plotThreads)
  return pins
}

/**
 * Deterministic placement for entities that have no pin yet: a gentle grid
 * inside the middle 80% of the map, row-major, so "Pin all locations" gives
 * the author something to drag rather than a pile in one corner.
 */
export function autoPlaceCoordinates(count: number): Array<{ x: number; y: number }> {
  if (count <= 0) return []
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i < count; i++) {
    const c = i % cols
    const r = Math.floor(i / cols)
    out.push({
      x: Number((0.1 + (0.8 * (c + 0.5)) / cols).toFixed(4)),
      y: Number((0.1 + (0.8 * (r + 0.5)) / rows).toFixed(4))
    })
  }
  return out
}
