import { describe, it, expect } from 'vitest'
import {
  deriveLabel,
  detectMappingReview,
  splitHeldOut,
  wholeSceneScoreLabel,
  fromConsensusEntry,
  sampleUnflagged,
  buildCalibrationReport
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

describe('fromConsensusEntry', () => {
  it('throws naming overall when overall is absent', () => {
    expect(() =>
      fromConsensusEntry({
        sceneId: 'p0a-sample-01',
        dims: {
          continuity: 'Fine',
          voice: 'Fine',
          show_tell: 'Fine',
          pacing: 'Fine',
          emotional_goal: 'Fine'
        }
      })
    ).toThrow(/overall/)
  })

  it('throws naming dims.continuity when continuity is absent', () => {
    expect(() =>
      fromConsensusEntry({
        sceneId: 'p0a-sample-01',
        overall: 'Keep',
        dims: {
          voice: 'Fine',
          show_tell: 'Fine',
          pacing: 'Fine',
          emotional_goal: 'Fine'
        }
      })
    ).toThrow(/continuity/)
  })

  it('normalizes a valid fixture entry', () => {
    const entry = sample.entries[0]
    expect(fromConsensusEntry(entry)).toEqual({
      sceneId: entry.sceneId,
      overall: entry.overall,
      dims: entry.dims,
      note: entry.note
    })
  })
})

describe('sampleUnflagged', () => {
  it('is deterministic across calls with the default seed', () => {
    const ids = ['p0a-sample-03', 'p0a-sample-01', 'p0a-sample-02']
    expect(sampleUnflagged(ids)).toEqual(sampleUnflagged(ids))
  })

  it('is order-independent (ascending sort before the PRNG)', () => {
    expect(sampleUnflagged(['b', 'a', 'c'])).toEqual(sampleUnflagged(['c', 'b', 'a']))
  })

  it('returns a subset of the unflagged ids and caps at len', () => {
    const ids = sample.entries.map((e) => e.sceneId)
    const out = sampleUnflagged(ids, 20261011, 10)
    expect(out).toHaveLength(Math.min(10, ids.length))
    for (const id of out) {
      expect(ids).toContain(id)
    }
    expect(sampleUnflagged(['a', 'b'], 20261011, 10)).toHaveLength(2)
    expect(sampleUnflagged(['b', 'a', 'c'], 7, 2)).toHaveLength(2)
  })
})

const FROZEN_CONTINUITY_NOTE =
  'Judge continuity is binary (8 = clean, 3 = verified contradiction); it cannot produce a continuity-driven revise — shadow-arm revises come from other dimensions or the mean.'

function loadCalibrationReport() {
  const scenes = sample.entries.map((e) => ({
    ...fromConsensusEntry(e),
    humanOnly: Boolean(e.humanOnly)
  }))
  const judge = Object.fromEntries(sample.entries.map((e) => [e.sceneId, e.judge]))
  return buildCalibrationReport(scenes, judge)
}

describe('buildCalibrationReport', () => {
  it('reports exact distribution, trigger, and Keep-with-Problem counts on the fixture', () => {
    const report = loadCalibrationReport()
    expect(report.distribution).toEqual({
      pass: 2,
      revise: 1,
      rewrite: 3,
      lowConfidence: 0,
      missingLoadBearing: 0
    })
    expect(report.triggers).toEqual({
      'continuity-only': 1,
      'voice-only': 1,
      both: 1
    })
    expect(report.keepWithProblem).toEqual({
      count: 1,
      sceneIds: ['p0a-sample-02']
    })
  })

  it('lists the single mapping-review hit with direction and phrase', () => {
    const report = loadCalibrationReport()
    expect(report.mappingReview.hits).toHaveLength(1)
    const hit = report.mappingReview.hits[0]
    expect(hit.sceneId).toBe('p0a-sample-06')
    expect(hit.direction).toBe('rebuild-on-revise')
    expect(hit.phrase.toLowerCase()).toContain('rebuild')
    const hitIds = new Set(report.mappingReview.hits.map((h) => h.sceneId))
    expect(report.mappingReview.unflaggedSample).toHaveLength(5)
    for (const s of report.mappingReview.unflaggedSample) {
      expect(hitIds.has(s.sceneId)).toBe(false)
    }
  })

  it('reports dual arms with descriptiveOnly on humanOnly and no verdict field', () => {
    const report = loadCalibrationReport()
    expect(report.dual.reviewer.n).toBe(6)
    expect(report.dual.humanOnly.n).toBe(1)
    expect(report.dual.humanOnly.descriptiveOnly).toBe(true)
    expect(Object.keys(report.dual.reviewer).sort()).toEqual([
      'agreement95',
      'n',
      'perClass',
      'weightedKappa'
    ])
    expect(Object.keys(report.dual.humanOnly).sort()).toEqual([
      'agreement95',
      'descriptiveOnly',
      'n',
      'perClass',
      'weightedKappa'
    ])
    for (const arm of [report.dual.reviewer, report.dual.humanOnly]) {
      expect('verdict' in arm).toBe(false)
      expect('pass' in arm).toBe(false)
      expect('fail' in arm).toBe(false)
      expect(Array.isArray(arm.agreement95)).toBe(true)
      expect(arm.agreement95).toHaveLength(2)
      expect(Object.keys(arm.perClass).sort()).toEqual(['pass', 'revise', 'rewrite'])
    }
  })

  it('keeps shadow arms separate with independent per-arm exclusion (never pooled)', () => {
    const report = loadCalibrationReport()
    expect(report.shadow.focused.n).toBe(5)
    expect(report.shadow.focused.excluded).toBe(1)
    expect(report.shadow.combined.n).toBe(6)
    expect(report.shadow.combined.excluded).toBe(0)
    expect(report.shadow.focused.n).not.toBe(report.shadow.combined.n)
    for (const arm of [report.shadow.focused, report.shadow.combined]) {
      expect(typeof arm.matches).toBe('number')
      expect(typeof arm.agreement).toBe('number')
      expect(Array.isArray(arm.agreement95)).toBe(true)
    }
  })

  it('reports rewriteByTrigger for all three triggers with rate, support, and CI', () => {
    const report = loadCalibrationReport()
    expect(Object.keys(report.rewriteByTrigger).sort()).toEqual([
      'both',
      'continuity-only',
      'voice-only'
    ])
    for (const trigger of ['continuity-only', 'voice-only', 'both']) {
      const row = report.rewriteByTrigger[trigger]
      expect(row.support).toBe(1)
      expect(row.rate).toBe(1)
      expect(Array.isArray(row.ci)).toBe(true)
      expect(row.ci).toHaveLength(2)
    }
  })

  it('includes the frozen continuity note verbatim', () => {
    const report = loadCalibrationReport()
    expect(report.notes).toContain(FROZEN_CONTINUITY_NOTE)
  })
})

describe('two-pass consensus arms', () => {
  const FINE_ALL = {
    continuity: 'Fine',
    voice: 'Fine',
    show_tell: 'Fine',
    pacing: 'Fine',
    emotional_goal: 'Fine'
  }

  function judgeEntry(label) {
    return { authoritativeLabel: label, focusedScore: 8, combinedScore: 8 }
  }

  it('(a) reports judge-vs-each-pass with B absent when no passB entries', () => {
    const scenes = [
      {
        sceneId: 'a1',
        humanOnly: false,
        passA: { overall: 'Keep', dims: { ...FINE_ALL }, note: '' }
      },
      {
        sceneId: 'a2',
        humanOnly: false,
        passA: {
          overall: 'Revise',
          dims: { ...FINE_ALL, show_tell: 'Problem' },
          note: ''
        }
      },
      {
        sceneId: 'a3',
        humanOnly: false,
        passA: {
          overall: 'Revise',
          dims: { ...FINE_ALL, continuity: 'Problem' },
          note: ''
        }
      }
    ]
    const judge = {
      a1: judgeEntry('pass'),
      a2: judgeEntry('revise'),
      a3: judgeEntry('rewrite')
    }
    const report = buildCalibrationReport(scenes, judge)
    expect(report.passes.A.n).toBe(3)
    expect(report.passes.A.weightedKappa).toBe(1)
    expect(report.passes.B).toBeUndefined()
  })

  it('(a) reports passes A and B when passB entries exist', () => {
    const scenes = [
      {
        sceneId: 'b1',
        humanOnly: false,
        passA: { overall: 'Keep', dims: { ...FINE_ALL }, note: '' },
        passB: { overall: 'Keep', dims: { ...FINE_ALL }, note: 'second confirms' }
      },
      {
        sceneId: 'b2',
        humanOnly: false,
        passA: {
          overall: 'Revise',
          dims: { ...FINE_ALL, continuity: 'Problem' },
          note: ''
        },
        passB: {
          overall: 'Revise',
          dims: { ...FINE_ALL, continuity: 'Problem' },
          note: 'second confirms'
        }
      },
      {
        sceneId: 'b3',
        humanOnly: false,
        passA: { overall: 'Keep', dims: { ...FINE_ALL }, note: '' }
      }
    ]
    const judge = {
      b1: judgeEntry('pass'),
      b2: judgeEntry('rewrite'),
      b3: judgeEntry('pass')
    }
    const report = buildCalibrationReport(scenes, judge)
    expect(report.passes.A.n).toBe(3)
    expect(report.passes.A.weightedKappa).toBe(1)
    expect(report.passes.B.n).toBe(2)
    expect(report.passes.B.weightedKappa).toBe(1)
  })

  it('(b) agreedOnly contains only agreeing scenes, optimistic true, no headline', () => {
    const scenes = [
      {
        sceneId: 'c1',
        humanOnly: false,
        passA: { overall: 'Keep', dims: { ...FINE_ALL }, note: '' },
        passB: { overall: 'Keep', dims: { ...FINE_ALL }, note: 'agree' }
      },
      {
        sceneId: 'c2',
        humanOnly: false,
        passA: {
          overall: 'Revise',
          dims: { ...FINE_ALL, continuity: 'Problem' },
          note: ''
        },
        passB: {
          overall: 'Revise',
          dims: { ...FINE_ALL, continuity: 'Problem' },
          note: 'agree'
        }
      },
      {
        sceneId: 'c3',
        humanOnly: false,
        passA: { overall: 'Keep', dims: { ...FINE_ALL }, note: '' },
        passB: {
          overall: 'Revise',
          dims: { ...FINE_ALL, continuity: 'Problem' },
          note: 'disagree'
        }
      }
    ]
    const judge = {
      c1: judgeEntry('pass'),
      c2: judgeEntry('rewrite'),
      c3: judgeEntry('pass')
    }
    const report = buildCalibrationReport(scenes, judge)
    expect(report.agreedOnly.n).toBe(2)
    expect(report.agreedOnly.optimistic).toBe(true)
    expect(report.agreedOnly.weightedKappa).toBe(1)
    expect('headline' in report).toBe(false)
  })

  it('(c) adjudicated arm derives from adjudicated entries with count reported', () => {
    const scenes = [
      {
        sceneId: 'd1',
        humanOnly: false,
        passA: { overall: 'Keep', dims: { ...FINE_ALL }, note: '' },
        adjudicated: {
          overall: 'Revise',
          dims: { ...FINE_ALL, show_tell: 'Problem' },
          note: 'adj'
        }
      },
      {
        sceneId: 'd2',
        humanOnly: false,
        passA: {
          overall: 'Revise',
          dims: { ...FINE_ALL, continuity: 'Problem' },
          note: ''
        },
        adjudicated: {
          overall: 'Revise',
          dims: { ...FINE_ALL, continuity: 'Problem' },
          note: 'adj'
        }
      },
      {
        sceneId: 'd3',
        humanOnly: false,
        passA: { overall: 'Keep', dims: { ...FINE_ALL }, note: '' }
      }
    ]
    const judge = {
      d1: judgeEntry('revise'),
      d2: judgeEntry('rewrite'),
      d3: judgeEntry('pass')
    }
    const report = buildCalibrationReport(scenes, judge)
    expect(report.adjudicated.n).toBe(2)
    expect(report.adjudicated.count).toBe(2)
    expect(report.adjudicated.weightedKappa).toBe(1)
  })

  it('(d) disagreements reports count, rate, rateCI95 of passA-vs-passB mismatches', () => {
    const scenes = [
      {
        sceneId: 'e1',
        humanOnly: false,
        passA: { overall: 'Keep', dims: { ...FINE_ALL }, note: '' },
        passB: { overall: 'Keep', dims: { ...FINE_ALL }, note: 'agree' }
      },
      {
        sceneId: 'e2',
        humanOnly: false,
        passA: { overall: 'Keep', dims: { ...FINE_ALL }, note: '' },
        passB: {
          overall: 'Revise',
          dims: { ...FINE_ALL, continuity: 'Problem' },
          note: 'disagree'
        }
      }
    ]
    const judge = { e1: judgeEntry('pass'), e2: judgeEntry('pass') }
    const report = buildCalibrationReport(scenes, judge)
    expect(report.disagreements.count).toBe(1)
    expect(report.disagreements.rate).toBeCloseTo(0.5, 10)
    expect(Array.isArray(report.disagreements.rateCI95)).toBe(true)
    expect(report.disagreements.rateCI95).toHaveLength(2)
  })

  it('(e) single-pass scenes still work exactly as before', () => {
    const scenes = [
      {
        sceneId: 'f1',
        overall: 'Keep',
        dims: { ...FINE_ALL },
        note: '',
        humanOnly: false
      },
      {
        sceneId: 'f2',
        overall: 'Revise',
        dims: { ...FINE_ALL, continuity: 'Problem' },
        note: '',
        humanOnly: false
      }
    ]
    const judge = { f1: judgeEntry('pass'), f2: judgeEntry('rewrite') }
    const report = buildCalibrationReport(scenes, judge)
    expect(report.distribution).toEqual({
      pass: 1,
      revise: 0,
      rewrite: 1,
      lowConfidence: 0,
      missingLoadBearing: 0
    })
    expect(report.dual.reviewer.n).toBe(2)
    expect(report.passes.A.n).toBe(2)
    expect(report.passes.B).toBeUndefined()
    expect(report.disagreements.count).toBe(0)
    expect(report.adjudicated).toBeUndefined()
    expect(report.agreedOnly.optimistic).toBe(true)
    expect(report.agreedOnly.n).toBe(0)
  })
})
