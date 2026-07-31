/**
 * Live-draft bridge: puts generated prose into the editor while it is being
 * written, instead of only after the whole run finishes.
 *
 * Two things were missing before this existed.
 *
 * 1. The editor renders `manuscriptStore.activeSubsection.content`, and nothing
 *    in the generation pipeline ever selected a subsection — so a finished
 *    volume was invisible until the user manually clicked into a scene.
 * 2. Streamed tokens only reached a preview box in the generator panel. Under
 *    parallel generation every in-flight scene wrote into that single buffer, so
 *    the preview flipped between scenes mid-sentence.
 *
 * Both are solved by streaming each scene into *its own* subsection row and
 * letting the editor follow one scene at a time. Writes are in-memory only
 * (never `updateSubsectionData`, which hits Dexie and queues an embedding on
 * every call); the durable write still happens once, when the scene commits.
 */

const FLUSH_INTERVAL_MS = 120

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Convert plain model prose into the paragraph HTML the editor speaks.
 *
 * The writer emits plain text, but `content` is round-tripped through Tiptap
 * (`editor.getHTML()` on autosave). Storing raw text meant every generated
 * scene rendered as one undifferentiated wall — the blank lines the model
 * produced were collapsed by the HTML parser.
 *
 * A blank line is a paragraph break; a single newline inside a paragraph is a
 * soft break, which is how prose models format dialogue beats.
 */
export function proseToHtml(text: any) {
  const raw = String(text ?? '').replace(/\r\n/g, '\n')
  if (!raw.trim()) return ''
  return raw
    .split(/\n\s*\n+/)
    .map((paragraph: string) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph: string) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Word count over plain prose — the editor's HTML is not a counting surface. */
export function countProseWords(text: any) {
  return String(text ?? '')
    .split(/\s+/)
    .filter(Boolean).length
}

type SceneHandle = {
  sceneIndex: number
  subsectionId: any
  sectionId: any
  prose: string
  dirty: boolean
  lastFlush: number
}

export class LiveDraftBridge {
  private manuscriptStore: any
  private enabled: boolean
  private active = new Map<any, SceneHandle>()
  private focusedId: any = null
  private timer: any = null

  constructor(manuscriptStore: any, { enabled = true }: { enabled?: boolean } = {}) {
    this.manuscriptStore = manuscriptStore
    this.enabled = enabled
  }

  setEnabled(value: boolean) {
    this.enabled = !!value
    if (!this.enabled) this.reset()
  }

  isEnabled() {
    return this.enabled
  }

  /**
   * Register a scene as in-flight and, if it should own the editor, open it.
   *
   * Focus follows the lowest in-flight scene index rather than the most recent
   * one: under parallel generation "most recent" would yank the editor around
   * unpredictably, whereas lowest-index reads in story order.
   */
  begin({ sceneIndex, subsectionId, sectionId }: { sceneIndex: number; subsectionId: any; sectionId?: any }) {
    if (!this.enabled || subsectionId == null) return
    const row = this.findRow(subsectionId)
    this.active.set(subsectionId, {
      sceneIndex,
      subsectionId,
      sectionId: sectionId ?? row?.sectionId ?? null,
      prose: '',
      dirty: false,
      lastFlush: 0
    })
    this.refocus()
  }

  /** Record the scene's full prose so far. Cheap; the DOM write is throttled. */
  push(subsectionId: any, fullProse: any) {
    if (!this.enabled) return
    const handle = this.active.get(subsectionId)
    if (!handle) return
    handle.prose = String(fullProse ?? '')
    handle.dirty = true
    this.schedule()
  }

  /** Final flush for a scene, then hand the editor to the next scene in line. */
  finish(subsectionId: any) {
    if (!this.enabled) return
    const handle = this.active.get(subsectionId)
    if (handle) {
      this.write(handle)
      this.active.delete(subsectionId)
    }
    if (this.focusedId === subsectionId) this.focusedId = null
    this.refocus()
  }

  /** Drop a scene without writing (a failed or aborted attempt). */
  abandon(subsectionId: any) {
    this.active.delete(subsectionId)
    if (this.focusedId === subsectionId) this.focusedId = null
    this.refocus()
  }

  /**
   * Open a finished scene in the editor — used when a run completes so the user
   * lands on real prose rather than whatever was open before they started.
   */
  focusSubsection(subsectionId: any) {
    if (!this.enabled || subsectionId == null) return
    const row = this.findRow(subsectionId)
    if (!row) return
    if (row.sectionId != null) this.manuscriptStore.setActiveSection(row.sectionId)
    this.manuscriptStore.setActiveSubsection(subsectionId)
    this.focusedId = subsectionId
  }

  reset() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.active.clear()
    this.focusedId = null
  }

  // ─── internals ──────────────────────────────────────────────

  private findRow(subsectionId: any) {
    const rows: any[] = this.manuscriptStore?.subsections || []
    return rows.find((s: any) => s.id === subsectionId)
  }

  private refocus() {
    if (!this.enabled) return
    if (this.focusedId != null && this.active.has(this.focusedId)) return
    let next: SceneHandle | null = null
    for (const handle of this.active.values()) {
      if (!next || handle.sceneIndex < next.sceneIndex) next = handle
    }
    if (!next) return
    this.focusSubsection(next.subsectionId)
  }

  private schedule() {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, FLUSH_INTERVAL_MS)
  }

  private flush() {
    let stillDirty = false
    for (const handle of this.active.values()) {
      if (!handle.dirty) continue
      this.write(handle)
      stillDirty = true
    }
    if (stillDirty) this.schedule()
  }

  /**
   * Mutate the row's fields in place rather than replacing the array entry.
   * `subsectionsBySection` never reads `content`, so an in-place write re-renders
   * only the component actually showing this scene — replacing the entry would
   * invalidate the whole chapter tree on every flush.
   */
  private write(handle: SceneHandle) {
    handle.dirty = false
    handle.lastFlush = Date.now()
    const row = this.findRow(handle.subsectionId)
    if (!row) return
    row.content = proseToHtml(handle.prose)
    row.wordCount = countProseWords(handle.prose)
    row.contentStatus = 'generating'
  }
}
