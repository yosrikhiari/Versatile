import { describe, it, expect } from 'vitest'
import { buildCandidateLedgerText } from '@/services/generation/deterministicContradictions'

// Ledger text for the LLM verification step, extracted pure so chapter-digest
// substitution is testable. Without chapter info the output must equal the
// long-standing inline format exactly.

const ledger = (over = {}) => ({
  sceneId: 's1',
  sceneNumber: 1,
  sceneTitle: 'Arrival',
  facts: {
    characters: ['Kael'],
    locations: ['Harbor'],
    events: ['Kael docks at dawn'],
    objects: ['compass'],
    timeline: 'Day 1'
  },
  ...over
})

describe('buildCandidateLedgerText', () => {
  it('renders ledgers verbatim in the legacy format when no chapters resolve', () => {
    expect(buildCandidateLedgerText({ ledgers: [ledger()] })).toBe(
      'Scene 1 ("Arrival"):\n' +
        '  Characters: Kael\n' +
        '  Locations: Harbor\n' +
        '  Events: Kael docks at dawn\n' +
        '  Objects: compass\n' +
        '  Timeline: Day 1'
    )
  })

  it('substitutes the chapter digest when one chapter dominates the candidates', () => {
    const ledgers = [
      ledger({ sceneId: 's1', sceneNumber: 1 }),
      ledger({ sceneId: 's2', sceneNumber: 2, sceneTitle: 'Storm' }),
      ledger({ sceneId: 's3', sceneNumber: 3, sceneTitle: 'Wreck' }),
      ledger({ sceneId: 's9', sceneNumber: 9, sceneTitle: 'Epilogue' })
    ]
    const states = (id) => ({
      sceneId: id,
      chapterNumber: id === 's9' ? 2 : 1,
      sourceFacts: []
    })
    const text = buildCandidateLedgerText({
      ledgers,
      entityStates: ['s1', 's2', 's3', 's9'].map(states),
      chapterDigests: [
        { chapterNumber: 1, summary: 'Kael sails into disaster' },
        { chapterNumber: 2, summary: 'Years later' }
      ],
      maxScenesPerChapter: 2
    })
    expect(text).toContain(
      'Chapter 1 (digest covering 3 scenes 1, 2, 3):\n  Kael sails into disaster'
    )
    expect(text).not.toContain('Scene 2 ("Storm")')
    expect(text).toContain('Scene 9 ("Epilogue")')
  })

  it('keeps ledgers verbatim when every chapter is at or under the cap', () => {
    const ledgers = [
      ledger({ sceneId: 's1', sceneNumber: 1 }),
      ledger({ sceneId: 's9', sceneNumber: 9, sceneTitle: 'Epilogue' })
    ]
    const text = buildCandidateLedgerText({
      ledgers,
      entityStates: [
        { sceneId: 's1', chapterNumber: 1, sourceFacts: [] },
        { sceneId: 's9', chapterNumber: 2, sourceFacts: [] }
      ],
      chapterDigests: [{ chapterNumber: 1, summary: 'Kael sails' }],
      maxScenesPerChapter: 2
    })
    expect(text).toContain('Scene 1 ("Arrival")')
    expect(text).toContain('Scene 9 ("Epilogue")')
    expect(text).not.toContain('Chapter 1 (digest')
  })
})
