import { ref } from 'vue'
import { aiGenerate, aiStream } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { DOCUMENT_PROMPTS } from '../config/documentPrompts'
import { useProjectStore } from '../stores/projectStore'

const DIRECTOR_SYSTEM_PROMPT = `You are a story architect, not a writer. Your role is to plan story structure based on the provided EVIDENCE.

OUTPUT FORMAT:
Return ONLY valid JSON with no markdown, no explanation, no code fences.
The JSON must have exactly two keys: "chapters" (array of chapter objects) and "storyArc" (object).

Each chapter object in the "chapters" array must have this structure:
{
  "chapterNumber": number,
  "title": "string",
  "goal": "string — what this chapter accomplishes narratively",
  "arcPosition": "opening" | "rising" | "climax" | "falling" | "resolution",
  "emotionalTarget": "string — what the READER feels at chapter end",
  "hookEnding": "string — the beat the chapter closes on",
  "estimatedWords": number,
  "scenes": [
    {
      "sceneNumber": number,
      "title": "string",
      "arcPosition": "setup" | "obstacle" | "turn" | "resolution" | "hook",
      "sceneFunction": "setup" | "obstacle" | "turn" | "resolution" | "hook",
      "emotionalGoal": "string — what the reader should feel",
      "whatChanges": "string — what is different by scene end",
      "obstacle": "string — the specific barrier or conflict the character must overcome in this scene",
      "charactersPresent": ["string names"],
      "characterWants": {
        "characterName": "what they are trying to achieve in this scene"
      },
      "location": "string — the primary setting where this scene takes place",
      "setup": "what this scene plants for future payoff",
      "payoff": "what earlier setup this pays off, or 'none'",
      "sensoryAnchor": "one specific concrete sensory detail",
      "tension": "low" | "medium" | "high" | "peak",
      "pacing": "slow" | "medium" | "fast",
      "estimatedWords": number
    }
  ]
}

StoryArc object:
{
  "premise": "string",
  "genre": "string",
  "tone": "string",
  "emotionalJourney": "hope → dread → earned relief",
  "centralConflict": "string",
  "resolution": "string",
  "totalChapters": number,
  "totalScenes": number,
  "totalEstimatedWords": number
}

Minimum 2 scenes per chapter, maximum 6 scenes per chapter.`

function sanitizeJson(raw) {
  if (!raw || typeof raw !== 'string') return null
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```json\s*/i, '')
  cleaned = cleaned.replace(/^```\s*/i, '')
  cleaned = cleaned.replace(/```$/i, '')
  cleaned = cleaned.replace(/```json$/i, '')
  cleaned = cleaned.trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const jsonStr = cleaned.slice(start, end + 1)
  try {
    return JSON.parse(jsonStr)
  } catch {
    return null
  }
}

export function useStoryDirector() {
  const isPlanning = ref(false)
  const planError = ref(null)

  async function generateStoryPlan({ goal, evidence, onPartialData }) {
    isPlanning.value = true
    planError.value = null

    try {
      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const activePrompts = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative

      const userPrompt = `Plan a complete document structure based on this GOAL.

### GOAL
OBJECTIVE/PREMISE: "${goal.premise}"
DOCUMENT TYPE/GENRE: "${goal.genre || 'Standard'}"
TONE: "${goal.tone || 'Professional'}"
TARGET WORD COUNT: ${goal.wordTarget || 4000}

Generate a complete plan as JSON with "chapters" array and "storyArc" object.`

      let baseDirectorPrompt = activePrompts.director
      if (goal.horizon === 'short_term') {
        baseDirectorPrompt = `You are a story architect and worldbuilder. Your task is to fulfill a targeted short-term GOAL based on the EVIDENCE provided.

OUTPUT FORMAT:
Return ONLY valid JSON with no markdown, no explanation, no code fences.
The JSON must have a "chapters" array. Each chapter object must contain a "scenes" array with the scene details.`
      }

      const finalSystemPrompt = `${baseDirectorPrompt}\n\n${evidence}`

      let accumulated = ''
      const emittedTitles = new Set()
      let scanOffset = 0

      await aiStream(userPrompt, finalSystemPrompt, (chunk) => {
        accumulated += chunk
        
        const regex = /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g
        regex.lastIndex = Math.max(0, scanOffset - 200)
        let match
        
        while ((match = regex.exec(accumulated)) !== null) {
          const title = match[1]
          if (!emittedTitles.has(title)) {
            emittedTitles.add(title)
            try { 
              if (onPartialData) onPartialData('scene', title) 
            } catch {}
          }
        }
        scanOffset = Math.max(0, accumulated.length - 200)
      }, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.7
      })

      let parsed = sanitizeJson(accumulated)
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

      const chapters = parsed.chapters || []
      const storyArc = parsed.storyArc || {}

      if (goal.horizon === 'long_term') {
        if (!Array.isArray(chapters) || chapters.length === 0) {
          throw new Error('Story plan has no chapters.')
        }
      }

      for (const chapter of chapters) {
        if (!chapter.emotionalTarget) chapter.emotionalTarget = 'Unspecified emotion'
        if (!chapter.scenes) chapter.scenes = []
        
        // Soft fallback for empty scenes
        if (chapter.scenes.length === 0) {
          chapter.scenes.push({
            sceneNumber: 1, title: 'Opening', arcPosition: 'setup', sceneFunction: 'setup',
            emotionalGoal: 'unknown', whatChanges: 'unknown', obstacle: 'unknown',
            charactersPresent: [], characterWants: {}, location: '', setup: '', payoff: 'none',
            sensoryAnchor: '', tension: 'medium', pacing: 'medium', estimatedWords: 500
          })
        }
        
        if (!chapter.estimatedWords || chapter.estimatedWords < 1000) {
          chapter.estimatedWords = Math.max(1500, Math.floor((goal.wordTarget || 4000) / Math.max(1, chapters.length)))
        }
        
        for (const scene of chapter.scenes) {
          if (!scene.arcPosition) scene.arcPosition = 'setup'
          if (!scene.obstacle) scene.obstacle = 'Unspecified obstacle'
        }
      }

      const validatedChapters = chapters.map((c, i) => {
        return {
          chapterNumber: c.chapterNumber || i + 1,
          title: c.title || `Chapter ${i + 1}`,
          goal: c.goal || '',
          arcPosition: c.arcPosition || '',
          emotionalTarget: c.emotionalTarget || '',
          hookEnding: c.hookEnding || '',
          estimatedWords: c.estimatedWords || 7000,
          scenes: (c.scenes || []).map((s, j) => ({
            sceneNumber: s.sceneNumber || j + 1,
            title: s.title || `Scene ${j + 1}`,
            emotionalGoal: s.emotionalGoal || '',
            whatChanges: s.whatChanges || '',
            obstacle: s.obstacle || '',
            sceneFunction: s.sceneFunction || s.arcPosition || 'setup',
            charactersPresent: Array.isArray(s.charactersPresent) ? s.charactersPresent : [],
            characterWants: (s.characterWants && typeof s.characterWants === 'object') ? s.characterWants : {},
            location: s.location || '',
            setup: s.setup || '',
            payoff: s.payoff || 'none',
            sensoryAnchor: s.sensoryAnchor || '',
            arcPosition: ['setup', 'obstacle', 'turn', 'resolution', 'hook', 'opening', 'rising', 'climax', 'falling'].includes(s.arcPosition) ? s.arcPosition : 'setup',
            tension: ['low', 'medium', 'high', 'peak'].includes(s.tension) ? s.tension : 'medium',
            pacing: ['slow', 'medium', 'fast'].includes(s.pacing) ? s.pacing : 'medium',
            estimatedWords: typeof s.estimatedWords === 'number' ? s.estimatedWords : Math.round(c.estimatedWords / Math.max(c.scenes.length, 1))
          }))
        }
      })

      const flatScenes = validatedChapters.flatMap(c => c.scenes)

      return {
        chapters: validatedChapters,
        scenes: flatScenes,
        storyArc: {
          premise: storyArc.premise || goal.premise,
          genre: storyArc.genre || goal.genre || 'Literary',
          tone: storyArc.tone || goal.tone || 'Atmospheric',
          emotionalJourney: storyArc.emotionalJourney || '',
          centralConflict: storyArc.centralConflict || '',
          resolution: storyArc.resolution || '',
          totalChapters: validatedChapters.length,
          totalScenes: flatScenes.length,
          totalEstimatedWords: validatedChapters.reduce((sum, c) => sum + (c.estimatedWords || 0), 0)
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

export { sanitizeJson }
