import { diffWords } from 'diff'
import { stripHtmlTags } from './textUtils'

export interface WordDiffSegment {
  value: string
  added?: boolean
  removed?: boolean
}

export interface CollapsedMarker {
  collapsed: true
  count: number
}

/** Inputs longer than this refuse with an explanatory throw (panel catches it). */
export const MAX_DIFF_WORDS = 4000

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

export function computeWordDiff(originalHtml: string, revisedHtml: string): WordDiffSegment[] {
  const original = stripHtmlTags(originalHtml)
  const revised = stripHtmlTags(revisedHtml)
  if (wordCount(original) > MAX_DIFF_WORDS || wordCount(revised) > MAX_DIFF_WORDS) {
    throw new Error(`diff input too long for word diff (cap ${MAX_DIFF_WORDS} words)`)
  }
  return diffWords(original, revised).map((part: any) => {
    const seg: WordDiffSegment = { value: part.value }
    if (part.added) seg.added = true
    if (part.removed) seg.removed = true
    return seg
  })
}

export function collapseSegments(
  segments: WordDiffSegment[],
  contextWords = 40
): Array<WordDiffSegment | CollapsedMarker> {
  const out: Array<WordDiffSegment | CollapsedMarker> = []
  const edge = Math.floor(contextWords / 2)
  for (const seg of segments) {
    if (seg.added || seg.removed || wordCount(seg.value) <= contextWords) {
      out.push(seg)
      continue
    }
    const words = seg.value.trim().split(/\s+/)
    const dropped = words.length - edge * 2
    out.push({ value: words.slice(0, edge).join(' ') + ' ' })
    out.push({ collapsed: true, count: dropped })
    out.push({ value: ' ' + words.slice(words.length - edge).join(' ') })
  }
  return out
}
