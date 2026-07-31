/**
 * Short relative age for a timestamp, phrased for edit history.
 *
 * Shared so the workspace index and the sidebar account card cannot drift into
 * describing the same project's age two different ways.
 */
export function editedAgo(iso?: string | null): string {
  if (!iso) return 'never edited'

  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'edited just now'
  if (min < 60) return `edited ${min}m ago`

  const hr = Math.floor(min / 60)
  if (hr < 24) return `edited ${hr}h ago`

  const day = Math.floor(hr / 24)
  if (day < 7) return `edited ${day}d ago`

  const wk = Math.floor(day / 7)
  if (wk < 5) return `edited ${wk}w ago`

  const mo = Math.floor(day / 30)
  if (mo < 12) return `edited ${mo}mo ago`

  return `edited ${Math.floor(day / 365)}y ago`
}

/** The same scale without the "edited" verb, for dense rows and metadata. */
export function shortAgo(iso?: string | null): string {
  return editedAgo(iso).replace(/^edited /, '').replace(/^never edited$/, '—')
}

/** Initials for an avatar chip: "Dev Preview" → "DP", "yosri" → "YO". */
export function initialsOf(name?: string | null): string {
  const clean = (name || '').trim()
  if (!clean) return '?'

  const parts = clean.split(/\s+/)
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase()
  return clean.slice(0, 2).toUpperCase()
}
