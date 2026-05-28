import { ref } from 'vue'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'

const REVISOR_SYSTEM_PROMPT = `You are a revision editor. You revise existing prose to fix specific issues without changing events, structure, or length significantly.

Rules:
- Revise ONLY the sections that address the listed issues
- Keep all prose that is not implicated in an issue completely unchanged
- Do not change the scene's events, only how they are written
- Stay within 15% of the original word count
- Output the full revised text — do not omit any part of the scene`

export function useStoryRevisor() {
  const isRevising = ref(false)

  async function reviseScene({ draft, critiqueResult, sceneBrief, storyBible }) {
    isRevising.value = true

    try {
      const majorIssues = critiqueResult.issues.filter(i => i.severity === 'major')
      const minorIssues = critiqueResult.issues.filter(i => i.severity === 'minor')

      if (majorIssues.length === 0 && minorIssues.length <= 2) {
        return draft
      }

      const issuesToFix = majorIssues.length > 0 ? majorIssues : minorIssues

      const wordCount = draft.split(/\s+/).length
      const maxWords = Math.round(wordCount * 1.15)
      const minWords = Math.round(wordCount * 0.85)

      const userPrompt = `Revise this scene draft to fix the following issues.

ISSUES TO FIX:
${issuesToFix.map(i => `- [${i.severity}] ${i.type}: ${i.description}`).join('\n')}

SCENE BRIEF (for context):
- Title: ${sceneBrief.title}
- Emotional goal: ${sceneBrief.emotionalGoal}
- Characters: ${sceneBrief.charactersPresent.join(', ')}
- Tension: ${sceneBrief.tension}

STORY BIBLE CONTEXT:
${storyBible || '(No story bible)'}

WORD COUNT CONSTRAINTS:
- Original word count: ${wordCount}
- Keep revised word count between ${minWords} and ${maxWords}

ORIGINAL DRAFT:
${draft}

Revise the draft to address ONLY the issues listed above. Output the full revised text.`

      const response = await aiGenerate(userPrompt, REVISOR_SYSTEM_PROMPT, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.4
      })

      return response || draft
    } catch (err) {
      return draft
    } finally {
      isRevising.value = false
    }
  }

  return { reviseScene, isRevising }
}
