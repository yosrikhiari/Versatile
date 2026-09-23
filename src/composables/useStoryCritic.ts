import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { aiGenerateJson } from './useAiService'
import { FEATURES } from '../config/ai'
import { SessionBudget } from '../services/aiProviderBudget'

import {
  getDefaultThreshold,
  getDimensionNames,
  formatDimensionRubrics
} from '../config/evalDimensions'
import { deriveVerdict } from '../services/criticVerdict'
import { sanitizeJson } from '../services/ai/aiHelpers'
import { guardCritique } from '../guardrails/integration/composableGuardrails'
import { recordQualityForOutput } from '../services/aiResponseCache'

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
}SCENE BRIEF:
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
${draftText}
${
  draftTruncated
    ? '\n[The draft was cut here for length. Judge only what you were given; do NOT treat the missing ending as an unresolved scene or a continuity fault.]\n'
    : ''
}
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

      let parsed: any = await callCritic(userPrompt)
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

  return {
    evaluateScene,
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
