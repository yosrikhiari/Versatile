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
  aiStream: (...args) => mockAiStream(...args)
}))

vi.mock('@/config/ai', () => ({
  FEATURES: { STORY_GENERATION: 'story_generation' }
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
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('Failed to parse')
      expect(planError.value).toContain('Failed to parse')
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
