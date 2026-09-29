/**
 * How much of the preceding scene the writer is shown, word for word (§48).
 *
 * It used to be the last 1,200 characters of each of the three scenes before
 * (continuation) or of the one before (drafting). The writer copied those
 * tails into the new scene: on a live branch the copy guard (§47) removed
 * 2,511 words in 12 of 24 sections, whatever the header said. A scene only
 * needs the last beat to join on; what happened earlier travels as a summary.
 *
 * But the writer also takes its TENSE from that one paragraph (§48): a
 * past-tense chapter whose last paragraph slipped into the present ("Then I
 * move, slow and sure...") was followed by three chapters written in the
 * present, until two kept original chapters broke the chain. So the excerpt is
 * the last paragraph told in the scene's own tense, and the tense is named.
 */
import { stripHtmlBlock } from '../../utils/textUtils'
import { narrativeTense, tenseMarkers, type Tense } from '../whatIf/tense'

export const PRECEDING_ENDING_MAX_CHARS = 500

function plainParagraphs(prose: string): string[] {
  const text = /<\/?[a-z][^>]*>/i.test(String(prose || ''))
    ? stripHtmlBlock(prose)
    : String(prose || '')
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** The last `maxChars` of a paragraph, starting at a sentence when possible. */
function cut(paragraph: string, maxChars: number): string {
  if (paragraph.length <= maxChars) return paragraph
  const tail = paragraph.slice(-maxChars)
  const m = tail.match(/[.!?…]["”’]?\s+(?=\S)/)
  return (
    '…' + (m && m.index! + m[0].length < tail.length ? tail.slice(m.index! + m[0].length) : tail)
  )
}

/**
 * The last paragraph of a scene (HTML or plain text), cut to its last
 * `maxChars` at a sentence start when the paragraph is longer.
 */
export function lastParagraph(prose: string, maxChars = PRECEDING_ENDING_MAX_CHARS): string {
  return cut(plainParagraphs(prose).at(-1) || '', maxChars)
}

/**
 * What the next scene is shown of this one: its last paragraph told in the
 * scene's own tense (a closing paragraph that slipped into the other tense
 * is passed over), and that tense, so the header can name it.
 */
export function precedingEnding(
  prose: string,
  maxChars = PRECEDING_ENDING_MAX_CHARS
): { text: string; tense: Tense } {
  const paragraphs = plainParagraphs(prose)
  const tense = narrativeTense(paragraphs.join('\n')).tense
  const otherTense = (p: string) => {
    const m = tenseMarkers(p)
    if (tense === 'past') return m.present > m.past
    if (tense === 'present') return m.past > m.present
    return false
  }
  const chosen = [...paragraphs].reverse().find((p) => !otherTense(p)) ?? paragraphs.at(-1) ?? ''
  return { text: cut(chosen, maxChars), tense }
}

/** " — told in the past tense; keep to it", or nothing when unclear. */
export function tenseNote(tense: Tense): string {
  return tense === 'unclear' ? '' : ` — told in the ${tense} tense; write in the ${tense} tense`
}
