import { describe, it, expect } from 'vitest'
import {
  orderScenesForRater,
  parseStudyPack,
  validatePassLabel,
  validateRaterId
} from '@/services/humanReviewPack'

const scenes = Array.from({ length: 12 }, (_, i) => ({
  sceneId: `scene-${i + 1}`,
  sceneTitle: `Scene ${i + 1}`,
  text: `Plain prose for scene ${i + 1}.`,
  brief: `Brief for scene ${i + 1}.`,
  facts: [`Fact for scene ${i + 1}.`]
}))

function pack(overrides = {}) {
  return {
    studyId: 'gate-human-pilot-v1',
    rubricVersion: 'v1',
    title: 'Gate human-reference pilot',
    scenes,
    ...overrides
  }
}

describe('parseStudyPack', () => {
  it('accepts the frozen 12-scene v1 pack and records a stable hash', () => {
    const parsed = parseStudyPack(pack())
    expect(parsed.rubricVersion).toBe('v1')
    expect(parsed.scenes).toHaveLength(12)
    expect(parsed.packHash).toMatch(/^[a-f0-9]{64}$/)

    const reordered = parseStudyPack({
      scenes: scenes.map((s) => ({
        facts: s.facts,
        text: s.text,
        sceneTitle: s.sceneTitle,
        brief: s.brief,
        sceneId: s.sceneId
      })),
      title: 'Gate human-reference pilot',
      rubricVersion: 'v1',
      studyId: 'gate-human-pilot-v1'
    })
    expect(reordered.packHash).toBe(parsed.packHash)
  })

  it('refuses a non-v1 rubric or the wrong scene count', () => {
    expect(() => parseStudyPack(pack({ rubricVersion: 'v2' }))).toThrow(/rubric/i)
    expect(() => parseStudyPack(pack({ scenes: scenes.slice(0, 11) }))).toThrow(/12 scenes/i)
    expect(() => parseStudyPack(pack({ scenes: [...scenes, scenes[0]] }))).toThrow(/12 scenes/i)
  })

  it('refuses duplicate scene ids and empty prose', () => {
    const duplicate = scenes.map((s, i) => (i === 1 ? { ...s, sceneId: 'scene-1' } : s))
    expect(() => parseStudyPack(pack({ scenes: duplicate }))).toThrow(/duplicate/i)

    const empty = scenes.map((s, i) => (i === 0 ? { ...s, text: '   ' } : s))
    expect(() => parseStudyPack(pack({ scenes: empty }))).toThrow(/text/i)
  })

  it('refuses critic or gate output in a pack, so the rater cannot see it', () => {
    const leaked = scenes.map((s, i) => (i === 0 ? { ...s, critique: 'The gate failed.' } : s))
    expect(() => parseStudyPack(pack({ scenes: leaked }))).toThrow(/critic|gate|allowed/i)

    expect(() => parseStudyPack({ ...pack(), gateResults: { score: 3 } })).toThrow(
      /critic|gate|allowed/i
    )
  })
})

describe('rater identity', () => {
  it('accepts anonymous participant codes and trims them', () => {
    expect(validateRaterId('  Rater A ')).toBe('Rater A')
    expect(validateRaterId('participant_04')).toBe('participant_04')
  })

  it('refuses AI/model names that would fail the human-provenance metadata check', () => {
    for (const name of ['claude-pass1', 'GPT-4o', 'qwen3', 'model-generated']) {
      expect(() => validateRaterId(name)).toThrow(/anonymous|model|human/i)
    }
  })

  it('refuses empty, overlong or unsafe ids', () => {
    expect(() => validateRaterId('')).toThrow()
    expect(() => validateRaterId('a'.repeat(41))).toThrow()
    expect(() => validateRaterId('<script>')).toThrow()
  })

  it('accepts a pass label or falls back to Pass 1', () => {
    expect(validatePassLabel('')).toBe('Pass 1')
    expect(validatePassLabel(' Re-label ')).toBe('Re-label')
    expect(() => validatePassLabel('x'.repeat(41))).toThrow()
  })
})

describe('orderScenesForRater', () => {
  const seed = {
    studyId: 'gate-human-pilot-v1',
    packHash: 'abc123',
    raterId: 'Rater A',
    passLabel: 'Pass 1'
  }

  it('is deterministic for a roter and contains every scene exactly once', () => {
    const a = orderScenesForRater(scenes, seed)
    const b = orderScenesForRater(scenes, seed)
    expect(a.map((s) => s.sceneId)).toEqual(b.map((s) => s.sceneId))
    expect(a.map((s) => s.sceneId).sort()).toEqual(scenes.map((s) => s.sceneId).sort())
  })

  it('gives different raters different orders', () => {
    const a = orderScenesForRater(scenes, seed).map((s) => s.sceneId)
    const b = orderScenesForRater(scenes, { ...seed, raterId: 'Rater B' }).map((s) => s.sceneId)
    expect(a).not.toEqual(b)
  })
})
