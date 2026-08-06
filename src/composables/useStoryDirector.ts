import { ref } from 'vue'
import { aiGenerate, aiStream, aiGenerateJson, resolveFeatureConfig } from './useAiService'
import { FEATURES, PROVIDERS, RESEARCH_CHUNKS_DEFAULT } from '../config/ai'
import { SessionBudget } from '../services/aiProviderBudget'

import { useProjectStore } from '../stores/projectStore'
import { getAllChunksForProject, getAllResearchDocuments } from '../services/researchDb'
import { getEmbedding } from '../services/embeddingService'
import { cosineSimilarity } from '../services/ollamaService'
import { resolveResearchScope } from '../services/researchScope'
import { sanitizeJson, repairTruncatedJson } from '../services/ai/aiHelpers'
import { guardPlan } from '../guardrails/integration/composableGuardrails'
import { rethrowIfFatal } from './generation/lifecycle/fatal'

// Planning is bounded by LACK OF PROGRESS, not by elapsed time.
//
// The previous 240s wall-clock cap was below what the work costs: an unbounded
// `num_predict` of ~4,400 tokens takes ~12 minutes on a partially-offloaded
// local model, so every planning call was killed mid-flight and every retry
// paid the same 240s again. Measured on a GTX 1650 / qwen3:8b at 5.85 tok/s.
//
// Now a call lives as long as tokens keep arriving and dies quickly when they
// stop, which detects a genuine hang sooner than the old cap did while no
// longer punishing slow hardware for succeeding.
const PLAN_IDLE_TIMEOUT_MS = 90_000
// Prompt evaluation emits nothing; on a large bible + research prompt this is
// legitimately minutes of silence before the first token.
const PLAN_FIRST_TOKEN_TIMEOUT_MS = 300_000

// Token budget per planned unit, measured against the schemas below. Left
// implicit, `resolveMaxTokens` fell back to a flat 4,096 for any model it has no
// metadata for — which is every local Ollama model — so a 3-scene call was given
// the same runway as a 100-chapter one and simply ran until it was cut off.
const TOKENS_PER_CHAPTER_STUB = 170
const TOKENS_PER_SCENE = 300
const STORY_ARC_TOKENS = 400

/**
 * Planning is many calls, not one, and `rethrowIfFatal` already treats an
 * AbortError as fatal to the run — so the only thing needed to make a cancelled
 * plan stop issuing work is to raise one at each loop boundary.
 */
function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (!signal?.aborted) return
  const err = new Error(message)
  err.name = 'AbortError'
  throw err
}

// Hard cap on how many chunks we lexically rank in one planning call. Retrieval
// only needs the top handful, and scanning an unbounded corpus on the main thread
// is what froze the "Planning" phase on large research sets.
const LEXICAL_SCAN_CAP = 4000

// Rank chunks by BM25-ish TF-IDF against the query, computing document frequency
// ONCE per token (the previous version recomputed df — and re-lowercased every
// chunk — inside a per-chunk loop, which was O(N²) and blocked the UI thread).
function rankChunksLexically(queryText: any, lowerTexts: any[]) {
  const qTokens = queryText.toLowerCase().split(/\W+/).filter(Boolean)
  const N = lowerTexts.length || 1
  if (qTokens.length === 0) return new Array(N).fill(0)

  // df[token] — how many chunks contain the token — computed once.
  const df = new Map()
  for (const token of qTokens) {
    let d = 0
    for (let i = 0; i < lowerTexts.length; i++) {
      if (lowerTexts[i].includes(token)) d++
    }
    df.set(token, d)
  }

  return lowerTexts.map((lowerText: string) => {
    let score = 0
    for (const token of qTokens) {
      const dfv = df.get(token)
      if (!dfv) continue
      // term frequency via indexOf (no per-token regex construction)
      let tf = 0
      let idx = lowerText.indexOf(token)
      while (idx !== -1) {
        tf++
        idx = lowerText.indexOf(token, idx + token.length)
      }
      if (tf === 0) continue
      const idf = Math.log((N - dfv + 0.5) / (dfv + 0.5) + 1)
      score += (1 + Math.log(tf)) * idf
    }
    return score
  })
}

// sanitizeJson imported from aiHelpers.js

// Force a validated plan to match the user's exact structural request:
// exactly N chapters, S scenes each, W words per chapter. Trims extras and
// pads shortfalls (a safety net — the prompt asks the model to hit these).
function enforceStructure(chapters: any, spec: any) {
  const N = Math.max(1, spec.chapters || chapters.length)
  const S = Math.max(1, spec.scenesPerChapter || 3)
  const W = Math.max(1, spec.wordsPerChapter || 2000)
  const wordsPerScene = Math.max(200, Math.round(W / S))
  const chaptersPerVol = Math.max(1, spec.chaptersPerVolume || N)

  const out = (Array.isArray(chapters) ? chapters : []).slice(0, N)
  while (out.length < N) {
    out.push({
      title: `Chapter ${out.length + 1}`,
      goal: '',
      arcPosition: '',
      emotionalTarget: '',
      hookEnding: '',
      scenes: []
    })
  }

  return out.map((c: any, i: number) => {
    let scenes = (Array.isArray(c.scenes) ? c.scenes : []).slice(0, S)
    while (scenes.length < S) {
      scenes.push({
        title: `Scene ${scenes.length + 1}`,
        emotionalGoal: '',
        whatChanges: '',
        obstacle: '',
        sceneFunction: 'setup',
        charactersPresent: [],
        characterWants: {},
        location: '',
        setup: '',
        payoff: 'none',
        sensoryAnchor: '',
        arcPosition: 'setup',
        tension: 'medium',
        pacing: 'medium'
      })
    }
    scenes = scenes.map((s: any, j: number) => ({ ...s, sceneNumber: j + 1, estimatedWords: wordsPerScene }))
    return {
      ...c,
      chapterNumber: i + 1,
      volumeIndex: Math.floor(i / chaptersPerVol) + 1,
      estimatedWords: W,
      scenes
    }
  })
}

// JSON schemas for the chunked planner's structured-output calls. On capable
// providers these constrain decoding directly; on others aiGenerateJson falls
// back to text + sanitizeJson, so this is strictly a reliability upgrade.
const SKELETON_SCHEMA = {
  type: 'object',
  properties: {
    storyArc: {
      type: 'object',
      properties: {
        premise: { type: 'string' },
        genre: { type: 'string' },
        tone: { type: 'string' },
        centralConflict: { type: 'string' },
        emotionalJourney: { type: 'string' },
        resolution: { type: 'string' }
      }
    },
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chapterNumber: { type: 'number' },
          title: { type: 'string' },
          goal: { type: 'string' },
          arcPosition: { type: 'string' },
          emotionalTarget: { type: 'string' },
          hookEnding: { type: 'string' }
        },
        required: ['title']
      }
    }
  },
  required: ['chapters']
}

const SCENES_SCHEMA = {
  type: 'object',
  properties: {
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sceneNumber: { type: 'number' },
          title: { type: 'string' },
          emotionalGoal: { type: 'string' },
          whatChanges: { type: 'string' },
          obstacle: { type: 'string' },
          charactersPresent: { type: 'array', items: { type: 'string' } },
          characterWants: { type: 'object' },
          location: { type: 'string' },
          setup: { type: 'string' },
          payoff: { type: 'string' },
          sensoryAnchor: { type: 'string' },
          arcPosition: { type: 'string' },
          tension: { type: 'string' },
          pacing: { type: 'string' }
        },
        required: ['title']
      }
    }
  },
  required: ['scenes']
}

// Built per call so `maxItems` carries the exact count this batch asked for.
//
// An unbounded array tells the grammar it may keep emitting chapters forever,
// and a model handed a large num_predict duly does. The array bound is what lets
// the call terminate on its own rather than by running out of budget — the
// difference between a planning step that finishes and one that gets cut off.
function makeSkeletonSchema(batchCount: number) {
  return {
    ...SKELETON_SCHEMA,
    properties: {
      ...SKELETON_SCHEMA.properties,
      chapters: {
        ...SKELETON_SCHEMA.properties.chapters,
        minItems: batchCount,
        maxItems: batchCount
      }
    }
  }
}

function makeScenesSchema(sceneCount: number) {
  return {
    ...SCENES_SCHEMA,
    properties: {
      scenes: { ...SCENES_SCHEMA.properties.scenes, minItems: sceneCount, maxItems: sceneCount }
    }
  }
}

// How many chapters to request per skeleton call. A single call emitting 100+
// chapter objects is what truncates/times out and makes "Forging the Story Graph"
// hang; batching keeps every call small and reliable.
const SKELETON_BATCH_SIZE = 12

// Provider-aware planning concurrency. Ollama runs one model locally, so parallel
// calls only queue (no speedup, memory pressure) — keep it serial. Cloud providers
// plan chapters concurrently, which is the difference between minutes and an hour
// on a long novel.
function planConcurrency() {
  try {
    const config = resolveFeatureConfig(FEATURES.STORY_GENERATION)
    return config.provider === PROVIDERS.OLLAMA ? 1 : 4
  } catch {
    return 2
  }
}

// Bounded-concurrency map: runs the tasks with at most `limit` in flight, pulling
// the next task only when a slot frees (so each task's timeout clock starts when it
// actually launches, not up front). Task functions must not throw — planning tasks
// swallow their own errors and degrade.
async function runWithConcurrency(tasks: any[], limit: number) {
  const results = new Array(tasks.length)
  let cursor = 0
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++
      results[idx] = await tasks[idx]()
    }
  }
  const poolSize = Math.max(1, Math.min(limit, tasks.length))
  await Promise.all(Array.from({ length: poolSize }, () => worker()))
  return results
}

// Plan a large structured story in small, reliable pieces instead of one giant
// JSON: build the chapter skeleton in bounded batches (each batch threaded off the
// previous batch's last hook so the arc stays continuous), then plan each chapter's
// scenes with bounded concurrency. Every step degrades to padding rather than
// throwing, so a long novel always yields a usable plan — that is what keeps the
// "Forging the Story Graph" stage from hanging or aborting at scale.
async function planChunked({ goal, systemPrompt, onPartialData, onSkeletonReady, sessionBudget, signal }: { goal: any; systemPrompt: any; onPartialData: any; onSkeletonReady?: any; sessionBudget?: SessionBudget | null; signal?: AbortSignal }) {
  const s = goal.structure
  const N = Math.max(1, s.chapters)
  const S = Math.max(1, s.scenesPerChapter || 3)
  // Scene planning may run against different evidence than the skeleton did —
  // see the `onSkeletonReady` hook below.
  let activeSystemPrompt = systemPrompt

  // 1) Chapter skeleton — in batches of SKELETON_BATCH_SIZE
  const chapters: any[] = []
  let storyArc: any = {}
  // Padding is deliberate (a flaky batch must not cost the book its length) but
  // it is not free: a padded chapter is a title and nothing else. Counted here
  // so the caller can put it on the run-health ledger instead of the console.
  const degradation = { paddedChapters: 0, chaptersWithoutScenePlan: 0 }
  while (chapters.length < N) {
    throwIfAborted(signal, 'Story planning cancelled')
    const batchStart = chapters.length
    const batchCount = Math.min(SKELETON_BATCH_SIZE, N - batchStart)
    const needArc = batchStart === 0
    const prevHook = batchStart > 0 ? chapters[batchStart - 1].hookEnding : ''

    const skeletonPrompt = `Plan the chapter skeleton for this story.
PREMISE: "${goal.premise}"
GENRE: ${goal.genre || 'Standard'}
TONE: ${goal.tone || 'Standard'}

Produce EXACTLY ${batchCount} chapters, numbered ${batchStart + 1} through ${batchStart + batchCount}, forming part of ONE continuous arc across ${N} total chapters. Each chapter's "hookEnding" must set up the next chapter.
${prevHook ? `The PREVIOUS chapter (#${batchStart}) ended on: "${prevHook}". Chapter ${batchStart + 1} must follow directly from that.` : 'This batch opens the story.'}
Return ONLY JSON, no markdown:
{
  ${needArc ? '"storyArc": { "premise": "", "genre": "", "tone": "", "centralConflict": "", "emotionalJourney": "", "resolution": "" },\n  ' : ''}"chapters": [ { "chapterNumber": ${batchStart + 1}, "title": "", "goal": "", "arcPosition": "", "emotionalTarget": "", "hookEnding": "" } ]
}`
    const skel = await aiGenerateJson(skeletonPrompt, activeSystemPrompt, {
      feature: FEATURES.STORY_GENERATION,
      temperature: 0.7,
      idleTimeout: PLAN_IDLE_TIMEOUT_MS,
      firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
      maxTokens: batchCount * TOKENS_PER_CHAPTER_STUB + (needArc ? STORY_ARC_TOKENS : 0),
      schema: makeSkeletonSchema(batchCount),
      schemaName: 'chapter_skeleton',
      role: 'utility',
      sessionBudget,
      signal,
      // Heartbeat on every token chunk so the stage watchdog knows streaming is alive
      onToken: (_chunk, _full) => {
        try {
          if (onPartialData) onPartialData('structure', 'streaming')
        } catch {
          // Best-effort heartbeat; a throwing consumer must not break streaming.
        }
      }
    }).catch((err) => {
      // A spent budget or a user stop fails every remaining call identically.
      // Padding around those produces a full-length outline of empty chapters
      // and hides the reason the run is over — so they travel up instead.
      rethrowIfFatal(err)
      console.warn(`[StoryDirector] skeleton batch ${batchStart + 1}+ failed:`, err)
      return null
    })

    if (needArc && skel && skel.storyArc && typeof skel.storyArc === 'object') {
      storyArc = skel.storyArc
    }

    const batchChapters = Array.isArray(skel?.chapters) ? skel.chapters : []
    // Fill exactly batchCount chapters, padding any the model omitted so the arc
    // never loses its length to a single flaky/truncated batch.
    for (let k = 0; k < batchCount; k++) {
      const raw = batchChapters[k] || {}
      if (!raw.title) degradation.paddedChapters++
      const chapterNumber = batchStart + k + 1
      chapters.push({
        chapterNumber,
        title: raw.title || `Chapter ${chapterNumber}`,
        goal: raw.goal || '',
        arcPosition: raw.arcPosition || '',
        emotionalTarget: raw.emotionalTarget || '',
        hookEnding: raw.hookEnding || ''
      })
    }
    try {
      onPartialData?.('scene', `Outlined chapters ${batchStart + 1}–${batchStart + batchCount}`)
    } catch {
      // Best-effort progress callback; a throwing consumer must not break planning.
    }
  }

  // 1.5) The cast an arc needs is only knowable once the arc exists. Give the
  //      caller a window here — after the skeleton, before any scene is planned —
  //      to commit new entities and hand back refreshed evidence, so scenes can
  //      cast them by name. Without this the plan can only ever draw on the cast
  //      the synopsis alone produced, and nothing downstream adds to it.
  //
  //      Advisory: a failure here costs the story its new cast, not its plan.
  if (onSkeletonReady) {
    try {
      const refreshedEvidence = await onSkeletonReady({ chapters, storyArc })
      if (typeof refreshedEvidence === 'string' && refreshedEvidence.trim()) {
        activeSystemPrompt = refreshedEvidence
      }
    } catch (err) {
      rethrowIfFatal(err)
      console.warn('[StoryDirector] cast expansion hook failed; planning scenes as-is:', err)
    }
  }

  // 2) Scenes per chapter — independent given the skeleton, so plan them with
  //    bounded, provider-aware concurrency. Each chapter is still linked to the
  //    previous chapter's hook for continuity.
  const sceneTasks = chapters.map((ch: any, i: number) => async () => {
    // Checked per task, not once up front: these run with bounded concurrency,
    // so an abort during chapter 3 must stop chapters 4..N from ever being
    // issued rather than only the one in flight.
    throwIfAborted(signal, 'Scene planning cancelled')
    const prev = chapters[i - 1]
    try {
      onPartialData?.('scene', ch.title || `Chapter ${i + 1}`)
    } catch {
      // Best-effort progress callback; a throwing consumer must not break planning.
    }
    const scenePrompt = `Plan EXACTLY ${S} scenes for this chapter of the story.
STORY: "${goal.premise}" (${goal.genre || 'Standard'}, ${goal.tone || 'Standard'})
CHAPTER ${i + 1}: "${ch.title}"
- Chapter goal: ${ch.goal || ''}
- Emotional target: ${ch.emotionalTarget || ''}
- This chapter must end on: ${ch.hookEnding || 'a hook into the next chapter'}
${prev ? `- The PREVIOUS chapter ended on: "${prev.hookEnding || ''}". Scene 1 must pick up directly from that.` : '- This is the opening chapter.'}

Return ONLY JSON with EXACTLY ${S} scenes, no markdown:
{ "scenes": [ { "sceneNumber": 1, "title": "", "emotionalGoal": "", "whatChanges": "", "obstacle": "", "charactersPresent": [], "characterWants": {}, "location": "", "setup": "", "payoff": "", "sensoryAnchor": "", "arcPosition": "setup", "tension": "medium", "pacing": "medium" } ] }`
    const parsedScenes = await aiGenerateJson(scenePrompt, activeSystemPrompt, {
      feature: FEATURES.STORY_GENERATION,
      temperature: 0.7,
      idleTimeout: PLAN_IDLE_TIMEOUT_MS,
      firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
      maxTokens: S * TOKENS_PER_SCENE,
      schema: makeScenesSchema(S),
      schemaName: 'chapter_scenes',
      role: 'utility',
      sessionBudget,
      signal,
      // Heartbeat on every token chunk so the stage watchdog knows streaming is alive
      onToken: (_chunk, _full) => {
        try {
          if (onPartialData) onPartialData('structure', 'streaming')
        } catch {
          // Best-effort heartbeat; a throwing consumer must not break streaming.
        }
      }
    }).catch((err) => {
      rethrowIfFatal(err)
      console.warn(`[StoryDirector] scene plan for chapter ${i + 1} failed:`, err)
      return null
    })
    ch.scenes = Array.isArray(parsedScenes?.scenes) ? parsedScenes.scenes : []
    // `enforceStructure` will pad this chapter back to S scenes downstream, so
    // the plan's shape stays right and the loss is invisible unless counted.
    if (ch.scenes.length === 0) degradation.chaptersWithoutScenePlan++
    for (const sc of (ch as any).scenes) {
      try {
        onPartialData?.('scene', sc.title)
      } catch {
        // Best-effort progress callback; a throwing consumer must not break planning.
      }
    }
  })
  await runWithConcurrency(sceneTasks, planConcurrency())

  return { chapters, storyArc, degradation }
}

export function useStoryDirector() {
  const isPlanning = ref(false)
  const planError = ref<any>(null)
  let _sessionBudget: SessionBudget | null = null

  // `research` (optional, from the generator UI) scopes which imported research
  // documents inform the plan:
  //   { enabled?: boolean, documentIds?: number[] }
  // - enabled omitted → fall back to the global RESEARCH_ENABLED preference
  // - documentIds omitted/empty → use every document in the project (current behavior)
  // - documentIds set → restrict retrieval to exactly those documents
  // `onSkeletonReady` (optional) is invoked once the chapter skeleton exists and
  // before scenes are planned, with `{ chapters, storyArc }`. It may commit new
  // story entities and return a replacement system prompt (evidence) for scene
  // planning. Structured plans only — the unstructured path is a single call
  // with no seam to hook, and at its default 4k word target the opening cast is
  // already sized for the story.
  // `signal` (optional in the type, required in practice) is the `structure`
  // stage's abort signal. Planning is the longest chain of provider calls in the
  // run; without it the stage watchdog could declare the stage stuck and then
  // watch it go on issuing chapter after chapter against a provider slot the
  // next stage was already queued for.
  async function generateStoryPlan({ goal, evidence, onPartialData, onSkeletonReady, research, signal }: { goal: any; evidence: any; onPartialData: any; onSkeletonReady?: any; research: any; signal?: AbortSignal }) {
    isPlanning.value = true
    planError.value = null

    try {
      const projectStore = useProjectStore()
      const categoryType = projectStore.activeWorkspaceType || 'creative'
      const activePrompts = projectStore.getActivePrompts(categoryType)

      const s = goal.structure
      const structureBlock = s
        ? `

### STRUCTURE REQUIREMENTS (MANDATORY — follow these numbers exactly)
- Produce EXACTLY ${s.chapters} chapters.${s.volumes > 1 ? ` These span ${s.volumes} volumes of ${s.chaptersPerVolume} chapters each, in order.` : ''}
- Each chapter must contain EXACTLY ${s.scenesPerChapter || 3} scenes.
- Target ${s.wordsPerChapter} words per chapter (~${Math.round(s.wordsPerChapter / (s.scenesPerChapter || 3))} words per scene).
- LINKAGE: every chapter MUST end with a "hookEnding" that sets up the next chapter, and each chapter's first scene must pick up directly from the previous chapter's hook so the chapters read as one continuous story.`
        : ''

      const userPrompt = `Plan a complete document structure based on this GOAL.

### GOAL
OBJECTIVE/PREMISE: "${goal.premise}"
DOCUMENT TYPE/GENRE: "${goal.genre || 'Standard'}"
TONE: "${goal.tone || 'Professional'}"
TARGET WORD COUNT: ${goal.wordTarget || 4000}${structureBlock}

Generate a complete plan as JSON with "chapters" array and "storyArc" object.`

      let baseDirectorPrompt = activePrompts.director
      if (goal.horizon === 'short_term') {
        baseDirectorPrompt = `You are a story architect and worldbuilder. Your task is to fulfill a targeted short-term GOAL based on the EVIDENCE provided.

OUTPUT FORMAT:
Return ONLY valid JSON with no markdown, no explanation, no code fences.
The JSON must have a "chapters" array. Each chapter object must contain a "scenes" array with the scene details.`
      }

      // Same resolver the scene writer uses, so "which sources inform this run"
      // means one thing at plan time and write time.
      const { enabled: researchEnabled, documentIds: scopedDocIds } =
        resolveResearchScope(research)
      const selectedDocIds = scopedDocIds.length ? new Set(scopedDocIds.map(String)) : null
      let researchContext = ''
      if (researchEnabled) {
        try {
          let allChunks = await getAllChunksForProject(projectStore.currentProjectId)
          if (selectedDocIds) {
            allChunks = allChunks.filter((c: any) => selectedDocIds.has(String(c.documentId)))
          }
          // Bound the working set so ranking can't block the UI on a huge corpus.
          if (allChunks.length > LEXICAL_SCAN_CAP) {
            console.warn(
              `[StoryDirector] ${allChunks.length} research chunks exceeds scan cap; ranking first ${LEXICAL_SCAN_CAP}.`
            )
            allChunks = allChunks.slice(0, LEXICAL_SCAN_CAP)
          }
          if (allChunks.length > 0) {
            const count = Math.min(allChunks.length, RESEARCH_CHUNKS_DEFAULT)
            const queryText = `Premise: ${goal.premise}. Genre: ${goal.genre || 'Standard'}. Tone: ${goal.tone || 'Professional'}`
            const K = Math.max(10, count * 10)
            const lowerTexts = allChunks.map((c: any) => (c.text || '').toLowerCase())

            // Lexical ranking (TF-IDF), df computed once — O(N·tokens), not O(N²).
            const lexicalScores = rankChunksLexically(queryText, lowerTexts)
            const lexicalRanks = allChunks
              .map((c: any, i: number) => ({ chunk: c, score: lexicalScores[i] }))
              .sort((a: any, b: any) => b.score - a.score)
            const lexicalRankMap = new Map()
            lexicalRanks.forEach((item: any, rank: number) => lexicalRankMap.set(item.chunk.id, rank + 1))

            // Semantic ranking (best-effort)
            const semanticRankMap = new Map()
            try {
              const queryEmbedding = await getEmbedding(queryText)
              // Only chunks whose vector is finished AND lives in the query's
              // vector space. A half-indexed corpus (or one left over from a
              // different embedding model) used to contribute chunks that scored
              // 0 against every query and still occupied ranking slots.
              const withEmb = queryEmbedding
                ? allChunks.filter(
                    (c: any) =>
                      c.embedding &&
                      c.embedding.length === queryEmbedding.length &&
                      (!c.embeddingStatus || c.embeddingStatus === 'READY')
                  )
                : []
              if (withEmb.length > 0) {
                const scored = withEmb
                  .map((c: any) => ({ chunk: c, score: cosineSimilarity(queryEmbedding as any, c.embedding as any) }))
                  .sort((a: any, b: any) => b.score - a.score)
                scored.forEach((item: any, rank: number) => semanticRankMap.set(item.chunk.id, rank + 1))
              }
            } catch {
              // semantic unavailable, lexical-only RRF
            }

            // RRF fusion with dynamic K
            const rrfScores = allChunks.map((chunk: any) => {
              const lr = lexicalRankMap.get(chunk.id) ?? Infinity
              const sr = semanticRankMap.get(chunk.id) ?? Infinity
              const rrf = 1 / (K + lr) + 1 / (K + sr)
              return { chunk, rrf }
            })
            const selected = rrfScores
              .sort((a: any, b: any) => b.rrf - a.rrf)
              .slice(0, count)
              .map((s: any) => s.chunk)

            // Label each excerpt with the document it came from. Unlabelled text
            // dropped into the system prompt reads as the planner's own
            // assumptions; a named source reads as material to plan *from*, and
            // it matches the [source:…] form the scene writer now receives.
            const titles = new Map<string, string>()
            try {
              const docs = await getAllResearchDocuments(projectStore.currentProjectId)
              for (const d of docs) titles.set(String(d.id), d.fileName || d.title || '')
            } catch {
              // Titles are a nicety; the excerpts still carry the content.
            }
            researchContext = selected
              .map((c: any) => {
                const source = titles.get(String(c.documentId)) || c.heading || 'unknown source'
                return `[source:${source}]\n${c.text}`
              })
              .join('\n\n---\n\n')
          }
        } catch {
          researchContext = ''
        }
      }

      const finalSystemPrompt = `${baseDirectorPrompt}\n\n${evidence}${researchContext ? `\n\n## Research Context\n${researchContext}` : ''}`

      let parsed: any
      if (goal.structure) {
        // Large structured plan: build it in small, reliable chunks
        parsed = await planChunked({
          goal,
          systemPrompt: finalSystemPrompt,
          onPartialData,
          // Evidence is everything after the base director prompt, so a refreshed
          // bible has to be re-wrapped the same way to keep research attached.
          onSkeletonReady: onSkeletonReady
            ? async (skeleton: any) => {
                const refreshed = await onSkeletonReady(skeleton)
                if (typeof refreshed !== 'string' || !refreshed.trim()) return null
                return `${baseDirectorPrompt}\n\n${refreshed}${researchContext ? `\n\n## Research Context\n${researchContext}` : ''}`
              }
            : undefined,
          sessionBudget: _sessionBudget,
          signal
        })
      } else {
        // Small/default plan: one streaming call with a non-streaming retry
        let accumulated = ''
        const emittedTitles = new Set()
        let scanOffset = 0

        await aiStream(
          userPrompt,
          finalSystemPrompt,
          (chunk) => {
            accumulated += chunk

            // Heartbeat on every chunk so the stage watchdog knows streaming is alive
            try {
              if (onPartialData) onPartialData('structure', 'streaming')
            } catch {
              // Best-effort heartbeat; a throwing consumer must not break streaming.
            }

            const regex = /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g
            regex.lastIndex = Math.max(0, scanOffset - 200)
            let match

            while ((match = regex.exec(accumulated)) !== null) {
              const title = match[1]
              if (!emittedTitles.has(title)) {
                emittedTitles.add(title)
                try {
                  if (onPartialData) onPartialData('scene', title)
                } catch {
                  // Best-effort progress callback; a throwing consumer must not break planning.
                }
              }
            }
            scanOffset = Math.max(0, accumulated.length - 200)
          },
          {
            feature: FEATURES.STORY_GENERATION,
            temperature: 0.7,
            // Bounded by silence, not by elapsed time: a stalled model still
            // fails fast, but one that is simply slow is allowed to finish.
            idleTimeout: PLAN_IDLE_TIMEOUT_MS,
            firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
            sessionBudget: _sessionBudget,
            signal
          }
        )

        // A stream cut short still holds most of the plan; repair it before
        // paying for a second full generation.
        parsed = sanitizeJson(accumulated) || repairTruncatedJson(accumulated)
        if (!parsed) {
          // The repair path is for a truncated stream, not a cancelled one — a
          // second full-length call is the last thing an abandoned stage should do.
          throwIfAborted(signal, 'Story planning cancelled')
          const retryResponse = await aiGenerate(userPrompt, finalSystemPrompt, {
            feature: FEATURES.STORY_GENERATION,
            temperature: 0.5,
            idleTimeout: PLAN_IDLE_TIMEOUT_MS,
            firstTokenTimeout: PLAN_FIRST_TOKEN_TIMEOUT_MS,
            sessionBudget: _sessionBudget,
            signal
          })
          parsed = sanitizeJson(retryResponse) || repairTruncatedJson(retryResponse)
        }
      }

      if (!parsed) {
        throw new Error(
          'The planning model timed out or returned invalid JSON. Try fewer chapters, a smaller word target, or a larger/faster model.'
        )
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
            sceneNumber: 1,
            title: 'Opening',
            arcPosition: 'setup',
            sceneFunction: 'setup',
            emotionalGoal: 'unknown',
            whatChanges: 'unknown',
            obstacle: 'unknown',
            charactersPresent: [],
            characterWants: {},
            location: '',
            setup: '',
            payoff: 'none',
            sensoryAnchor: '',
            tension: 'medium',
            pacing: 'medium',
            estimatedWords: 500
          })
        }

        if (!chapter.estimatedWords || chapter.estimatedWords < 1000) {
          chapter.estimatedWords = Math.max(
            1500,
            Math.floor((goal.wordTarget || 4000) / Math.max(1, chapters.length))
          )
        }

        for (const scene of chapter.scenes) {
          if (!scene.arcPosition) scene.arcPosition = 'setup'
          if (!scene.obstacle) scene.obstacle = 'Unspecified obstacle'
        }
      }

      const validatedChapters = chapters.map((c: any, i: number) => {
        return {
          chapterNumber: c.chapterNumber || i + 1,
          title: c.title || `Chapter ${i + 1}`,
          goal: c.goal || '',
          arcPosition: c.arcPosition || '',
          emotionalTarget: c.emotionalTarget || '',
          hookEnding: c.hookEnding || '',
          estimatedWords: c.estimatedWords || 7000,
          scenes: (c.scenes || []).map((s: any, j: number) => ({
            sceneNumber: s.sceneNumber || j + 1,
            title: s.title || `Scene ${j + 1}`,
            emotionalGoal: s.emotionalGoal || '',
            whatChanges: s.whatChanges || '',
            obstacle: s.obstacle || '',
            sceneFunction: s.sceneFunction || s.arcPosition || 'setup',
            charactersPresent: Array.isArray(s.charactersPresent) ? s.charactersPresent : [],
            characterWants:
              s.characterWants && typeof s.characterWants === 'object' ? s.characterWants : {},
            location: s.location || '',
            setup: s.setup || '',
            payoff: s.payoff || 'none',
            sensoryAnchor: s.sensoryAnchor || '',
            arcPosition: [
              'setup',
              'obstacle',
              'turn',
              'resolution',
              'hook',
              'opening',
              'rising',
              'climax',
              'falling'
            ].includes(s.arcPosition)
              ? s.arcPosition
              : 'setup',
            tension: ['low', 'medium', 'high', 'peak'].includes(s.tension) ? s.tension : 'medium',
            pacing: ['slow', 'medium', 'fast'].includes(s.pacing) ? s.pacing : 'medium',
            estimatedWords:
              typeof s.estimatedWords === 'number'
                ? s.estimatedWords
                : Math.round(c.estimatedWords / Math.max(c.scenes.length, 1))
          }))
        }
      })

      // Honor the user's exact volumes/chapters/words request if one was given
      const finalChapters = goal.structure
        ? enforceStructure(validatedChapters, goal.structure)
        : validatedChapters
      const flatScenes = finalChapters.flatMap((c: any) => c.scenes)

      // The plan names characters and locations the writer will be held to,
      // so phantom entities are caught here rather than scene by scene.
      await guardPlan({ plan: { chapters: finalChapters, scenes: flatScenes } })

      return {
        chapters: finalChapters,
        scenes: flatScenes,
        // What the plan had to invent. Always present, so a consumer can read it
        // without checking which planning path ran; zeroes mean a clean plan.
        degradation: {
          paddedChapters: parsed?.degradation?.paddedChapters || 0,
          chaptersWithoutScenePlan: parsed?.degradation?.chaptersWithoutScenePlan || 0
        },
        storyArc: {
          premise: storyArc.premise || goal.premise,
          genre: storyArc.genre || goal.genre || 'Literary',
          tone: storyArc.tone || goal.tone || 'Atmospheric',
          emotionalJourney: storyArc.emotionalJourney || '',
          centralConflict: storyArc.centralConflict || '',
          resolution: storyArc.resolution || '',
          totalChapters: finalChapters.length,
          totalScenes: flatScenes.length,
          totalEstimatedWords: finalChapters.reduce((sum: number, c: any) => sum + (c.estimatedWords || 0), 0)
        }
      }
    } catch (err: any) {
      planError.value = err.message || 'Story planning failed'
      throw err
    } finally {
      isPlanning.value = false
    }
  }

  return { generateStoryPlan, isPlanning, planError, get sessionBudget() { return _sessionBudget }, set sessionBudget(v: SessionBudget | null) { _sessionBudget = v } }
}

export { sanitizeJson, enforceStructure }
