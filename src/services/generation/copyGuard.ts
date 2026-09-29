/**
 * The writer is shown how the preceding scenes end, so the new scene joins
 * them. It copies that text: on a live What If branch 7 of 8 rewritten
 * chapters repeated a 39-208 word passage from the last ~1,200 characters of
 * a chapter before (§47), and a generated book repeated 190 words from one
 * chapter to the next. This removes, by code, the sentences of a new scene
 * that are mostly a passage copied from what the writer was shown.
 *
 * A word counts as copied when it sits in a run of `minRun` or more words
 * that the context also has (six-word phrases, lower case, punctuation
 * dropped). No two chapters of either original book share a run over 12
 * words, so a 15-word run is a copy, not a turn of phrase. A sentence goes
 * when at least half of its words are copied.
 */

const N = 6

function norm(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']+/g, '')
}

function gramSet(text: string): Set<string> {
  const words = String(text || '')
    .split(/\s+/)
    .map(norm)
    .filter(Boolean)
  const out = new Set<string>()
  for (let i = 0; i + N <= words.length; i++) out.add(words.slice(i, i + N).join(' '))
  return out
}

/** Sentences of a paragraph, keeping their punctuation and closing quotes. */
function sentencesOf(paragraph: string): string[] {
  return (
    paragraph
      .match(/[^.!?…]+(?:[.!?…]+["”’')\]]*|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) || []
  )
}

export interface CopyGuardResult {
  prose: string
  /** Sentences removed. */
  dropped: number
  /** Words removed. */
  words: number
  /** The start of the first removed sentence, for the run log. */
  sample: string
}

export function dropCopiedSentences(
  prose: string,
  context: string,
  t = { minRun: 15, minShare: 0.5 }
): CopyGuardResult {
  const text = String(prose || '')
  const seen = gramSet(context)
  if (!seen.size || !text.trim()) return { prose: text, dropped: 0, words: 0, sample: '' }

  // Every word of the prose, with the paragraph and sentence it belongs to.
  const paragraphs = text.split(/\n\s*\n/).map((p) => sentencesOf(p.replace(/\s+/g, ' ').trim()))
  const words: Array<{ w: string; p: number; s: number }> = []
  paragraphs.forEach((sents, p) =>
    sents.forEach((sent, s) =>
      sent
        .split(' ')
        .map(norm)
        .filter(Boolean)
        .forEach((w) => words.push({ w, p, s }))
    )
  )
  // Mark the words of every run of shared phrases long enough to be a copy.
  const copied = new Array(words.length).fill(false)
  let runStart = -1
  const close = (end: number) => {
    // phrases runStart..end-1 matched: words runStart .. end-1+N-1
    if (runStart >= 0 && end - runStart + N - 1 >= t.minRun)
      for (let k = runStart; k < end + N - 1; k++) copied[k] = true
    runStart = -1
  }
  for (let i = 0; i + N <= words.length; i++) {
    const g = words
      .slice(i, i + N)
      .map((x) => x.w)
      .join(' ')
    if (seen.has(g)) {
      if (runStart < 0) runStart = i
    } else close(i)
  }
  close(Math.max(0, words.length - N + 1))

  const tally = new Map<string, { n: number; c: number }>()
  words.forEach((x, i) => {
    const key = `${x.p}:${x.s}`
    const v = tally.get(key) || { n: 0, c: 0 }
    v.n++
    if (copied[i]) v.c++
    tally.set(key, v)
  })
  let dropped = 0
  let droppedWords = 0
  let sample = ''
  const kept = paragraphs
    .map((sents, p) =>
      sents
        .filter((sent, s) => {
          const v = tally.get(`${p}:${s}`)
          if (!v || v.c / v.n < t.minShare) return true
          dropped++
          droppedWords += v.n
          if (!sample) sample = sent.slice(0, 120)
          return false
        })
        .join(' ')
    )
    .filter(Boolean)
  if (!dropped) return { prose: text, dropped: 0, words: 0, sample: '' }
  return { prose: kept.join('\n\n'), dropped, words: droppedWords, sample }
}
