import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/db-digests', () => ({
  getProjectDigests: vi.fn(),
  getProjectChapterDigests: vi.fn(),
  getProjectVolumeDigests: vi.fn(),
  getEntityStateTimeline: vi.fn()
}))
vi.mock('@/composables/useAiService', () => ({
  aiGenerateJson: vi.fn()
}))

import { detectContradictions } from '@/composables/betareader/contradictionDetector'
import {
  getProjectDigests,
  getProjectChapterDigests,
  getProjectVolumeDigests,
  getEntityStateTimeline
} from '@/services/db-digests'
import { aiGenerateJson } from '@/composables/useAiService'

// Pass-1 chapter grouping, through the public detector interface with the
// system edges (DB, LLM) mocked. Kael dies in chapter 1 and reappears in
// chapter 2 with no revival recorded: one deterministic error spanning two
// chapters, plus one LLM candidate pair the stubbed model clears.

const st = (over = {}) => ({
  projectId: 'p1',
  entityType: 'character',
  entityId: '~kael',
  entityName: 'Kael',
  sceneNumber: 1,
  sourceFacts: [],
  stateHash: 'h',
  version: 1,
  updatedAt: 'T',
  ...over
})
const flags = (over = {}) => ({
  present: false,
  status: 'unknown',
  condition: 'intact',
  location: null,
  attributes: {},
  knows: [],
  ...over
})

const scenes = [
  { id: 's1', sceneNumber: 1, projectId: 'p1' },
  { id: 's2', sceneNumber: 2, projectId: 'p1' }
]

beforeEach(() => {
  vi.resetAllMocks()
  getProjectDigests.mockResolvedValue([])
  getProjectChapterDigests.mockResolvedValue([])
  getProjectVolumeDigests.mockResolvedValue([])
  getEntityStateTimeline.mockResolvedValue([
    st({ sceneId: 's1', sceneNumber: 1, chapterNumber: 1, state: flags({ status: 'dead' }) }),
    st({
      sceneId: 's2',
      sceneNumber: 2,
      chapterNumber: 2,
      state: flags({ present: true, status: 'healthy' })
    })
  ])
  aiGenerateJson.mockResolvedValue(null)
})

describe('detectContradictions chapter grouping', () => {
  it('prefixes finding ids with the first scene chapter when chapters span', async () => {
    const out = await detectContradictions([], scenes, {})
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('contradiction-1-0')
    expect(out[0].category).toBe('dead_then_alive')
    expect(out[0].betweenScenes).toEqual(['Scene 1', 'Scene 2'])
  })

  it('reports cross-chapter resurrection as a warning from the rollup level', async () => {
    // Pass-1 scene rules are chapter-scoped: a death in ch1 with the
    // reappearance in ch2 is invisible to them. Pass 2 owns the pair and
    // calls it what it is at that distance — a warning, not an error.
    const out = await detectContradictions([], scenes, {})
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('warning')
    expect(out[0].category).toBe('dead_then_alive')
  })

  it('keeps legacy ids when everything sits in one chapter', async () => {
    getEntityStateTimeline.mockResolvedValue([
      st({ sceneId: 's1', sceneNumber: 1, chapterNumber: 1, state: flags({ status: 'dead' }) }),
      st({
        sceneId: 's2',
        sceneNumber: 2,
        chapterNumber: 1,
        state: flags({ present: true, status: 'healthy' })
      })
    ])
    const out = await detectContradictions([], scenes, {})
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('contradiction-0')
  })

  it('indexes per chapter in rule order and leaves unplaced findings legacy', async () => {
    const scenes3 = [...scenes, { id: 's3', sceneNumber: 3, projectId: 'p1' }]
    getEntityStateTimeline.mockResolvedValue([
      // Kael: dies ch1, reappears ch2.
      st({ sceneId: 's1', sceneNumber: 1, chapterNumber: 1, state: flags({ status: 'dead' }) }),
      st({
        sceneId: 's2',
        sceneNumber: 2,
        chapterNumber: 2,
        state: flags({ present: true, status: 'healthy' })
      }),
      // Mira: dies and reappears within ch2.
      st({
        entityId: '~mira',
        entityName: 'Mira',
        sceneId: 's2',
        sceneNumber: 2,
        chapterNumber: 2,
        state: flags({ status: 'dead' })
      }),
      st({
        entityId: '~mira',
        entityName: 'Mira',
        sceneId: 's3',
        sceneNumber: 3,
        chapterNumber: 2,
        state: flags({ present: true, status: 'healthy' })
      }),
      // Rin: dies somewhere unplaced, reappears ch1 — first scene
      // resolves to no chapter, so the legacy id survives the prefixing.
      st({
        entityId: '~rin',
        entityName: 'Rin',
        sceneId: 'sx',
        sceneNumber: null,
        chapterNumber: null,
        state: flags({ status: 'dead' })
      }),
      st({
        entityId: '~rin',
        entityName: 'Rin',
        sceneId: 's1',
        sceneNumber: 1,
        chapterNumber: 1,
        state: flags({ present: true, status: 'healthy' })
      })
    ])
    const out = await detectContradictions([], scenes3, {})
    // Other rules (seam, timeline) legitimately fire on a sparse
    // multi-chapter fixture; grouping is asserted on the rule under test.
    const deaths = out.filter((r) => r.category === 'dead_then_alive')
    // Order is Pass-1 groups first (Mira, ch2-local, still an error)
    // then Pass 2 (Kael's span and Rin's backfill gap, both warnings).
    expect(deaths.map((r) => r.id)).toEqual([
      'contradiction-2-0',
      'contradiction-1-0',
      expect.stringMatching(/^contradiction-\d+$/)
    ])
    expect(deaths.map((r) => r.severity)).toEqual(['error', 'warning', 'warning'])
  })

  it('surfaces volume drift with a legacy id (no scenes to attribute)', async () => {
    getProjectVolumeDigests.mockResolvedValue([
      { volumeId: 'v1', charactersPresent: ['Kael', 'Mira'], locations: ['Harbor'] },
      { volumeId: 'v2', charactersPresent: ['Jax', 'Pell'], locations: ['Desert'] }
    ])
    getProjectChapterDigests.mockResolvedValue([
      { chapterNumber: 1, volumeId: 'v1', summary: 'Harbor days' },
      { chapterNumber: 2, volumeId: 'v2', summary: 'Desert days' }
    ])
    const out = await detectContradictions([], scenes, {})
    const drift = out.filter((r) => r.category === 'volume_drift')
    expect(drift.length).toBeGreaterThan(0)
    expect(drift[0]).toMatchObject({ severity: 'warning' })
    expect(drift[0].id).toMatch(/^contradiction-\d+$/)
    expect(drift[0].description).toContain('chapter 1')
  })
})
