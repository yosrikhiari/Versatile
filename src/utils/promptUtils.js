/** Entries kept verbatim before we start eliding the middle. */
const LOG_VERBATIM_MAX = 5
/** Most-recent entries kept once eliding kicks in. */
const LOG_RECENT_KEPT = 3

/**
 * Condense a chapter log for a prompt.
 *
 * Accepts either the array of entries or the already-joined string, because
 * callers legitimately hold both shapes: the orchestrator builds arrays
 * (`logEntries`, `runningChapterLog`) while `useStoryCritic` renders the joined
 * string straight into its prompt, so the value cannot simply become an array
 * everywhere.
 *
 * BUG THIS FIXES: the old signature required an Array and returned '' for
 * anything else — but every caller passed `logEntries.join('\n')`. So this
 * ALWAYS returned '', every writer prompt read "(This is the first scene —
 * nothing has happened yet.)" no matter how far into the novel it was, and the
 * `runningChapterLog` incremental optimization (commented "Fix #2 — avoids
 * O(n²)") was maintaining a value that was then discarded.
 *
 * Splitting a joined string on newlines assumes one entry per line, which is how
 * every caller builds them (`Scene N ("Title"): summary`). A summary containing a
 * newline would be counted as two entries — the result degrades to "keep the last
 * 3 lines" rather than "the last 3 scenes", which is a cosmetic loss, not a
 * correctness one.
 *
 * @param {string[]|string} chapterLog
 * @returns {string}
 */
export function summarizeLog(chapterLog) {
  if (!chapterLog) return ''

  const entries = Array.isArray(chapterLog)
    ? chapterLog.filter((e) => e !== null && e !== undefined && String(e).trim() !== '')
    : String(chapterLog)
        .split('\n')
        .filter((line) => line.trim() !== '')

  if (entries.length === 0) return ''
  if (entries.length <= LOG_VERBATIM_MAX) return entries.join('\n')

  const recent = entries.slice(-LOG_RECENT_KEPT)
  const omitted = entries.length - LOG_RECENT_KEPT
  return [...recent, `(... plus ${omitted} earlier entries omitted)`].join('\n')
}
