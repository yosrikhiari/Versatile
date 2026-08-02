import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { aiGenerate, aiStream, aiGenerateJson } from './useAiService'
import { FEATURES } from '../config/ai'
import { SessionBudget } from '../services/aiProviderBudget'

import { formatEvalFeedback } from '../services/evalFeedback'
import { getVoiceProfile } from '../config/voiceProfiles'
import { buildPersonaBlock } from '../config/writerPersonas'
import { computeComplexityLevel } from '../config/modelRouting'
import { buildSceneContext } from '../services/sceneContextService'
import { usePromptBuilder } from './usePromptBuilder'
import { summarizeLog } from '../utils/promptUtils'
import { fitSceneContext } from '../services/ai/contextBudget'
import { guardScene } from '../guardrails/integration/composableGuardrails'
import { countProseWords } from './generation/writing/liveDraft'

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
  keyFacts: [],
  // Distinguishes "the extractor ran and the scene genuinely established nothing"
  // from "the extractor never ran". Downstream, `discoverSync` finding zero
  // changes is ambiguous without this: an empty bible update looked identical to
  // a scene that never reached extraction at all, which is how a generation run
  // wrote thirteen scenes and not one character, location, or graph edge.
  metadataStatus: 'skipped' as 'ok' | 'failed' | 'skipped'
}

/**
 * Prose that must not be salvaged.
 *
 * The catch in `writeSceneStructured` exists so a failure *after* generation —
 * metadata extraction, a guardrail, a downstream write — does not throw away a
 * scene the model already wrote. That is right for those cases and wrong for
 * one: when the prose ITSELF is what failed validation, handing it back is not
 * salvage, it is laundering the rejection. The repetition guard threw, and the
 * catch returned the identical text one line later, so the guard had never once
 * rejected anything.
 */
class UnsalvageableProseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsalvageableProseError'
  }
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

function extractDoc(docString: any, heading: any) {
  if (!docString) return ''
  const regex = new RegExp(`#+\\s*${heading}[\\s\\S]*?(?=\n#|$)`, 'i')
  const match = docString.match(regex)
  return match ? match[0].trim() : ''
}

/**
 * Detect excessive repetition in prose.
 * Returns { hasRepetition: boolean, details: string } if repetition found.
 * Checks for:
 * - Repeated n-grams (sequences of N words) appearing too many times
 * - Repeated paragraphs (by sentence clusters)
 * - Excessive character/word repetition ratios
 */
function detectRepetition(prose: string, options: {
  minNgramWords?: number
  maxNgramOccurrences?: number
  minParagraphWords?: number
  maxParagraphOccurrences?: number
} = {}): { hasRepetition: boolean; details: string } {
  const {
    minNgramWords = 6,
    maxNgramOccurrences = 3,
    minParagraphWords = 15,
    maxParagraphOccurrences = 2
  } = options

  if (!prose || prose.length < 100) return { hasRepetition: false, details: '' }

  const sentences = prose.split(/[.!?]+/).map(s => s.trim()).filter(Boolean)
  if (sentences.length < 4) return { hasRepetition: false, details: '' }

  // Check for repeated n-grams (word sequences)
  const words = prose.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length >= minNgramWords * 2) {
    const ngramCounts = new Map<string, number>()
    for (let i = 0; i <= words.length - minNgramWords; i++) {
      const ngram = words.slice(i, i + minNgramWords).join(' ')
      ngramCounts.set(ngram, (ngramCounts.get(ngram) || 0) + 1)
    }
    for (const [ngram, count] of ngramCounts) {
      if (count > maxNgramOccurrences && ngram.length > 20) {
        return {
          hasRepetition: true,
          details: `Repeated ${minNgramWords}-gram (${count}x): "${ngram.slice(0, 80)}..."`
        }
      }
    }
  }

  // Check for repeated paragraph-like segments (sentence clusters)
  const paragraphSegments = []
  for (let i = 0; i < sentences.length - 1; i++) {
    const segment = sentences.slice(i, i + 2).join(' ')
    const wordCount = segment.split(/\s+/).filter(Boolean).length
    if (wordCount >= minParagraphWords) {
      paragraphSegments.push(segment.toLowerCase())
    }
  }
  const segmentCounts = new Map<string, number>()
  for (const seg of paragraphSegments) {
    segmentCounts.set(seg, (segmentCounts.get(seg) || 0) + 1)
  }
  for (const [seg, count] of segmentCounts) {
    if (count > maxParagraphOccurrences) {
      return {
        hasRepetition: true,
        details: `Repeated paragraph segment (${count}x): "${seg.slice(0, 100)}..."`
      }
    }
  }

  return { hasRepetition: false, details: '' }
}

/**
 * Undo wrapping a model sometimes adds despite being told to emit plain prose:
 */
function stripAccidentalWrapping(text: any) {
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
 * A scene is allowed to come in this far under its target before we do anything
 * about it. Prose is not poured to a line — asking a model to hit 1200 exactly
 * produces padding, which is worse than being short. But 1095 against 1200 is
 * within tolerance and 700 is not, and previously nothing told them apart.
 */
const LENGTH_TOLERANCE_RATIO = 0.85

/**
 * Two passes, then stop. If the model has not reached the target after being
 * asked twice to keep going, it has said what it has to say about this scene;
 * a third ask buys repetition, not length.
 */
const MAX_EXTENSION_PASSES = 2

/**
 * Does this continuation just restate prose the scene already has?
 *
 * Compares on a normalised opening rather than the whole text, because a model
 * that restarts reproduces the beginning closely and then drifts — by the end
 * the two differ enough that a whole-text comparison sees new writing.
 */
function isRepeatOf(candidate: string, existing: string): boolean {
  const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const haystack = normalise(existing)
  // 120 characters is long enough that real prose effectively never collides,
  // and a candidate shorter than that is compared whole. Short candidates are
  // judged strictly on purpose: they cannot close a meaningful word gap, so
  // discarding one on suspicion costs nothing and keeps repetition out.
  const probe = normalise(candidate).slice(0, 120)
  if (!probe) return true
  return haystack.includes(probe)
}

/**
 * Bring a short scene up to its word target by continuing it.
 *
 * Returns the prose unchanged when it is already long enough, when no target was
 * set, or when the model stops producing new text — in every case the caller
 * gets usable prose, because a scene that is shorter than requested is still a
 * scene and must never be lost to this.
 */
async function extendToTarget(
  prose: string,
  {
    targetWords,
    userPrompt,
    systemPrompt,
    complexity,
    signal,
    sessionBudget,
    onChunk,
    onRawChunk
  }: any
): Promise<string> {
  const target = Number(targetWords) || 0
  if (!target) return prose

  let current = prose
  for (let pass = 0; pass < MAX_EXTENSION_PASSES; pass++) {
    const words = countProseWords(current)
    if (words >= Math.floor(target * LENGTH_TOLERANCE_RATIO)) return current

    const needed = target - words
    // The tail, not the whole scene: the model needs to know where it stopped so
    // it can pick the sentence up, and re-sending the full scene would both cost
    // context and invite it to rewrite what is already there.
    const tail = current.slice(-2000)
    const continuationPrompt = `${userPrompt}

---
CONTINUATION PASS. The scene above has already been written up to ${words} words, short of its ${target}-word target.

Continue it from exactly where it stops. Do not restart the scene. Do not summarise or repeat what has already happened. Do not reuse any sentence from the text below. Write approximately ${needed} more words and carry the scene to its proper close.

THE SCENE SO FAR ENDS WITH:
${tail}

Write the continuation now as prose. Output ONLY the new text — no headings, no preamble, no notes.`

    const maxTokens = Math.max(600, Math.min(3000, Math.ceil(needed * 1.8) + 400))
    let added = ''
    const opts = {
      feature: FEATURES.STORY_GENERATION,
      maxTokens,
      signal,
      complexity,
      sessionBudget
    }

    try {
      if (onChunk) {
        await aiStream(
          continuationPrompt,
          systemPrompt,
          (chunk: any) => {
            added += chunk
            if (onRawChunk) onRawChunk(chunk)
            onChunk(chunk, chunk)
          },
          opts
        )
      } else {
        added = await aiGenerate(continuationPrompt, systemPrompt, opts)
      }
    } catch (err: any) {
      // The scene itself succeeded; only the top-up failed. Hand back what we
      // have rather than turning a short scene into no scene.
      console.warn(
        `[useStoryWriter] length continuation failed at ${words}/${target} words:`,
        err?.message || err
      )
      return current
    }

    const cleaned = stripAccidentalWrapping(added).trim()
    if (!cleaned) return current

    // "Continue" is an instruction a model can satisfy by restarting. Appending
    // a repeat would hit the word target while making the scene strictly worse,
    // which is the one outcome worth more than being short — so a continuation
    // that opens on text we already have is discarded, not merged.
    if (isRepeatOf(cleaned, current)) {
      console.warn(
        `[useStoryWriter] length continuation repeated existing prose at ${words}/${target} words; kept the shorter original`
      )
      return current
    }

    const merged = `${current.trim()}\n\n${cleaned}`
    // A pass that adds nothing means the model is refusing. Looping again would
    // burn another full generation to learn the same thing.
    if (countProseWords(merged) <= words) return current
    current = merged
  }

  return current
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
 * Chunked rather than truncated. This used to `slice(0, 6000)`, which on the
 * 1,700-1,900 word scenes this pipeline actually produces (~9,500-10,500 chars)
 * left roughly 40% of every scene structurally invisible: any fact, entity, or
 * relationship established in a scene's final third could never be recorded, on
 * the success path, silently.
 *
 * @returns {Promise<object>} the metadata fields, always shaped like EMPTY_METADATA
 */
const METADATA_CHUNK_CHARS = 6000

/** Split on paragraph boundaries so no chunk starts mid-sentence. */
function chunkProseForMetadata(prose: string, limit = METADATA_CHUNK_CHARS): string[] {
  if (prose.length <= limit) return [prose]
  const paragraphs = prose.split(/\n\s*\n/)
  const chunks: string[] = []
  let current = ''
  for (const para of paragraphs) {
    // A single paragraph longer than the limit still has to be cut, but that is
    // the rare case rather than every scene.
    if (para.length > limit) {
      if (current) { chunks.push(current); current = '' }
      for (let i = 0; i < para.length; i += limit) chunks.push(para.slice(i, i + limit))
      continue
    }
    if (current && current.length + para.length + 2 > limit) {
      chunks.push(current)
      current = para
    } else {
      current = current ? `${current}\n\n${para}` : para
    }
  }
  if (current) chunks.push(current)
  return chunks
}

function dedupeByName(items: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const item of items) {
    const key = String(item?.name || item?.title || '').toLowerCase().trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function uniqueStrings(values: any[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of values) {
    const s = String(v || '').trim()
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
  }
  return out
}

/** Union the per-chunk extractions into one scene-level metadata object. */
function mergeSceneMetadata(parts: any[]) {
  const ok = parts.filter(Boolean)
  if (ok.length === 0) return { ...EMPTY_METADATA, metadataStatus: 'failed' as const }
  return {
    // The first chunk covers the scene's opening, which is what a one-sentence
    // "what happens" summary should describe.
    summary: ok.find((p) => p.summary)?.summary || '',
    usedEntities: {
      characterNames: uniqueStrings(ok.flatMap((p) => p.usedEntities?.characterNames || [])),
      locationNames: uniqueStrings(ok.flatMap((p) => p.usedEntities?.locationNames || [])),
      plotThreadTitles: uniqueStrings(ok.flatMap((p) => p.usedEntities?.plotThreadTitles || []))
    },
    newEntities: {
      characters: dedupeByName(ok.flatMap((p) => p.newEntities?.characters || [])),
      locations: dedupeByName(ok.flatMap((p) => p.newEntities?.locations || [])),
      plotThreads: dedupeByName(ok.flatMap((p) => p.newEntities?.plotThreads || []))
    },
    // Deduped, not concatenated. Two chunks that both witness "Kaelen confronts
    // the Guardian" describe one relationship, and `commitSync` turns each event
    // into a graph edge — so concatenating would draw the same edge twice.
    networkEvents: dedupeEvents(ok.flatMap((p) => p.networkEvents || [])),
    keyFacts: uniqueStrings(ok.flatMap((p) => p.keyFacts || [])),
    metadataStatus: 'ok' as const
  }
}

function dedupeEvents(events: any[]): any[] {
  const seen = new Set<string>()
  const out: any[] = []
  for (const e of events) {
    const key = [e?.type, e?.from, e?.to, e?.label]
      .map((v) => String(v || '').toLowerCase().trim())
      .join('|')
    if (key === '|||' || seen.has(key)) continue
    seen.add(key)
    out.push(e)
  }
  return out
}

async function extractSceneMetadata(prose: any, { entityContext, signal, sessionBudget }: { entityContext?: any; signal?: any; sessionBudget?: SessionBudget | null } = {}) {
  const full = String(prose || '')
  if (!full.trim()) return { ...EMPTY_METADATA, metadataStatus: 'skipped' as const }

  const chunks = chunkProseForMetadata(full)
  const parts: any[] = []
  for (const chunk of chunks) {
    // Sequential on purpose: `providerGate` allows one in-flight Ollama request,
    // so firing these concurrently would only queue them behind each other while
    // holding the foreground slot away from the next scene's prose.
    parts.push(await extractMetadataChunk(chunk, { entityContext, signal, sessionBudget }))
  }
  return mergeSceneMetadata(parts)
}

async function extractMetadataChunk(excerpt: string, { entityContext, signal, sessionBudget }: { entityContext?: any; signal?: any; sessionBudget?: SessionBudget | null } = {}) {
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
        // Deliberately NOT role:'utility', despite being exactly the kind of
        // short extractive call the utility lane exists for.
        //
        // This call alternates with prose, once per scene. On a GPU too small to
        // hold both models a switch costs 11-14s of loading each way (measured,
        // GTX 1650), so routing it away would pay ~25s of swapping to save ~29s
        // of generation — break-even at best, and 30 swap pairs across a volume.
        // The utility lane wins where such calls run CONSECUTIVELY (planning,
        // spine, network): one swap amortised over a dozen calls.
        signal,
        sessionBudget
      }
    )
    return { ...EMPTY_METADATA, ...meta, metadataStatus: 'ok' as const }
  } catch (err: any) {
    console.warn('[useStoryWriter] metadata extraction failed; prose kept, metadata empty:', err)
    return null
  }
}

export function useStoryWriter() {
  const isWriting = ref(false)
  const writeError = ref<string | null>(null)
  let _sessionBudget: SessionBudget | null = null

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
  }: {
    sceneBrief: any; storyArc: any; chapterLog: any; storyBible: any; onChunk: any;
    embeddingContext: any; storyContract: any; rejectedPatterns: any; existingEntitiesJson: any;
    voiceProfile: any; completedScenes: any; characters: any;
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
              currentSceneBrief: sceneBrief,
              options: undefined
            })
          : embeddingContext || ''

      const allRejected: string[] = []
      if (rejectedPatterns) allRejected.push(rejectedPatterns)
      if (extraRejected && extraRejected.length > 0) {
        allRejected.push(
          extraRejected
            .map((p: any, i: any) => `${i + 1}. Context: "${p.context}" — AVOID generating similar content`)
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
              `- Pacing: ${sceneBrief.pacing || 'medium'}`,
              ...(sceneBrief.sectionRole
                ? [
                    `- Section role: ${sceneBrief.sectionRole}`,
                    `- This is section ${sceneBrief.sectionIndex} of ${sceneBrief.totalSections}`
                  ]
                : [])
            ]
          : [
              `- Goal: ${sceneBrief.goal || ''}`,
              `- Obstacle: ${sceneBrief.obstacle || ''}`,
              `- Characters: ${(sceneBrief.characters || []).join(', ')}`,
              `- Location: ${sceneBrief.location || ''}`,
              `- What changes: ${sceneBrief.change || ''}`,
              `- Tone note: ${sceneBrief.toneNote || ''}`,
              ...(sceneBrief.sectionRole
                ? [
                    `- Section role: ${sceneBrief.sectionRole}`,
                    `- This is section ${sceneBrief.sectionIndex} of ${sceneBrief.totalSections}`
                  ]
                : [])
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
        storyArc,
        chapterIndex: undefined,
        totalChapters: undefined
      })

      let fullText = ''

      if (onChunk) {
        await aiStream(
          userPrompt,
          systemPrompt,
          (chunk: any) => {
            fullText += chunk
            onChunk(chunk, fullText)
          },
          { feature: FEATURES.STORY_GENERATION, complexity, sessionBudget: _sessionBudget }
        )
      } else {
        fullText = await aiGenerate(userPrompt, systemPrompt, {
          feature: FEATURES.STORY_GENERATION,
          complexity,
          sessionBudget: _sessionBudget
        })
      }

      return fullText
    } catch (err: any) {
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
  }: {
    sceneBrief: any; storyArc: any; chapterLog: any; storyBible: any; onChunk: any;
    onRawChunk: any; embeddingContext: any; storyContract: any; rejectedPatterns: any;
    existingEntitiesJson: any; spineContext: any; anchorRole: any; anchorConstraints: any;
    pastEvalResults: any; focusInstructions: any; voiceProfile: any; completedScenes: any;
    characters: any; signal: any;
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
              currentSceneBrief: sceneBrief,
              options: undefined
            })
          : embeddingContext || ''

      const allRejected: string[] = []
      if (rejectedPatterns) allRejected.push(rejectedPatterns)
      if (extraRejected && extraRejected.length > 0) {
        allRejected.push(
          extraRejected
            .map((p: any, i: any) => `${i + 1}. Context: "${p.context}" — AVOID generating similar content`)
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
              `- Arc position: ${sceneBrief.arcPosition || ''}`,
              ...(sceneBrief.sectionRole
                ? [
                    `- Section role: ${sceneBrief.sectionRole}`,
                    `- This is section ${sceneBrief.sectionIndex} of ${sceneBrief.totalSections} — write only the content belonging to this section`
                  ]
                : [])
            ]
          : [
              `- Goal: ${sceneBrief.goal || ''}`,
              `- Obstacle: ${sceneBrief.obstacle || ''}`,
              `- Characters: ${(sceneBrief.characters || []).join(', ')}`,
              `- Location: ${sceneBrief.location || ''}`,
              `- What changes: ${sceneBrief.change || ''}`,
              `- Tone note: ${sceneBrief.toneNote || ''}`,
              ...(sceneBrief.sectionRole
                ? [
                    `- Section role: ${sceneBrief.sectionRole}`,
                    `- This is section ${sceneBrief.sectionIndex} of ${sceneBrief.totalSections} — write only the content belonging to this section`
                  ]
                : [])
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
        storyArc,
        chapterIndex: undefined,
        totalChapters: undefined
      })

      // CALL 1 — prose. Plain text, not wrapped in a JSON envelope, because that
      // envelope suppresses prose length ~44x on a small local model (verified,
      // see extractSceneMetadata). Every streamed token IS prose now, so the old
      // state machine that dug prose out of a streaming JSON string is gone.
      if (onChunk) {
        await aiStream(
          userPrompt,
          systemPrompt,
          (chunk: any) => {
            accumulated += chunk
            if (onRawChunk) onRawChunk(chunk)
            onChunk(chunk, chunk)
          },
          { feature: FEATURES.STORY_GENERATION, maxTokens, signal, complexity, sessionBudget: _sessionBudget }
        )
      } else {
        accumulated = await aiGenerate(userPrompt, systemPrompt, {
          feature: FEATURES.STORY_GENERATION,
          maxTokens,
          signal,
          complexity,
          sessionBudget: _sessionBudget
        })
      }

      let prose = stripAccidentalWrapping(accumulated)

      // Check for excessive repetition in generated prose — model looping is a
      // known failure mode that the quality gate won't catch if it only sees
      // the first 4000 chars. Catch it here and treat as a failed attempt.
      const repCheck = detectRepetition(prose)
      if (repCheck.hasRepetition) {
        console.warn('[useStoryWriter] Repetition detected in generated prose:', repCheck.details)
        throw new UnsalvageableProseError(
          `Generation produced repetitive output: ${repCheck.details}`
        )
      }

      // Make the word target mean something.
      //
      // "The scene MUST be at least N words" is the only lever the prompt has,
      // and on a small local model it is a weak one — scenes came back at 1095
      // against a 1200 target, or 1848, with nothing downstream objecting. The
      // quality gate did not catch it because it compares a draft against the
      // *first attempt's* length, never against the target the author set.
      //
      // Continue rather than regenerate. The prose that exists is fine; there is
      // just not enough of it, and rewriting from scratch throws away good work
      // to re-roll the same dice. Asking the model to keep going from where it
      // stopped is both cheaper and far more reliable than asking it again to
      // please be longer this time.
      prose = await extendToTarget(prose, {
        targetWords: estimatedWords,
        userPrompt,
        systemPrompt,
        complexity,
        signal,
        sessionBudget: _sessionBudget,
        onChunk,
        onRawChunk
      })
      // The salvage path in `catch` hands back `accumulated`, so the extension
      // has to land there too — otherwise a failure in a later step would
      // silently return the short version of a scene we had already fixed.
      accumulated = prose

      // Re-check after extension. The first check ran on the pre-extension draft,
      // and `extendToTarget` exists precisely to make scenes longer — looping is
      // the cheapest way for a model to produce more tokens, so the step most
      // likely to introduce repetition was the one step never examined for it.
      const extendedRepCheck = detectRepetition(prose)
      if (extendedRepCheck.hasRepetition) {
        console.warn(
          '[useStoryWriter] Repetition detected after extension:',
          extendedRepCheck.details
        )
        throw new UnsalvageableProseError(
          `Extension produced repetitive output: ${extendedRepCheck.details}`
        )
      }

      // CALL 2 — metadata. Extractive over the finished prose; never throws, so a
      // metadata failure still yields the scene. Net-neutral on call count: the
      // per-scene summary call this subsumes was removed in the same series.
      const structured = await extractSceneMetadata(prose, {
        entityContext: existingEntitiesJson,
        signal,
        sessionBudget: _sessionBudget
      })

      // Data-commit boundary: entity/relationship/fact/safety checks run over
      // the finished scene before it is handed back for persistence.
      await guardScene({
        prose,
        structured,
        sceneId: sceneBrief?.id != null ? String(sceneBrief.id) : undefined
      })

      return { prose, structured: { ...structured, prose } }
    } catch (err: any) {
      // Prose that failed its OWN validation is not salvageable — returning it
      // here is what silently cancelled the repetition guard.
      if (accumulated.trim() && !(err instanceof UnsalvageableProseError)) {
        // Prose was produced before something downstream failed. Prose is the
        // deliverable, so return it rather than lose a written scene.
        //
        // But extract its metadata too. A salvaged scene with empty metadata
        // contributes nothing to the bible, the graph, or the chapter ledger,
        // so the NEXT scene is written against the same context as the last —
        // which is how a run produces thirteen scenes and zero story-bible
        // changes. `extractSceneMetadata` never throws by contract, so this
        // cannot make the salvage path less reliable than it was.
        const prose = stripAccidentalWrapping(accumulated)
        const structured = await extractSceneMetadata(prose, {
          entityContext: existingEntitiesJson,
          signal,
          sessionBudget: _sessionBudget
        }).catch(() => ({ ...EMPTY_METADATA, metadataStatus: 'failed' as const }))
        return { prose, structured: { ...structured, prose } }
      }
      writeError.value = err.message || 'Scene writing failed'
      throw err
    } finally {
      isWriting.value = false
    }
  }

  return { writeScene, writeSceneStructured, isWriting, writeError, get sessionBudget() { return _sessionBudget }, set sessionBudget(v: SessionBudget | null) { _sessionBudget = v } }
}

export {
  summarizeLog,
  CRAFT_RULES,
  PROSE_STYLE_GUIDE,
  FALLBACK_VOICE,
  UnsalvageableProseError
}

/**
 * Name-based check rather than `instanceof`.
 *
 * The generator and the writer can end up holding two copies of this module
 * (Vite dev vs. build, test module resets), and `instanceof` silently returns
 * false across copies — which would send rejected prose straight back down the
 * salvage path this error exists to prevent. Failing open here is exactly the
 * bug being fixed, so identity is checked the one way that survives.
 */
export function isUnsalvageableProse(err: unknown): boolean {
  return (
    err instanceof UnsalvageableProseError ||
    (typeof err === 'object' && err !== null && (err as any).name === 'UnsalvageableProseError')
  )
}
