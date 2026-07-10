import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { aiGenerate, aiStream } from './useAiService'
import { FEATURES } from '../config/ai'
import { DOCUMENT_PROMPTS } from '../config/documentPrompts'
import { finalizeStream } from '../services/jsonExtractor'
import { formatEvalFeedback } from '../services/evalFeedback'
import { getVoiceProfile } from '../config/voiceProfiles'
import { buildSceneContext } from '../services/sceneContextService'
import { summarizeLog } from '../utils/promptUtils'

const FALLBACK_VOICE = `Write in third person limited. Past tense. Favor specific concrete nouns over category nouns. Show emotional states through physical sensation and action, not direct statement. Vary sentence length — short during tension, longer during reflection.`

const CRAFT_RULES = `CRAFT RULES — follow all of these:
1. Every scene must include at least one auditory detail and one tactile detail
2. Characters under stress never say exactly what they mean — write subtext
3. Avoid: "she felt X" — show the feeling through body/action/dialogue
4. Specific beats generic: '94 Civic with cracked dash > 'old car'
5. The first sentence of a scene must create forward motion or tension
6. The last sentence must leave something unresolved or changed`

const PROSE_STYLE_GUIDE = `PROSE STYLE GUIDE — apply these rules to every scene:

VOICE:
- Write in close third person — stay inside the protagonist's skull at all times. Never pull back to omniscient.
- Narrative irony: the protagonist's internal commentary should be drier and more self-aware than their circumstances warrant. Deadpan understatement in response to catastrophe.
- The reader knows what the protagonist knows, when they know it. No dramatic irony.
- Internal voice register is colloquial. External narration is a half-step more formal — the gap between them creates the sense of a thinking mind.

PROSE RULES:
- Open every scene mid-physical-detail, mid-action, or mid-emotional-state. No establishing shots. No scene-setting preamble before the first sentence.
- Paragraph rhythm: 2–3 sentence paragraphs alternating with single-sentence emphasis beats. Single-sentence paragraphs are emotional punctuation only — never description.
- Sensory priority: physical sensation first (pain, cold, hunger), then temperature, then sight. Sound and taste sparingly. Smell last, used once per scene at most.
- Worldbuilding only through immediate experience. No standalone lore paragraphs.
- All exposition must be delivered through a character's direct perception.

DIALOGUE:
- Every line must do at least two things simultaneously: reveal character + advance situation, or establish subtext + reveal relationship.
- Characters express care, threat, status, and alliance obliquely — never directly.
- Tags: "said" and "added" only. No adverb tags. Prefer action beats over tags.
- When a character's voice identifies them uniquely, omit the tag.

CONTEXT-ADAPTIVE RULES (weight these based on this scene's TENSION, PACING, and ARC POSITION from the SCENE BRIEF above):
- Tension HIGH or PEAK: compress paragraphs, foreground subtext over direct speech, minimize interiority, hard stop.
- Tension LOW or MEDIUM: expand interiority, relax into sensory detail, allow reflective passages.
- Pacing SLOW: deeper sensory depth, longer paragraphs, extended interiority.
- Pacing FAST: compressed action, minimal interiority, short declarative sentences.
- Arc position OPENING: establish immediate physical reality and the protagonist's emotional state at entry.
- Arc position RISING: complicate what was established, introduce new pressure.
- Arc position CLIMAX: escalation beats, payoff delivery, hard stop on unresolved threat.
- Arc position FALLING or RESOLUTION: emotional landing, consequences revealed, softer close that implies continuation.

CHAPTER STRUCTURE (for volume/novel mode):
- Open with immediate physical or emotional reality. Complicate. Escalate. Close on unresolved threat or stated-but-unfulfilled intention.
- Never close a chapter on resolution. The reader must need the next page.
- Middle scenes (not opening/closing) are complication-and-escalation beats. The chapter's closing scene owns the hook.

PROTAGONIST VOICE:
- Internal monologue: deadpan understatement, immediate pragmatic calculation over emotion, brief compassion suppressed by survival logic, specific grudges stated as calm intentions.
- Never express vulnerability directly. Never be heroic or inspirational in internal monologue.
- React to catastrophe with pragmatic acceptance before emotion. Never be surprised by own competence.
- Internal vocabulary is colloquial — save elevated language for the narration frame.

FORBIDDEN (do not use these under any circumstances):
- Purple prose or flowery description
- "He felt X" — show through action or thought
- Heroic internal monologue
- Protagonist surprised by own competence
- Exposition dumps — worldbuilding only through immediate experience
- Omniscient narration or dramatic irony
- Characters saying what they mean directly
- Adverb dialogue tags
- Resolution at chapter close
- Standalone lore paragraphs`

function extractDoc(docString, heading) {
  if (!docString) return ''
  const regex = new RegExp(`#+\\s*${heading}[\\s\\S]*?(?=\n#|$)`, 'i')
  const match = docString.match(regex)
  return match ? match[0].trim() : ''
}

function tryExtractProse(raw) {
  // Attempt full parse first
  try {
    const parsed = finalizeStream(raw)
    if (parsed && typeof parsed.prose === 'string') return parsed.prose
  } catch {
    // Not valid JSON yet; fall through to lenient extraction below.
  }

  // Fallback: locate prose between "prose": " and the next known key
  const proseKey = '"prose": "'
  const proseIdx = raw.indexOf(proseKey)
  if (proseIdx === -1) return ''

  const afterKey = proseIdx + proseKey.length

  // Find whichever structural key comes first after the prose value
  let endIdx = -1
  for (const key of ['"usedEntities"', '"newEntities"']) {
    const idx = raw.indexOf(key, afterKey)
    if (idx !== -1 && (endIdx === -1 || idx < endIdx)) endIdx = idx
  }
  if (endIdx === -1) return ''

  // Work backward from the end marker to find the last unescaped " before it
  let proseEnd = -1
  let i = endIdx - 1
  while (i >= afterKey) {
    if (raw[i] === '"') {
      let bs = 0
      while (i - bs - 1 >= 0 && raw[i - bs - 1] === '\\') bs++
      if (bs % 2 === 0) {
        proseEnd = i
        break
      }
    }
    i--
  }
  if (proseEnd === -1) return ''

  return raw
    .slice(afterKey, proseEnd)
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
}

function tryExtractStructured(raw) {
  const result = {}
  for (const key of ['"usedEntities"', '"newEntities"', '"networkEvents"']) {
    try {
      const keyIdx = raw.indexOf(key)
      if (keyIdx === -1) continue
      const colonIdx = raw.indexOf(':', keyIdx + key.length)
      if (colonIdx === -1) continue
      const openChars = ['{', '[']
      let valueStart = -1
      for (const ch of openChars) {
        const idx = raw.indexOf(ch, colonIdx)
        if (idx !== -1 && (valueStart === -1 || idx < valueStart)) valueStart = idx
      }
      if (valueStart === -1) continue
      const openChar = raw[valueStart]
      const closeChar = openChar === '{' ? '}' : ']'
      let depth = 0,
        endIdx = -1
      for (let i = valueStart; i < raw.length; i++) {
        if (raw[i] === openChar) depth++
        else if (raw[i] === closeChar) {
          depth--
          if (depth === 0) {
            endIdx = i
            break
          }
        }
      }
      if (endIdx === -1) continue
      const keyName = key.slice(1, -1)
      result[keyName] = JSON.parse(raw.slice(valueStart, endIdx + 1))
    } catch {
      // This key's value isn't complete/valid JSON yet; skip it.
    }
  }
  return Object.keys(result).length ? result : null
}

export function useStoryWriter() {
  const isWriting = ref(false)
  const writeError = ref(null)

  async function writeScene({
    sceneBrief,
    storyArc,
    chapterLog,
    storyBible,
    onChunk,
    embeddingContext,
    storyContract,
    rejectedPatterns: extraRejected,
    existingEntitiesJson,
    voiceProfile,
    completedScenes,
    characters
  }) {
    isWriting.value = true
    writeError.value = null

    try {
      const styleGuide = extractDoc(storyBible || '', 'Style Guide')
      const rejectedPatterns = extractDoc(storyBible || '', 'Avoid These Patterns')
      // Inject the full context document wholesale as authoritative canon. Previously
      // only the Characters/World headings were extracted, silently dropping timeline,
      // relationships, and the story-so-far summary — a major cause of hallucinated and
      // self-contradicting scenes when continuing an existing draft.
      const storyContextBlock =
        storyBible && storyBible.trim()
          ? `STORY CONTEXT (established canon — everything below is already TRUE; never contradict or re-invent it):\n${storyBible.trim()}\n`
          : ''

      const profileResult = voiceProfile ? getVoiceProfile(voiceProfile, FALLBACK_VOICE) : null
      const voiceInstruction = profileResult?.voiceInstruction || styleGuide || FALLBACK_VOICE
      const profileStyleGuide = profileResult?.styleGuide || ''

      const sceneContext =
        completedScenes?.length > 0
          ? buildSceneContext({
              completedScenes,
              characters: characters || [],
              currentSceneIndex: sceneBrief.sceneNumber || 0
            })
          : embeddingContext || ''

      const allRejected = []
      if (rejectedPatterns) allRejected.push(rejectedPatterns)
      if (extraRejected && extraRejected.length > 0) {
        allRejected.push(
          extraRejected
            .map((p, i) => `${i + 1}. Context: "${p.context}" — AVOID generating similar content`)
            .join('\n')
        )
      }
      const antiPatterns =
        allRejected.length > 0
          ? `AVOID producing output resembling these rejected examples:\n${allRejected.join('\n')}`
          : ''

      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const activePrompts = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative
      const activeCraftRules =
        categoryType === 'creative' || categoryType === 'novel' ? `\n\n${CRAFT_RULES}` : ''

      const voiceConstraint = activeCraftRules
        ? `IMPORTANT: Apply the following voice guidance within the craft constraints above. The craft constraints are hard rules and take priority.\n\n`
        : ''

      const systemPrompt = `${activePrompts.writer}${activeCraftRules}

${PROSE_STYLE_GUIDE}
${profileStyleGuide ? `\n${profileStyleGuide}\n` : ''}

${voiceConstraint}${voiceInstruction}

${antiPatterns ? antiPatterns + '\n' : ''}
Write ONLY the detailed content for this section. Do not summarize. Start writing immediately.`

      const logSummary = summarizeLog(chapterLog)

      const contractSection = storyContract
        ? `\nSTORY CONTRACT (world rules — never break these):\n${storyContract}\n`
        : ''

      const briefLines =
        sceneBrief.emotionalGoal !== undefined
          ? [
              `- Emotional goal: ${sceneBrief.emotionalGoal}`,
              `- What changes: ${sceneBrief.whatChanges}`,
              ...(sceneBrief.pov
                ? [
                    `- POV: write this scene strictly from ${sceneBrief.pov}'s point of view — do not head-hop into other characters' thoughts`
                  ]
                : []),
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

${sceneContext ? `PREVIOUSLY ESTABLISHED (from existing story content):\n${sceneContext}\n` : ''}
SCENE BRIEF:
${briefSection}

${existingEntitiesJson ? `EXISTING ENTITIES (already established in the story — maintain these):\n${existingEntitiesJson}\n` : ''}
STORY ARC (for tonal reference):
- Genre: ${storyArc?.genre || ''}
- Tone: ${storyArc?.tone || ''}
- Central conflict: ${storyArc?.centralConflict || ''}

${storyContextBlock}
Target word count: approximately ${sceneBrief.estimatedWords || 800} words.

Write ONLY the prose for scene ${sceneId}. Start writing immediately.`

      let fullText = ''

      if (onChunk) {
        await aiStream(
          userPrompt,
          systemPrompt,
          (chunk) => {
            fullText += chunk
            onChunk(chunk, fullText)
          },
          { feature: FEATURES.STORY_GENERATION }
        )
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

  async function writeSceneStructured({
    sceneBrief,
    storyArc,
    chapterLog,
    storyBible,
    onChunk,
    onRawChunk,
    embeddingContext,
    storyContract,
    rejectedPatterns: extraRejected,
    existingEntitiesJson,
    spineContext,
    anchorRole,
    anchorConstraints,
    pastEvalResults,
    voiceProfile,
    completedScenes,
    characters
  }) {
    isWriting.value = true
    writeError.value = null

    let accumulated = ''

    try {
      const styleGuide = extractDoc(storyBible || '', 'Style Guide')
      const rejectedPatterns = extractDoc(storyBible || '', 'Avoid These Patterns')
      // Inject the full context document wholesale as authoritative canon. Previously
      // only the Characters/World headings were extracted, silently dropping timeline,
      // relationships, and the story-so-far summary — a major cause of hallucinated and
      // self-contradicting scenes when continuing an existing draft.
      const storyContextBlock =
        storyBible && storyBible.trim()
          ? `STORY CONTEXT (established canon — everything below is already TRUE; never contradict or re-invent it):\n${storyBible.trim()}\n`
          : ''

      const profileResult = voiceProfile ? getVoiceProfile(voiceProfile, FALLBACK_VOICE) : null
      const voiceInstruction = profileResult?.voiceInstruction || styleGuide || FALLBACK_VOICE
      const profileStyleGuide = profileResult?.styleGuide || ''

      const sceneContext =
        completedScenes?.length > 0
          ? buildSceneContext({
              completedScenes,
              characters: characters || [],
              currentSceneIndex: sceneBrief.sceneNumber || 0
            })
          : embeddingContext || ''

      const allRejected = []
      if (rejectedPatterns) allRejected.push(rejectedPatterns)
      if (extraRejected && extraRejected.length > 0) {
        allRejected.push(
          extraRejected
            .map((p, i) => `${i + 1}. Context: "${p.context}" — AVOID generating similar content`)
            .join('\n')
        )
      }
      const antiPatterns =
        allRejected.length > 0
          ? `AVOID producing output resembling these rejected examples:\n${allRejected.join('\n')}`
          : ''

      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const activePrompts = DOCUMENT_PROMPTS[categoryType] || DOCUMENT_PROMPTS.creative
      const activeCraftRules =
        categoryType === 'creative' || categoryType === 'novel' ? `\n\n${CRAFT_RULES}` : ''

      const voiceConstraint = activeCraftRules
        ? `IMPORTANT: Apply the following voice guidance within the craft constraints above. The craft constraints are hard rules and take priority.\n\n`
        : ''

      const systemPrompt = `${activePrompts.writer}${activeCraftRules}

${PROSE_STYLE_GUIDE}
${profileStyleGuide ? `\n${profileStyleGuide}\n` : ''}

${voiceConstraint}${voiceInstruction}

${antiPatterns ? antiPatterns + '\n' : ''}
${pastEvalResults ? `\n## PAST EVALUATION FEEDBACK\n${pastEvalResults}\n` : ''}
Respond ONLY with valid JSON. No markdown. No preamble. No explanation outside the JSON.`

      const logSummary = summarizeLog(chapterLog)

      const contractSection = storyContract
        ? `\nSTORY CONTRACT (world rules — never break these):\n${storyContract}\n`
        : ''

      const briefLines =
        sceneBrief.emotionalGoal !== undefined
          ? [
              `- Emotional goal: ${sceneBrief.emotionalGoal}`,
              `- What changes: ${sceneBrief.whatChanges}`,
              ...(sceneBrief.pov
                ? [
                    `- POV: write this scene strictly from ${sceneBrief.pov}'s point of view — do not head-hop into other characters' thoughts`
                  ]
                : []),
              `- Characters present: ${(sceneBrief.charactersPresent || []).join(', ')}`,
              `- Character wants: ${JSON.stringify(sceneBrief.characterWants || {}, null, 2)}`,
              `- Setup to plant: ${sceneBrief.setup || ''}`,
              `- Payoff to deliver: ${sceneBrief.payoff || 'none'}`,
              `- Sensory anchor: ${sceneBrief.sensoryAnchor || ''}`,
              `- Tension: ${sceneBrief.tension || 'medium'}`,
              `- Pacing: ${sceneBrief.pacing || 'medium'}`,
              `- Arc position: ${sceneBrief.arcPosition || ''}`
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

      const anchorSection = anchorRole
        ? `\nANCHOR ROLE: ${anchorRole}\n${anchorConstraints || ''}\n`
        : ''
      const spineSection = spineContext
        ? `\nNOVEL SPINE (read this to maintain cross-chapter coherence):\n${spineContext}\n`
        : ''

      const userPrompt = `${contractSection}${spineSection}${anchorSection}
Write scene ${sceneId}: "${sceneTitle}"

CHAPTER LOG (what has happened before this scene):
${logSummary || '(This is the first scene — nothing has happened yet.)'}

${sceneContext ? `PREVIOUSLY ESTABLISHED (from existing story content):\n${sceneContext}\n` : ''}
SCENE BRIEF:
${briefSection}

STORY ARC (for tonal reference):
- Genre: ${storyArc?.genre || ''}
- Tone: ${storyArc?.tone || ''}
- Central conflict: ${storyArc?.centralConflict || ''}

${storyContextBlock}${existingContext}
The scene MUST be at least ${sceneBrief.estimatedWords || 800} words. Do not end the scene early. If you are below the word count, continue writing until you reach it.

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
  ],
  "keyFacts": ["durable canon THIS scene establishes: who is now injured/dead/changed, who learned or revealed what, time elapsed. 0-4 short factual statements. Omit the field or use [] if nothing durable changed."]
}

IMPORTANT: The prose field must reach the word count target above. Do not end the scene early — keep writing until the word target is met.
CRITICAL JSON RULE: The prose field is a JSON string value. ALL double quotes inside it MUST be escaped as \" — especially dialogue quotes. For dialogue, use single quotes or curly quotes (\u201C/\u201D) to avoid breaking the JSON.`

      // Compute a tight token cap based on the scene's word target
      const estimatedWords = sceneBrief.estimatedWords || 800
      const maxTokens = Math.max(2000, Math.min(4500, Math.ceil(estimatedWords * 1.8) + 800))

      if (onChunk) {
        // Lightweight prose detection state machine — avoids O(n²) full-buffer
        // re-scanning that tryExtractProse() would cause on every chunk.
        let proseStarted = false
        let pendingPrefix = ''
        let proseEnded = false
        const END_MARKERS = ['"usedEntities"', '"newEntities"', '"networkEvents"']
        let recentTail = '' // rolling window for end-of-prose detection

        await aiStream(
          userPrompt,
          systemPrompt,
          (chunk) => {
            accumulated += chunk
            if (onRawChunk) onRawChunk(chunk)
            if (proseEnded) return

            if (!proseStarted) {
              pendingPrefix += chunk
              const proseKey = '"prose"'
              const keyIdx = pendingPrefix.indexOf(proseKey)
              if (keyIdx !== -1) {
                proseStarted = true
                const colonIdx = pendingPrefix.indexOf(':', keyIdx + proseKey.length)
                if (colonIdx !== -1) {
                  const quoteIdx = pendingPrefix.indexOf('"', colonIdx + 1)
                  if (quoteIdx !== -1) {
                    const remainder = pendingPrefix.slice(quoteIdx + 1)
                    if (remainder.length > 0) onChunk(remainder, remainder)
                  }
                }
                pendingPrefix = '' // free memory
              }
            } else {
              // Check rolling tail for structural key (end of prose value)
              recentTail = (recentTail + chunk).slice(-40)
              for (const marker of END_MARKERS) {
                if (recentTail.includes(marker)) {
                  proseEnded = true
                  return
                }
              }
              onChunk(chunk, chunk)
            }
          },
          { feature: FEATURES.STORY_GENERATION, maxTokens }
        )
      } else {
        accumulated = await aiGenerate(userPrompt, systemPrompt, {
          feature: FEATURES.STORY_GENERATION,
          maxTokens
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
        const structured = tryExtractStructured(accumulated)
        return { prose: fallback, structured }
      }
      writeError.value = err.message || 'Scene writing failed'
      throw err
    } finally {
      isWriting.value = false
    }
  }

  return { writeScene, writeSceneStructured, isWriting, writeError }
}

export { summarizeLog }
