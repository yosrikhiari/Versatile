import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { aiGenerate } from './useAiService'
import { FEATURES } from '../config/ai'

export function useStoryRevisor() {
  const isRevising = ref(false)

  async function reviseScene({
    draft,
    critiqueResult,
    sceneBrief,
    storyBible,
    existingEntitiesJson,
    focusInstructions
  }) {
    isRevising.value = true

    try {
      const majorIssues = critiqueResult.issues.filter((i) => i.severity === 'major')
      const minorIssues = critiqueResult.issues.filter((i) => i.severity === 'minor')

      if (majorIssues.length === 0 && minorIssues.length <= 2) {
        return draft
      }

      const issuesToFix = majorIssues.length > 0 ? majorIssues : minorIssues

      const wordCount = draft.split(/\s+/).length
      const maxWords = Math.round(wordCount * 1.15)
      const minWords = Math.round(wordCount * 0.85)

      const userPrompt = `Revise this scene draft to fix the following issues.

ISSUES TO FIX:
${issuesToFix.map((i) => `- [${i.severity}] ${i.type}: ${i.description}`).join('\n')}

${focusInstructions ? `IMPROVEMENT GUIDANCE (based on historical patterns, focus extra attention on these areas):
${focusInstructions}

` : ''}SCENE BRIEF (for context):
- Title: ${sceneBrief.title}
- Emotional goal: ${sceneBrief.emotionalGoal}
- Characters: ${sceneBrief.charactersPresent.join(', ')}
- Tension: ${sceneBrief.tension}

STORY BIBLE CONTEXT:
${storyBible || '(No story bible)'}

EXISTING ENTITIES CONTEXT:
${existingEntitiesJson || '(No existing entities)'}

ORIGINAL DRAFT:
${draft}

CRITICAL - WORD COUNT CONSTRAINT:
The original draft is ${wordCount} words. Your revision MUST be between ${minWords} and ${maxWords} words. This is a hard constraint — count your words carefully before returning. Output ONLY the revised text with no additional commentary.`

      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const { DOCUMENT_PROMPTS } = await import('../config/documentPrompts')
      const activePrompts = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative

      const response = await aiGenerate(userPrompt, activePrompts.revisor, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.4
      })

      let revisedText = response || draft

      const revisedWords = revisedText.trim().split(/\s+/).length
      if (revisedWords < minWords || revisedWords > maxWords) {
        const retryPrompt = `Your previous revision was ${revisedWords} words but must be between ${minWords} and ${maxWords}. Rewrite it to fit this exact word count. Output ONLY the revised text.

${revisedText}`
        const retryResponse = await aiGenerate(retryPrompt, activePrompts.revisor, {
          feature: FEATURES.STORY_GENERATION,
          temperature: 0.3
        })
        if (retryResponse) revisedText = retryResponse
      }

      return revisedText
    } catch {
      return draft
    } finally {
      isRevising.value = false
    }
  }

  return { reviseScene, isRevising }
}
