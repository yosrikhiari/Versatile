import { ref } from 'vue'
import { aiGenerate, aiStream } from '../services/aiService'
import { FEATURES, RESEARCH_CHUNKS_DEFAULT } from '../config/ai'
import { DOCUMENT_PROMPTS } from '../config/documentPrompts'
import { useProjectStore } from '../stores/projectStore'
import { getAllChunksForProject } from '../services/researchDb'
import { getEmbedding } from '../services/embeddingService'
import { cosineSimilarity } from '../services/ollamaService'
import { useLocalStorage } from './useLocalStorage'
import { RESEARCH_KEYS } from '../config/researchKeys'

function lexicalScore(query, text) {
  const tokens = query.toLowerCase().split(/\W+/).filter(Boolean)
  const lower = text.toLowerCase()
  return tokens.reduce((sum, t) => sum + (lower.includes(t) ? 1 : 0), 0)
}

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

      const researchEnabled = useLocalStorage(RESEARCH_KEYS.RESEARCH_ENABLED, true)
      let researchContext = ''
      if (researchEnabled.value) {
        try {
          const allChunks = await getAllChunksForProject(projectStore.currentProjectId)
          if (allChunks.length > 0) {
            const count = Math.min(allChunks.length, RESEARCH_CHUNKS_DEFAULT)
            let selected = allChunks.slice(0, count)
            try {
              const queryText = `Premise: ${goal.premise}. Genre: ${goal.genre || 'Standard'}. Tone: ${goal.tone || 'Professional'}`
              const queryEmbedding = await getEmbedding(queryText)
              if (queryEmbedding && allChunks.some(c => c.embedding)) {
                const withEmb = allChunks.filter(c => c.embedding)
                const withoutEmb = allChunks.filter(c => !c.embedding)
                const scored = withEmb
                  .map(c => ({ chunk: c, score: cosineSimilarity(queryEmbedding, c.embedding) }))
                  .sort((a, b) => b.score - a.score)
                selected = scored.slice(0, count).map(s => s.chunk)
                if (selected.length < count && withoutEmb.length > 0) {
                  const remaining = count - selected.length
                  const lexical = withoutEmb
                    .filter(c => !selected.some(s => s.id === c.id))
                    .map(c => ({ chunk: c, score: lexicalScore(queryText, c.text) }))
                    .sort((a, b) => b.score - a.score)
                  selected = [...selected, ...lexical.slice(0, remaining).map(s => s.chunk)]
                }
              }
            } catch {
              // embed fallback: use first N chunks
            }
            researchContext = selected.map(c => c.text).join('\n\n---\n\n')
          }
        } catch {
          researchContext = ''
        }
      }

      const finalSystemPrompt = `${baseDirectorPrompt}\n\n${evidence}${researchContext ? `\n\n## Research Context\n${researchContext}` : ''}`

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
