import { ref } from 'vue'
import { aiGenerateJson } from './useAiService'
import { FEATURES } from '../config/ai'

interface WhatIfAlternative {
  title: string
  prose: string
  styleNote?: string
}

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
  const alternatives = ref<WhatIfAlternative[]>([])
  const error = ref<string | null>(null)

  async function generateAlternatives({ sceneProse, sceneBrief, chapterLog, storyArc, voiceProfile, activeCraftRules, premise }: { sceneProse: any; sceneBrief: any; chapterLog: any; storyArc?: any; voiceProfile?: any; activeCraftRules?: any; premise?: any }) {
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

      // Both of these were already parameters and were dropped on the floor:
      // destructured at the top, never referenced in either prompt. So every
      // alternative was written with no voice and no craft rules, which is most
      // of why they come back sounding like a different author than the scene
      // they are meant to replace.
      const voiceText =
        typeof voiceProfile === 'string'
          ? voiceProfile.trim()
          : voiceProfile
            ? String(voiceProfile.voiceInstruction || voiceProfile.styleGuide || '').trim()
            : ''

      const craftText = Array.isArray(activeCraftRules)
        ? activeCraftRules.filter(Boolean).join('\n')
        : String(activeCraftRules || '').trim()

      // The author's own "what if" — the single thing this feature exists to
      // answer. The panel collects it in a textarea and, until now, never sent
      // it: every alternative was a generic divergence that ignored the premise
      // the author had just typed.
      const premiseText = String(premise || '').trim()

      const userPrompt = `You are helping a writer explore alternative directions for the current scene.

CURRENT SCENE PROSE:
${sceneProse || '(No prose written yet)'}

${briefText ? `SCENE BRIEF:\n${briefText}\n` : ''}
${storyArc ? `STORY ARC:\n- Genre: ${storyArc.genre || ''}\n- Tone: ${storyArc.tone || ''}\n- Central conflict: ${storyArc.centralConflict || ''}\n` : ''}
${voiceText ? `AUTHOR VOICE (match this — it is measured from the manuscript):\n${voiceText}\n` : ''}
${craftText ? `CRAFT RULES (honour these):\n${craftText}\n` : ''}
CHAPTER LOG (what has happened before this scene):
${logText}
${premiseText ? `\nTHE AUTHOR'S "WHAT IF" — every alternative must follow from this:\n${premiseText}\n` : ''}
Generate 3–4 distinct alternative continuations for this scene. Each alternative should:
1. ${premiseText ? 'Take the premise above as given, and explore a DIFFERENT consequence of it' : 'Take the scene in a different creative direction'}
2. Be written in the same voice and style as the existing prose
3. Be 2–4 paragraphs of flowing prose
4. Have a clear title describing the approach

${
  premiseText
    ? 'Do not ignore or soften the premise — it is the point of the exercise. Vary how it plays out, not whether it happens.'
    : 'The alternatives can change a character’s choice, introduce a complication, or take the scene in a totally different narrative direction.'
}`

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

      alternatives.value = (result.alternatives as WhatIfAlternative[]) || []
      return alternatives.value
    } catch (err: any) {
      error.value = err.message || 'What If generation failed'
      throw err
    } finally {
      isGenerating.value = false
    }
  }

  function applyAlternative(index: number) {
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
