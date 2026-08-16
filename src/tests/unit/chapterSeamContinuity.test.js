import { describe, it, expect } from 'vitest'
import dataset from '../../../validation/novel-100-data.json'
import { deriveEntityStates } from '@/services/generation/entityStates'
import { runDeterministicContradictionChecks } from '@/services/generation/deterministicContradictions'

// Location-name map must match scripts/build-100-chapter-data.mjs EXACTLY: the
// generator writes the travel keyFact using these names, and the seam validator
// treats a location change as justified only when the new location's name appears
// in the arriving chapter's keyFacts. Drift here produces false positives.
const LOC_NAME = {
  L1: 'the Archives of Veylthar',
  L2: 'the Lattice Spire',
  L3: 'the Sunken Quarter',
  L4: 'the Convergence Plateau',
  L5: 'the Threnody Sanctum',
  L6: 'the Floating Market of Cinder',
  L7: 'the Ashlands',
  L8: "Duskwane's Redoubt",
  L9: 'the Silent Library',
  L10: 'the Shattered Causeway'
}

const nameOf = Object.fromEntries(dataset.cast.map((c) => [c.id, c.name]))
const castIds = new Set(dataset.cast.map((c) => c.id))
const sorted = [...dataset.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)

/**
 * Walks every chapter boundary (1→2 … 99→100) and asserts the seam between the
 * ending of one chapter and the opening of the next is continuous. Pure
 * structural check on the dataset; the real engine is exercised separately.
 */
function collectSeamIssues(data) {
  const chs = [...data.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)
  const ids = new Set(chs.map((c) => c.id))
  const issues = []
  for (let i = 1; i < chs.length; i++) {
    const prev = chs[i - 1]
    const cur = chs[i]
    const boundary = `${prev.chapterNumber}->${cur.chapterNumber}`

    if (cur.chapterNumber !== prev.chapterNumber + 1) {
      issues.push({ boundary, type: 'order-gap' })
    }

    // Cast must carry across a boundary unless the new chapter is a deliberate
    // flashback (non-linear by definition).
    if (!cur.flashback) {
      const pc = new Set(prev.charactersPresent || [])
      const cc = new Set(cur.charactersPresent || [])
      if (pc.size > 0 && cc.size > 0 && ![...pc].some((x) => cc.has(x))) {
        issues.push({ boundary, type: 'cast-drop', prev: [...pc], cur: [...cc] })
      }

      // Each chapter must declare the hook it ends on and the chapter it continues
      // from, so the ending→opening link is explicit and checkable.
      if (!cur.continuesFrom) {
        issues.push({ boundary, type: 'continuation-missing' })
      } else if (cur.continuesFrom !== prev.id) {
        issues.push({
          boundary,
          type: 'continuation-broken',
          expected: prev.id,
          got: cur.continuesFrom
        })
      }
      if (!cur.ending || typeof cur.ending !== 'string' || !cur.ending.trim()) {
        issues.push({ boundary, type: 'ending-missing' })
      }
    }

    // A location change between adjacent chapters is a teleport unless the move is
    // acknowledged in the arriving chapter's facts/references.
    if (prev.location && cur.location && prev.location !== cur.location && !cur.flashback) {
      const ln = LOC_NAME[cur.location]
      const justified =
        (cur.keyFacts || []).some((f) => f.includes(ln)) || (cur.references || []).length > 0
      if (!justified) {
        issues.push({ boundary, type: 'location-teleport', from: prev.location, to: cur.location })
      }
    }

    // No dangling edges/references across the seam.
    for (const r of cur.references || []) {
      if (r && r.to && !ids.has(r.to)) issues.push({ boundary, type: 'ref-orphan', ref: r.to })
    }
    for (const e of cur.edges || []) {
      if (!castIds.has(e[0]) || !castIds.has(e[1]))
        issues.push({ boundary, type: 'edge-orphan', e })
    }
  }
  return issues
}

describe('100-chapter seam continuity (structural)', () => {
  // The dataset intentionally seeds one referential violation at chapter 52
  // (`referential-violation` scenario: edge ['C1','C99','allied']) to exercise the
  // consistency engine. The seam validator must still surface it; everything else
  // must be seamless.
  const KNOWN_SEEDS = new Set(['51->52:edge-orphan'])

  it('has no unexpected seam breaks across all 99 chapter boundaries', () => {
    const issues = collectSeamIssues(dataset)
    const unexpected = issues.filter((i) => !KNOWN_SEEDS.has(`${i.boundary}:${i.type}`))
    expect(unexpected).toEqual([])
    expect(issues.some((i) => i.boundary === '51->52' && i.type === 'edge-orphan')).toBe(true)
  })

  it('every chapter declares an ending hook and a continuation link', () => {
    for (const ch of sorted) {
      if (ch.flashback || ch.chapterNumber === 1) continue
      expect(ch.continuesFrom, `chapter ${ch.chapterNumber} continuesFrom`).toBeTruthy()
      expect(
        typeof ch.ending === 'string' && ch.ending.trim().length > 0,
        `chapter ${ch.chapterNumber} ending`
      ).toBe(true)
    }
  })
})

describe('100-chapter seam continuity (real engine)', () => {
  function buildStates(data) {
    const states = []
    for (const ch of [...data.chapters].sort((a, b) => a.chapterNumber - b.chapterNumber)) {
      states.push(
        ...deriveEntityStates({
          projectId: 'seam-test',
          digest: {
            subsectionId: ch.id,
            chapterNumber: ch.chapterNumber,
            sceneNumber: 1,
            location: LOC_NAME[ch.location],
            charactersPresent: (ch.charactersPresent || []).map((id) => nameOf[id]).filter(Boolean),
            keyFacts: ch.keyFacts || [],
            summary: ch.summary || ''
          }
        })
      )
    }
    return states
  }
  function buildDigests(states) {
    return states.map((s) => ({
      subsectionId: s.sceneId,
      sceneNumber: s.sceneNumber,
      chapterNumber: s.chapterNumber,
      keyFacts: s.sourceFacts,
      summary: ''
    }))
  }

  it('the engine actually emits seam_disconnect for a broken seam (self-test)', async () => {
    // Drop a character who was on stage at the end of ch50 from ch51 entirely,
    // with no recorded death. The real Rule 7 must flag the broken seam.
    const mutated = JSON.parse(JSON.stringify(dataset))
    const c51 = mutated.chapters.find((x) => x.chapterNumber === 51)
    c51.charactersPresent = c51.charactersPresent.filter((id) => id !== 'C1')
    const states = buildStates(mutated)
    const det = await runDeterministicContradictionChecks(buildDigests(states), [], states)
    const seam = det.filter((d) => d.type === 'seam_disconnect')
    expect(seam.length).toBeGreaterThanOrEqual(1)
    expect(seam[0].entityName).toBe('Elias Varn')
    expect(seam[0].description).toMatch(/chapter 50.*chapter 51/)
  })

  it('derives entity states with zero seam_disconnect across the whole book', async () => {
    const states = buildStates(dataset)
    const det = await runDeterministicContradictionChecks(buildDigests(states), [], states)
    const seam = det.filter((d) => d.type === 'seam_disconnect')
    expect(seam).toEqual([])
  })
})

describe('seam validator is meaningful (mutation self-tests)', () => {
  it('catches a broken continuation link', () => {
    const mutated = JSON.parse(JSON.stringify(dataset))
    const c = mutated.chapters.find((x) => x.chapterNumber === 50)
    c.continuesFrom = 'ch-0001'
    const issues = collectSeamIssues(mutated)
    expect(issues.some((i) => i.type === 'continuation-broken' && i.boundary === '49->50')).toBe(
      true
    )
  })

  it('catches a cast-drop seam', () => {
    const mutated = JSON.parse(JSON.stringify(dataset))
    const c = mutated.chapters.find((x) => x.chapterNumber === 50)
    c.charactersPresent = ['C99'] // C99 is not in any prior chapter's cast -> true disjoint
    const issues = collectSeamIssues(mutated)
    expect(issues.some((i) => i.type === 'cast-drop' && i.boundary === '49->50')).toBe(true)
  })

  it('catches an unjustified location teleport', () => {
    const mutated = JSON.parse(JSON.stringify(dataset))
    const c = mutated.chapters.find((x) => x.chapterNumber === 11)
    c.keyFacts = c.keyFacts.filter((f) => !f.includes('Lattice Spire'))
    c.references = []
    const issues = collectSeamIssues(mutated)
    expect(issues.some((i) => i.type === 'location-teleport' && i.boundary === '10->11')).toBe(true)
  })

  it('catches a dangling reference', () => {
    const mutated = JSON.parse(JSON.stringify(dataset))
    const c = mutated.chapters.find((x) => x.chapterNumber === 30)
    c.references = [{ to: 'ch-9999', kind: 'x' }]
    const issues = collectSeamIssues(mutated)
    expect(issues.some((i) => i.type === 'ref-orphan')).toBe(true)
  })
})
