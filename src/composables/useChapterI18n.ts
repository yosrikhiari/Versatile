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
  'chapter.generate': 'Generate Chapter',
  'chapter.scenes': 'Scenes',
  'chapter.wordTarget': 'Chapter Word Target',
  'chapter.approve': 'Approve',
  'chapter.reject': 'Reject',
  'chapter.rerequest': 'Request Changes',
  'chapter.pause': 'Pause',
  'chapter.resume': 'Resume',
  'chapter.stop': 'Stop generation',
  'chapter.complete': 'Chapter Complete',
  'chapter.failed': 'Chapter Generation Failed',
  'chapter.gatePassed': 'Chapter gate passed',
  'chapter.gateBlocked': 'Chapter gate found blocking issues',
  'chapter.unfinished': 'Unfinished chapter — {written} of {total} scenes written.',
  'chapter.perScene': '{scenes} scene(s) · ~{words} words per scene'
}

export function t(key: string, params?: Record<string, string | number>): string {
  let text = STRINGS[key] ?? key
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }
  return text
}

export function useChapterI18n() {
  return { t }
}
