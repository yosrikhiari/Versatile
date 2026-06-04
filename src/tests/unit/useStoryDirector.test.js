import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const mockAiGenerate = vi.fn()
const mockProjectStore = {
  activeWorkspaceType: 'creative'
}

vi.mock('@/services/aiService', () => ({
  aiGenerate: (...args) => mockAiGenerate(...args)
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
    actions: [
      {
        type: 'write_scene',
        payload: {
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
          estimatedWords: 500
        }
      },
      {
        type: 'write_scene',
        payload: {
          sceneNumber: 2,
          title: 'Confrontation',
          emotionalGoal: 'Fear',
          whatChanges: 'Hero faces villain',
          charactersPresent: ['John', 'Jane'],
          characterWants: { John: 'Survive', Jane: 'Win' },
          setup: 'Villain revealed',
          payoff: 'Establishes conflict',
          sensoryAnchor: 'Dark room',
          tension: 'peak',
          pacing: 'fast',
          estimatedWords: 800
        }
      },
      {
        type: 'write_scene',
        payload: {
          sceneNumber: 3,
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
          estimatedWords: 400
        }
      },
      { type: 'develop_character', payload: { name: 'Mentor', description: 'Guide' } },
      { type: 'brainstorm_twist', payload: { idea: 'Betrayal' } },
      { type: 'write_scene', payload: {} }
    ],
    storyArc: {
      premise: 'Test premise',
      genre: 'Fantasy',
      tone: 'Dark',
      emotionalJourney: 'hope to despair',
      centralConflict: 'Good vs Evil',
      resolution: 'Hero triumphs',
      totalScenes: 6
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
      expect(result.actions).toHaveLength(6)
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
      expect(result.actions).toHaveLength(6)
      expect(mockAiGenerate).toHaveBeenCalledTimes(2)
    })

    it('throws when both attempts fail', async () => {
      mockAiGenerate.mockResolvedValue('invalid')
      const { generateStoryPlan, planError } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('Failed to parse')
      expect(planError.value).toContain('Failed to parse')
    })

    it('throws when long_term has less than 6 actions', async () => {
      const fewActions = JSON.stringify({
        actions: [
          { type: 'write_scene', payload: { title: 'A' } },
          { type: 'write_scene', payload: { title: 'B' } },
          { type: 'write_scene', payload: { title: 'C' } },
          { type: 'write_scene', payload: { title: 'D' } },
          { type: 'write_scene', payload: { title: 'E' } }
        ],
        storyArc: {}
      })
      mockAiGenerate.mockResolvedValue(fewActions)
      const { generateStoryPlan } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('Minimum is 6')
    })

    it('throws when long_term has more than 15 actions', async () => {
      const manyActions = Array.from({ length: 16 }, (_, i) => ({
        type: 'write_scene',
        payload: { title: `Scene ${i + 1}` }
      }))
      mockAiGenerate.mockResolvedValue(JSON.stringify({ actions: manyActions, storyArc: {} }))
      const { generateStoryPlan } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('Maximum is 15')
    })

    it('validates action payloads with defaults', async () => {
      const minimalResponse = JSON.stringify({
        actions: Array.from({ length: 6 }, (_, i) => ({
          type: 'write_scene',
          payload: { sceneNumber: i + 1, title: `Scene ${i + 1}` }
        })),
        storyArc: {}
      })
      mockAiGenerate.mockResolvedValue(minimalResponse)
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({ goal, evidence: '' })
      result.actions.forEach((a, i) => {
        expect(a.payload.tension).toBe('medium')
        expect(a.payload.pacing).toBe('medium')
        expect(a.payload.estimatedWords).toBeGreaterThan(0)
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

    it('handles non-write_scene action types', async () => {
      const response = JSON.stringify({
        actions: [
          { type: 'write_scene', payload: { title: 'Open' } },
          { type: 'write_scene', payload: { title: 'Mid' } },
          { type: 'write_scene', payload: { title: 'End' } },
          { type: 'write_scene', payload: { title: 'A' } },
          { type: 'write_scene', payload: { title: 'B' } },
          { type: 'custom_action', payload: { customData: true } }
        ],
        storyArc: {}
      })
      mockAiGenerate.mockResolvedValue(response)
      const { generateStoryPlan } = useStoryDirector()
      const result = await generateStoryPlan({ goal: { ...goal, horizon: 'short_term' }, evidence: '' })
      const custom = result.actions.find(a => a.type === 'custom_action')
      expect(custom.payload.customData).toBe(true)
    })

    it('handles missing AI model error gracefully', async () => {
      mockAiGenerate.mockRejectedValue(new Error('Model not found'))
      const { generateStoryPlan } = useStoryDirector()
      await expect(generateStoryPlan({ goal, evidence: '' })).rejects.toThrow('Model not found')
    })
  })
})
