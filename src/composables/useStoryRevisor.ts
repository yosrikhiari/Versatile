import { ref } from 'vue'
import { useAiService } from './useAiService'
import { useProjectStore } from '../stores/projectStore'
import { DOCUMENT_PROMPTS } from '../services/ai/promptStore'
import type { RevisorParams, PromptSet } from '../types/ai'

export const isRevising = ref(false)

export async function reviseScene(params: RevisorParams): Promise<string> {
  isRevising.value = true

  try {
    const { generate, stream } = useAiService()
    const { draft, critiqueResult, sceneBrief, storyBible, existingEntitiesJson } = params

    const majorIssues = critiqueResult.issues.filter((i) => i.severity === 'major')
    const minorIssues = critiqueResult.issues.filter((i) => i.severity === 'minor')

    const critiqueSection = [
      critiqueResult.score != null ? `Overall Score: ${critiqueResult.score}/10` : '',
      majorIssues.length > 0 ? '\nCRITICAL ISSUES TO FIX:' : '',
      ...majorIssues.map((i) => `- [${i.type}] ${i.description}`),
      minorIssues.length > 0 ? '\nSUGGESTED IMPROVEMENTS:' : '',
      ...minorIssues.map((i) => `- [${i.type}] ${i.description}`)
    ].filter(Boolean).join('\n')

    const revisionPrompt = `[ORIGINAL SCENE]
${draft}

[CRITIQUE FEEDBACK]
${critiqueSection}

[SCENE BRIEF]
- Title: ${sceneBrief.title}
- Emotional goal: ${sceneBrief.emotionalGoal || 'N/A'}
- Characters present: ${sceneBrief.charactersPresent.join(', ')}
- Tension: ${sceneBrief.tension}

${storyBible ? `[STORY CONTEXT]\n${storyBible}\n` : ''}
${existingEntitiesJson ? `[ENTITIES]\n${existingEntitiesJson}\n` : ''}

Revise the scene addressing the above critique feedback.
- Fix all critical issues.
- Consider suggested improvements.
- Maintain the original scene's core purpose and emotional beats.
- Keep the same narrative voice and style.
- Output ONLY the revised prose, no meta-commentary.`

    const projectStore = useProjectStore()
    const categoryType = (projectStore.currentCategory || 'creative').toLowerCase()
    const allPrompts = DOCUMENT_PROMPTS as unknown as Record<string, PromptSet>
    const prompts = allPrompts[categoryType] || allPrompts.creative
    const systemPrompt = prompts.revisor
    const revised = await generate(revisionPrompt, systemPrompt, 'spark', { temperature: 0.7 })

    return revised
  } catch (error) {
    isRevising.value = false
    throw error
  } finally {
    isRevising.value = false
  }
}
