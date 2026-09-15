/**
 * Chapter-mode strings, behind a lookup rather than inline in the template.
 *
 * A no-op wrapper today: it returns English and interpolates `{named}` slots.
 * The point is the seam — when a real i18n runtime arrives, this file is what
 * changes, not every label in the chapter block. Keys that are not in the map
 * return themselves, so a missing translation shows the key rather than an
 * empty element.
 */

const STRINGS: Record<string, string> = {
  'chapter.generate': 'Generate chapter',
  'chapter.scenes': 'Scenes',
  'chapter.wordTarget': 'Chapter word target',
  'chapter.approve': 'Approve',
  'chapter.reject': 'Reject',
  'chapter.rerequest': 'Request changes',
  'chapter.pause': 'Pause',
  'chapter.resume': 'Resume',
  'chapter.stop': 'Stop generation',
  'chapter.complete': 'Chapter complete',
  'chapter.failed': 'Chapter generation failed',
  'chapter.gatePassed': 'Chapter gate passed',
  'chapter.gateBlocked': 'Chapter gate found blocking issues',
  'chapter.unfinished': 'Unfinished chapter — {written} of {total} scenes written.',
  'chapter.perScene': '{scenes} {scenes|scene|scenes} · ~{words} words per scene'
}

export function t(key: string, params?: Record<string, string | number>): string {
  let text = STRINGS[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      // `{count|one|many}` picks a plural from the same slot: "2 scenes", not "2 scene(s)".
      text = text.replace(new RegExp(`\\{${name}\\|([^|}]*)\\|([^}]*)\\}`, 'g'), (_m, one, many) =>
        Number(value) === 1 ? one : many
      )
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}

export function useChapterI18n() {
  return { t }
}
