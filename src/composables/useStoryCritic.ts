import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { aiGenerateJson } from './useAiService'
import {
  bibleFacts,
  bibleNames,
  buildConfirmPrompt,
  buildSentenceRepairPrompt,
  buildContinuityPrompt,
  buildPacingPrompt,
  buildVoicePrompt,
  dialogueDistinctRatio,
  extractDialogueLines,
  fillerParagraphs,
  CONFIRM_SCHEMA,
  CONTINUITY_SCHEMA,
  contradictionsToReport,
  factsBeforeChapter,
  JUDGE_SAMPLING,
  MIN_DISTINCT_DIALOGUE,
  MIN_VOICE_LINES,
  pacingLabelsSchema,
  pacingVote,
  SENTENCE_REPAIR_SCHEMA,
  unreverseParagraphNumbers,
  splitParagraphs,
  splitSentences,
  verifyContradictions
} from './criticIsolation'
import { FEATURES } from '../config/ai'
import { SessionBudget } from '../services/aiProviderBudget'

import {
  getDefaultThreshold,
  getDimensionNames,
  formatDimensionRubrics
} from '../config/evalDimensions'
import { deriveVerdict, CRITIC_VERDICT_CONFIG } from '../services/criticVerdict'
import { sanitizeJson } from '../services/ai/aiHelpers'
import { guardCritique } from '../guardrails/integration/composableGuardrails'
import { recordQualityForOutput } from '../services/aiResponseCache'
import { STORAGE_KEYS } from '../config/storageKeys'

/**
 * Detect excessive repetition in prose.
 * Returns { hasRepetition: boolean, details: string } if repetition found.
 */
function detectRepetition(prose: string): { hasRepetition: boolean; details: string } {
  if (!prose || prose.length < 100) return { hasRepetition: false, details: '' }

  const sentences = prose
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (sentences.length < 4) return { hasRepetition: false, details: '' }

  // Check for repeated n-grams (word sequences)
  const minNgramWords = 6
  const maxNgramOccurrences = 3
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
  const minParagraphWords = 15
  const maxParagraphOccurrences = 2
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
 * The critic's output contract, built per workspace so the dimension names are
 * part of the grammar.
 *
 * Every field is `required`, and `dimensionScores` names its keys. Under
 * grammar-constrained decoding (Ollama `format`) an optional property may be
 * omitted, and qwen3:8b did exactly that on a long evaluation prompt: 30 of 30
 * scenes of a real run came back as `{ "pass": true, "strengths": [...] }` —
 * no score, no dimensions, no issues — which the old parse turned into a
 * fabricated 7 with zero issues, and the verdict "passed on self-reported
 * score". The whole quality gate was passing itself. With the fields required
 * the same model returns a full evaluation (`reports/live/critic-probe/`).
 *
 * Property order is the emission order under the grammar: the score and the
 * per-dimension scores come before `pass`, so the verdict is written after the
 * judgement rather than first.
 *
 * Do not move `score` after `dimensionScores`. It looks like it should help —
 * emitting one number for the whole scene before assessing any dimension is a
 * guess, not a summary, and `score` is a flat 8/10 across all thirty committed
 * salt-road scenes (§10). It was tried and measured on those thirty scenes
 * (`reports/live/critic-rank-agreement/gpu8b-reordered/`): the score stayed
 * constant, just at 9 instead of 8, and the dimensions got WORSE — distinct
 * dimension vectors fell from 8 to 4, with continuity, voice and show_tell each
 * collapsing to a single value where they had previously varied. Whatever pins
 * the overall score, emission order is not it, and the order below discriminates
 * better. See §15.
 */
function buildCriticSchema(dimensionNames: string[]) {
  const dims = dimensionNames.length
    ? dimensionNames
    : ['continuity', 'voice', 'emotional_goal', 'show_tell', 'pacing']
  const dimensionProps: Record<string, unknown> = {}
  for (const d of dims) dimensionProps[d] = { type: 'number' }
  return {
    type: 'object',
    properties: {
      score: { type: 'number' },
      dimensionScores: { type: 'object', properties: dimensionProps, required: dims },
      issues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            severity: { type: 'string', enum: ['minor', 'major'] },
            description: { type: 'string' }
          },
          required: ['type', 'severity', 'description']
        }
      },
      strengths: { type: 'array', items: { type: 'string' } },
      pass: { type: 'boolean' }
    },
    required: ['score', 'dimensionScores', 'issues', 'strengths', 'pass']
  }
}

/**
 * One dimension, its own rubric, nothing else.
 *
 * Measured (docs §16-17a): the combined call passed 40 of 40 scenes with a
 * deliberately injected defect, and the targeted dimension moved -0.1, -0.8,
 * -0.1 and +0.2 -- the continuity contradiction scoring HIGHER than the clean
 * control. Asked one dimension at a time over the same scenes and injections,
 * the same model on the same hardware moved -0.38, -2.75, -0.88 and -0.50, in
 * the right direction every time. The model can do this job; five questions in
 * one call was stopping it.
 *
 * `issue` is requested but not required: a dimension that scores well has
 * nothing to report, and forcing a string there invites invention.
 */
const FOCUSED_DIMENSION_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    issue: { type: 'string' }
  },
  required: ['score']
}

/**
 * The focused, input-isolated critic (and the isolated chapter audit). ON by
 * default since §24: on 30 scenes it caught 133/145 planted defects where the
 * combined critic caught 0/16, failed 1/30 clean scenes, the audit accused
 * 0/30 good scenes (was 10/30), and a book run showed no measurable extra
 * time. Only an explicit `false` turns it off.
 */
export function isFocusedCriticEnabled(): boolean {
  try {
    // STORAGE_KEYS ref
    return localStorage.getItem(STORAGE_KEYS.CRITIC_FOCUSED) !== 'false'
  } catch {
    return true
  }
}

export function setFocusedCritic(enabled: boolean) {
  try {
    // STORAGE_KEYS ref
    localStorage.setItem(STORAGE_KEYS.CRITIC_FOCUSED, enabled ? 'true' : 'false')
  } catch {
    /* private mode — the default (on) stands */
  }
}

/** A critique that carries no judgement at all: no score and no dimension scores. */
function isVerdictless(parsed: any, dims: string[]) {
  if (!parsed || typeof parsed !== 'object') return true
  const hasScore = typeof parsed.score === 'number' && Number.isFinite(parsed.score)
  const raw = parsed.dimensionScores || {}
  const hasDims = dims.some((d) => typeof raw[d] === 'number' && Number.isFinite(raw[d]))
  return !hasScore && !hasDims
}

const CONTRADICTION_SCHEMA = {
  type: 'object',
  properties: {
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          description: { type: 'string' },
          between: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  },
  required: ['contradictions']
}

function countCharacters(storyBible: any) {
  if (!storyBible) return 0
  const charMatches = storyBible.match(/##\s+\w+/g)
  return charMatches ? charMatches.length : 0
}

const CONSISTENCY_EXCERPT_MAX_CHARS = 2000

/**
 * Scene excerpts per continuity check.
 *
 * This was uncapped: a character appearing in 20 scenes produced a single
 * ~40,000-char prompt. That does not survive contact with a real context window
 * — probe-ollama.js measured the server silently evaluating ~2,050 of ~6,153
 * tokens sent and reporting no error. So an uncapped prompt was ALREADY losing
 * scenes, just arbitrarily and invisibly. Choosing which to drop is strictly
 * better than letting the server choose.
 *
 * 6 x 2000 chars ~= 12k chars, which leaves room for the ledger and the
 * character sheet inside a 16k window.
 */
const CONSISTENCY_MAX_SCENES = 6

/**
 * Keep the establishing scene and the most recent ones.
 *
 * Continuity drift is a function of distance from where a fact was established,
 * so the first appearance and the latest appearances carry the most signal; the
 * middle is where a contradiction is least likely to be newly introduced. Scenes
 * stay in narrative order, and the caller reports the elision so the model does
 * not read the gap as "nothing happened".
 */
function selectConsistencyScenes(scenes: any, max = CONSISTENCY_MAX_SCENES) {
  if (!Array.isArray(scenes) || scenes.length <= max) {
    return { selected: scenes || [], omitted: 0 }
  }
  const head = scenes.slice(0, 1)
  const tail = scenes.slice(-(max - 1))
  return { selected: [...head, ...tail], omitted: scenes.length - max }
}

function formatExcerpts(scenes: any) {
  const { selected, omitted } = selectConsistencyScenes(scenes)
  const body = selected
    .map(
      (s: any, i: any) =>
        `--- Scene ${i + 1} ---\n${(s.prose || '').slice(0, CONSISTENCY_EXCERPT_MAX_CHARS)}`
    )
    .join('\n\n')
  if (!omitted) return body
  return `(${omitted} middle scene${omitted === 1 ? '' : 's'} omitted for length — the first and most recent appearances are shown.)\n\n${body}`
}

const CONSISTENCY_CRITIC_PROMPT = `You are a continuity editor. Given a character's facts and every scene they appear in, list any contradictions.

Check for contradictions in: name spelling, physical appearance, personality traits, niche traits/characteristics, goals/motivations, timeline/logical sequence.

If an "Established canon" list is provided, also flag any scene that contradicts those durable facts — e.g. a character acting alive after being established dead, appearing in two places at once, or knowing something not yet revealed to them.

Respond ONLY with valid JSON:
{
  "contradictions": [
    {
      "type": "name | appearance | personality | trait | motivation | timeline",
      "description": "exactly what contradicts",
      "between": ["scene 1 excerpt", "scene 2 excerpt"]
    }
  ]
}

If no contradictions found, return { "contradictions": [] }`

// Render the accumulated story fact ledger (durable canon established by prior
// chapters) so the continuity check can flag prose that contradicts it — a
// character acting alive after being established dead, in two places at once,
// or knowing something not yet revealed. Empty/non-array → no block (the caller
// may pass '' or omit it), keeping the check backward compatible.
function formatLedgerBlock(ledger: any) {
  if (!Array.isArray(ledger) || ledger.length === 0) return ''
  return `\nEstablished canon (flag any prose that contradicts these facts):\n${ledger
    .map((f) => `- ${f}`)
    .join('\n')}\n`
}

function formatCharacterCheck(character: any, ledger: any, sceneExcerpts: any) {
  const excerpts = formatExcerpts(sceneExcerpts)
  return `Character: ${character.name}
Role: ${character.role || 'unknown'}
Goal: ${character.goal || 'unknown'}
Voice: ${character.voice || 'unknown'}
Notes: ${character.notes || 'none'}
Traits: ${character.traits?.length ? character.traits.join(', ') : 'none'}
${formatLedgerBlock(ledger)}
Scenes this character appears in with excerpts:
${excerpts}`
}

function formatLocationCheck(location: any, ledger: any, sceneExcerpts: any) {
  const excerpts = formatExcerpts(sceneExcerpts)
  return `Location: ${location.name}
Description: ${location.description || 'unknown'}
Notes: ${location.notes || 'unknown'}
Traits: ${location.traits?.length ? location.traits.join(', ') : 'none'}
${formatLedgerBlock(ledger)}
Scenes set at this location:
${excerpts}`
}

export function useStoryCritic() {
  const isEvaluating = ref(false)
  const isCheckingConsistency = ref(false)
  const consistencyReport = ref<any>(null)
  let _sessionBudget: SessionBudget | null = null

  /**
   * Keep only the pairs that cannot both be true (see buildConfirmPrompt).
   * A failed call keeps the pair: the quote was already verified by code, and
   * dropping evidence because a second call failed would hide it.
   */
  async function confirmContradictions(pairs: Array<{ sentence: string; fact: string }>) {
    const kept: Array<{ sentence: string; fact: string }> = []
    for (const pair of pairs) {
      const answer = (await aiGenerateJson(
        buildConfirmPrompt(pair.sentence, pair.fact),
        'You decide whether two statements about a story contradict each other.',
        {
          feature: FEATURES.STORY_GENERATION,
          role: 'critic',
          temperature: 0,
          maxTokens: 30,
          schema: CONFIRM_SCHEMA,
          schemaName: 'confirm_contradiction',
          sessionBudget: _sessionBudget,
          ...JUDGE_SAMPLING
        }
      ).catch(() => null)) as { bothCanBeTrue?: boolean } | null
      if (answer?.bothCanBeTrue !== true) kept.push(pair)
    }
    return kept
  }

  async function evaluateScene({
    draft,
    sceneBrief,
    storyBible,
    chapterLog,
    existingEntitiesJson,
    focusInstructions
  }: {
    draft: any
    sceneBrief: any
    storyBible: any
    chapterLog: any
    // Callers that have no entity/focus context omit these (e.g. evalGates).
    existingEntitiesJson?: any
    focusInstructions?: any
  }) {
    isEvaluating.value = true

    try {
      // Quick local check for excessive repetition before calling the critic.
      // If the model looped the same text, we can fail fast without an LLM call.
      const repCheck = detectRepetition(draft)
      if (repCheck.hasRepetition) {
        console.warn('[useStoryCritic] Repetition detected in draft:', repCheck.details)
        return {
          pass: false,
          score: 1,
          evalUnavailable: false,
          issues: [
            {
              severity: 'critical',
              type: 'repetition',
              description: `Excessive repetition detected: ${repCheck.details}`
            }
          ],
          strengths: [],
          dimensionScores: {}
        }
      }

      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const activePrompts = projectStore.getActivePrompts(categoryType)

      const characterCount = countCharacters(storyBible)
      const hasFewCharacters = characterCount < 2

      const promptDims = getDimensionNames(categoryType)
      const dimsList = promptDims.map((d) => `  - ${d}`).join('\n')
      const rubrics = formatDimensionRubrics(categoryType, promptDims)

      // The critic sees the WHOLE scene. It used to see `draft.slice(0, 4000)`:
      // on the 30 salt-road scenes (4,380-6,313 chars) that hid the last 26% of
      // every single one, so the critic judged prose that stopped mid-action and
      // marked it down for it — `continuity` was the lowest dimension on 29/30
      // scenes and the sole reason for all 7 gate failures. A 6k-char scene is
      // ~1.6k tokens against the critic role's 8k window, so there is room.
      // The cap that remains is a runaway guard, and when it bites the prompt
      // says so, because "the text you were given ends early" is not a defect
      // in the writing.
      const DRAFT_CHAR_CAP = 24000
      const draftTruncated = draft.length > DRAFT_CHAR_CAP
      const draftText = draftTruncated ? draft.slice(0, DRAFT_CHAR_CAP) : draft

      /**
       * Everything about the scene, with no judging instruction attached.
       *
       * Both modes need this verbatim; only the question in front of it differs.
       * Keeping it in one place is what makes the focused mode a swap of the
       * question rather than a second prompt to maintain.
       */
      const sceneBlockFor = (text: string) => `SCENE BRIEF:
- Title: ${sceneBrief.title}
- Emotional goal: ${sceneBrief.emotionalGoal}
- Characters present: ${sceneBrief.charactersPresent.join(', ')}
- Payoff: ${sceneBrief.payoff}
- Tension: ${sceneBrief.tension}

CHAPTER LOG (previous events):
${chapterLog || '(First scene)'}

EXISTING ENTITIES CONTEXT:
${existingEntitiesJson || '(No existing entities)'}

STORY BIBLE (character descriptions for voice check):
${storyBible || '(No story bible)'}

${hasFewCharacters ? 'NOTE: Fewer than 2 characters defined. Skip continuity and voice checks.' : ''}

DRAFT TEXT:
${text}
${
  draftTruncated
    ? '\n[The draft was cut here for length. Judge only what you were given; do NOT treat the missing ending as an unresolved scene or a continuity fault.]\n'
    : ''
}`
      const sceneBlock = sceneBlockFor(draftText)

      const userPrompt = `Evaluate this scene draft across ALL of the following dimensions:
${dimsList}

You MUST provide a score (1-10) for each dimension in the "dimensionScores" field of your JSON response.

SCORING SCALE — use these anchors. Do not default to a middling score; if a
dimension is genuinely excellent say so, and if it is genuinely weak say so.
${rubrics}

${
  focusInstructions
    ? `FOCUS AREAS (pay extra attention to these dimensions based on historical weaknesses):
${focusInstructions}

`
    : ''
}${sceneBlock}

Return JSON evaluation with dimensionScores covering all listed dimensions.`

      const criticSchema = buildCriticSchema(promptDims)
      const callCritic = (prompt: string) =>
        aiGenerateJson(prompt, activePrompts.critic, {
          feature: FEATURES.STORY_GENERATION,
          // The Critic role: a different model from the Writer when the placement
          // table says so (the judge should not be the author), on its own lane.
          role: 'critic',
          temperature: 0.3,
          maxTokens: 1000,
          schema: criticSchema,
          schemaName: 'scene_evaluation',
          sessionBudget: _sessionBudget
        }).catch(() => null)

      /**
       * The focused path: one call per dimension, then the same shape the
       * combined call returns, so everything downstream -- `deriveVerdict`, the
       * guardrails, persistence -- is untouched.
       *
       * Sequential on purpose. The calls are ~1.1 s each against one resident
       * model, and five of them come to roughly what the single combined call
       * costs; firing them in parallel at one GPU buys nothing and makes the
       * budget accounting harder to read.
       */
      async function focusedCritique() {
        const dimensionScores: Record<string, number> = {}
        const issues: {
          type: string
          severity: string
          description: string
          paragraphs?: number[]
          evidence?: Array<{ sentence: string; fact: string }>
        }[] = []
        const minDimension = CRITIC_VERDICT_CONFIG.minDimensionScore

        /**
         * voice and pacing are judged on isolated input (see criticIsolation.ts):
         * whole-scene judging let one flaw drag every dimension down. Returns
         * the score and issue, or null when the dimension is not judged — too
         * little dialogue to have a voice, or the call failed (the same
         * treatment the whole-scene path gives a failed call).
         */
        async function isolatedDimension(dimension: 'voice' | 'pacing'): Promise<{
          score: number
          issue?: (typeof issues)[number]
          filler?: number[]
        } | null> {
          if (dimension === 'voice') {
            const lines = extractDialogueLines(draftText)
            if (lines.length < MIN_VOICE_LINES) return null
            // Free, exact, and runs first: verbatim looping is not a matter of
            // taste, so it needs no model to call it.
            const distinct = dialogueDistinctRatio(lines)
            if (distinct < MIN_DISTINCT_DIALOGUE) {
              return {
                score: 2,
                issue: {
                  type: 'voice',
                  severity: 'major',
                  description: `Dialogue repeats itself: only ${Math.round(distinct * 100)}% of ${lines.length} lines are distinct.`
                }
              }
            }
            const parsedVoice = (await aiGenerateJson(
              buildVoicePrompt({
                lines,
                storyBible: storyBible || '',
                charactersPresent: sceneBrief?.charactersPresent || sceneBrief?.characters || [],
                rubric: formatDimensionRubrics(categoryType, ['voice'])
              }),
              'You judge dialogue voice from dialogue alone, and you are willing to mark it low.',
              {
                feature: FEATURES.STORY_GENERATION,
                role: 'critic',
                temperature: 0.3,
                maxTokens: 300,
                schema: FOCUSED_DIMENSION_SCHEMA,
                schemaName: 'focused_voice_isolated',
                sessionBudget: _sessionBudget,
                ...JUDGE_SAMPLING
              }
            ).catch(() => null)) as { score?: number; issue?: string } | null
            if (!parsedVoice || typeof parsedVoice.score !== 'number') return null
            const issueText = typeof parsedVoice.issue === 'string' ? parsedVoice.issue.trim() : ''
            return {
              score: parsedVoice.score,
              issue: issueText
                ? {
                    type: 'voice',
                    severity: parsedVoice.score < minDimension ? 'major' : 'minor',
                    description: issueText
                  }
                : undefined
            }
          }

          const paragraphs = splitParagraphs(draftText)
          if (paragraphs.length === 0) return null
          const labelPass = async (paras: string[], name: string) => {
            const parsed = (await aiGenerateJson(
              buildPacingPrompt({
                paragraphs: paras,
                emotionalGoal: sceneBrief?.emotionalGoal || '',
                whatChanges: sceneBrief?.whatChanges || sceneBrief?.change || ''
              }),
              'You label paragraphs of fiction precisely, one label per paragraph.',
              {
                feature: FEATURES.STORY_GENERATION,
                role: 'critic',
                temperature: 0,
                maxTokens: 20 * paras.length + 50,
                schema: pacingLabelsSchema(paras.length),
                schemaName: name,
                sessionBudget: _sessionBudget,
                ...JUDGE_SAMPLING
              }
            ).catch(() => null)) as { labels?: unknown } | null
            return parsed && Array.isArray(parsed.labels) ? fillerParagraphs(parsed.labels) : null
          }
          const forward = await labelPass(paragraphs, 'focused_pacing_paragraphs')
          if (!forward) return null
          // Only a pass that would fail the scene is re-asked (see pacingVote).
          const reversedRaw =
            forward.length >= 2
              ? await labelPass([...paragraphs].reverse(), 'focused_pacing_paragraphs_reversed')
              : null
          const vote = pacingVote(
            forward,
            reversedRaw ? unreverseParagraphNumbers(reversedRaw, paragraphs.length) : null
          )
          const filler = vote.filler
          const score = vote.score
          return {
            score,
            filler,
            issue: filler.length
              ? {
                  type: 'pacing',
                  severity: score < minDimension ? 'major' : 'minor',
                  // Paragraph numbers are the point: the reviser can cut or
                  // rework exactly these instead of rewriting the scene.
                  description: `Paragraph${filler.length > 1 ? 's' : ''} ${filler.join(', ')} advance${filler.length > 1 ? '' : 's'} neither plot, character nor tension.`,
                  // What a repair may cut: only flags the reversed pass agreed
                  // with (§25 — cutting every forward flag took 2-3x more real
                  // prose).
                  paragraphs: vote.confirmed
                }
              : undefined
          }
        }

        /**
         * Continuity against the bible's facts, with code-verified quotes (see
         * criticIsolation.ts). Null when there is nothing to check — no bible,
         * or no sentence mentions anyone in it — or when the call failed.
         */
        async function isolatedContinuity(): Promise<{
          score: number
          issue?: (typeof issues)[number]
        } | null> {
          const facts = bibleFacts(storyBible || '')
          const names = bibleNames(storyBible || '')
          if (!facts.length || !names.length) return null
          const sentences = splitSentences(draftText).filter((s) =>
            names.some((n) => s.includes(n))
          )
          if (!sentences.length) return null
          const parsed = (await aiGenerateJson(
            buildContinuityPrompt({ facts, sentences }),
            'You check new prose against established facts. You report only contradictions you can quote on both sides.',
            {
              feature: FEATURES.STORY_GENERATION,
              role: 'critic',
              temperature: 0,
              maxTokens: 600,
              schema: CONTINUITY_SCHEMA,
              schemaName: 'focused_continuity_facts',
              sessionBudget: _sessionBudget,
              ...JUDGE_SAMPLING
            }
          ).catch(() => null)) as { contradictions?: unknown } | null
          if (!parsed) return null
          const verified = await confirmContradictions(
            verifyContradictions(parsed.contradictions, draftText, facts)
          )
          if (!verified.length) return { score: 8 }
          return {
            score: 3,
            issue: {
              type: 'continuity',
              severity: 'major',
              description: verified
                .map((c) => `"${c.sentence}" contradicts "${c.fact}"`)
                .join('; '),
              evidence: verified
            }
          }
        }

        // Pacing runs first so its verdict can be used below: a paragraph it
        // has already failed as filler is not handed to show_tell as well.
        // Filler IS flat telling ("Nothing about the hour was remarkable") —
        // an isolated show/tell labeller called 88 of 90 planted filler
        // paragraphs REPORTED — so without this one flawed paragraph was
        // failed twice, and show_tell co-failed on 15 of 30 padded scenes.
        const pacingJudged = promptDims.includes('pacing')
          ? await isolatedDimension('pacing')
          : null
        const pacingFailed =
          pacingJudged && pacingJudged.score < minDimension ? pacingJudged.filler || [] : []
        const showTellText = pacingFailed.length
          ? splitParagraphs(draftText)
              .filter((_, i) => !pacingFailed.includes(i + 1))
              .join('\n\n')
          : draftText

        for (const dimension of promptDims) {
          if (dimension === 'pacing') {
            if (pacingJudged) {
              dimensionScores[dimension] = pacingJudged.score
              if (pacingJudged.issue) issues.push(pacingJudged.issue)
            }
            continue
          }
          if (dimension === 'continuity') {
            const judged = await isolatedContinuity()
            if (judged) {
              dimensionScores[dimension] = judged.score
              if (judged.issue) issues.push(judged.issue)
            }
            continue
          }
          if (dimension === 'voice') {
            const judged = await isolatedDimension(dimension)
            if (judged) {
              dimensionScores[dimension] = judged.score
              if (judged.issue) issues.push(judged.issue)
            }
            continue
          }
          // What this dimension is actually judged against. The shared block
          // labels the bible "character descriptions for voice check", which is
          // true for voice and actively misleading for continuity — the first
          // acceptance run caught the contradiction at -0.12 with that framing
          // against -0.50 when the bible was named as established fact.
          const FRAMING: Record<string, string> = {
            continuity:
              'The STORY BIBLE below is established fact. Prose that contradicts it — a character who is dead, a debt that never existed — is a continuity failure however well written.',
            voice:
              'Judge whether the characters sound like different people, and like the people the STORY BIBLE describes.',
            show_tell:
              'Judge dramatisation against summary. A paragraph that reports what happened instead of enacting it is telling.',
            pacing:
              'Judge whether every passage earns its place. Material that advances neither plot, character nor tension is filler.',
            emotional_goal:
              'Judge the scene against the emotional goal in its brief, and nothing else.'
          }
          const prompt = `Judge ONE aspect of this scene: ${dimension}.

${FRAMING[dimension] || ''}

SCORING SCALE — use these anchors and nothing else:
${formatDimensionRubrics(categoryType, [dimension])}

If the scene is weak on this aspect, say so — a middling default is worse than
an honest low mark. Name the problem in "issue" only if there is one.

${dimension === 'show_tell' ? sceneBlockFor(showTellText) : sceneBlock}

Return JSON: { "score": number, "issue": "one sentence, or omit if none" }`
          // NOT `activePrompts.critic`: that system prompt instructs the model
          // to return the full five-dimension object, which contradicts the one
          // question being asked here.
          const focusedSystem = `You are a story editor judging exactly one aspect of a scene: ${dimension}. You judge that aspect and nothing else, and you are willing to mark it low.`
          const parsedDim = (await aiGenerateJson(prompt, focusedSystem, {
            feature: FEATURES.STORY_GENERATION,
            role: 'critic',
            temperature: 0.3,
            maxTokens: 300,
            schema: FOCUSED_DIMENSION_SCHEMA,
            schemaName: `focused_${dimension}`,
            sessionBudget: _sessionBudget,
            ...JUDGE_SAMPLING
          }).catch(() => null)) as { score?: number; issue?: string } | null
          if (!parsedDim || typeof parsedDim.score !== 'number') continue
          dimensionScores[dimension] = parsedDim.score
          const issue = typeof parsedDim.issue === 'string' ? parsedDim.issue.trim() : ''
          if (issue && parsedDim.score < minDimension) {
            issues.push({
              type: dimension,
              // The dimension floor is what `deriveVerdict` fails a scene on, so
              // a score under it is the major kind by definition.
              severity: 'major',
              description: issue
            })
          } else if (issue) {
            issues.push({ type: dimension, severity: 'minor', description: issue })
          }
        }
        if (Object.keys(dimensionScores).length === 0) return null
        const values = Object.values(dimensionScores)
        return {
          // No summary number is asked for: measured over thirty scenes it is a
          // constant (§10, §15) and `deriveVerdict` keys on the weakest
          // dimension anyway. The mean is reported for display only.
          score: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
          dimensionScores,
          issues,
          strengths: []
        }
      }

      let parsed: any = isFocusedCriticEnabled()
        ? await focusedCritique()
        : await callCritic(userPrompt)
      // One retry when the model produced JSON that judges nothing. The
      // grammar now requires the fields, so this is a backstop for a provider
      // that ignores `required` (or a text-mode fallback), not the normal path.
      if (parsed && isVerdictless(parsed, promptDims)) {
        console.warn(
          '[useStoryCritic] critic returned no score and no dimension scores — asking once more'
        )
        parsed = await callCritic(
          `${userPrompt}

Your previous answer omitted "score" and "dimensionScores". Return every field: a numeric "score" (1-10) and a numeric score for EACH dimension listed above.`
        )
      }
      if (parsed && isVerdictless(parsed, promptDims)) {
        // Honest surrender: a critique with no judgement is not a verdict, and
        // it must not become one by defaulting the score.
        console.warn(
          '[useStoryCritic] Scene evaluation unavailable — the critic returned no score and no dimension scores twice. The quality gate did NOT run for this scene.'
        )
        return {
          pass: true,
          score: null,
          evalUnavailable: true,
          issues: [],
          strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
          verdictReason: 'critic returned no score and no dimension scores'
        }
      }
      if (!parsed) {
        // Don't fabricate a passing 7 — that poisons quality averages and makes
        // unattended runs look fine when the critic actually never ran.
        //
        // `pass: true` here is a surrender, not a verdict: the gate cannot
        // usefully retry a writer when it is the CRITIC that failed, so it
        // accepts the draft. That is defensible, but it must not be quiet — a
        // broken critic otherwise makes the pipeline cheaper and the run look
        // healthier. Callers surface evalUnavailable; this warn is the backstop.
        console.warn(
          '[useStoryCritic] Scene evaluation unavailable — critic output could not be parsed. The quality gate did NOT run for this scene.'
        )
        return {
          pass: true,
          score: null,
          evalUnavailable: true,
          issues: [],
          strengths: ['Evaluation unavailable — critic output could not be parsed']
        }
      }

      const issues = Array.isArray(parsed.issues) ? parsed.issues : []
      const strengths = Array.isArray(parsed.strengths) ? parsed.strengths : []

      const expectedDims = getDimensionNames(categoryType)
      const rawScores: any = parsed.dimensionScores || {}
      const dimensionScores: any = {}
      for (const dim of expectedDims) {
        const val = rawScores[dim]
        dimensionScores[dim] = typeof val === 'number' && val >= 1 && val <= 10 ? val : null
      }

      // No fabricated score. A missing overall score is derived from the
      // dimension scores the model did give (the verdict is derived from those
      // anyway); `isVerdictless` above guarantees at least one exists here.
      const numericDims = Object.values(dimensionScores).filter(
        (v): v is number => typeof v === 'number'
      )
      const score: number =
        typeof parsed.score === 'number' && Number.isFinite(parsed.score)
          ? parsed.score
          : Math.round((numericDims.reduce((a, b) => a + b, 0) / numericDims.length) * 10) / 10

      const threshold = getDefaultThreshold(categoryType)

      // Derived from the dimension scores and issue severity, NOT from `score`.
      // Measured against the snapshot corpus, `score` is saturated: good-pass,
      // borderline, and a deliberately contradictory clear-fail all came back at
      // 8/10, so `score >= threshold` passed every one of them and the pipeline
      // gate could not reject anything. See services/criticVerdict.ts.
      const verdict = deriveVerdict({ score, dimensionScores, issues }, threshold)
      const pass = verdict.pass

      // A malformed critique silently corrupts score aggregation downstream,
      // so shape is verified before the result leaves the composable. Kept as
      // an inline literal below: binding the return to a const would lose the
      // object-literal freshness that lets callers read `evalUnavailable` off
      // the inferred union.
      await guardCritique({ result: { pass, score, dimensionScores, issues, strengths } })

      // If this draft came from the response cache, attribute the score back to
      // the entry that produced it, so a badly-scoring response stops being
      // served as a semantic match. No-ops for freshly generated prose.
      recordQualityForOutput(draft, score).catch(() => {})

      return {
        pass,
        score,
        dimensionScores,
        issues,
        strengths,
        // Why the verdict went the way it did. Without this a failed gate says
        // only "rejected", and the author cannot see that it was voice at 6 —
        // which is the actionable part.
        verdictReason: verdict.reason,
        weakestDimension: verdict.weakestDimension,
        dimensionMean: verdict.dimensionMean
      }
    } catch {
      return {
        pass: true,
        score: null,
        evalUnavailable: true,
        issues: [],
        strengths: ['Evaluation unavailable — critic call failed']
      }
    } finally {
      isEvaluating.value = false
    }
  }

  async function checkContradictions({
    characters,
    locations,
    sceneProse,
    synopsis,
    ledger
  }: {
    characters: any
    locations: any
    sceneProse: any
    synopsis: any
    ledger: any
  }) {
    isCheckingConsistency.value = true
    const report: { characterIssues: any[]; locationIssues: any[]; error?: string } = {
      characterIssues: [],
      locationIssues: []
    }

    // Focused mode: each scene's sentences against the facts of earlier
    // chapters, quotes verified by code (criticIsolation.ts, §23). The
    // entity-by-entity judge below accused 10/30 clean scenes and caught the
    // planted contradiction 1/30; this one measured 0/30 and 30/30.
    if (isFocusedCriticEnabled() && Array.isArray(ledger) && ledger.length > 0) {
      try {
        const names = [
          ...new Set([
            ...(characters || [])
              .map((c: { name?: unknown }) => String(c?.name || ''))
              .filter(Boolean),
            ...bibleNames(ledger.join('\n'))
          ])
        ]
        const found: Array<{ sentence: string; fact: string }> = []
        const seen = new Set<string>()
        for (const scene of sceneProse || []) {
          const prose = String(scene?.prose || '')
          if (!prose || seen.has(prose)) continue
          seen.add(prose)
          const chapter = Number(scene?.chapterNumber ?? scene?.chapterId)
          const facts = factsBeforeChapter(ledger, Number.isFinite(chapter) ? chapter : null)
          const sentences = splitSentences(prose).filter((s) => names.some((n) => s.includes(n)))
          if (!facts.length || !sentences.length) continue
          const parsed = (await aiGenerateJson(
            buildContinuityPrompt({ facts, sentences }),
            'You check new prose against established facts. You report only contradictions you can quote on both sides.',
            {
              feature: FEATURES.STORY_GENERATION,
              role: 'critic',
              temperature: 0,
              maxTokens: 600,
              schema: CONTINUITY_SCHEMA,
              schemaName: 'audit_continuity_facts',
              sessionBudget: _sessionBudget,
              ...JUDGE_SAMPLING
            }
          ).catch(() => null)) as { contradictions?: unknown } | null
          if (parsed)
            found.push(
              ...(await confirmContradictions(
                verifyContradictions(parsed.contradictions, prose, facts)
              ))
            )
        }
        return contradictionsToReport(found, names)
      } finally {
        isCheckingConsistency.value = false
      }
    }

    try {
      const systemNote = synopsis ? `Story synopsis: "${synopsis}"\n\n` : ''

      // Pre-index scenes by character name (avoids O(C×S) repeated .filter() inside loop)
      const scenesByChar = new Map()
      for (const char of characters) {
        scenesByChar.set(
          char.name,
          sceneProse.filter((s: any) => (s.characters || []).includes(char.name))
        )
      }

      // Pre-index scenes by location name
      const scenesByLoc = new Map()
      for (const loc of locations) {
        scenesByLoc.set(
          loc.name,
          sceneProse.filter((s: any) => s.location === loc.name)
        )
      }

      /**
       * How many scenes an entity needs before it is worth checking.
       *
       * This was a flat 2 for both characters and locations: with fewer, there
       * is no second scene to contradict the first. That reasoning holds only
       * when the scenes are all the checker has. When a fact LEDGER is supplied
       * the entity has something to contradict from the first scene onward —
       * and the checker was declining to look. Measured 2026-09-23: a single
       * scene stating a living character "had been dead for two years", against
       * a ledger saying he leads the caravan, returned zero issues. With the
       * same input and this threshold it is caught.
       */
      const minScenes = Array.isArray(ledger) && ledger.length > 0 ? 1 : 2

      // Build task factories for characters and locations
      const charTasks = characters
        .filter((char: any) => (scenesByChar.get(char.name)?.length || 0) >= minScenes)
        .map((char: any) => async () => {
          const charScenes = scenesByChar.get(char.name)
          const prompt = formatCharacterCheck(char, ledger, charScenes)
          const parsed: any = await aiGenerateJson(systemNote + prompt, CONSISTENCY_CRITIC_PROMPT, {
            feature: FEATURES.STORY_GENERATION,
            role: 'critic',
            temperature: 0.3,
            maxTokens: 1000,
            schema: CONTRADICTION_SCHEMA,
            schemaName: 'contradiction_report',
            sessionBudget: _sessionBudget
          }).catch(() => null)
          if (parsed?.contradictions?.length > 0) {
            return { character: char.name, contradictions: parsed.contradictions }
          }
          return null
        })

      const locTasks = locations
        .filter((loc: any) => (scenesByLoc.get(loc.name)?.length || 0) >= minScenes)
        .map((loc: any) => async () => {
          const locScenes = scenesByLoc.get(loc.name)
          const prompt = formatLocationCheck(loc, ledger, locScenes)
          const parsed: any = await aiGenerateJson(systemNote + prompt, CONSISTENCY_CRITIC_PROMPT, {
            feature: FEATURES.STORY_GENERATION,
            role: 'critic',
            temperature: 0.3,
            maxTokens: 1000,
            schema: CONTRADICTION_SCHEMA,
            schemaName: 'contradiction_report',
            sessionBudget: _sessionBudget
          }).catch(() => null)
          if (parsed?.contradictions?.length > 0) {
            return { location: loc.name, contradictions: parsed.contradictions }
          }
          return null
        })

      // Execute with concurrency cap of 3 to avoid overwhelming the LLM backend
      const allTasks = [...charTasks, ...locTasks]
      const CONCURRENCY = 3
      const results: any[] = []
      for (let i = 0; i < allTasks.length; i += CONCURRENCY) {
        const batch = allTasks.slice(i, i + CONCURRENCY).map((fn: any) => fn())
        results.push(...(await Promise.all(batch)))
      }

      for (const r of results) {
        if (!r) continue
        if (r.character) report.characterIssues.push(r)
        if (r.location) report.locationIssues.push(r)
      }
    } catch (err: any) {
      report.error = err.message
    } finally {
      consistencyReport.value = report
      isCheckingConsistency.value = false
    }

    return report
  }

  /**
   * One sentence, rewritten so it no longer contradicts one fact (§25). The
   * scene-gate repair uses it instead of writing the whole scene again.
   * Returns null when the call fails; '' means "delete the sentence".
   */
  async function repairSentence(sentence: string, fact: string): Promise<string | null> {
    const parsed = (await aiGenerateJson(
      buildSentenceRepairPrompt(sentence, fact),
      'You are a careful line editor for fiction.',
      {
        feature: FEATURES.STORY_GENERATION,
        role: 'critic',
        temperature: 0,
        maxTokens: 200,
        schema: SENTENCE_REPAIR_SCHEMA,
        schemaName: 'repair_sentence',
        sessionBudget: _sessionBudget,
        ...JUDGE_SAMPLING
      }
    ).catch(() => null)) as { sentence?: unknown } | null
    return parsed && typeof parsed.sentence === 'string' ? parsed.sentence.trim() : null
  }

  return {
    evaluateScene,
    repairSentence,
    isEvaluating,
    checkContradictions,
    isCheckingConsistency,
    consistencyReport,
    get sessionBudget() {
      return _sessionBudget
    },
    set sessionBudget(v: SessionBudget | null) {
      _sessionBudget = v
    }
  }
}

export { sanitizeJson, countCharacters, formatCharacterCheck, formatLocationCheck }
