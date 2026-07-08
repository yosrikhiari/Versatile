import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockProjectStore = {
  activeWorkspaceType: 'creative'
}
const mockAiStream = vi.fn(async (user, system, onChunk, opts) => {
  try {
    const res = await mockAiGenerate(user, system, opts)
    onChunk(res)
  } catch (err) {
    throw err
  }
})

vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args),
  aiStream: (...args) => mockAiStream(...args),
  aiGenerateStructured: async (...args) => {
    const r = await mockAiGenerate(...args)
    if (r && typeof r === 'object') return r
    const cleaned = String(r).replace(/```json/gi, '').replace(/```/g, '').trim()
    const m = cleaned.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('structured parse failed')
    return JSON.parse(m[0])
  }
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' },
  PROVIDER_DEFAULT: 'ollama',
  PROVIDERS: { OLLAMA: 'ollama' },
  FEATURE_DEFAULTS: { story_generation: { provider: 'ollama', model: null } },
  EMBEDDING_DEFAULTS: { provider: 'ollama', model: 'nomic-embed-text', threshold: 0.75, batchSize: 32 },
  EMBEDDING_PROVIDERS: { OLLAMA: 'ollama' }
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => mockProjectStore
}))

vi.mock('@/config/documentPrompts', () => ({
  DOCUMENT_PROMPTS: {
    creative: {
      director: 'You are a story architect planning a narrative arc. Keep JSON output only.'
    },
    academic: {
      director: 'You are planning an academic document.'
    }
  }
}))

let useStoryDirector, sanitizeJson
beforeEach(async () => {
  setActivePinia(createPinia())
  vi.resetModules()
  vi.clearAllMocks()
  const mod = await import('@/composables/useStoryDirector')
  useStoryDirector = mod.useStoryDirector
  sanitizeJson = mod.sanitizeJson
})

function makeValidResponse() {
  return JSON.stringify({
    chapters: [
      {
        chapterNumber: 1,
        title: 'Chapter 1',
        goal: 'Goal',
        arcPosition: 'opening',
        emotionalTarget: 'Hope',
        hookEnding: 'Hook',
        estimatedWords: 5000,
        scenes: [
          {
            sceneNumber: 1,
            title: 'Opening',
            emotionalGoal: 'Hope',
            whatChanges: 'Hero begins journey',
            charactersPresent: ['John'],
            characterWants: { John: 'Find purpose' },
            setup: 'Establishes conflict',
            payoff: 'none',
            sensoryAnchor: 'Morning light',
            tension: 'medium',
            pacing: 'slow',
            arcPosition: 'setup',
            obstacle: 'obstacle',
            estimatedWords: 500
          },
          {
            sceneNumber: 2,
            title: 'Middle 1',
            arcPosition: 'obstacle',
            obstacle: 'obstacle',
            estimatedWords: 500
          },
          {
            sceneNumber: 3,
            title: 'Middle 2',
            arcPosition: 'turn',
            obstacle: 'obstacle',
            estimatedWords: 500
          },
          {
            sceneNumber: 4,
            title: 'Resolution',
            emotionalGoal: 'Relief',
            whatChanges: 'Conflict resolved',
            charactersPresent: ['John'],
            characterWants: { John: 'Find peace' },
            setup: 'Hero overcomes',
            payoff: 'Villain revealed',
            sensoryAnchor: 'Sunset',
            tension: 'low',
            pacing: 'slow',
            arcPosition: 'resolution',
            obstacle: 'obstacle',
            estimatedWords: 400
          }
        ]
      }
    ],
    storyArc: {
      premise: 'Test premise',
      genre: 'Fantasy',
      tone: 'Dark',
      emotionalJourney: 'hope to despair',
      centralConflict: 'Good vs Evil',
      resolution: 'Hero triumphs',
      totalScenes: 4
    }
  })
}

describe('useStoryDirector', () => {
  describe('sanitizeJson', () => {
    it('parses valid JSON', () => {
      expect(sanitizeJson('{"a":1}')).toEqual({ a: 1 })
    })

    it('returns null for empty input', () => {
      expect(sanitizeJson('')).toBeNull()
      expect(sanitizeJson(null)).toBeNull()
    })

    it('strips markdown fences', () => {
      expect(sanitizeJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    })

    it('returns null for malformed JSON', () => {
      expect(sanitizeJson('not json')).toBeNull()
    })
  })

  describe('generateStoryPlan', () => {
    const goal = {
      premise: 'Test premise',
      genre: 'Fantasy',
      tone: 'Dark',
      wordTarget: 4000,
      horizon: 'long_term'
    }

    it('returns validated actions and storyArc', async () => {
      mockAiGenerate.mockResolvedValue(makeValidResponse())
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({ goal, evidence: 'Story bible' })
      expect(result.chapters).toHaveLength(1)
      expect(result.scenes).toHaveLength(4)
      expect(result.storyArc.premise).toBe('Test premise')
      expect(result.storyArc.genre).toBe('Fantasy')
    })

    it('plans in chunks (skeleton + per-chapter scenes) when a structure is given', async () => {
      const skeleton = JSON.stringify({
        storyArc: { premise: 'P', genre: 'Fantasy', tone: 'Dark', centralConflict: 'c' },
        chapters: [
          { chapterNumber: 1, title: 'Ch1', goal: 'g1', hookEnding: 'h1' },
          { chapterNumber: 2, title: 'Ch2', goal: 'g2', hookEnding: 'h2' }
        ]
      })
      const sceneJson = JSON.stringify({ scenes: [{ sceneNumber: 1, title: 'S1' }, { sceneNumber: 2, title: 'S2' }] })
      mockAiGenerate.mockResolvedValueOnce(skeleton).mockResolvedValue(sceneJson)

      const { generateStoryPlan } = useStoryDirector()
      const structuredGoal = { ...goal, structure: { chapters: 2, scenesPerChapter: 2, wordsPerChapter: 1000, chaptersPerVolume: 2, volumes: 1 } }
      const result = await generateStoryPlan({ goal: structuredGoal, evidence: '' })

      expect(result.chapters).toHaveLength(2)
      expect(result.chapters.every(c => c.scenes.length === 2)).toBe(true)
      expect(result.scenes).toHaveLength(4)
      // 1 skeleton call + 1 per chapter = 3 non-streaming calls (no giant single plan)
      expect(mockAiGenerate).toHaveBeenCalledTimes(3)
      expect(result.chapters.map(c => c.volumeIndex)).toEqual([1, 1])
    })

    it('batches the skeleton for a long novel and plans every chapter (no giant single call)', async () => {
      // 30 chapters → ceil(30/12) = 3 skeleton batches + 30 scene calls.
      const skeleton12 = JSON.stringify({
        storyArc: { premise: 'P', genre: 'Fantasy', tone: 'Dark', centralConflict: 'c' },
        chapters: Array.from({ length: 12 }, (_, i) => ({
          chapterNumber: i + 1,
          title: `Ch${i + 1}`,
          goal: `g${i + 1}`,
          hookEnding: `h${i + 1}`
        }))
      })
      const scenesJson = JSON.stringify({
        scenes: [
          { sceneNumber: 1, title: 'S1' },
          { sceneNumber: 2, title: 'S2' }
        ]
      })
      mockAiGenerate.mockImplementation((prompt) =>
        /chapter skeleton/i.test(prompt) ? skeleton12 : scenesJson
      )

      const { generateStoryPlan } = useStoryDirector()
      const structuredGoal = {
        ...goal,
        horizon: 'long_term',
        structure: { chapters: 30, scenesPerChapter: 2, wordsPerChapter: 1000, chaptersPerVolume: 10, volumes: 3 }
      }
      const result = await generateStoryPlan({ goal: structuredGoal, evidence: '' })

      expect(result.chapters).toHaveLength(30)
      expect(result.chapters.every((c) => c.scenes.length === 2)).toBe(true)
      expect(result.scenes).toHaveLength(60)

      const calls = mockAiGenerate.mock.calls.map((c) => c[0])
      const skeletonCalls = calls.filter((p) => /chapter skeleton/i.test(p))
      const sceneCalls = calls.filter((p) => /Plan EXACTLY/i.test(p))
      expect(skeletonCalls).toHaveLength(3) // batched, never one 30-chapter call
      expect(sceneCalls).toHaveLength(30)

      // Volumes tagged 10/10/10
      const volumeCounts = result.chapters.reduce((acc, c) => {
        acc[c.volumeIndex] = (acc[c.volumeIndex] || 0) + 1
        return acc
      }, {})
      expect(volumeCounts).toEqual({ 1: 10, 2: 10, 3: 10 })
    })

    it('degrades to a padded plan instead of throwing when the skeleton model fails', async () => {
      // Model returns unparseable output for everything → planChunked must still
      // produce the requested structure rather than aborting the whole run.
      mockAiGenerate.mockResolvedValue('not json at all')
      const { generateStoryPlan } = useStoryDirector()
      const structuredGoal = {
        ...goal,
        horizon: 'long_term',
        structure: { chapters: 6, scenesPerChapter: 3, wordsPerChapter: 1500, chaptersPerVolume: 3, volumes: 2 }
      }
      const result = await generateStoryPlan({ goal: structuredGoal, evidence: '' })
      expect(result.chapters).toHaveLength(6)
      expect(result.chapters.every((c) => c.scenes.length === 3)).toBe(true)
      expect(result.chapters.map((c) => c.volumeIndex)).toEqual([1, 1, 1, 2, 2, 2])
    })

    it('pads a short skeleton batch up to the requested count', async () => {
      // Skeleton returns only 2 chapters when 5 were asked for → the missing 3 are
      // padded so the arc never loses its length to a truncated batch.
      const shortSkeleton = JSON.stringify({
        storyArc: { premise: 'P' },
        chapters: [
          { chapterNumber: 1, title: 'Real1', hookEnding: 'h1' },
          { chapterNumber: 2, title: 'Real2', hookEnding: 'h2' }
        ]
      })
      const scenesJson = JSON.stringify({ scenes: [{ sceneNumber: 1, title: 'S1' }] })
      mockAiGenerate.mockImplementation((prompt) =>
        /chapter skeleton/i.test(prompt) ? shortSkeleton : scenesJson
      )
      const { generateStoryPlan } = useStoryDirector()
      const structuredGoal = {
        ...goal,
        horizon: 'long_term',
        structure: { chapters: 5, scenesPerChapter: 1, wordsPerChapter: 800, chaptersPerVolume: 5, volumes: 1 }
      }
      const result = await generateStoryPlan({ goal: structuredGoal, evidence: '' })
      expect(result.chapters).toHaveLength(5)
      expect(result.chapters[0].title).toBe('Real1')
      expect(result.chapters[3].title).toBe('Chapter 4') // padded
    })

    it('sets isPlanning ref correctly', async () => {
      mockAiGenerate.mockResolvedValue(makeValidResponse())
      const { generateStoryPlan, isPlanning } = useStoryDirector()
      const promise = generateStoryPlan({ goal, evidence: '' })
      expect(isPlanning.value).toBe(true)
      await promise
      expect(isPlanning.value).toBe(false)
    })

    it('retries on failed parse first attempt', async () => {
      mockAiGenerate
        .mockResolvedValueOnce('invalid response')
        .mockResolvedValueOnce(makeValidResponse())
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({ goal, evidence: '' })
      expect(result.chapters).toHaveLength(1)
      expect(mockAiGenerate).toHaveBeenCalledTimes(2)
    })

    it('throws when both attempts fail', async () => {
      mockAiGenerate.mockResolvedValue('invalid')
      const { generateStoryPlan, planError } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('invalid JSON')
      expect(planError.value).toContain('invalid JSON')
    })

    it('throws when long_term has no chapters', async () => {
      const fewActions = JSON.stringify({
        chapters: [],
        storyArc: {}
      })
      mockAiGenerate.mockResolvedValue(fewActions)
      const { generateStoryPlan } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('no chapters')
    })

    it('validates scene payloads with defaults', async () => {
      const minimalResponse = JSON.stringify({
        chapters: [{
          chapterNumber: 1,
          title: 'Chapter 1',
          emotionalTarget: 'Hope',
          estimatedWords: 6000,
          scenes: Array.from({ length: 4 }, (_, i) => ({
            sceneNumber: i + 1, title: `Scene ${i + 1}`, arcPosition: 'setup', obstacle: 'ob'
          }))
        }],
        storyArc: {}
      })
      mockAiGenerate.mockResolvedValue(minimalResponse)
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({ goal, evidence: '' })
      result.scenes.forEach((s, _i) => {
        expect(s.tension).toBe('medium')
        expect(s.pacing).toBe('medium')
        expect(s.estimatedWords).toBeGreaterThan(0)
      })
    })

    it('uses short_term prompt for short_term horizon', async () => {
      const shortGoal = { ...goal, horizon: 'short_term' }
      mockAiGenerate.mockResolvedValue(makeValidResponse())
      const { generateStoryPlan } = useStoryDirector()
      await generateStoryPlan({ goal: shortGoal, evidence: '' })
      const systemPrompt = mockAiGenerate.mock.calls[0][1]
      expect(systemPrompt).toContain('short-term')
    })

    it('handles custom actions missing but parses successfully anyway', async () => {
      const response = JSON.stringify({
        chapters: [{
          chapterNumber: 1,
          emotionalTarget: 'Hope',
          estimatedWords: 6000,
          scenes: Array.from({ length: 4 }, (_, i) => ({
            sceneNumber: i + 1, title: `Scene ${i + 1}`, arcPosition: 'setup', obstacle: 'ob'
          }))
        }],
        storyArc: {}
      })
      mockAiGenerate.mockResolvedValue(response)
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({ goal: { ...goal, horizon: 'short_term' }, evidence: '' })
      expect(result.chapters).toHaveLength(1)
    })

    it('handles missing AI model error gracefully', async () => {
      mockAiGenerate.mockRejectedValue(new Error('Model not found'))
      const { generateStoryPlan } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('Model not found')
    })
  })
})

describe('enforceStructure', () => {
  it('trims to the exact chapter count and pads scenes/words', async () => {
    const { enforceStructure } = await import('@/composables/useStoryDirector')
    const raw = [
      { title: 'A', scenes: [{ title: 's1' }, { title: 's2' }, { title: 's3' }, { title: 's4' }] },
      { title: 'B', scenes: [{ title: 's1' }] },
      { title: 'C', scenes: [] }
    ]
    const out = enforceStructure(raw, { chapters: 2, scenesPerChapter: 3, wordsPerChapter: 3000, chaptersPerVolume: 2, volumes: 1 })
    expect(out.length).toBe(2)
    for (const ch of out) {
      expect(ch.scenes.length).toBe(3)
      expect(ch.estimatedWords).toBe(3000)
      expect(ch.scenes.every(s => s.estimatedWords === 1000)).toBe(true)
    }
    expect(out[0].chapterNumber).toBe(1)
    expect(out[1].chapterNumber).toBe(2)
  })

  it('pads chapters up to the requested count', async () => {
    const { enforceStructure } = await import('@/composables/useStoryDirector')
    const out = enforceStructure([{ title: 'Only', scenes: [{ title: 'x' }] }], { chapters: 4, scenesPerChapter: 2, wordsPerChapter: 1000 })
    expect(out.length).toBe(4)
    expect(out.every(c => c.scenes.length === 2)).toBe(true)
  })

  it('tags chapters with volumeIndex by chaptersPerVolume', async () => {
    const { enforceStructure } = await import('@/composables/useStoryDirector')
    const raw = Array.from({ length: 6 }, (_, i) => ({ title: `C${i}`, scenes: [] }))
    const out = enforceStructure(raw, { chapters: 6, scenesPerChapter: 1, wordsPerChapter: 800, chaptersPerVolume: 3, volumes: 2 })
    expect(out.map(c => c.volumeIndex)).toEqual([1, 1, 1, 2, 2, 2])
  })
})
