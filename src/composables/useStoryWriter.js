import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { aiGenerate, aiStream } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { finalizeStream } from '../services/jsonExtractor'

const DEFAULT_VOICE = `Write in third person limited. Past tense. Favor specific concrete nouns over category nouns. Show emotional states through physical sensation and action, not direct statement. Vary sentence length — short during tension, longer during reflection.`

const CRAFT_RULES = `CRAFT RULES — follow all of these:
1. Every scene must include at least one auditory detail and one tactile detail
2. Characters under stress never say exactly what they mean — write subtext
3. Avoid: "she felt X" — show the feeling through body/action/dialogue
4. Specific beats generic: '94 Civic with cracked dash > 'old car'
5. The first sentence of a scene must create forward motion or tension
6. The last sentence must leave something unresolved or changed`

function extractDoc(docString, heading) {
  if (!docString) return ''
  const regex = new RegExp(`#+\\s*${heading}[\\s\\S]*?(?=\n#|$)`, 'i')
  const match = docString.match(regex)
  return match ? match[0].trim() : ''
}

function summarizeLog(chapterLog) {
  if (!chapterLog || !Array.isArray(chapterLog)) return ''
  if (chapterLog.length <= 5) return chapterLog.join('\n')
  const recent = chapterLog.slice(-3)
  return [...recent, `(... plus ${chapterLog.length - 3} earlier scenes summarized)`].join('\n')
}

function tryExtractProse(raw) {
  // Attempt full parse first
  try {
    const parsed = finalizeStream(raw)
    if (parsed && typeof parsed.prose === 'string') return parsed.prose
  } catch {}

  // Progressive extraction from partial JSON
  const proseKey = '"prose": "'
  const keyIndex = raw.indexOf(proseKey)
  if (keyIndex === -1) return ''

  let start = keyIndex + proseKey.length
  let result = ''
  let i = start

  while (i < raw.length) {
    const ch = raw[i]
    if (ch === '\\') {
      result += ch + (raw[i + 1] || '')
      i += 2
    } else if (ch === '"') {
      break
    } else {
      result += ch
      i++
    }
  }

  return result
}

export function useStoryWriter() {
  const isWriting = ref(false)
  const writeError = ref(null)

  async function writeScene({ sceneBrief, storyArc, chapterLog, storyBible, onChunk, embeddingContext, storyContract, rejectedPatterns: extraRejected }) {
    isWriting.value = true
    writeError.value = null

    try {
      const styleGuide = extractDoc(storyBible || '', 'Style Guide')
      const rejectedPatterns = extractDoc(storyBible || '', 'Avoid These Patterns')
      const charactersSection = extractDoc(storyBible || '', 'Characters')
      const worldSection = extractDoc(storyBible || '', 'World')

      const voiceInstruction = styleGuide || DEFAULT_VOICE

      const allRejected = []
      if (rejectedPatterns) allRejected.push(rejectedPatterns)
      if (extraRejected && extraRejected.length > 0) {
        allRejected.push(extraRejected.map((p, i) =>
          `${i + 1}. Context: "${p.context}" — AVOID generating similar content`
        ).join('\n'))
      }
      const antiPatterns = allRejected.length > 0
        ? `AVOID producing output resembling these rejected examples:\n${allRejected.join('\n')}`
        : ''

      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const { DOCUMENT_PROMPTS } = await import('../config/documentPrompts')
      const activePrompts = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative
      const activeCraftRules = categoryType === 'creative' || categoryType === 'novel' ? `\n\n${CRAFT_RULES}` : ''

      const systemPrompt = `${activePrompts.writer}

${voiceInstruction}

${antiPatterns ? antiPatterns + '\n' : ''}${activeCraftRules}

Write ONLY the detailed content for this section. Do not summarize. Start writing immediately.`

      const logSummary = summarizeLog(chapterLog)

      const contractSection = storyContract ? `\nSTORY CONTRACT (world rules — never break these):\n${storyContract}\n` : ''

      const briefLines = sceneBrief.emotionalGoal !== undefined
        ? [
            `- Emotional goal: ${sceneBrief.emotionalGoal}`,
            `- What changes: ${sceneBrief.whatChanges}`,
            `- Characters present: ${(sceneBrief.charactersPresent || []).join(', ')}`,
            `- Character wants: ${JSON.stringify(sceneBrief.characterWants || {}, null, 2)}`,
            `- Setup to plant: ${sceneBrief.setup || ''}`,
            `- Payoff to deliver: ${sceneBrief.payoff || 'none'}`,
            `- Sensory anchor: ${sceneBrief.sensoryAnchor || ''}`,
            `- Tension: ${sceneBrief.tension || 'medium'}`,
            `- Pacing: ${sceneBrief.pacing || 'medium'}`
          ]
        : [
            `- Goal: ${sceneBrief.goal || ''}`,
            `- Obstacle: ${sceneBrief.obstacle || ''}`,
            `- Characters: ${(sceneBrief.characters || []).join(', ')}`,
            `- Location: ${sceneBrief.location || ''}`,
            `- What changes: ${sceneBrief.change || ''}`,
            `- Tone note: ${sceneBrief.toneNote || ''}`
          ]

      const briefSection = briefLines.join('\n')

      const sceneId = sceneBrief.sceneNumber || sceneBrief.sceneIndex || 1
      const sceneTitle = sceneBrief.title || `Scene ${sceneId}`

      const userPrompt = `${contractSection}
Write scene ${sceneId}: "${sceneTitle}"

CHAPTER LOG (what has happened before this scene):
${logSummary || '(This is the first scene — nothing has happened yet.)'}

${embeddingContext ? `PREVIOUSLY ESTABLISHED (from existing story content):\n${embeddingContext}\n` : ''}
SCENE BRIEF:
${briefSection}

STORY ARC (for tonal reference):
- Genre: ${storyArc?.genre || ''}
- Tone: ${storyArc?.tone || ''}
- Central conflict: ${storyArc?.centralConflict || ''}

CHARACTER SHEETS:
${charactersSection || '(No character sheets available)'}

WORLD CONTEXT:
${worldSection || '(No world context available)'}

Target word count: approximately ${sceneBrief.estimatedWords || 800} words.

Write ONLY the prose for scene ${sceneId}. Start writing immediately.`

      let fullText = ''

      if (onChunk) {
        await aiStream(userPrompt, systemPrompt, (chunk) => {
          fullText += chunk
          onChunk(chunk, fullText)
        }, { feature: FEATURES.STORY_GENERATION })
      } else {
        fullText = await aiGenerate(userPrompt, systemPrompt, {
          feature: FEATURES.STORY_GENERATION
        })
      }

      return fullText
    } catch (err) {
      writeError.value = err.message || 'Scene writing failed'
      throw err
    } finally {
      isWriting.value = false
    }
  }

  async function writeSceneStructured({ sceneBrief, storyArc, chapterLog, storyBible, onChunk, embeddingContext, storyContract, rejectedPatterns: extraRejected, existingEntitiesJson }) {
    isWriting.value = true
    writeError.value = null

    let accumulated = ''

    try {
      const styleGuide = extractDoc(storyBible || '', 'Style Guide')
      const rejectedPatterns = extractDoc(storyBible || '', 'Avoid These Patterns')
      const charactersSection = extractDoc(storyBible || '', 'Characters')
      const worldSection = extractDoc(storyBible || '', 'World')

      const voiceInstruction = styleGuide || DEFAULT_VOICE

      const allRejected = []
      if (rejectedPatterns) allRejected.push(rejectedPatterns)
      if (extraRejected && extraRejected.length > 0) {
        allRejected.push(extraRejected.map((p, i) =>
          `${i + 1}. Context: "${p.context}" — AVOID generating similar content`
        ).join('\n'))
      }
      const antiPatterns = allRejected.length > 0
        ? `AVOID producing output resembling these rejected examples:\n${allRejected.join('\n')}`
        : ''

      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const { DOCUMENT_PROMPTS } = await import('../config/documentPrompts')
      const activePrompts = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative
      const activeCraftRules = categoryType === 'creative' || categoryType === 'novel' ? `\n\n${CRAFT_RULES}` : ''

      const systemPrompt = `${activePrompts.writer}

${voiceInstruction}

${antiPatterns ? antiPatterns + '\n' : ''}${activeCraftRules}

Respond ONLY with valid JSON. No markdown. No preamble. No explanation outside the JSON.`

      const logSummary = summarizeLog(chapterLog)

      const contractSection = storyContract ? `\nSTORY CONTRACT (world rules — never break these):\n${storyContract}\n` : ''

      const briefLines = sceneBrief.emotionalGoal !== undefined
        ? [
            `- Emotional goal: ${sceneBrief.emotionalGoal}`,
            `- What changes: ${sceneBrief.whatChanges}`,
            `- Characters present: ${(sceneBrief.charactersPresent || []).join(', ')}`,
            `- Character wants: ${JSON.stringify(sceneBrief.characterWants || {}, null, 2)}`,
            `- Setup to plant: ${sceneBrief.setup || ''}`,
            `- Payoff to deliver: ${sceneBrief.payoff || 'none'}`,
            `- Sensory anchor: ${sceneBrief.sensoryAnchor || ''}`,
            `- Tension: ${sceneBrief.tension || 'medium'}`,
            `- Pacing: ${sceneBrief.pacing || 'medium'}`
          ]
        : [
            `- Goal: ${sceneBrief.goal || ''}`,
            `- Obstacle: ${sceneBrief.obstacle || ''}`,
            `- Characters: ${(sceneBrief.characters || []).join(', ')}`,
            `- Location: ${sceneBrief.location || ''}`,
            `- What changes: ${sceneBrief.change || ''}`,
            `- Tone note: ${sceneBrief.toneNote || ''}`
          ]

      const briefSection = briefLines.join('\n')

      const sceneId = sceneBrief.sceneNumber || sceneBrief.sceneIndex || 1
      const sceneTitle = sceneBrief.title || `Scene ${sceneId}`

      const existingContext = existingEntitiesJson
        ? `\nEXISTING WORLD CONTEXT:\n${existingEntitiesJson}\n`
        : ''

      const userPrompt = `${contractSection}
Write scene ${sceneId}: "${sceneTitle}"

CHAPTER LOG (what has happened before this scene):
${logSummary || '(This is the first scene — nothing has happened yet.)'}

${embeddingContext ? `PREVIOUSLY ESTABLISHED (from existing story content):\n${embeddingContext}\n` : ''}
SCENE BRIEF:
${briefSection}

STORY ARC (for tonal reference):
- Genre: ${storyArc?.genre || ''}
- Tone: ${storyArc?.tone || ''}
- Central conflict: ${storyArc?.centralConflict || ''}

CHARACTER SHEETS:
${charactersSection || '(No character sheets available)'}

WORLD CONTEXT:
${worldSection || '(No world context available)'}${existingContext}
Target word count: approximately ${sceneBrief.estimatedWords || 800} words.

Respond ONLY with valid JSON in this exact shape. No markdown. No preamble. No explanation outside the JSON.

{
  "prose": "...",
  "usedEntities": {
    "characterNames": [...],
    "locationNames": [...],
    "plotThreadTitles": [...]
  },
  "newEntities": {
    "characters": [{ "name": "...", "role": "...", "description": "..." }],
    "locations": [{ "name": "...", "type": "...", "description": "..." }],
    "plotThreads": [{ "title": "...", "status": "open", "summary": "..." }]
  },
  "networkEvents": [
    { "type": "relationship", "from": "EntityName", "to": "EntityName", "label": "arrives at" }
  ]
}

IMPORTANT: The prose field must be at least 800 words. Do not truncate the story to save tokens.`

      if (onChunk) {
        await aiStream(userPrompt, systemPrompt, (chunk) => {
          accumulated += chunk
          onChunk(chunk, tryExtractProse(accumulated))
        }, { feature: FEATURES.STORY_GENERATION, maxTokens: 6000 })
      } else {
        accumulated = await aiGenerate(userPrompt, systemPrompt, {
          feature: FEATURES.STORY_GENERATION, maxTokens: 6000
        })
      }

      // Extract structured JSON after streaming completes
      const parsed = finalizeStream(accumulated)
      return {
        prose: parsed.prose || accumulated,
        structured: parsed
      }
    } catch (err) {
      // Graceful degradation: return extracted prose if JSON parsing failed
      if (err.message?.includes('JSON')) {
        const fallback = tryExtractProse(accumulated) || accumulated
        return { prose: fallback, structured: null }
      }
      writeError.value = err.message || 'Scene writing failed'
      throw err
    } finally {
      isWriting.value = false
    }
  }

  return { writeScene, writeSceneStructured, isWriting, writeError }
}

export { extractDoc, summarizeLog }
