/**
 * Where a section sits on the way to done.
 *
 * These were raw Tailwind hexes (grey / blue-500 / amber-500 / emerald-500),
 * which read as a different product from the rest of the near-monochrome UI and
 * did not follow the light theme. They now resolve through the design tokens,
 * as a progression: unstarted recedes, active takes the accent, review asks for
 * attention, done settles into sage.
 *
 * Consumers use these in inline `background-color` / `color` / `color-mix`, all
 * of which accept `var()`. Do not feed them to a canvas 2D context.
 */
export const SECTION_STATUSES = [
  { value: 'planning', label: 'Planning', color: 'var(--vers-text-muted)', shape: 'dashed' },
  { value: 'drafting', label: 'Drafting', color: 'var(--vers-accent-primary)', shape: 'half' },
  { value: 'review', label: 'Under Review', color: 'var(--vers-status-warning)', shape: 'target' },
  { value: 'final', label: 'Final', color: 'var(--vers-status-success)', shape: 'check' }
]

/**
 * Plot-thread lifecycle.
 *
 * `in_progress` is canonical. The board used to write `inprogress` while the
 * timeline read `in_progress`, so a thread dragged into "In Progress" rendered
 * with no colour and no label on the timeline — it fell straight through the
 * lookup. `normalizeThreadStatus` accepts both spellings so existing rows keep
 * displaying correctly, and writers emit the canonical value from now on, which
 * migrates the data as threads are touched.
 */
export const THREAD_STATUSES = [
  { value: 'open', label: 'Open', color: 'var(--vers-status-open)', shape: 'ring' },
  {
    value: 'in_progress',
    label: 'In Progress',
    color: 'var(--vers-status-in_progress)',
    shape: 'half'
  },
  {
    value: 'resolved',
    label: 'Resolved',
    color: 'var(--vers-status-resolved)',
    shape: 'check'
  },
  { value: 'closed', label: 'Closed', color: 'var(--vers-status-closed)', shape: 'solid' }
]

const THREAD_STATUS_ALIASES: Record<string, string> = {
  inprogress: 'in_progress',
  'in-progress': 'in_progress'
}

/** Maps any stored spelling onto the canonical thread status value. */
export function normalizeThreadStatus(status?: string | null): string {
  if (!status) return 'open'
  return THREAD_STATUS_ALIASES[status] || status
}

/** Config for a thread status, tolerant of legacy spellings. */
export function threadStatusMeta(status?: string | null) {
  const canonical = normalizeThreadStatus(status)
  return THREAD_STATUSES.find((s) => s.value === canonical) || THREAD_STATUSES[0]
}

export const LENS_MAP = {
  weakVerbs: 'weak_verb',
  repetition: 'repetition',
  pacing: 'pacing',
  clarity: 'unclear_references'
}

export const LENS_LABELS = {
  weak_verb: 'Weak Verbs',
  repetition: 'Repetition',
  pacing: 'Pacing',
  unclear_references: 'Clarity Issues'
}
