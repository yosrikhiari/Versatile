import { describe, it, expect } from 'vitest'
import { chunkProseForMetadata, mergeSceneMetadata } from '@/composables/useStoryWriter'

// Regression lock for S-11: `extractSceneMetadata` must not drop a scene's
// final third. The historical bug was `slice(0, 6000)`; the fix is paragraph
// boundary chunking + full-coverage merge. These two pure helpers are the
// load-bearing part of that fix.

describe('chunkProseForMetadata (S-11 regression)', () => {
  it('returns a single chunk when prose fits under the limit', () => {
    const prose = 'Short scene.\n\nSecond paragraph.'
    expect(chunkProseForMetadata(prose)).toEqual([prose])
  })

  it('splits long prose on paragraph boundaries and covers the whole scene', () => {
    // Three paragraphs, each ~5k chars, well over the 6000-char default limit.
    const para = (label) => `${label}: ` + 'word '.repeat(1000)
    const prose = [para('OPEN'), para('MIDDLE'), para('CLOSE')].join('\n\n')
    expect(prose.length).toBeGreaterThan(6000)

    const chunks = chunkProseForMetadata(prose)
    expect(chunks.length).toBeGreaterThan(1)

    // Every paragraph's marker must survive in some chunk — no third dropped.
    const joined = chunks.join('\n\n')
    expect(joined).toContain('OPEN:')
    expect(joined).toContain('MIDDLE:')
    expect(joined).toContain('CLOSE:')
  })

  it('never starts a chunk mid-paragraph when paragraphs are small', () => {
    const para = 'alpha '.repeat(50)
    const prose = [para, para, para].join('\n\n')
    const chunks = chunkProseForMetadata(prose)
    for (const c of chunks) {
      const paras = c.split('\n\n')
      for (const p of paras) expect(p.startsWith('alpha') || p === '').toBe(true)
    }
  })
})

describe('mergeSceneMetadata (S-11 regression)', () => {
  it('unions entities and key facts across every chunk, not just the first', () => {
    const parts = [
      {
        summary: 'Opening beat.',
        usedEntities: {
          characterNames: ['Aldric'],
          locationNames: ['Vale'],
          plotThreadTitles: ['Prophecy']
        },
        newEntities: { characters: [{ name: 'Aldric' }], locations: [], plotThreads: [] },
        networkEvents: [{ type: 'relationship', from: 'Aldric', to: 'Bryn', label: 'meets' }],
        keyFacts: ['Aldric enters the Vale'],
        metadataStatus: 'ok'
      },
      {
        summary: '',
        usedEntities: { characterNames: ['Bryn'], locationNames: [], plotThreadTitles: [] },
        newEntities: { characters: [{ name: 'Bryn' }], locations: [], plotThreads: [] },
        networkEvents: [{ type: 'relationship', from: 'Bryn', to: 'Aldric', label: 'allies' }],
        keyFacts: ['Bryn reveals the artifact'],
        metadataStatus: 'ok'
      }
    ]

    const merged = mergeSceneMetadata(parts)
    expect(merged.usedEntities.characterNames).toEqual(expect.arrayContaining(['Aldric', 'Bryn']))
    expect(merged.keyFacts).toEqual(
      expect.arrayContaining(['Aldric enters the Vale', 'Bryn reveals the artifact'])
    )
    expect(merged.newEntities.characters.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Aldric', 'Bryn'])
    )
    // The late-chunk fact must not be lost — this is exactly what the
    // slice(0, 6000) bug used to drop.
    expect(merged.keyFacts).toContain('Bryn reveals the artifact')
  })

  it('falls back to failed status when every part is empty', () => {
    const merged = mergeSceneMetadata([null, undefined])
    expect(merged.metadataStatus).toBe('failed')
  })
})
