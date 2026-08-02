/**
 * The derived-artifact layer (ARCHITECTURE-OFFLINE-FIRST-VERDICT.md §4.1).
 *
 * The load-bearing properties are: it costs no LLM call, it invalidates on
 * content change, and it is total — any shape of input yields a valid digest,
 * because this runs on the commit path and must never lose a scene.
 */
import { describe, it, expect } from 'vitest'
import {
  buildSceneDigest,
  hashContent,
  isDigestStale,
  computeStyleVector,
  countUniqueProseWords,
  DIGEST_VERSION
} from '@/services/generation/sceneDigest'

const PROSE = [
  'Kaelen crossed the shattered stone, the map held tight against his chest.',
  '"You should not have come," the guardian said.',
  'He weighed the words, then stepped forward into the cold.'
].join(' ')

const STRUCTURED = {
  summary: 'Kaelen meets the guardian.',
  usedEntities: {
    characterNames: ['Kaelen', 'The Guardian'],
    locationNames: ['Sacred Chamber'],
    plotThreadTitles: []
  },
  keyFacts: ['Kaelen has entered the sacred chamber.'],
  metadataStatus: 'ok'
}

const base = { projectId: 'p1', subsectionId: 's1', prose: PROSE, structured: STRUCTURED }

describe('hashContent', () => {
  it('is stable for identical text', () => {
    expect(hashContent(PROSE)).toBe(hashContent(PROSE))
  })

  it('changes when the prose changes', () => {
    expect(hashContent(PROSE)).not.toBe(hashContent(PROSE + ' One more sentence.'))
  })

  it('distinguishes same-length different text', () => {
    expect(hashContent('abcd')).not.toBe(hashContent('abce'))
  })

  it('handles empty and nullish input', () => {
    expect(() => hashContent('')).not.toThrow()
    expect(() => hashContent(null)).not.toThrow()
  })
})

describe('isDigestStale', () => {
  it('is stale when no digest exists', () => {
    expect(isDigestStale(null, PROSE)).toBe(true)
  })

  it('is fresh when the hash matches', () => {
    const d = buildSceneDigest(base)
    expect(isDigestStale(d, PROSE)).toBe(false)
  })

  it('is stale after the prose is edited', () => {
    const d = buildSceneDigest(base)
    expect(isDigestStale(d, PROSE + ' He turned back.')).toBe(true)
  })

  it('is stale when the digest format version moves on', () => {
    const d = { ...buildSceneDigest(base), version: DIGEST_VERSION - 1 }
    expect(isDigestStale(d, PROSE)).toBe(true)
  })
})

describe('buildSceneDigest', () => {
  it('lifts facts from the writer metadata rather than re-deriving them', () => {
    const d = buildSceneDigest(base)
    expect(d.summary).toBe('Kaelen meets the guardian.')
    expect(d.keyFacts).toEqual(['Kaelen has entered the sacred chamber.'])
    expect(d.facts.characters).toEqual(['Kaelen', 'The Guardian'])
    expect(d.metadataStatus).toBe('ok')
  })

  it('records duplicate ratio so a looping scene is visible without an LLM', () => {
    const loop = Array.from(
      { length: 20 },
      () => 'He had no illusions of being any different.'
    ).join(' ')
    const d = buildSceneDigest({ ...base, prose: `${PROSE} ${loop}` })
    expect(d.duplicateRatio).toBeGreaterThan(0.5)
    expect(d.uniqueWordCount).toBeLessThan(d.wordCount)
  })

  it('reports zero duplication for clean prose', () => {
    expect(buildSceneDigest(base).duplicateRatio).toBe(0)
  })

  it('marks metadataStatus skipped when there is no metadata', () => {
    const d = buildSceneDigest({ ...base, structured: undefined })
    expect(d.metadataStatus).toBe('skipped')
    expect(d.summary).toBe('')
  })

  it('is total — malformed metadata still yields a valid digest', () => {
    for (const structured of [null, {}, { keyFacts: 'nope' }, { usedEntities: 7 }]) {
      const d = buildSceneDigest({ ...base, structured })
      expect(d.contentHash).toBeTruthy()
      expect(Array.isArray(d.keyFacts)).toBe(true)
      expect(Array.isArray(d.facts.characters)).toBe(true)
    }
  })

  it('falls back to the scene brief for cast when metadata has none', () => {
    const d = buildSceneDigest({
      ...base,
      structured: { metadataStatus: 'failed' },
      scene: {
        charactersPresent: ['Mira'],
        location: 'Tide Office',
        sceneNumber: 4,
        title: 'Ledger'
      }
    })
    expect(d.charactersPresent).toEqual(['Mira'])
    expect(d.location).toBe('Tide Office')
    expect(d.sceneNumber).toBe(4)
  })

  it('deduplicates entity names case-insensitively', () => {
    const d = buildSceneDigest({
      ...base,
      structured: {
        ...STRUCTURED,
        usedEntities: { characterNames: ['Kaelen', 'kaelen', 'KAELEN'] }
      }
    })
    expect(d.facts.characters).toEqual(['Kaelen'])
  })
})

describe('computeStyleVector', () => {
  it('is all zeros for empty prose rather than NaN', () => {
    const v = computeStyleVector('')
    expect(Object.values(v).every((n) => n === 0)).toBe(true)
  })

  it('detects dialogue', () => {
    const withDialogue = computeStyleVector('"Stop," she said. "Please."')
    const without = computeStyleVector('She asked him to stop, quietly.')
    expect(withDialogue.dialogueRatio).toBeGreaterThan(without.dialogueRatio)
  })

  it('detects pronoun-opening sentences — a strong AI-prose tell', () => {
    const heavy = computeStyleVector('He walked. She waited. They turned. It ended.')
    expect(heavy.pronounOpenRatio).toBe(1)
    expect(computeStyleVector('Kaelen walked. Mira waited.').pronounOpenRatio).toBe(0)
  })

  it('detects filter words that signal telling', () => {
    const telling = computeStyleVector('He felt afraid. She knew it. They realized the truth.')
    const showing = computeStyleVector('His hands shook. Her jaw set. The door slammed.')
    expect(telling.filterWordRatio).toBeGreaterThan(showing.filterWordRatio)
  })

  it('measures sentence-length variance so monotone prose is detectable', () => {
    const monotone = computeStyleVector(
      'One two three four. Five six seven eight. Nine ten one two.'
    )
    const varied = computeStyleVector(
      'Short. Then a considerably longer sentence that runs on for a while. Stop.'
    )
    expect(varied.sentenceLengthVariance).toBeGreaterThan(monotone.sentenceLengthVariance)
  })
})

describe('countUniqueProseWords', () => {
  it('drops duplicate sentences', () => {
    const s = 'He had no illusions of being any different.'
    expect(countUniqueProseWords(`${s} ${s} ${s}`)).toBe(8)
  })

  it('keeps short repeats — dialogue legitimately repeats', () => {
    expect(countUniqueProseWords('No. No. No.')).toBe(3)
  })
})
