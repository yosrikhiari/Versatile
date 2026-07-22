import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { aiGenerate, aiStream, aiGenerateJson } from './useAiService'
import { FEATURES } from '../config/ai'

import { formatEvalFeedback } from '../services/evalFeedback'
import { getVoiceProfile } from '../config/voiceProfiles'
import { buildPersonaBlock } from '../config/writerPersonas'
import { computeComplexityLevel } from '../config/modelRouting'
import { buildSceneContext } from '../services/sceneContextService'
import { usePromptBuilder } from './usePromptBuilder'
import { summarizeLog } from '../utils/promptUtils'
import { fitSceneContext } from '../services/ai/contextBudget'

// Schema for the metadata-extraction pass (call 2). Extractive, not generative:
// the prose already exists, so a small local model does this well even though it
// cannot write long prose inside a JSON envelope (verified — see the note on
// writeSceneStructured). Native structured output (Ollama grammar) is ideal here
// precisely because there is no length to suppress.
const SCENE_METADATA_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    usedEntities: {
      type: 'object',
      properties: {
        characterNames: { type: 'array', items: { type: 'string' } },
        locationNames: { type: 'array', items: { type: 'string' } },
        plotThreadTitles: { type: 'array', items: { type: 'string' } }
      }
    },
    newEntities: {
      type: 'object',
      properties: {
        characters: { type: 'array', items: { type: 'object' } },
        locations: { type: 'array', items: { type: 'object' } },
        plotThreads: { type: 'array', items: { type: 'object' } }
      }
    },
    networkEvents: { type: 'array', items: { type: 'object' } },
    keyFacts: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary']
}

const EMPTY_METADATA = {
  summary: '',
  usedEntities: { characterNames: [], locationNames: [], plotThreadTitles: [] },
  newEntities: { characters: [], locations: [], plotThreads: [] },
  networkEvents: [],
  keyFacts: []
}

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

/**
 * Undo wrapping a model sometimes adds despite being told to emit plain prose:
 * a markdown code fence, or a leftover {"prose": "..."} envelope. Best-effort and
 * cheap — if nothing matches, the text is returned unchanged.
 */
function stripAccidentalWrapping(text) {
  let out = String(text || '').trim()
  // ```lang\n...\n```
  const fence = out.match(/^```[a-z]*\n([\s\S]*?)\n```$/i)
  if (fence) out = fence[1].trim()
  // A stray JSON envelope — pull the prose field back out.
  if (out.startsWith('{')) {
    try {
      const obj = JSON.parse(out)
      if (obj && typeof obj.prose === 'string' && obj.prose.trim()) return obj.prose.trim()
    } catch {
      // Not valid JSON — leave it; the prose is still readable as-is.
    }
  }
  return out
}

/**
 * Second pass: extract entities/facts/summary FROM finished prose.
 *
 * Split out from generation because asking a small local model to write long
 * prose inside a JSON envelope suppresses the prose ~44x (dolphin-mistral:7b: 711
 * words as plain prose vs 16 words JSON-wrapped, same brief — see
 * scripts/ml-pipelines/potato-profile/smoke-writer.js). Generation and
 * extraction are different skills; a 7B model is fine at the second when it is
 * not simultaneously doing the first.
 *
 * Never throws — metadata is enrichment, not the deliverable. A failed
 * extraction returns empty structures so the scene's prose still lands.
 *
 * @returns {Promise<object>} the metadata fields, always shaped like EMPTY_METADATA
 */
async function extractSceneMetadata(prose, { entityContext, signal } = {}) {
  const excerpt = String(prose || '').slice(0, 6000)
  if (!excerpt.trim()) return { ...EMPTY_METADATA }

  const prompt = `Read this scene and extract structured metadata about it. Do not rewrite or summarize the prose beyond the one-sentence summary field.

${entityContext ? `KNOWN ENTITIES (already established — classify references to these as "used", anything genuinely new as "new"):\n${entityContext}\n\n` : ''}SCENE:
${excerpt}

Extract:
- summary: exactly one concise sentence describing what happens, for the chapter log.
- usedEntities: names of already-known characters/locations/plotThreads that appear.
- newEntities: characters/locations/plotThreads introduced here that were not already known.
- networkEvents: relationship changes, e.g. { "type": "relationship", "from": "A", "to": "B", "label": "arrives at" }.
- keyFacts: 0-4 short statements of durable canon this scene establishes (who is now injured/dead/changed, who learned what, time elapsed). [] if nothing durable changed.`

  try {
    const meta = await aiGenerateJson(
      prompt,
      'You extract structured metadata from prose. Respond only with the requested JSON.',
      {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.2,
        // Generous on purpose. The JSON itself needs ~300 tokens, but thinking
        // models (qwen3 et al.) spend output budget on reasoning BEFORE the
        // JSON; an 800 cap truncated qwen3's response mid-object and the
        // grammar path died with "Unexpected end of JSON input" (seen live in
        // sweep-writer). num_predict is a ceiling, not a target — non-thinking
        // models stop early and pay nothing for the headroom.
        maxTokens: 2500,
        schema: SCENE_METADATA_SCHEMA,
        schemaName: 'scene_metadata',
        signal
      }
    )
    return { ...EMPTY_METADATA, ...meta }
  } catch (err) {
    console.warn('[useStoryWriter] metadata extraction failed; prose kept, metadata empty:', err)
    return { ...EMPTY_METADATA }
  }
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
              currentSceneIndex: sceneBrief.sceneNumber || 0,
              currentSceneBrief: sceneBrief
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
      const activePrompts = projectStore.getActivePrompts(categoryType)
      const activeCraftRules =
        categoryType === 'creative' || categoryType === 'novel' ? `\n\n${CRAFT_RULES}` : ''

      const voiceConstraint = activeCraftRules
        ? `IMPORTANT: Apply the following voice guidance within the craft constraints above. The craft constraints are hard rules and take priority.\n\n`
        : ''

      const personaBlock = buildPersonaBlock({
        genre: storyArc?.genre,
        pov: sceneBrief.pov,
        tone: storyArc?.tone
      })
      const personaSection = personaBlock ? `\n${personaBlock}\n` : ''

      const systemPrompt = `${activePrompts.writer}${activeCraftRules}${personaSection}

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

      const complexity = computeComplexityLevel({
        feature: FEATURES.STORY_GENERATION,
        sceneBrief,
        storyArc
      })

      let fullText = ''

      if (onChunk) {
        await aiStream(
          userPrompt,
          systemPrompt,
          (chunk) => {
            fullText += chunk
            onChunk(chunk, fullText)
          },
          { feature: FEATURES.STORY_GENERATION, complexity }
        )
      } else {
        fullText = await aiGenerate(userPrompt, systemPrompt, {
          feature: FEATURES.STORY_GENERATION,
          complexity
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
    focusInstructions,
    voiceProfile,
    completedScenes,
    characters,
    signal
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
              currentSceneIndex: sceneBrief.sceneNumber || 0,
              currentSceneBrief: sceneBrief
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
      const activeCraftRules =
        categoryType === 'creative' || categoryType === 'novel' ? `\n\n${CRAFT_RULES}` : ''

      const voiceConstraint = activeCraftRules
        ? `IMPORTANT: Apply the following voice guidance within the craft constraints above. The craft constraints are hard rules and take priority.\n\n`
        : ''

      const personaBlock = buildPersonaBlock({
        genre: storyArc?.genre,
        pov: sceneBrief.pov,
        tone: storyArc?.tone
      })
      const { buildSystemPrompt } = usePromptBuilder()
      const systemPrompt = buildSystemPrompt({
        categoryType,
        voiceInstruction,
        antiPatterns,
        activeCraftRules,
        pastEvalResults,
        proseStyleGuide: PROSE_STYLE_GUIDE,
        focusInstructions,
        profileStyleGuide,
        voiceConstraint,
        promptOverrides: projectStore.promptOverrides,
        personaBlock
      })

      const logSummary = summarizeLog(chapterLog)

      // Fit the variable context to the model's REAL window before assembling.
      //
      // Ollama does not reject an oversized prompt — it silently discards part of
      // it. Measured: ~6,153 tokens sent at num_ctx=4096, 2,050 evaluated, no
      // error (reports/ollama-probe.json). And it discards from the FRONT, where
      // the canon lives, while the JSON rules at the end always survive.
      //
      // So the question is not whether context gets dropped. It is whether WE
      // choose — by value, and out loud — or the server chooses, by position, in
      // silence. Only the variable inputs are budgeted; the template below is
      // untouched, so the prompt's shape and wording do not move.
      const outputTokens = Math.max(
        2000,
        Math.min(4500, Math.ceil((sceneBrief.estimatedWords || 800) * 1.8) + 800)
      )
      const fitted = fitSceneContext({
        storyContract,
        spineContext,
        storyContextBlock,
        existingEntitiesJson,
        sceneContext,
        logSummary,
        outputTokens
      })
      if (fitted.note) {
        console.warn(
          `[useStoryWriter] scene "${sceneBrief.title || sceneBrief.sceneNumber || ''}" context budget: ${fitted.note}`
        )
      }

      const contractSection = fitted.storyContract
        ? `\nSTORY CONTRACT (world rules — never break these):\n${fitted.storyContract}\n`
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

      const existingContext = fitted.existingEntitiesJson
        ? `\nEXISTING WORLD CONTEXT:\n${fitted.existingEntitiesJson}\n`
        : ''

      const anchorSection = anchorRole
        ? `\nANCHOR ROLE: ${anchorRole}\n${anchorConstraints || ''}\n`
        : ''

      const spineSection = fitted.spineContext
        ? `\nNOVEL SPINE (read this to maintain cross-chapter coherence):\n${fitted.spineContext}\n`
        : ''

      const userPrompt = `${contractSection}${spineSection}${anchorSection}
Write scene ${sceneId}: "${sceneTitle}"

CHAPTER LOG (what has happened before this scene):
${fitted.logSummary || '(This is the first scene — nothing has happened yet.)'}

${fitted.sceneContext ? `PREVIOUSLY ESTABLISHED (from existing story content):\n${fitted.sceneContext}\n` : ''}
SCENE BRIEF:
${briefSection}

STORY ARC (for tonal reference):
- Genre: ${storyArc?.genre || ''}
- Tone: ${storyArc?.tone || ''}
- Central conflict: ${storyArc?.centralConflict || ''}

${fitted.storyContextBlock}${existingContext}
The scene MUST be at least ${sceneBrief.estimatedWords || 800} words. Do not end the scene early. If you are below the word count, continue writing until you reach it.

Write the scene now as prose. Output ONLY the scene text — no JSON, no headings, no preamble, no notes. Start with the first sentence of the scene.`

      // Compute a tight token cap based on the scene's word target
      const estimatedWords = sceneBrief.estimatedWords || 800
      const maxTokens = Math.max(2000, Math.min(4500, Math.ceil(estimatedWords * 1.8) + 800))

      const complexity = computeComplexityLevel({
        feature: FEATURES.STORY_GENERATION,
        sceneBrief,
        storyArc
      })

      // CALL 1 — prose. Plain text, not wrapped in a JSON envelope, because that
      // envelope suppresses prose length ~44x on a small local model (verified,
      // see extractSceneMetadata). Every streamed token IS prose now, so the old
      // state machine that dug prose out of a streaming JSON string is gone.
      if (onChunk) {
        await aiStream(
          userPrompt,
          systemPrompt,
          (chunk) => {
            accumulated += chunk
            if (onRawChunk) onRawChunk(chunk)
            onChunk(chunk, chunk)
          },
          { feature: FEATURES.STORY_GENERATION, maxTokens, signal, complexity }
        )
      } else {
        accumulated = await aiGenerate(userPrompt, systemPrompt, {
          feature: FEATURES.STORY_GENERATION,
          maxTokens,
          signal,
          complexity
        })
      }

      const prose = stripAccidentalWrapping(accumulated)

      // CALL 2 — metadata. Extractive over the finished prose; never throws, so a
      // metadata failure still yields the scene. Net-neutral on call count: the
      // per-scene summary call this subsumes was removed in the same series.
      const structured = await extractSceneMetadata(prose, {
        entityContext: existingEntitiesJson,
        signal
      })

      return { prose, structured: { ...structured, prose } }
    } catch (err) {
      if (accumulated.trim()) {
        // Prose was produced before something downstream failed. Prose is the
        // deliverable, so return it rather than lose a written scene.
        return {
          prose: stripAccidentalWrapping(accumulated),
          structured: { ...EMPTY_METADATA }
        }
      }
      writeError.value = err.message || 'Scene writing failed'
      throw err
    } finally {
      isWriting.value = false
    }
  }

  return { writeScene, writeSceneStructured, isWriting, writeError }
}

export { summarizeLog, CRAFT_RULES, PROSE_STYLE_GUIDE, FALLBACK_VOICE }
