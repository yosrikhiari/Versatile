import { ref } from 'vue'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { useStoryDocuments } from './useStoryDocuments'
import { useProjectStore } from '../stores/projectStore'

const DIRECTOR_SYSTEM_PROMPT = `You are a story architect, not a writer. Your role is to plan story structure based on the provided EVIDENCE.

EVIDENCE INTEGRATION RULES:
- You MUST ground your plan in the provided STORY BIBLE evidence.
- Use existing characters, locations, and plot threads wherever relevant.
- Adhere strictly to the AUTHOR STYLE GUIDELINES.

TENSION ARC RULES:
- Vary tension across scenes. Do NOT escalate linearly.
- Tension should create a wave: low → medium → high → medium → peak → low
- Valleys between peaks are essential for emotional recovery.
- Peak tension belongs in the climax (scene 2 before last or last).
- Opening scene should hook (medium tension), not peak.

SETUP & PAYOFF:
- Every scene must plant at least one setup for a future scene or pay off an earlier setup.
- No unearned reversals — every twist must be set up at least one scene prior.
- If a scene has no setup or payoff, it does not earn its place.

CHARACTER INTEGRITY:
- Characters must act from stated wants and goals, not convenience.
- Every character present in a scene must want something.
- Character wants may conflict — that is the engine of the scene.

SCENE ECONOMY:
- Every scene must earn its place. Ask: "What is LOST if this scene is cut?"
- If the answer is "nothing", remove the scene.
- No filler scenes. No transition scenes that do nothing but move characters between locations.

WORD BUDGET DISTRIBUTION:
- Opening scene: 10-15% of total word count
- Climax scene: 20-25% of total word count
- Remaining scenes: distribute evenly

OUTPUT FORMAT:
Return ONLY valid JSON with no markdown, no explanation, no code fences.
The JSON must have exactly two keys: "actions" (array of action objects) and "storyArc" (object).

Each action object in the "actions" array must have this structure:
{
  "type": "write_scene",
  "payload": {
  "sceneNumber": number,
  "title": "string",
  "emotionalGoal": "string — what the reader should feel",
  "whatChanges": "string — what is different by scene end",
  "charactersPresent": ["string names"],
  "characterWants": {
    "characterName": "what they are trying to achieve in this scene"
  },
  "setup": "what this scene plants for future payoff",
  "payoff": "what earlier setup this pays off, or 'none'",
  "sensoryAnchor": "one specific concrete sensory detail",
  "tension": "low" | "medium" | "high" | "peak",
  "pacing": "slow" | "medium" | "fast",
  "estimatedWords": number
  }
}

StoryArc object:
{
  "premise": "string",
  "genre": "string",
  "tone": "string",
  "emotionalJourney": "hope → dread → earned relief",
  "centralConflict": "string",
  "resolution": "string",
  "totalScenes": number,
  "totalEstimatedWords": number
}

Minimum 6 actions, maximum 15 actions. Total estimated words across all write_scene payloads should match the target.`

function sanitizeJson(raw) {
  if (!raw || typeof raw !== 'string') return null
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '')
  cleaned = cleaned.replace(/^```\s*/i, '')
  cleaned = cleaned.replace(/```$/i, '')
  cleaned = cleaned.replace(/```json$/i, '')
  cleaned = cleaned.trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

export function useStoryDirector() {
  const isPlanning = ref(false)
  const planError = ref(null)

  async function generateStoryPlan({ goal, evidence }) {
    isPlanning.value = true
    planError.value = null

    try {
      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const { DOCUMENT_PROMPTS } = await import('../config/documentPrompts')
      const activePrompts = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative

      const userPrompt = `Plan a complete document structure based on this GOAL.

### GOAL
OBJECTIVE/PREMISE: "${goal.premise}"
DOCUMENT TYPE/GENRE: "${goal.genre || 'Standard'}"
TONE: "${goal.tone || 'Professional'}"
TARGET WORD COUNT: ${goal.wordTarget || 4000}

Generate a complete plan as JSON with "actions" array and "storyArc" object.`

      let baseDirectorPrompt = activePrompts.director
      if (goal.horizon === 'short_term') {
        baseDirectorPrompt = `You are a story architect and worldbuilder. Your task is to fulfill a targeted short-term GOAL based on the EVIDENCE provided.

OUTPUT FORMAT:
Return ONLY valid JSON with no markdown, no explanation, no code fences.
The JSON must have an "actions" array.
Each action object must have a "type" (e.g., "develop_character", "brainstorm_twist") and a "payload" object containing the specific details relevant to the action.`
      } else {
        baseDirectorPrompt = baseDirectorPrompt
          .replace(/"scenes"/g, '"actions"')
          .replace(/scene object/g, 'action object')
          .replace(/totalScenes/g, 'totalActions')
      }

      const finalSystemPrompt = `${baseDirectorPrompt}\n\n${evidence}`

      const response = await aiGenerate(userPrompt, finalSystemPrompt, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.7
      })

      let parsed = sanitizeJson(response)
      if (!parsed) {
        const retryResponse = await aiGenerate(userPrompt, finalSystemPrompt, {
          feature: FEATURES.STORY_GENERATION,
          temperature: 0.5
        })
        parsed = sanitizeJson(retryResponse)
      }

      if (!parsed) {
        throw new Error('Failed to parse story plan JSON after retry. The model returned invalid output.')
      }

      const actions = parsed.actions || []
      const storyArc = parsed.storyArc || {}

      if (goal.horizon === 'long_term') {
        if (!Array.isArray(actions) || actions.length < 6) {
          throw new Error(`Story plan has ${actions.length} actions. Minimum is 6.`)
        }
        if (actions.length > 15) {
          throw new Error(`Story plan has ${actions.length} actions. Maximum is 15.`)
        }
      }

      const validatedActions = actions.map((a, i) => {
        if (a.type === 'write_scene') {
          const s = a.payload || {}
          return {
            type: 'write_scene',
            payload: {
              sceneNumber: s.sceneNumber || i + 1,
              title: s.title || `Scene ${i + 1}`,
              emotionalGoal: s.emotionalGoal || '',
              whatChanges: s.whatChanges || '',
              charactersPresent: Array.isArray(s.charactersPresent) ? s.charactersPresent : [],
              characterWants: (s.characterWants && typeof s.characterWants === 'object') ? s.characterWants : {},
              setup: s.setup || '',
              payoff: s.payoff || 'none',
              sensoryAnchor: s.sensoryAnchor || '',
              tension: ['low', 'medium', 'high', 'peak'].includes(s.tension) ? s.tension : 'medium',
              pacing: ['slow', 'medium', 'fast'].includes(s.pacing) ? s.pacing : 'medium',
              estimatedWords: typeof s.estimatedWords === 'number' ? s.estimatedWords : Math.round((goal.wordTarget || 4000) / actions.length)
            }
          }
        }
        return a // Fallback for other action types in the future
      })

      return {
        actions: validatedActions,
        storyArc: {
          premise: storyArc.premise || goal.premise,
          genre: storyArc.genre || goal.genre || 'Literary',
          tone: storyArc.tone || goal.tone || 'Atmospheric',
          emotionalJourney: storyArc.emotionalJourney || '',
          centralConflict: storyArc.centralConflict || '',
          resolution: storyArc.resolution || '',
          totalActions: validatedActions.length,
          totalEstimatedWords: validatedActions.reduce((sum, a) => sum + (a.payload?.estimatedWords || 0), 0)
        }
      }
    } catch (err) {
      planError.value = err.message || 'Story planning failed'
      throw err
    } finally {
      isPlanning.value = false
    }
  }

  return { generateStoryPlan, isPlanning, planError }
}
