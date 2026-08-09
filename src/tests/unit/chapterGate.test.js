import { describe, it, expect } from 'vitest'
import {
  evaluateChapter,
  describeChapterGate,
  shortestScenes,
  CHAPTER_SHORT_RATIO,
  CHAPTER_LONG_RATIO
} from '../../services/generation/chapterGate'

/** Distinct, non-looping prose of roughly `words` words. */
function prose(seed, words) {
  const sentences = []
  for (let i = 0; i < words; i += 9) {
    sentences.push(`${seed} beat ${i} moved the scene onward with fresh detail here.`)
  }
  return sentences.join(' ')
}

function scene(seed, words, extra = {}) {
  return {
    title: `Scene ${seed}`,
    sceneNumber: seed,
    prose: prose(`S${seed}`, words),
    characters: ['Ana'],
    ...extra
  }
}

function plan(count, estimatedWords, extra = {}) {
  return Array.from({ length: count }, (_, i) => ({
    sceneNumber: i + 1,
    title: `Scene ${i + 1}`,
    estimatedWords,
    ...extra
  }))
}

function codes(report) {
  return report.findings.map((f) => f.code)
}

describe('chapterGate — stage A: structure and prose', () => {
  it('passes a clean chapter with no findings', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200), scene(2, 200), scene(3, 200)],
      plan: plan(3, 200),
      targetWords: 600
    })
    expect(report.passed).toBe(true)
    expect(report.findings).toEqual([])
    expect(report.metrics.sceneCount).toBe(3)
    expect(report.metrics.continuityIssues).toBe(0)
  })

  it('blocks when a planned scene never produced prose', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200), null, scene(3, 200)],
      plan: plan(3, 200),
      targetWords: 600
    })
    expect(report.passed).toBe(false)
    expect(codes(report)).toContain('missing_prose')
    expect(report.findings.find((f) => f.code === 'missing_prose').sceneIndices).toEqual([2])
  })

  it('blocks on empty or whitespace-only prose', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200), { title: 'S2', prose: '   ' }],
      plan: plan(2, 200),
      targetWords: 400
    })
    expect(report.passed).toBe(false)
    expect(codes(report)).toContain('empty_prose')
  })

  it('blocks a looping chapter on the whole-chapter duplicate ratio', () => {
    const loop = Array.from(
      { length: 40 },
      () => 'The lantern guttered against the wall and went out again.'
    ).join(' ')
    const report = evaluateChapter({
      scenes: [{ title: 'S1', prose: loop, characters: [] }],
      plan: plan(1, 400),
      targetWords: 400
    })
    expect(report.passed).toBe(false)
    expect(codes(report)).toContain('chapter_duplicate')
    expect(report.metrics.chapterDuplicateRatio).toBeGreaterThan(0.15)
  })

  it('warns when two scenes tell the same beat', () => {
    const shared = prose('shared', 200)
    const report = evaluateChapter({
      scenes: [
        { title: 'S1', prose: shared, characters: [] },
        { title: 'S2', prose: shared, characters: [] }
      ],
      plan: plan(2, 200),
      targetWords: 400
    })
    const finding = report.findings.find((f) => f.code === 'cross_scene_repetition')
    expect(finding).toBeDefined()
    expect(finding.severity).toBe('warn')
    expect(finding.sceneIndices).toEqual([1, 2])
  })

  it('blocks on a model refusal at the head of a scene', () => {
    const report = evaluateChapter({
      scenes: [{ title: 'S1', prose: "I'm sorry, but I can't write that scene.", characters: [] }],
      plan: plan(1, 200),
      targetWords: 200
    })
    expect(report.passed).toBe(false)
    expect(codes(report)).toContain('refusal_prose')
  })

  it('does not mistake a character refusing for a model refusing', () => {
    const dialogue = `"I'm sorry, but I can't," she said. ${prose('S1', 200)}`
    const report = evaluateChapter({
      scenes: [{ title: 'S1', prose: dialogue, characters: [] }],
      plan: plan(1, 200),
      targetWords: 200
    })
    expect(codes(report)).not.toContain('refusal_prose')
  })

  it('warns — never blocks — when the chapter comes in short', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 100)],
      plan: plan(1, 1000),
      targetWords: 1000
    })
    const finding = report.findings.find((f) => f.code === 'chapter_short')
    expect(finding).toBeDefined()
    expect(finding.severity).toBe('warn')
    expect(report.passed).toBe(true)
    expect(report.metrics.wordRatio).toBeLessThan(CHAPTER_SHORT_RATIO)
  })

  it('warns when the chapter badly overruns its target', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 900)],
      plan: plan(1, 300),
      targetWords: 300
    })
    expect(codes(report)).toContain('chapter_long')
    expect(report.metrics.wordRatio).toBeGreaterThan(CHAPTER_LONG_RATIO)
    expect(report.passed).toBe(true)
  })

  it('blocks when metadata extraction failed anywhere', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200), scene(2, 200)],
      plan: plan(2, 200),
      targetWords: 400,
      metadataFailed: 1
    })
    expect(report.passed).toBe(false)
    expect(codes(report)).toContain('metadata_failed')
  })

  it('blocks when metadata was skipped on every scene, but not on some', () => {
    const some = evaluateChapter({
      scenes: [scene(1, 200), scene(2, 200)],
      plan: plan(2, 200),
      targetWords: 400,
      metadataSkipped: 1
    })
    expect(codes(some)).not.toContain('metadata_skipped_all')

    const all = evaluateChapter({
      scenes: [scene(1, 200), scene(2, 200)],
      plan: plan(2, 200),
      targetWords: 400,
      metadataSkipped: 2
    })
    expect(all.passed).toBe(false)
    expect(codes(all)).toContain('metadata_skipped_all')
  })

  it('warns when a scene does not cast the POV character the plan declared', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200, { characters: ['Bram'] })],
      plan: plan(1, 200, { pov: 'Ana' }),
      targetWords: 200
    })
    const finding = report.findings.find((f) => f.code === 'pov_drift')
    expect(finding).toBeDefined()
    expect(finding.severity).toBe('warn')
  })
})

describe('chapterGate — stage B: aggregate critiques', () => {
  it('blocks when more than a third of the scenes still fail critique', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200), scene(2, 200), scene(3, 200)],
      plan: plan(3, 200),
      targetWords: 600,
      verdicts: [
        { sceneIndex: 1, passed: false },
        { sceneIndex: 2, passed: false },
        { sceneIndex: 3, passed: true }
      ]
    })
    expect(report.passed).toBe(false)
    expect(codes(report)).toContain('verdicts_failed')
    expect(report.metrics.scenesBelowFloor).toBe(2)
  })

  it('tolerates one failed scene in three', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200), scene(2, 200), scene(3, 200)],
      plan: plan(3, 200),
      targetWords: 600,
      verdicts: [
        { sceneIndex: 1, passed: false },
        { sceneIndex: 2, passed: true },
        { sceneIndex: 3, passed: true }
      ]
    })
    expect(codes(report)).not.toContain('verdicts_failed')
  })

  it('warns on the weakest dimension across the chapter', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200)],
      plan: plan(1, 200),
      targetWords: 200,
      verdicts: [{ sceneIndex: 1, passed: true, dimensionScores: { voice: 5, pacing: 8 } }]
    })
    expect(codes(report)).toContain('weak_dimension')
    expect(report.metrics.weakestDimension).toEqual({ name: 'voice', score: 5 })
    expect(report.passed).toBe(true)
  })

  it('blocks only when the critic judged nothing at all', () => {
    const some = evaluateChapter({
      scenes: [scene(1, 200), scene(2, 200)],
      plan: plan(2, 200),
      targetWords: 400,
      verdicts: [
        { sceneIndex: 1, evalUnavailable: true },
        { sceneIndex: 2, passed: true }
      ]
    })
    expect(codes(some)).toContain('eval_unavailable')
    expect(some.passed).toBe(true)

    const none = evaluateChapter({
      scenes: [scene(1, 200), scene(2, 200)],
      plan: plan(2, 200),
      targetWords: 400,
      verdicts: [
        { sceneIndex: 1, evalUnavailable: true },
        { sceneIndex: 2, evalUnavailable: true }
      ]
    })
    expect(none.passed).toBe(false)
    expect(codes(none)).toContain('eval_unavailable_all')
  })

  it('blocks when more than 30% of the scenes are degraded', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200), scene(2, 200), scene(3, 200)],
      plan: plan(3, 200),
      targetWords: 600,
      degradedScenes: 2
    })
    expect(report.passed).toBe(false)
    expect(codes(report)).toContain('degraded_scenes')
  })
})

describe('chapterGate — stages C and D', () => {
  it('blocks on continuity issues the audit could not resolve', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200)],
      plan: plan(1, 200),
      targetWords: 200,
      continuity: { issueCount: 3 }
    })
    expect(report.passed).toBe(false)
    expect(codes(report)).toContain('continuity_unresolved')
    expect(report.metrics.continuityIssues).toBe(3)
  })

  it('treats a low coherence score as advisory only', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200)],
      plan: plan(1, 200),
      targetWords: 200,
      coherence: { arc: 3, pacing: 8, voice: 9 }
    })
    expect(report.passed).toBe(true)
    expect(codes(report)).toContain('weak_coherence')
    expect(report.metrics.coherence).toEqual({ arc: 3, pacing: 8, voice: 9 })
  })
})

describe('chapterGate — reporting helpers', () => {
  it('describes a report in one readable block', () => {
    const report = evaluateChapter({
      scenes: [scene(1, 200), null],
      plan: plan(2, 200),
      targetWords: 400
    })
    const text = describeChapterGate(report)
    expect(text).toContain('Chapter gate found blocking issues')
    expect(text).toContain('missing_prose')
    expect(text).toContain('2 scene(s)')
  })

  it('picks the two shortest scenes for the expansion round, skipping holes', () => {
    const picked = shortestScenes([scene(1, 400), null, scene(3, 90), scene(4, 150)])
    expect(picked).toHaveLength(2)
    expect(picked.map((p) => p.index)).toEqual([2, 3])
  })
})
