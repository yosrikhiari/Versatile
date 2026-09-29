/**
 * Repetition across scenes, by code (§46). The writer can copy a passage from
 * another chapter into the one it is writing -- on the first live branch
 * after §45, "When Night Came" opened with the first 1,173 characters of
 * "The Morlocks", word for word. No check compared scenes with each other.
 *
 * The measure: six-word phrases (lower case, punctuation dropped) that two
 * scenes share, as a share of the smaller scene's phrases, and the longest
 * run of words the two have in common. A book's own chapters share almost
 * none; a scene is compared with every other scene of the branch, never with
 * its own original (a rewrite may keep the original's sentences).
 */

const N = 6

function tokens(prose: string): { raw: string[]; norm: string[] } {
  const raw = String(prose || '')
    .split(/\s+/)
    .filter(Boolean)
  const norm = raw.map((w) => w.toLowerCase().replace(/[^a-z0-9']+/g, ''))
  const keep = norm.map((w) => w.length > 0)
  return { raw: raw.filter((_, i) => keep[i]), norm: norm.filter((_, i) => keep[i]) }
}

function grams(norm: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i + N <= norm.length; i++) out.push(norm.slice(i, i + N).join(' '))
  return out
}

export interface Overlap {
  /** Shared six-word phrases, as a share of the smaller scene's (0-1). */
  share: number
  /** The longest run of words the two scenes have in common. */
  longestRun: number
  /** The start of that run, as written in the first scene. */
  sample: string
}

export function overlap(a: string, b: string): Overlap {
  const ta = tokens(a)
  const ga = grams(ta.norm)
  const gb = new Set(grams(tokens(b).norm))
  const da = new Set(ga)
  if (!da.size || !gb.size) return { share: 0, longestRun: 0, sample: '' }
  let shared = 0
  for (const g of da) if (gb.has(g)) shared++
  let best = 0
  let bestAt = -1
  let run = 0
  ga.forEach((g, i) => {
    run = gb.has(g) ? run + 1 : 0
    if (run > best) {
      best = run
      bestAt = i - run + 1
    }
  })
  const longestRun = best ? best + N - 1 : 0
  const sample = best ? ta.raw.slice(bestAt, bestAt + Math.min(longestRun, 30)).join(' ') : ''
  return { share: shared / Math.min(da.size, gb.size), longestRun, sample }
}

/**
 * Repeated when the two scenes share a passage (a run of `minRun` words) or
 * many phrases scattered through (`minShare`). Set in §46: no two chapters
 * of either book share a run over 12 words or 0.66% of their phrases, nor do
 * the scenes of most generated books (<= 12 words, <= 3.2%).
 */
export function isRepeat(o: Overlap, t = { minShare: 0.05, minRun: 25 }): boolean {
  return o.share >= t.minShare || o.longestRun >= t.minRun
}
