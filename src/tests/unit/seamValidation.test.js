import { describe, it, expect } from 'vitest'
import { deriveSeamWarnings } from '../../services/generation/seamValidation'

function scene(digest) {
  return {
    projectId: 'p1',
    subsectionId: digest.subsectionId,
    chapterNumber: digest.chapterNumber,
    sceneNumber: digest.sceneNumber,
    location: digest.location || '',
    charactersPresent: digest.charactersPresent || [],
    keyFacts: digest.keyFacts || [],
    summary: digest.summary || '',
    facts: { characters: [], objects: [] }
  }
}

// Chapter 1: Aldric + Mira present in opening and closing.
// Chapter 2: only Mira present — Aldric vanishes from the next chapter with no
// recorded departure. This is exactly the seam break the generator must surface.
const dropped = [
  scene({
    subsectionId: 's1',
    chapterNumber: 1,
    sceneNumber: 1,
    charactersPresent: ['Aldric', 'Mira']
  }),
  scene({
    subsectionId: 's2',
    chapterNumber: 1,
    sceneNumber: 2,
    charactersPresent: ['Aldric', 'Mira']
  }),
  scene({ subsectionId: 's3', chapterNumber: 2, sceneNumber: 1, charactersPresent: ['Mira'] }),
  scene({ subsectionId: 's4', chapterNumber: 2, sceneNumber: 2, charactersPresent: ['Mira'] })
]

// Chapter 1: Aldric + Mira. Chapter 2: both carried over — seam intact.
const carried = [
  scene({
    subsectionId: 's1',
    chapterNumber: 1,
    sceneNumber: 1,
    charactersPresent: ['Aldric', 'Mira']
  }),
  scene({
    subsectionId: 's2',
    chapterNumber: 1,
    sceneNumber: 2,
    charactersPresent: ['Aldric', 'Mira']
  }),
  scene({
    subsectionId: 's3',
    chapterNumber: 2,
    sceneNumber: 1,
    charactersPresent: ['Aldric', 'Mira']
  }),
  scene({
    subsectionId: 's4',
    chapterNumber: 2,
    sceneNumber: 2,
    charactersPresent: ['Aldric', 'Mira']
  })
]

// Aldric dies in chapter 1's closing scene — a deliberate, recorded departure.
const departed = [
  scene({
    subsectionId: 's1',
    chapterNumber: 1,
    sceneNumber: 1,
    charactersPresent: ['Aldric', 'Mira']
  }),
  scene({
    subsectionId: 's2',
    chapterNumber: 1,
    sceneNumber: 2,
    charactersPresent: ['Aldric', 'Mira'],
    keyFacts: ['Aldric is killed at the gate'],
    summary: 'Aldric dies defending the gate.'
  }),
  scene({ subsectionId: 's3', chapterNumber: 2, sceneNumber: 1, charactersPresent: ['Mira'] }),
  scene({ subsectionId: 's4', chapterNumber: 2, sceneNumber: 2, charactersPresent: ['Mira'] })
]

describe('deriveSeamWarnings (generation-time seam)', () => {
  it('flags a character dropped between adjacent chapters', () => {
    const warnings = deriveSeamWarnings(dropped)
    const chapterWarnings = warnings.filter((w) => w.kind === 'chapter')
    expect(chapterWarnings.length).toBeGreaterThanOrEqual(1)
    const aldric = chapterWarnings.find((w) => w.entityName === 'Aldric')
    expect(aldric).toBeTruthy()
    expect(aldric.chapterNumber).toBe(1)
    expect(aldric.description).toMatch(/chapter 1.*chapter 2/i)
  })

  it('stays clean when cast is carried across the boundary', () => {
    const warnings = deriveSeamWarnings(carried)
    expect(warnings.filter((w) => w.entityName === 'Aldric').length).toBe(0)
  })

  it('does not flag a death recorded before the boundary', () => {
    const warnings = deriveSeamWarnings(departed)
    expect(warnings.filter((w) => w.entityName === 'Aldric').length).toBe(0)
  })

  it('returns no warnings for an empty digest list', () => {
    expect(deriveSeamWarnings([])).toEqual([])
  })

  it('stays clean across the real pilot boundary (full cast, weeks pass)', () => {
    // Modeled on the actual qwen3 pilot: ch1 closes with Mara+June in the
    // lamp room (pencil handoff), ch2 opens weeks later in the snow with
    // both present. A legitimate time jump with full cast continuity must
    // not warn — the validator judges presence, not elapsed time.
    const pilot = [
      scene({
        subsectionId: 'ch1s5',
        chapterNumber: 1,
        sceneNumber: 5,
        location: 'lamp room',
        charactersPresent: ['Mara Voss', 'June Voss'],
        summary: 'June asks to stay; Mara answers by handing her the log pencil.'
      }),
      scene({
        subsectionId: 'ch2s1',
        chapterNumber: 2,
        sceneNumber: 1,
        location: 'landing and stores',
        charactersPresent: ['Mara Voss', 'June Voss'],
        summary: 'First snow, weeks later. June runs the inventory; the pencil lives in her pocket.'
      })
    ]
    const warnings = deriveSeamWarnings(pilot)
    expect(warnings.filter((w) => w.kind === 'chapter')).toEqual([])
  })
})
