/**
 * Fills the Story Canvas from generated story content.
 *
 * Every other editor surface is populated by a generation run — the manuscript
 * gets chapters and scenes, the Story Network gets entities and edges, the
 * Timeline gets ordered plot threads — but the canvas was reachable only by
 * hand. Generate a ten-chapter volume and it still said "No elements yet",
 * because nothing outside the canvas component had ever written `storyElements`.
 *
 * The sync is additive and idempotent. Elements are keyed by what they came
 * from, so re-running after a second volume adds only what is new, and anything
 * the author placed, retitled or arranged is left exactly as it is. Nothing here
 * deletes.
 */

/** Canvas element types, as offered by the Story Canvas UI. */
export const CANVAS_TYPES = {
  SECTION: 'section',
  CHARACTER: 'character',
  LOCATION: 'location',
  PLOT_POINT: 'plotpoint',
  NOTE: 'note'
} as const

export interface CanvasSource {
  sections?: Array<{ id: any; title?: string; order?: number }>
  characters?: Array<{ id: any; name?: string }>
  locations?: Array<{ id: any; name?: string }>
  plotThreads?: Array<{ id: any; title?: string }>
}

export interface CanvasElement {
  type: string
  title: string
  x: number
  y: number
  width: number
  height: number
  data: Record<string, unknown>
}

const ELEMENT_WIDTH = 200
const ELEMENT_HEIGHT = 100
const GRID_COLUMNS = 4
const GRID_GAP = 24

/**
 * Identity of the story object an element stands for.
 *
 * Also recognises elements the user created by dragging a section in, which
 * record `data.sectionId` and no source key — without that, a sync would
 * cheerfully add a second card for a chapter already on the canvas.
 */
export function elementKey(element: { type?: string; data?: any }): string | null {
  const data = element?.data || {}
  if (data.sourceType && data.sourceId != null) return `${data.sourceType}:${data.sourceId}`
  if (data.sectionId != null) return `${CANVAS_TYPES.SECTION}:${data.sectionId}`
  return null
}

/**
 * Decide which elements are missing from the canvas.
 *
 * Pure: it reads the story and the current canvas and returns rows to add. The
 * caller owns persistence, which keeps the placement rules testable without a
 * database.
 */
export function planCanvasElements(
  source: CanvasSource,
  existingElements: Array<{ type?: string; data?: any }> = []
): CanvasElement[] {
  const taken = new Set<string>()
  for (const el of existingElements || []) {
    const key = elementKey(el)
    if (key) taken.add(key)
  }

  // Story order: chapters first, then the cast, the places, and the threads
  // running through them — the order an author would lay them out by hand.
  const candidates: Array<{ type: string; sourceId: any; title: string }> = []

  for (const section of source.sections || []) {
    candidates.push({
      type: CANVAS_TYPES.SECTION,
      sourceId: section.id,
      title: section.title || `Chapter ${(section.order ?? 0) + 1}`
    })
  }
  for (const character of source.characters || []) {
    if (!character?.name) continue
    candidates.push({
      type: CANVAS_TYPES.CHARACTER,
      sourceId: character.id,
      title: character.name
    })
  }
  for (const location of source.locations || []) {
    if (!location?.name) continue
    candidates.push({ type: CANVAS_TYPES.LOCATION, sourceId: location.id, title: location.name })
  }
  for (const thread of source.plotThreads || []) {
    if (!thread?.title) continue
    candidates.push({ type: CANVAS_TYPES.PLOT_POINT, sourceId: thread.id, title: thread.title })
  }

  const out: CanvasElement[] = []
  // Continue the grid below whatever is already placed, so new elements never
  // land on top of an arrangement the author made.
  let slot = existingElements?.length || 0

  for (const candidate of candidates) {
    const key = `${candidate.type}:${candidate.sourceId}`
    if (taken.has(key)) continue
    taken.add(key)

    const column = slot % GRID_COLUMNS
    const row = Math.floor(slot / GRID_COLUMNS)
    slot++

    out.push({
      type: candidate.type,
      title: candidate.title,
      x: column * (ELEMENT_WIDTH + GRID_GAP),
      y: row * (ELEMENT_HEIGHT + GRID_GAP),
      width: ELEMENT_WIDTH,
      height: ELEMENT_HEIGHT,
      data: {
        sourceType: candidate.type,
        sourceId: candidate.sourceId,
        // Kept so the existing drag-created shape and this one stay
        // interchangeable for consumers that read `sectionId`.
        ...(candidate.type === CANVAS_TYPES.SECTION ? { sectionId: candidate.sourceId } : {}),
        generated: true
      }
    })
  }

  return out
}
