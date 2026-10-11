import { describe, it, expect } from 'vitest'
import {
  deriveLabel,
  detectMappingReview,
  splitHeldOut,
  wholeSceneScoreLabel
} from '../../evaluation/labelDerivation'
import sample from './fixtures/p0a-calibration-sample.json'

// P0-A judge calibration: derive pass/revise/rewrite from the frozen v1
// Keep/Revise + per-dimension Problem/Fine/Unsure marks (design spec:
// docs/superpowers/specs/2026-10-11-p0a-label-derivation-design.md §1).
// Load-bearing dims are continuity + voice only.

const FINE_LOAD_BEARING = { continuity: 'Fine', voice: 'Fine' }

describe('deriveLabel', () => {
  it('maps Keep with clean dims to pass with no flags', () => {
    const result = deriveLabel({
      overall: 'Keep',
      dims: {
        ...FINE_LOAD_BEARING,
        show_tell: 'Fine',
        pacing: 'Fine',
        emotional_goal: 'Fine'
      }
    })
    expect(result).toEqual({
      label: 'pass',
      lowConfidence: false,
      keepWithProblem: false,
      missingLoadBearing: false
    })
  })

  it('maps Keep with a continuity Problem to pass flagged keepWithProblem', () => {
    const result = deriveLabel({
      overall: 'Keep',
      dims: {
        continuity: 'Problem',
        voice: 'Fine',
        show_tell: 'Fine',
        pacing: 'Fine',
        emotional_goal: 'Fine'
      }
    })
    expect(result.label).toBe('pass')
    expect(result.keepWithProblem).toBe(true)
    expect(result.lowConfidence).toBe(false)
    expect(result.missingLoadBearing).toBe(false)
  })

  it('maps Revise + continuity Problem to rewrite with continuity-only trigger', () => {
    const result = deriveLabel({
      overall: 'Revise',
      dims: {
        continuity: 'Problem',
        voice: 'Fine',
        show_tell: 'Fine',
        pacing: 'Fine',
        emotional_goal: 'Fine'
      }
    })
    expect(result.label).toBe('rewrite')
    expect(result.trigger).toBe('continuity-only')
    expect(result.keepWithProblem).toBe(false)
    expect(result.missingLoadBearing).toBe(false)
  })

  it('maps Revise + voice Problem to rewrite with voice-only trigger', () => {
    const result = deriveLabel({
      overall: 'Revise',
      dims: {
        continuity: 'Fine',
        voice: 'Problem',
        show_tell: 'Fine',
        pacing: 'Fine',
        emotional_goal: 'Fine'
      }
    })
    expect(result.label).toBe('rewrite')
    expect(result.trigger).toBe('voice-only')
    expect(result.keepWithProblem).toBe(false)
    expect(result.missingLoadBearing).toBe(false)
  })

  it('maps Revise + both load-bearing Problems to rewrite with both trigger', () => {
    const result = deriveLabel({
      overall: 'Revise',
      dims: {
        continuity: 'Problem',
        voice: 'Problem',
        show_tell: 'Fine',
        pacing: 'Fine',
        emotional_goal: 'Fine'
      }
    })
    expect(result.label).toBe('rewrite')
    expect(result.trigger).toBe('both')
    expect(result.keepWithProblem).toBe(false)
    expect(result.missingLoadBearing).toBe(false)
  })

  it('maps Revise + advisory-only Problem to revise with no low-confidence flag', () => {
    const result = deriveLabel({
      overall: 'Revise',
      dims: {
        ...FINE_LOAD_BEARING,
        show_tell: 'Problem',
        pacing: 'Fine',
        emotional_goal: 'Fine'
      }
    })
    expect(result.label).toBe('revise')
    expect(result.lowConfidence).toBe(false)
    expect(result.keepWithProblem).toBe(false)
    expect(result.missingLoadBearing).toBe(false)
  })

  it('maps Revise + Unsure-only on load-bearing dims to revise flagged low-confidence', () => {
    const result = deriveLabel({
      overall: 'Revise',
      dims: {
        continuity: 'Unsure',
        voice: 'Unsure',
        show_tell: 'Fine',
        pacing: 'Fine',
        emotional_goal: 'Fine'
      }
    })
    expect(result.label).toBe('revise')
    expect(result.lowConfidence).toBe(true)
    expect(result.missingLoadBearing).toBe(false)
  })

  it('flags a missing continuity key as revise + missingLoadBearing, never silently mapped', () => {
    const result = deriveLabel({
      overall: 'Revise',
      dims: {
        voice: 'Fine',
        show_tell: 'Fine',
        pacing: 'Fine',
        emotional_goal: 'Fine'
      }
    })
    expect(result.label).toBe('revise')
    expect(result.missingLoadBearing).toBe(true)
  })

  it('flags Unsure on either load-bearing dim as low-confidence alongside other signals', () => {
    const withContinuityUnsure = deriveLabel({
      overall: 'Revise',
      dims: {
        continuity: 'Unsure',
        voice: 'Fine',
        show_tell: 'Problem',
        pacing: 'Fine',
        emotional_goal: 'Fine'
      }
    })
    expect(withContinuityUnsure.label).toBe('revise')
    expect(withContinuityUnsure.lowConfidence).toBe(true)

    const withVoiceUnsure = deriveLabel({
      overall: 'Revise',
      dims: {
        continuity: 'Fine',
        voice: 'Unsure',
        show_tell: 'Fine',
        pacing: 'Problem',
        emotional_goal: 'Fine'
      }
    })
    expect(withVoiceUnsure.label).toBe('revise')
    expect(withVoiceUnsure.lowConfidence).toBe(true)
  })

  it('covers the six calibration shapes in the fixture with exact dimension keys', () => {
    expect(sample.entries).toHaveLength(6)
    for (const entry of sample.entries) {
      expect(Object.keys(entry.dims)).toEqual([
        'continuity',
        'voice',
        'show_tell',
        'pacing',
        'emotional_goal'
      ])
    }
    const byId = Object.fromEntries(sample.entries.map((e) => [e.sceneId, e]))
    expect(deriveLabel(byId['p0a-sample-01']).label).toBe('pass')
    expect(deriveLabel(byId['p0a-sample-02']).keepWithProblem).toBe(true)
    expect(deriveLabel(byId['p0a-sample-03']).trigger).toBe('continuity-only')
    expect(deriveLabel(byId['p0a-sample-04']).trigger).toBe('voice-only')
    expect(deriveLabel(byId['p0a-sample-05']).trigger).toBe('both')
    expect(deriveLabel(byId['p0a-sample-06']).label).toBe('revise')
  })
})

describe('detectMappingReview', () => {
  it('flags rebuild language on derived-revise as needing mapping review', () => {
    expect(
      detectMappingReview('revise', 'This scene is fundamentally broken and needs rebuilding')
    ).toBe(true)
  })

  it('flags fix-in-place language on derived-rewrite as needing mapping review', () => {
    expect(
      detectMappingReview('rewrite', 'Just a quick fix — tighten the dialogue and trim the ending')
    ).toBe(true)
  })

  it('ignores clean notes on either derived label', () => {
    expect(detectMappingReview('revise', 'Solid pacing with a satisfying emotional payoff')).toBe(
      false
    )
    expect(detectMappingReview('rewrite', 'Solid pacing with a satisfying emotional payoff')).toBe(
      false
    )
  })

  it('does not flag the capitalized nationality "Polish" on either label', () => {
    expect(detectMappingReview('revise', 'the Polish dialogue sings')).toBe(false)
    expect(detectMappingReview('rewrite', 'the Polish dialogue sings')).toBe(false)
  })

  it('documents sentence-initial "Polish" as an accepted miss (capitalized verb)', () => {
    expect(detectMappingReview('rewrite', 'Polish the transitions in act two')).toBe(false)
  })

  it('flags negated rebuild language for human disposal (scan proposes, human disposes)', () => {
    expect(detectMappingReview('revise', 'there is no need to rewrite this scene')).toBe(true)
  })

  it('flags the lowercase polish verb on derived-rewrite (fix-class contradicts rewrite, not revise)', () => {
    expect(detectMappingReview('rewrite', 'needs a polish in act two')).toBe(true)
    expect(detectMappingReview('revise', 'needs a polish in act two')).toBe(false)
  })

  it('flags multi-hit fix language with word boundaries on derived-rewrite', () => {
    expect(detectMappingReview('rewrite', 'Trade talks need polish and trim')).toBe(true)
  })
})

describe('splitHeldOut', () => {
  it('is deterministic (same input twice yields identical output)', () => {
    const scenes = sample.entries.map((e) => ({ sceneId: e.sceneId }))
    expect(splitHeldOut(scenes)).toEqual(splitHeldOut(scenes))
  })

  it('covers all 6 fixture sceneIds with disjoint sets and no duplicates', () => {
    const scenes = sample.entries.map((e) => ({ sceneId: e.sceneId }))
    const { setA, setB } = splitHeldOut(scenes)
    const all = [...setA, ...setB]
    expect(all).toHaveLength(6)
    expect(new Set(all).size).toBe(6)
    for (const e of sample.entries) {
      expect(all).toContain(e.sceneId)
    }
    for (const id of setA) {
      expect(setB).not.toContain(id)
    }
  })

  // Pinned SHA-256 first-byte parity assignments.
  // Worked example: echo -n "p0a-sample-02" | sha256sum
  // → a47a1ba666a94f43d1305801751d387e1325858c5f859235eb95f02923ff7a79
  // → first byte 0xa4 = 164, even → SET-A.
  it('pins the frozen SET-A/SET-B fixture assignment', () => {
    const scenes = sample.entries.map((e) => ({ sceneId: e.sceneId }))
    const { setA, setB } = splitHeldOut(scenes)
    expect([...setA].sort()).toEqual(['p0a-sample-02', 'p0a-sample-05'])
    expect([...setB].sort()).toEqual([
      'p0a-sample-01',
      'p0a-sample-03',
      'p0a-sample-04',
      'p0a-sample-06'
    ])
  })
})

describe('wholeSceneScoreLabel', () => {
  it.each([
    [8, 'pass'],
    [7, 'pass'],
    [6.9, 'revise'],
    [5, 'revise'],
    [4.9, 'rewrite'],
    [0, 'rewrite']
  ])('maps score %s to %s', (score, expected) => {
    expect(wholeSceneScoreLabel(score)).toBe(expected)
  })

  it.each([[null], [NaN], [undefined]])('maps %s to excluded (never defaulted)', (score) => {
    expect(wholeSceneScoreLabel(score)).toBe('excluded')
  })
})
