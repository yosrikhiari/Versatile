/**
 * Openings that reuse an earlier scene's images (UX-AUDIT #59, issue #66).
 *
 * The writer opens scene after scene on the same picture: "Nesrin knelt
 * beside …, her fingers brushing", "boots sinking into the damp earth", "the
 * cold touch of". §46's repetition check cannot see it — it looks for
 * six-word phrases two scenes share, and a reused image is reworded every
 * time. What survives the rewording is the pair of content words that carry
 * the image ("boots sink", "coarse fabric", "cold touch").
 *
 * The measure: the opening's content words (stopwords, pronouns and the
 * story's character names dropped, a light stem so "brushing" meets
 * "brushed"), taken in adjacent pairs. Two openings reuse an image when they
 * share a pair. Pure code, no model call.
 */

/** Words of an opening: its first sentence, extended to at least this many words. */
export const OPENING_MIN_WORDS = 20
/** …and cut at this many, so a long first paragraph is not "the opening". */
export const OPENING_MAX_WORDS = 40

const STOP = new Set(
  (
    'a an the and or but if then so as of at by for from in into onto on off out over under ' +
    'up down to with without within upon about above below across after against along among ' +
    'around before behind beneath beside besides between beyond during except inside near ' +
    'outside past since through throughout toward towards until via while than that this ' +
    'these those there here where when what which who whom whose why how ' +
    'i me my mine myself you your yours yourself he him his himself she her hers herself ' +
    'it its itself we us our ours ourselves they them their theirs themselves ' +
    'is am are was were be been being have has had having do does did doing ' +
    'will would shall should can could may might must not no nor only own same too very ' +
    'just once again still yet ever never also even all any both each few more most other ' +
    'some such one two like s t don now ' +
    'said says say'
  ).split(/\s+/)
)

/** Light stem: enough for "brushing/brushed/brushes" to meet, not a real stemmer. */
function stem(word: string): string {
  let w = word
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  // "sinking" -> "sink", "brushing" -> "brush"; a doubled consonant left by
  // "-ed"/"-ing" ("stepped" -> "stepp") is undone so it meets "step".
  if (w.length > 3 && w[w.length - 1] === w[w.length - 2] && !/[aeiouls]/.test(w[w.length - 1]))
    w = w.slice(0, -1)
  return w
}

/** The opening of a scene: its first sentence, at least MIN and at most MAX words. */
export function openingOf(prose: string): string {
  const words = String(prose || '')
    .replace(/<[^>]+>/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return ''
  let end = Math.min(words.length, OPENING_MAX_WORDS)
  for (let i = OPENING_MIN_WORDS - 1; i < end; i++) {
    if (/[.!?]["'”’)]*$/.test(words[i])) {
      end = i + 1
      break
    }
  }
  return words.slice(0, end).join(' ')
}

function nameWords(names: string[]): Set<string> {
  const out = new Set<string>()
  for (const name of names || []) {
    for (const part of String(name || '')
      .toLowerCase()
      .split(/[^\p{L}']+/u)) {
      if (part.length > 1) out.add(part.replace(/'s$/, ''))
    }
  }
  return out
}

/** Adjacent content-word pairs of an opening: the images it is made of. */
export function imagePairs(opening: string, names: string[] = []): Set<string> {
  const skip = nameWords(names)
  const content = String(opening || '')
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w) && !skip.has(w))
    .map(stem)
  const pairs = new Set<string>()
  for (let i = 0; i + 1 < content.length; i++) {
    if (content[i] !== content[i + 1]) pairs.add(`${content[i]} ${content[i + 1]}`)
  }
  return pairs
}

export interface OpeningReuse {
  /** Index (into the scenes given) of the scene whose opening is reused. */
  earlier: number
  /** The image pairs the two openings share. */
  shared: string[]
}

/**
 * For one opening, every earlier opening it shares an image with.
 * `earlierOpenings` are already-written scenes, oldest first.
 */
export function reusedImages(
  opening: string,
  earlierOpenings: string[],
  names: string[] = []
): OpeningReuse[] {
  const mine = imagePairs(opening, names)
  if (!mine.size) return []
  const out: OpeningReuse[] = []
  earlierOpenings.forEach((other, earlier) => {
    const theirs = imagePairs(other, names)
    const shared = [...mine].filter((p) => theirs.has(p))
    if (shared.length) out.push({ earlier, shared })
  })
  return out
}

/**
 * A book's openings in order: how many reuse an image from an earlier one.
 * The measure the probe and the replay report.
 */
export function bookOpeningReuse(proses: string[], names: string[] = []) {
  const openings = proses.map(openingOf)
  const perScene = openings.map((o, i) => reusedImages(o, openings.slice(0, i), names))
  const reusing = perScene.filter((r) => r.length > 0).length
  const counts = new Map<string, number>()
  for (const o of openings)
    for (const p of imagePairs(o, names)) counts.set(p, (counts.get(p) || 0) + 1)
  const repeated = [...counts.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1])
  return {
    scenes: openings.length,
    reusing,
    share: openings.length > 1 ? reusing / (openings.length - 1) : 0,
    repeated,
    perScene,
    openings
  }
}

/**
 * Most openings shown to the writer: about 8 × 30 words, ~350 tokens. Nearby
 * scenes are the ones a reader holds in mind; the measure found reuse up to
 * 26 scenes apart, but the window is a prompt budget, not a claim about
 * memory.
 */
export const RECENT_OPENINGS_MAX = 8

/**
 * The openings of the written scenes nearest this one, in story order, for the
 * writer's brief: "these images are taken". Nearest by position, either side —
 * under anchor-first writing a chapter's closing scene is written before its
 * middle, and a middle scene must not open like either neighbour.
 */
export function buildRecentOpeningsContext(
  writtenScenes: ReadonlyArray<{ prose?: string; sceneNumber?: number } | null | undefined>,
  sceneIndex: number,
  max = RECENT_OPENINGS_MAX
): string {
  const near = (writtenScenes || [])
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene, index }) => index !== sceneIndex && String(scene?.prose || '').trim())
    .sort(
      (a, b) => Math.abs(a.index - sceneIndex) - Math.abs(b.index - sceneIndex) || a.index - b.index
    )
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
  return near
    .map(
      ({ scene, index }) =>
        `- Scene ${scene?.sceneNumber ?? index + 1}: "${openingOf(scene?.prose || '')}"`
    )
    .join('\n')
}
