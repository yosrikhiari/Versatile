import { ref } from 'vue'
import { aiGenerateJson } from './useAiService'
import { FEATURES } from '../config/ai'

const WHATIF_SCHEMA = {
  type: 'object',
  properties: {
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short label for this alternative direction' },
          prose: { type: 'string', description: 'The continued or rewritten scene prose following this alternative' },
          styleNote: { type: 'string', description: 'Brief note on how this alternative differs in tone or approach' }
        },
        required: ['title', 'prose']
      },
      minItems: 3,
      maxItems: 4
    }
  },
  required: ['alternatives']
}

export function useWhatIf() {
  const isGenerating = ref(false)
  const alternatives = ref([])
  const error = ref(null)

  async function generateAlternatives({ sceneProse, sceneBrief, chapterLog, storyArc, voiceProfile, activeCraftRules }) {
    isGenerating.value = true
    error.value = null
    alternatives.value = []

    try {
      const systemPrompt = 'You are a creative writing assistant. Generate alternative scene directions that match the voice and style of the existing prose.'

      const briefText = sceneBrief
        ? Object.entries(sceneBrief)
            .filter(([, v]) => v)
            .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
            .join('\n')
        : ''

      const logText = Array.isArray(chapterLog) && chapterLog.length
        ? chapterLog.join('\n')
        : '(No prior events — this is early in the story.)'

      const userPrompt = `You are helping a writer explore alternative directions for the current scene.

CURRENT SCENE PROSE:
${sceneProse || '(No prose written yet)'}

${briefText ? `SCENE BRIEF:\n${briefText}\n` : ''}
${storyArc ? `STORY ARC:\n- Genre: ${storyArc.genre || ''}\n- Tone: ${storyArc.tone || ''}\n- Central conflict: ${storyArc.centralConflict || ''}\n` : ''}

CHAPTER LOG (what has happened before this scene):
${logText}

Generate 3–4 distinct alternative continuations for this scene. Each alternative should:
1. Take the scene in a different creative direction
2. Be written in the same voice and style as the existing prose
3. Be 2–4 paragraphs of flowing prose
4. Have a clear title describing the approach

The alternatives can change a character's choice, introduce a complication, or take the scene in a totally different narrative direction.`

      const result = await aiGenerateJson(
        userPrompt,
        systemPrompt,
        {
          feature: FEATURES.STORY_GENERATION,
          temperature: 0.8,
          maxTokens: 3000,
          schema: WHATIF_SCHEMA,
          schemaName: 'whatif_alternatives'
        }
      )

      alternatives.value = result.alternatives || []
      return alternatives.value
    } catch (err) {
      error.value = err.message || 'What If generation failed'
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  function applyAlternative(index) {
    const alt = alternatives.value[index]
    if (!alt) return null
    return alt.prose
  }

  function clear() {
    alternatives.value = []
    error.value = null
  }

  return {
    isGenerating,
    alternatives,
    error,
    generateAlternatives,
    applyAlternative,
    clear
  }
}
