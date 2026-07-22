import { ref } from 'vue'
import { aiGenerate, aiStream, aiGenerateJson, resolveFeatureConfig } from './useAiService'
import { FEATURES, PROVIDERS, RESEARCH_CHUNKS_DEFAULT } from '../config/ai'

import { useProjectStore } from '../stores/projectStore'
import { getAllChunksForProject } from '../services/researchDb'
import { getEmbedding } from '../services/embeddingService'
import { cosineSimilarity } from '../services/ollamaService'
import { useLocalStorage } from './useLocalStorage'
import { RESEARCH_KEYS } from '../config/researchKeys'
import { sanitizeJson } from '../services/ai/aiHelpers'

// Bound the planning call (stream + retry) so a stalled model surfaces a clear
// error in a few minutes instead of hanging on Ollama's 20-minute default.
const PLAN_TIMEOUT_MS = 240000

// Hard cap on how many chunks we lexically rank in one planning call. Retrieval
// only needs the top handful, and scanning an unbounded corpus on the main thread
// is what froze the "Planning" phase on large research sets.
const LEXICAL_SCAN_CAP = 4000

// Rank chunks by BM25-ish TF-IDF against the query, computing document frequency
// ONCE per token (the previous version recomputed df — and re-lowercased every
// chunk — inside a per-chunk loop, which was O(N²) and blocked the UI thread).
function rankChunksLexically(queryText, lowerTexts) {
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

  return lowerTexts.map((lowerText) => {
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
function enforceStructure(chapters, spec) {
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

  return out.map((c, i) => {
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
    scenes = scenes.map((s, j) => ({ ...s, sceneNumber: j + 1, estimatedWords: wordsPerScene }))
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
async function runWithConcurrency(tasks, limit) {
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
async function planChunked({ goal, systemPrompt, onPartialData }) {
  const s = goal.structure
  const N = Math.max(1, s.chapters)
  const S = Math.max(1, s.scenesPerChapter || 3)

  // 1) Chapter skeleton — in batches of SKELETON_BATCH_SIZE
  const chapters = []
  let storyArc = {}
  while (chapters.length < N) {
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
    const skel = await aiGenerateJson(skeletonPrompt, systemPrompt, {
      feature: FEATURES.STORY_GENERATION,
      temperature: 0.7,
      timeout: PLAN_TIMEOUT_MS,
      schema: SKELETON_SCHEMA,
      schemaName: 'chapter_skeleton'
    }).catch(() => null)

    if (needArc && skel && skel.storyArc && typeof skel.storyArc === 'object') {
      storyArc = skel.storyArc
    }

    const batchChapters = Array.isArray(skel?.chapters) ? skel.chapters : []
    // Fill exactly batchCount chapters, padding any the model omitted so the arc
    // never loses its length to a single flaky/truncated batch.
    for (let k = 0; k < batchCount; k++) {
      const raw = batchChapters[k] || {}
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

  // 2) Scenes per chapter — independent given the skeleton, so plan them with
  //    bounded, provider-aware concurrency. Each chapter is still linked to the
  //    previous chapter's hook for continuity.
  const sceneTasks = chapters.map((ch, i) => async () => {
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
    const parsedScenes = await aiGenerateJson(scenePrompt, systemPrompt, {
      feature: FEATURES.STORY_GENERATION,
      temperature: 0.7,
      timeout: PLAN_TIMEOUT_MS,
      schema: SCENES_SCHEMA,
      schemaName: 'chapter_scenes'
    }).catch(() => null)
    ch.scenes = Array.isArray(parsedScenes?.scenes) ? parsedScenes.scenes : []
    for (const sc of ch.scenes) {
      try {
        onPartialData?.('scene', sc.title)
      } catch {
        // Best-effort progress callback; a throwing consumer must not break planning.
      }
    }
  })
  await runWithConcurrency(sceneTasks, planConcurrency())

  return { chapters, storyArc }
}

export function useStoryDirector() {
  const isPlanning = ref(false)
  const planError = ref(null)

  // `research` (optional, from the generator UI) scopes which imported research
  // documents inform the plan:
  //   { enabled?: boolean, documentIds?: number[] }
  // - enabled omitted → fall back to the global RESEARCH_ENABLED preference
  // - documentIds omitted/empty → use every document in the project (current behavior)
  // - documentIds set → restrict retrieval to exactly those documents
  async function generateStoryPlan({ goal, evidence, onPartialData, research }) {
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

      const researchDefault = useLocalStorage(RESEARCH_KEYS.RESEARCH_ENABLED, true)
      const researchEnabled =
        research && typeof research.enabled === 'boolean' ? research.enabled : researchDefault.value
      const selectedDocIds =
        Array.isArray(research?.documentIds) && research.documentIds.length
          ? new Set(research.documentIds)
          : null
      let researchContext = ''
      if (researchEnabled) {
        try {
          let allChunks = await getAllChunksForProject(projectStore.currentProjectId)
          if (selectedDocIds) {
            allChunks = allChunks.filter((c) => selectedDocIds.has(c.documentId))
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
            const lowerTexts = allChunks.map((c) => (c.text || '').toLowerCase())

            // Lexical ranking (TF-IDF), df computed once — O(N·tokens), not O(N²).
            const lexicalScores = rankChunksLexically(queryText, lowerTexts)
            const lexicalRanks = allChunks
              .map((c, i) => ({ chunk: c, score: lexicalScores[i] }))
              .sort((a, b) => b.score - a.score)
            const lexicalRankMap = new Map()
            lexicalRanks.forEach((item, rank) => lexicalRankMap.set(item.chunk.id, rank + 1))

            // Semantic ranking (best-effort)
            let semanticRankMap = new Map()
            try {
              const queryEmbedding = await getEmbedding(queryText)
              if (queryEmbedding && allChunks.some((c) => c.embedding)) {
                const withEmb = allChunks.filter((c) => c.embedding)
                const scored = withEmb
                  .map((c) => ({ chunk: c, score: cosineSimilarity(queryEmbedding, c.embedding) }))
                  .sort((a, b) => b.score - a.score)
                scored.forEach((item, rank) => semanticRankMap.set(item.chunk.id, rank + 1))
              }
            } catch {
              // semantic unavailable, lexical-only RRF
            }

            // RRF fusion with dynamic K
            const rrfScores = allChunks.map((chunk) => {
              const lr = lexicalRankMap.get(chunk.id) ?? Infinity
              const sr = semanticRankMap.get(chunk.id) ?? Infinity
              const rrf = 1 / (K + lr) + 1 / (K + sr)
              return { chunk, rrf }
            })
            const selected = rrfScores
              .sort((a, b) => b.rrf - a.rrf)
              .slice(0, count)
              .map((s) => s.chunk)
            researchContext = selected.map((c) => c.text).join('\n\n---\n\n')
          }
        } catch {
          researchContext = ''
        }
      }

      const finalSystemPrompt = `${baseDirectorPrompt}\n\n${evidence}${researchContext ? `\n\n## Research Context\n${researchContext}` : ''}`

      let parsed
      if (goal.structure) {
        // Large structured plan: build it in small, reliable chunks
        parsed = await planChunked({ goal, systemPrompt: finalSystemPrompt, onPartialData })
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
            // Bound planning so a stalled model fails fast instead of hanging for
            // Ollama's default 20 minutes with no visible progress.
            timeout: PLAN_TIMEOUT_MS
          }
        )

        parsed = sanitizeJson(accumulated)
        if (!parsed) {
          const retryResponse = await aiGenerate(userPrompt, finalSystemPrompt, {
            feature: FEATURES.STORY_GENERATION,
            temperature: 0.5,
            timeout: PLAN_TIMEOUT_MS
          })
          parsed = sanitizeJson(retryResponse)
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

      const validatedChapters = chapters.map((c, i) => {
        return {
          chapterNumber: c.chapterNumber || i + 1,
          title: c.title || `Chapter ${i + 1}`,
          goal: c.goal || '',
          arcPosition: c.arcPosition || '',
          emotionalTarget: c.emotionalTarget || '',
          hookEnding: c.hookEnding || '',
          estimatedWords: c.estimatedWords || 7000,
          scenes: (c.scenes || []).map((s, j) => ({
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
      const flatScenes = finalChapters.flatMap((c) => c.scenes)

      return {
        chapters: finalChapters,
        scenes: flatScenes,
        storyArc: {
          premise: storyArc.premise || goal.premise,
          genre: storyArc.genre || goal.genre || 'Literary',
          tone: storyArc.tone || goal.tone || 'Atmospheric',
          emotionalJourney: storyArc.emotionalJourney || '',
          centralConflict: storyArc.centralConflict || '',
          resolution: storyArc.resolution || '',
          totalChapters: finalChapters.length,
          totalScenes: flatScenes.length,
          totalEstimatedWords: finalChapters.reduce((sum, c) => sum + (c.estimatedWords || 0), 0)
        }
      }
    } catch (err) {
      planError.value = err.message || 'Story planning failed'
      throw err
    } finally {
      isPlanning.value = false
    }
  }

  return { generateStoryPlan, isPlanning, planError }
}

export { sanitizeJson, enforceStructure }
