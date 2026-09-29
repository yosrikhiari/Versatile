/**
 * How much of the preceding scene the writer is shown, word for word (§48).
 *
 * It used to be the last 1,200 characters of each of the three scenes before
 * (continuation) or of the one before (drafting). The writer copied those
 * tails into the new scene: on a live branch the copy guard (§47) removed
 * 2,511 words in 12 of 24 sections, whatever the header said. A scene only
 * needs the last beat to join on; what happened earlier travels as a summary.
 */
import { stripHtmlBlock } from '../../utils/textUtils'

export const PRECEDING_ENDING_MAX_CHARS = 500

/**
 * The last paragraph of a scene (HTML or plain text), cut to its last
 * `maxChars` at a sentence start when the paragraph is longer.
 */
export function lastParagraph(prose: string, maxChars = PRECEDING_ENDING_MAX_CHARS): string {
  const text = /<\/?[a-z][^>]*>/i.test(String(prose || ''))
    ? stripHtmlBlock(prose)
    : String(prose || '')
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const last = paragraphs.at(-1) || ''
  if (last.length <= maxChars) return last
  const tail = last.slice(-maxChars)
  // Start at the first whole sentence inside the cut, when there is one.
  const m = tail.match(/[.!?…]["”’]?\s+(?=\S)/)
  return (
    '…' + (m && m.index! + m[0].length < tail.length ? tail.slice(m.index! + m[0].length) : tail)
  )
}
