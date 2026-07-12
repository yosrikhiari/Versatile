import { DOCUMENT_PROMPTS } from '../config/documentPrompts'
import { summarizeLog } from '../utils/promptUtils'

/**
 * @param {object} sceneBrief
 * @returns {string}
 */
function buildBriefSection(sceneBrief) {
  const lines =
    sceneBrief.emotionalGoal !== undefined
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

  if (sceneBrief.emotionalGoal !== undefined && sceneBrief.arcPosition) {
    lines.push(`- Arc position: ${sceneBrief.arcPosition}`)
  }

  return lines.join('\n')
}

/**
 * @param {number} sceneId
 * @returns {string}
 */
function buildJsonOutputInstructions(sceneId) {
  return `Respond ONLY with valid JSON in this exact shape. No markdown. No preamble. No explanation outside the JSON.

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

IMPORTANT: The prose field must reach the word count target above. Do not end the scene early — keep writing until the word target is met.
CRITICAL JSON RULE: The prose field is a JSON string value. ALL double quotes inside it MUST be escaped as \\" — especially dialogue quotes. For dialogue, use single quotes or curly quotes (\\u201C/\\u201D) to avoid breaking the JSON.`
}

/**
 * @param {object} params
 * @param {string} [params.categoryType='creative']
 * @param {string} params.voiceInstruction
 * @param {string} params.antiPatterns
 * @param {string} params.activeCraftRules
 * @param {string|null} [params.pastEvalResults]
 * @param {string} [params.proseStyleGuide]
 * @param {string|null} [params.focusInstructions]
 * @param {string} [params.profileStyleGuide]
 * @param {string} [params.voiceConstraint]
 * @returns {string}
 */
function buildSystemPrompt({
  categoryType = 'creative',
  voiceInstruction,
  antiPatterns,
  activeCraftRules,
  pastEvalResults,
  proseStyleGuide,
  focusInstructions,
  profileStyleGuide,
  voiceConstraint
}) {
  const activePrompts = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative

  if (!proseStyleGuide) {
    return `${activePrompts.writer}${activeCraftRules || ''}

${voiceConstraint || ''}${voiceInstruction}

${antiPatterns ? antiPatterns + '\n' : ''}
Write ONLY the detailed content for this section. Do not summarize. Start writing immediately.`
  }

  return `${activePrompts.writer}${activeCraftRules || ''}

${proseStyleGuide}
${profileStyleGuide ? `\n${profileStyleGuide}\n` : ''}

${voiceConstraint || ''}${voiceInstruction}

${antiPatterns ? antiPatterns + '\n' : ''}
${pastEvalResults ? `\n## PAST EVALUATION FEEDBACK\n${pastEvalResults}\n` : ''}
${focusInstructions ? `\n${focusInstructions}\n` : ''}
Respond ONLY with valid JSON. No markdown. No preamble. No explanation outside the JSON.`
}

/**
 * @param {object} params
 * @param {object} params.sceneBrief
 * @param {object} params.storyArc
 * @param {string[]} params.chapterLog
 * @param {number} params.sceneId
 * @param {string} params.sceneTitle
 * @param {string} params.contractSection
 * @param {string} params.embeddingContext
 * @param {string} params.existingEntitiesJson
 * @param {string} params.charactersSection
 * @param {string} params.worldSection
 * @param {string} params.spineSection
 * @param {string} params.anchorSection
 * @param {number} [params.estimatedWords=800]
 * @param {boolean} [params.isStructuredMode=false]
 * @param {string} [params.logSummary]
 * @returns {string}
 */
function buildUserPrompt({
  sceneBrief,
  storyArc,
  chapterLog,
  sceneId,
  sceneTitle,
  contractSection,
  embeddingContext,
  existingEntitiesJson,
  charactersSection,
  worldSection,
  spineSection,
  anchorSection,
  estimatedWords = 800,
  isStructuredMode = false,
  logSummary
}) {
  const log = logSummary !== undefined ? logSummary : summarizeLog(chapterLog)
  const logText = log || '(This is the first scene — nothing has happened yet.)'
  const briefSection = buildBriefSection(sceneBrief)

  if (!isStructuredMode) {
    return `${contractSection}
Write scene ${sceneId}: "${sceneTitle}"

CHAPTER LOG (what has happened before this scene):
${logText}

${embeddingContext ? `PREVIOUSLY ESTABLISHED (from existing story content):\n${embeddingContext}\n` : ''}SCENE BRIEF:
${briefSection}

${existingEntitiesJson ? `EXISTING ENTITIES (already established in the story — maintain these):\n${existingEntitiesJson}\n` : ''}STORY ARC (for tonal reference):
- Genre: ${storyArc?.genre || ''}
- Tone: ${storyArc?.tone || ''}
- Central conflict: ${storyArc?.centralConflict || ''}

CHARACTER SHEETS:
${charactersSection || '(No character sheets available)'}

WORLD CONTEXT:
${worldSection || '(No world context available)'}

Target word count: approximately ${estimatedWords} words.

Write ONLY the prose for scene ${sceneId}. Start writing immediately.`
  }

  const existingContext = existingEntitiesJson
    ? `\nEXISTING WORLD CONTEXT:\n${existingEntitiesJson}\n`
    : ''

  return `${contractSection}${spineSection ? `\nNOVEL SPINE (read this to maintain cross-chapter coherence):\n${spineSection}\n` : ''}${anchorSection ? `\nANCHOR ROLE: ${anchorSection}\n` : ''}
Write scene ${sceneId}: "${sceneTitle}"

CHAPTER LOG (what has happened before this scene):
${logText}

${embeddingContext ? `PREVIOUSLY ESTABLISHED (from existing story content):\n${embeddingContext}\n` : ''}SCENE BRIEF:
${briefSection}

STORY ARC (for tonal reference):
- Genre: ${storyArc?.genre || ''}
- Tone: ${storyArc?.tone || ''}
- Central conflict: ${storyArc?.centralConflict || ''}

CHARACTER SHEETS:
${charactersSection || '(No character sheets available)'}

WORLD CONTEXT:
${worldSection || '(No world context available)'}${existingContext}
The scene MUST be at least ${estimatedWords} words. Do not end the scene early. If you are below the word count, continue writing until you reach it.

${buildJsonOutputInstructions(sceneId)}`
}

export function usePromptBuilder() {
  return {
    buildSystemPrompt,
    buildUserPrompt,
    summarizeLog,
    buildBriefSection,
    buildJsonOutputInstructions
  }
}
