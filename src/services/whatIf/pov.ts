/**
 * Narrative person, by code (§44). A rewritten chapter of The Time Machine
 * slipped from the book's "I" into "he" ("the scent of burning fruit lingered
 * in his throat"); nothing checked for it. The Time Machine is told in the
 * first person throughout; Ethan Frome has a first-person frame around
 * third-person chapters -- so a rewrite is compared with its own original,
 * never with the book as a whole.
 *
 * The measure: first-person pronouns per 1,000 words of narration,
 * dialogue removed (a third-person scene is full of "I" inside quotes).
 */

export type Person = 'first' | 'third' | 'unclear'

// Plural too: a frame narrator often speaks as "we" (The Time Machine opens
// "expounding a recondite matter to us").
const FIRST = /\b(I|me|my|mine|myself|we|us|our|ours|ourselves)\b/g

/** The prose with quoted speech removed. */
export function narrationOf(prose: string): string {
  return String(prose || '')
    .replace(/“[^”]*”/g, ' ')
    .replace(/"[^"]*"/g, ' ')
}

export function firstPersonRate(prose: string): { rate: number; words: number } {
  const narration = narrationOf(prose)
  const words = narration.split(/\s+/).filter(Boolean).length
  const hits = (narration.match(FIRST) || []).length
  return { rate: words ? (hits * 1000) / words : 0, words }
}

/**
 * First when "I" carries the narration, third when it is (almost) absent from
 * it, unclear in between or when there is too little narration to tell.
 * Thresholds are set in §44 on the original chapters of both books.
 */
export function narrativePerson(
  prose: string,
  t = { first: 10, third: 2, minWords: 150 }
): {
  person: Person
  rate: number
} {
  const { rate, words } = firstPersonRate(prose)
  if (words < t.minWords) return { person: 'unclear', rate }
  return { person: rate >= t.first ? 'first' : rate <= t.third ? 'third' : 'unclear', rate }
}

/**
 * A rewrite that tells its scene in another person than the original did.
 * Only a clear first/third on both sides counts.
 */
export function povDrift(
  original: string,
  rewritten: string
): { from: Person; to: Person; originalRate: number; rewrittenRate: number } | null {
  const a = narrativePerson(original)
  const b = narrativePerson(rewritten)
  if (a.person === 'unclear' || b.person === 'unclear' || a.person === b.person) return null
  return { from: a.person, to: b.person, originalRate: a.rate, rewrittenRate: b.rate }
}

/** The line a brief carries so the writer keeps the original's person. */
export function povRule(person: Person): string {
  if (person === 'first')
    return 'NARRATION: first person ("I"), as the original scene is told. Do not switch to "he" or "she" for the narrator.'
  if (person === 'third')
    return 'NARRATION: third person ("he", "she"), as the original scene is told. Do not switch to "I".'
  return ''
}
