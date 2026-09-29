/**
 * Narrative tense, by code (§45) -- the companion of pov.ts. A rewrite told in
 * the present where its original is told in the past, or a past-tense scene
 * that slides into the present for a stretch, reads wrong at once and no
 * check looked for it.
 *
 * The measure: unambiguous past and present verb forms in the narration, with
 * quoted speech removed (speech is naturally present tense). Only forms that
 * cannot be another part of speech are counted -- "was / is", "said / says",
 * "looked / looks" -- plus "I / we + base verb" for first-person present
 * ("I walk"), since the bare base form alone is ambiguous.
 */
import { narrationOf } from './pov'

export type Tense = 'past' | 'present' | 'unclear'

// Paired forms: the same verbs on both sides, so neither tense gets more
// chances to be counted.
const PAIRS: Array<[string, string[]]> = [
  ['was', ['is', 'am']],
  ['were', ['are']],
  ['had', ['has']],
  ['did', ['does']],
  ['said', ['says']],
  ['went', ['goes']],
  ['looked', ['looks']],
  ['turned', ['turns']],
  ['walked', ['walks']],
  ['stood', ['stands']],
  ['sat', ['sits']],
  ['felt', ['feels']],
  ['thought', ['thinks']],
  ['knew', ['knows']],
  ['saw', ['sees']],
  ['came', ['comes']],
  ['took', ['takes']],
  ['seemed', ['seems']],
  ['held', ['holds']],
  ['told', ['tells']],
  ['began', ['begins']],
  ['watched', ['watches']],
  ['reached', ['reaches']],
  ['stepped', ['steps']],
  ['kept', ['keeps']],
  ['moved', ['moves']],
  ['opened', ['opens']],
  ['closed', ['closes']],
  ['pulled', ['pulls']],
  ['pushed', ['pushes']],
  ['smiled', ['smiles']],
  ['nodded', ['nods']],
  ['shook', ['shakes']],
  ['laughed', ['laughs']],
  ['asked', ['asks']],
  ['answered', ['answers']],
  ['whispered', ['whispers']],
  ['stared', ['stares']],
  ['glanced', ['glances']],
  ['leaned', ['leans']],
  ['lifted', ['lifts']],
  ['pressed', ['presses']],
  ['waited', ['waits']],
  ['tried', ['tries']],
  ['wanted', ['wants']],
  ['noticed', ['notices']],
  ['remembered', ['remembers']],
  ['heard', ['hears']],
  ['found', ['finds']],
  ['gave', ['gives']],
  ['ran', ['runs']],
  ['fell', ['falls']],
  ['rose', ['rises']],
  ['brought', ['brings']],
  ['got', ['gets']],
  ['made', ['makes']]
]
const PAST = new RegExp(`\\b(${PAIRS.map((p) => p[0]).join('|')})\\b`, 'gi')
const PRESENT = new RegExp(`\\b(${PAIRS.flatMap((p) => p[1]).join('|')})\\b`, 'gi')
const BASE =
  'walk|look|turn|stand|sit|feel|think|know|see|come|take|hold|tell|begin|watch|reach|step|go|say'
// "I walk", "we turn" -- but not "I will walk" or "to walk" (the pronoun must
// be right before the verb).
const FIRST_PRESENT = new RegExp(`\\b(I|we)\\s+(${BASE})\\b`, 'g')

/**
 * The paragraphs of a scene, without the ones that are the opening or middle
 * of a speech running over several paragraphs: by the old convention each
 * such paragraph opens with a quote mark and only the last one closes it, so
 * narrationOf cannot see them as speech. "“It is a law of nature we
 * overlook..." in The Time Machine is one.
 */
export function paragraphsOf(prose: string): string[] {
  const all = String(prose || '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const open = all.filter(unclosedSpeech).length
  // Most paragraphs open a quote and never close it: the whole scene is one
  // told story (The Time Machine is the Traveller talking), so it is all
  // narration.
  if (open * 2 > all.length) return all.map((p) => p.replace(/^[“"]/, ''))
  return all.filter((p) => !unclosedSpeech(p))
}

function unclosedSpeech(p: string): boolean {
  if (p.startsWith('“')) return (p.match(/“/g) || []).length > (p.match(/”/g) || []).length
  if (p.startsWith('"')) return (p.match(/"/g) || []).length % 2 === 1
  return false
}

export function tenseMarkers(prose: string): { past: number; present: number } {
  const n = narrationOf(paragraphsOf(prose).join('\n'))
  const past = (n.match(PAST) || []).length
  const present = (n.match(PRESENT) || []).length + (n.match(FIRST_PRESENT) || []).length
  return { past, present }
}

/**
 * Past, present or unclear (never flagged), with thresholds set in §45 on the
 * two books and 134 other scenes: real past-tense chapters go as low as 78%
 * past (The Time Machine muses in the timeless present: "the sanitation and
 * the agriculture of today are still..."), and present-tense scenes with
 * memories as high as 25% past ("She had known this moment would come").
 */
export function narrativeTense(
  prose: string,
  t = { past: 0.75, present: 0.35, minMarkers: 10 }
): { tense: Tense; pastShare: number; markers: number } {
  const { past, present } = tenseMarkers(prose)
  const markers = past + present
  const pastShare = markers ? past / markers : 0
  if (markers < t.minMarkers) return { tense: 'unclear', pastShare, markers }
  const tense = pastShare >= t.past ? 'past' : pastShare <= t.present ? 'present' : 'unclear'
  return { tense, pastShare, markers }
}

/** A rewrite told in another tense than its original. Clear on both sides only. */
export function tenseDrift(
  original: string,
  rewritten: string
): { from: Tense; to: Tense; originalPast: number; rewrittenPast: number } | null {
  const a = narrativeTense(original)
  const b = narrativeTense(rewritten)
  if (a.tense === 'unclear' || b.tense === 'unclear' || a.tense === b.tense) return null
  return { from: a.tense, to: b.tense, originalPast: a.pastShare, rewrittenPast: b.pastShare }
}

/**
 * Paragraphs of a past-tense scene that are told in the present: the usual
 * slip is a stretch, not the whole scene. A paragraph counts only with enough
 * markers to judge (short ones are noise).
 */
export function presentParagraphs(
  prose: string,
  t = { minMarkers: 4, maxPast: 0.2 }
): Array<{ index: number; text: string; pastShare: number }> {
  const out: Array<{ index: number; text: string; pastShare: number }> = []
  paragraphsOf(prose).forEach((text, index) => {
    const { past, present } = tenseMarkers(text)
    const m = past + present
    if (m >= t.minMarkers && past / m <= t.maxPast) out.push({ index, text, pastShare: past / m })
  })
  return out
}

/**
 * A rewrite of a past-tense scene that slides into the present for a
 * stretch: at least `margin` more present-tense paragraphs than its original
 * has. The margin is there because an original can have some too -- The Time
 * Machine has three, all timeless remarks ("It is a law of nature we
 * overlook...") -- and a rewrite may keep them.
 */
export function presentStretch(
  original: string,
  rewritten: string,
  margin = 2
): { added: number; sample: string } | null {
  // A whole-scene switch is tenseDrift's; a mixed rewrite (unclear overall) is ours.
  if (narrativeTense(original).tense !== 'past' || narrativeTense(rewritten).tense === 'present')
    return null
  const before = presentParagraphs(original).length
  const after = presentParagraphs(rewritten)
  const added = after.length - before
  return added >= margin ? { added, sample: after[0].text.slice(0, 200) } : null
}

/** The line a brief carries so the writer keeps the original's tense. */
export function tenseRule(tense: Tense): string {
  if (tense === 'past')
    return 'TENSE: past tense ("she walked", "he said"), as the original scene is told. Do not switch to the present.'
  if (tense === 'present')
    return 'TENSE: present tense ("she walks", "he says"), as the original scene is told. Do not switch to the past.'
  return ''
}
