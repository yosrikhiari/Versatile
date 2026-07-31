import { ref } from 'vue'
import { useProjectStore } from '../stores/projectStore'
import { aiGenerateJson } from './useAiService'
import { FEATURES } from '../config/ai'
import { SessionBudget } from '../services/aiProviderBudget'

import { getDefaultThreshold, getDimensionNames } from '../config/evalDimensions'
import { sanitizeJson } from '../services/ai/aiHelpers'
import { guardCritique } from '../guardrails/integration/composableGuardrails'
import { recordQualityForOutput } from '../services/aiResponseCache'

const CRITIC_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'number' },
    pass: { type: 'boolean' },
    dimensionScores: { type: 'object' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string' },
          type: { type: 'string' },
          description: { type: 'string' }
        }
      }
    },
    strengths: { type: 'array', items: { type: 'string' } }
  }
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
      (s: any, i: any) => `--- Scene ${i + 1} ---\n${(s.prose || '').slice(0, CONSISTENCY_EXCERPT_MAX_CHARS)}`
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
      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const activePrompts = projectStore.getActivePrompts(categoryType)

      const characterCount = countCharacters(storyBible)
      const hasFewCharacters = characterCount < 2

      const promptDims = getDimensionNames(categoryType)
      const dimsList = promptDims.map((d) => `  - ${d}`).join('\n')

      const userPrompt = `Evaluate this scene draft across ALL of the following dimensions:
${dimsList}

You MUST provide a score (1-10) for each dimension in the "dimensionScores" field of your JSON response.

${focusInstructions ? `FOCUS AREAS (pay extra attention to these dimensions based on historical weaknesses):
${focusInstructions}

` : ''}SCENE BRIEF:
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
${draft.slice(0, 4000)}

Return JSON evaluation with dimensionScores covering all listed dimensions.`

      const parsed = await aiGenerateJson(userPrompt, activePrompts.critic, {
        feature: FEATURES.STORY_GENERATION,
        temperature: 0.3,
        maxTokens: 1000,
        schema: CRITIC_SCHEMA,
        schemaName: 'scene_evaluation',
        sessionBudget: _sessionBudget
      }).catch(() => null)
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
      const score = typeof parsed.score === 'number' ? parsed.score : 7

      const expectedDims = getDimensionNames(categoryType)
      const rawScores: any = parsed.dimensionScores || {}
      const dimensionScores: any = {}
      for (const dim of expectedDims) {
        const val = rawScores[dim]
        dimensionScores[dim] = typeof val === 'number' && val >= 1 && val <= 10 ? val : null
      }

      const threshold = getDefaultThreshold(categoryType)
      const pass = score >= threshold

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
        strengths
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

  async function checkContradictions({ characters, locations, sceneProse, synopsis, ledger }: { characters: any; locations: any; sceneProse: any; synopsis: any; ledger: any }) {
    isCheckingConsistency.value = true
    const report: { characterIssues: any[]; locationIssues: any[]; error?: string } = { characterIssues: [], locationIssues: [] }

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

      // Build task factories for characters and locations
      const charTasks = characters
        .filter((char: any) => (scenesByChar.get(char.name)?.length || 0) >= 2)
        .map((char: any) => async () => {
          const charScenes = scenesByChar.get(char.name)
          const prompt = formatCharacterCheck(char, ledger, charScenes)
          const parsed: any = await aiGenerateJson(systemNote + prompt, CONSISTENCY_CRITIC_PROMPT, {
            feature: FEATURES.STORY_GENERATION,
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
        .filter((loc: any) => (scenesByLoc.get(loc.name)?.length || 0) >= 2)
        .map((loc: any) => async () => {
          const locScenes = scenesByLoc.get(loc.name)
          const prompt = formatLocationCheck(loc, ledger, locScenes)
          const parsed: any = await aiGenerateJson(systemNote + prompt, CONSISTENCY_CRITIC_PROMPT, {
            feature: FEATURES.STORY_GENERATION,
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
    get sessionBudget() { return _sessionBudget },
    set sessionBudget(v: SessionBudget | null) { _sessionBudget = v }
  }
}

export { sanitizeJson, countCharacters, formatCharacterCheck, formatLocationCheck }
