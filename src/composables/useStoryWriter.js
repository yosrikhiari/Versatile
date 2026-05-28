import { ref } from 'vue'
import { aiGenerate, aiStream } from '../services/aiService'
import { FEATURES } from '../config/ai'

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

      const systemPrompt = `You are a fiction writer. Write compelling prose.

${voiceInstruction}

${antiPatterns ? antiPatterns + '\n' : ''}
${CRAFT_RULES}

Write ONLY the prose for this scene. Do not summarize. Do not add headings like "Scene 1". Do not break the fourth wall. Start writing immediately.`

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

  return { writeScene, isWriting, writeError }
}
