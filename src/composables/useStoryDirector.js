import { ref } from 'vue'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { useStoryDocuments } from './useStoryDocuments'
import { useProjectStore } from '../stores/projectStore'

const DIRECTOR_SYSTEM_PROMPT = `You are a story architect, not a writer. Your role is to plan story structure.

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
The JSON must have exactly two keys: "scenes" (array of scene objects) and "storyArc" (object).

Each scene object:
{
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

Minimum 6 scenes, maximum 15 scenes. Total estimated words should match the target.`

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

  async function generateStoryPlan({ premise, genre, tone, wordTarget }) {
    isPlanning.value = true
    planError.value = null

    try {
      const userPrompt = `Plan a complete story based on this premise.

PREMISE: "${premise}"
GENRE: "${genre || 'Literary'}"
TONE: "${tone || 'Atmospheric'}"
TARGET WORD COUNT: ${wordTarget || 4000}

Generate a complete story plan as JSON with "scenes" array and "storyArc" object.
Follow the tension arc rules, setup/payoff rules, character integrity rules, and word budget distribution precisely.`

      const response = await aiGenerate(userPrompt, DIRECTOR_SYSTEM_PROMPT, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.7
      })

      let parsed = sanitizeJson(response)
      if (!parsed) {
        const retryResponse = await aiGenerate(userPrompt, DIRECTOR_SYSTEM_PROMPT, {
          feature: FEATURES.STORY_GENERATION,
          temperature: 0.5
        })
        parsed = sanitizeJson(retryResponse)
      }

      if (!parsed) {
        throw new Error('Failed to parse story plan JSON after retry. The model returned invalid output.')
      }

      const scenes = parsed.scenes || []
      const storyArc = parsed.storyArc || {}

      if (!Array.isArray(scenes) || scenes.length < 6) {
        throw new Error(`Story plan has ${scenes.length} scenes. Minimum is 6.`)
      }
      if (scenes.length > 15) {
        throw new Error(`Story plan has ${scenes.length} scenes. Maximum is 15.`)
      }

      const validatedScenes = scenes.map((s, i) => ({
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
        estimatedWords: typeof s.estimatedWords === 'number' ? s.estimatedWords : Math.round((wordTarget || 4000) / scenes.length)
      }))

      return {
        scenes: validatedScenes,
        storyArc: {
          premise: storyArc.premise || premise,
          genre: storyArc.genre || genre || 'Literary',
          tone: storyArc.tone || tone || 'Atmospheric',
          emotionalJourney: storyArc.emotionalJourney || '',
          centralConflict: storyArc.centralConflict || '',
          resolution: storyArc.resolution || '',
          totalScenes: validatedScenes.length,
          totalEstimatedWords: validatedScenes.reduce((sum, s) => sum + s.estimatedWords, 0)
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
