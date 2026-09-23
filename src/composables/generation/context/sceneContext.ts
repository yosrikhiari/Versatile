import { getEmbedding } from '../../../services/embeddingService'
import { cosineSimilarity } from '../../../services/ollamaService'
import { multiHopRetrieval as multiHopRetrieve } from '../../../services/ragMultiHopRetrieval'
import { formatCitationContext } from '../../../services/ragCitationInjector'
import { estimateTokens } from '../../../services/ai/contextBudget'
import { getOllamaNumCtx } from '../../../config/ollama'

/**
 * How many tokens of prior-scene continuity the writer may receive.
 *
 * This was the constant 350 — inherited from `EMBEDDING_CONTEXT_MAX_CHARS =
 * 1400` under an old 4:1 character guess, converted to tokens to "keep the same
 * intent". The intent was kept; nobody re-asked whether it was right. Measured
 * on a real run (2026-09-23): the writer's window is 16,384 tokens, of which
 * 12,644 are budget after output and scaffold, and the largest prompt the
 * pipeline actually produced was 3,104 tokens — 19% of the window. Continuity,
 * the one channel carrying what happened in the story, held 2.8% of the budget
 * while ~9,500 tokens went unused.
 *
 * So the cap is now a share of the window rather than a number. The floor is
 * the old 350 so a small `num_ctx` behaves exactly as before.
 *
 * Note the reserves duplicate `fitSceneContext`'s: this has to be computed
 * BEFORE the blocks are assembled, and that trims them after. They are
 * deliberately the same numbers — if one moves, move both.
 */
const RETRIEVAL_OUTPUT_RESERVE_TOKENS = 2240
const RETRIEVAL_SCAFFOLD_RESERVE_TOKENS = 1500
const RETRIEVAL_BUDGET_SHARE = 0.3
const RETRIEVAL_MIN_TOKENS = 350

function retrievalBudgetTokens(numCtx?: number): number {
  const ctx = typeof numCtx === 'number' && numCtx > 0 ? numCtx : getOllamaNumCtx()
  const usable = Math.max(
    1000,
    ctx - RETRIEVAL_OUTPUT_RESERVE_TOKENS - RETRIEVAL_SCAFFOLD_RESERVE_TOKENS
  )
  return Math.max(RETRIEVAL_MIN_TOKENS, Math.round(usable * RETRIEVAL_BUDGET_SHARE))
}

/** How much of the immediately preceding scene's ending is carried verbatim. */
const PRECEDING_ENDING_CHARS = 1200

const CONSISTENCY_FIX_ROUNDS = 2
const CONSISTENCY_FIX_MAX_SCENES = 3

/**
 * Only a warning threshold now, not a switch.
 *
 * It used to decide the retrieval strategy: at or below 25 prior scenes the
 * positional rule ran, above it the embedding ranking did. That is a proxy for
 * the real question — does what we want to send fit in the budget? — so the
 * strategy is chosen on that directly, and this stays to flag that a long book
 * is leaning on prose excerpts because embeddings were unavailable.
 */
const PROSE_EXCERPT_MAX_SCENES = 25

function buildFactLedger(spine: any, writtenScenes: any) {
  const proseByChapter = new Map()
  if (Array.isArray(writtenScenes)) {
    for (const scene of writtenScenes) {
      if (!scene || scene.chapterId == null || !Array.isArray(scene.keyFacts)) continue
      const key = String(scene.chapterId)
      if (!proseByChapter.has(key)) proseByChapter.set(key, [])
      const bucket = proseByChapter.get(key)
      for (const fact of scene.keyFacts) {
        if (typeof fact === 'string' && fact.trim()) bucket.push(fact.trim())
      }
    }
  }

  const ledger: string[] = []
  const emit = (chapterNumber: any, facts: any) => {
    for (const fact of facts) ledger.push(`Ch${chapterNumber}: ${fact}`)
  }

  if (!Array.isArray(spine)) {
    for (const key of [...proseByChapter.keys()].sort((a, b) => Number(a) - Number(b))) {
      emit(key, proseByChapter.get(key))
    }
    return ledger
  }

  for (const entry of spine) {
    if (!entry) continue
    const key = String(entry.chapterNumber)
    const prose = proseByChapter.get(key)
    if (prose && prose.length) {
      emit(entry.chapterNumber, prose)
    } else if (Array.isArray(entry.keyFacts)) {
      emit(
        entry.chapterNumber,
        entry.keyFacts
          .filter((f: any) => typeof f === 'string' && f.trim())
          .map((f: any) => f.trim())
      )
    }
  }
  return ledger
}

/**
 * The durable facts the story has actually established, by chapter, for the
 * writer.
 *
 * `buildFactLedger` has existed for a while and all three of its callers are in
 * `ConsistencyService` — it is read after the prose is written, to find
 * contradictions, and never before, to prevent them. So the writer's only
 * cross-chapter signal was `spineContext`, which is generated from the OUTLINE
 * before any prose exists: chapter 5 opens against a description of what
 * chapter 4 was *planned* to do, not what it did.
 *
 * Passing `null` for the spine is deliberate. `buildFactLedger` then emits only
 * facts lifted from written prose, which is the point — a planned fact is what
 * the spine already carries, and mixing the two would hide which is which.
 *
 * `chapterNumber` is not optional in practice: the anchor-first writer drafts
 * every chapter's opening and closing scene before any middles, so by the time
 * a chapter-1 middle is written, chapter 5's anchors are in `writtenScenes`.
 * Without the filter that middle would be handed facts from its own future.
 */
interface LedgerScene {
  chapterId?: number | string | null
  keyFacts?: string[]
}

function buildStoryStateContext(
  writtenScenes: LedgerScene[] | null | undefined,
  chapterNumber?: number | null
): string {
  const scoped = (Array.isArray(writtenScenes) ? writtenScenes : []).filter((s) => {
    if (!s || s.chapterId == null) return false
    if (chapterNumber == null) return true
    return Number(s.chapterId) <= Number(chapterNumber)
  })
  if (scoped.length === 0) return ''
  return buildFactLedger(null, scoped).join('\n')
}

function fullCharacter(c: any) {
  return { name: c.name, role: c.role, description: c.description, traits: c.traits || [] }
}
function fullLocation(l: any) {
  return { name: l.name, description: l.description, notes: l.notes, traits: l.traits || [] }
}
function fullThread(t: any) {
  return { title: t.title, status: t.status, notes: t.notes, traits: t.traits || [] }
}

function buildExistingEntitiesBlob(characterList: any, locationList: any, plotThreadList: any) {
  return JSON.stringify(
    {
      characters: characterList.map(fullCharacter),
      locations: locationList.map(fullLocation),
      plotThreads: plotThreadList.map(fullThread)
    },
    null,
    2
  )
}

function nameKey(v: any) {
  return String(v || '')
    .trim()
    .toLowerCase()
}

/**
 * Entity context scoped to one scene, rather than the whole story bible.
 *
 * The full dump grows with the novel and rides in every writer call, so prompts
 * scaled with the project instead of the scene — the wrong axis. The scene brief
 * already knows its own cast via `charactersPresent`, so spend detail on who is
 * actually here and give everyone else a name+role index, which preserves the
 * "these people exist, don't reinvent them" signal at a fraction of the tokens.
 *
 * Plot threads ARE scoped when the scene names them: `threadIds` (emitted by
 * the director against the thread catalog) selects the threads the scene
 * advances; those ride full, the rest collapse to a title-only index like
 * `otherCharacters`. With no `threadIds` there is no signal to scope on and
 * every thread rides whole, as before.
 *
 * Returns `null` when the scene names nobody — the director's fallback path
 * leaves `charactersPresent` empty (useStoryDirector.js:93), and scoping on an
 * empty cast would send zero character detail. Callers fall back to the full
 * dump in that case.
 *
 * @returns {string|null} compact JSON, or null if the scene has no usable cast
 */
function buildSceneEntitiesBlob(
  scene: any,
  { characters = [], locations = [], plotThreads = [] }: any = {}
) {
  const present = new Set(
    [...(scene?.charactersPresent || []), ...(scene?.characters || [])].filter(Boolean).map(nameKey)
  )
  if (present.size === 0) return null

  const here = nameKey(scene?.location)
  const isPresent = (c: any) => present.has(nameKey(c.name))
  const isHere = (l: any) => here !== '' && nameKey(l.name) === here

  const cast = characters.filter(isPresent)
  if (cast.length === 0) return null

  const elsewhere = characters.filter((c: any) => !isPresent(c))
  const hereLocs = locations.filter(isHere)
  const otherLocs = locations.filter((l: any) => !isHere(l))

  const payload: Record<string, any> = {
    charactersInScene: cast.map(fullCharacter)
  }
  const threadIds = new Set(
    (Array.isArray(scene?.threadIds) ? scene.threadIds : []).map((t: any) => String(t))
  )
  if (threadIds.size === 0) {
    payload.plotThreads = plotThreads.map(fullThread)
  } else {
    const inScene = plotThreads.filter((t: any) => threadIds.has(String(t.id)))
    const others = plotThreads.filter((t: any) => !threadIds.has(String(t.id)))
    payload.threadsInScene = inScene.map(fullThread)
    if (others.length) {
      payload.otherThreads = others.map((t: any) => ({ title: t.title }))
    }
  }
  // Name-only indexes: enough to know they exist, cheap enough to always send.
  if (elsewhere.length) {
    payload.otherCharacters = elsewhere.map((c: any) => ({ name: c.name, role: c.role }))
  }
  if (hereLocs.length) payload.locationsInScene = hereLocs.map(fullLocation)
  if (otherLocs.length) payload.otherLocations = otherLocs.map((l: any) => l.name)

  // No pretty-print: indentation costs tokens and no model needs it.
  return JSON.stringify(payload)
}

function planConsistencyFixes(report: any, writtenScenes: any) {
  const fixes = new Map()
  if (!report || !Array.isArray(writtenScenes) || writtenScenes.length === 0) return fixes

  const norm = (t: any) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const normedProse = writtenScenes.map((s) => norm(s.prose))

  const findByExcerpt = (excerpt: any) => {
    const e = norm(excerpt)
    if (e.length < 12) return -1
    for (const probeLen of [60, 40, 24]) {
      const probe = e.slice(0, probeLen)
      if (probe.length < 12) continue
      for (let i = normedProse.length - 1; i >= 0; i--) {
        if (normedProse[i].includes(probe)) return i
      }
    }
    return -1
  }

  const latestWithEntity = (name: any, kind: any) => {
    for (let i = writtenScenes.length - 1; i >= 0; i--) {
      const ws = writtenScenes[i]
      const match =
        kind === 'Character' ? (ws.characters || []).includes(name) : ws.location === name
      if (match) return i
    }
    return -1
  }

  const addReason = (idx: any, reason: any) => {
    if (idx < 0) return
    if (!fixes.has(idx)) fixes.set(idx, new Set())
    fixes.get(idx).add(reason)
  }

  const handle = (name: any, kind: any, contradictions: any) => {
    for (const c of contradictions || []) {
      const reason =
        `${kind} "${name}" — ${c.type || 'inconsistency'}: ${c.description || ''}`.trim()
      const idxs = (c.between || []).map(findByExcerpt).filter((i: any) => i >= 0)
      const target = idxs.length ? Math.max(...idxs) : latestWithEntity(name, kind)
      addReason(target, reason)
    }
  }

  for (const ci of report.characterIssues || [])
    handle(ci.character, 'Character', ci.contradictions)
  for (const li of report.locationIssues || []) handle(li.location, 'Location', li.contradictions)
  return fixes
}

function buildEmbeddingContext(currentScene: any, priorScenes: any, budgetTokens?: number) {
  if (priorScenes.length === 0) return ''
  const budget = typeof budgetTokens === 'number' ? budgetTokens : retrievalBudgetTokens()

  if (priorScenes.length > PROSE_EXCERPT_MAX_SCENES) {
    console.warn(
      `[VolumeStoryGenerator] Falling back to prose-excerpt continuity for ` +
        `${priorScenes.length} scenes — embedding retrieval was unavailable; ` +
        `continuity beyond the last two scenes may suffer.`
    )
  }

  let context = ''

  const precedingScene = priorScenes.at(-1)
  if (precedingScene) {
    const endingExcerpt =
      precedingScene.prose.length > PRECEDING_ENDING_CHARS
        ? '...' + precedingScene.prose.slice(-PRECEDING_ENDING_CHARS)
        : precedingScene.prose
    context += `[Ending of Preceding Scene ${precedingScene.sceneNumber}: "${precedingScene.title}"]\n${endingExcerpt}\n\n`
  }

  const olderScene = priorScenes.at(-2)
  if (olderScene && estimateTokens(context) < budget) {
    context += `[Summary of Scene ${olderScene.sceneNumber}: "${olderScene.title}"]\n${olderScene.summary || olderScene.prose.slice(0, 300) + '...'}\n\n`
  }

  // Everything else that fits, best-first. The old limit of 3 was a companion
  // to the 350-token cap — under it a fourth line would rarely have fit anyway.
  // With a real budget the limit is the budget, so `selectRelevantPriorScenes`
  // ranks the whole remainder and the loop stops when the room runs out.
  // Ranked, not dumped. `selectRelevantPriorScenes` keeps only scenes sharing a
  // character or the location, and that filter is the point: padding the budget
  // with every remaining scene buries the relevant ones instead of adding to
  // them. The budget decides HOW MANY of the ranked list fit — it does not
  // decide to stop ranking.
  const candidates = priorScenes.slice(0, -2)
  const ordered = selectRelevantPriorScenes(currentScene, candidates, candidates.length)
  if (ordered.length) {
    let header = `[Earlier related scenes]\n`
    let added = 0
    for (const s of ordered) {
      const line = `- Scene ${s.sceneNumber} ("${s.title}"): ${s.summary || s.prose.slice(0, 200) + '...'}\n`
      if (estimateTokens(context + header + line) >= budget) break
      header += line
      added += 1
    }
    if (added) context += header + '\n'
  }

  return context.trim()
}

function selectRelevantPriorScenes(currentScene: any, candidates: any, limit: any) {
  if (!candidates || candidates.length === 0) return []
  const names = new Set(
    [...(currentScene.charactersPresent || []), ...(currentScene.characters || [])]
      .filter(Boolean)
      .map((n) => String(n).toLowerCase())
  )
  const loc = currentScene.location ? String(currentScene.location).toLowerCase() : ''

  const scored = []
  for (const s of candidates) {
    let score = 0
    const sceneNames = (s.characters || []).map((n: any) => String(n).toLowerCase())
    for (const n of sceneNames) if (names.has(n)) score++
    if (loc && s.location && String(s.location).toLowerCase() === loc) score += 1
    if (score > 0) scored.push({ s, score, sceneNumber: s.sceneNumber })
  }
  scored.sort((a, b) => b.score - a.score || (b.sceneNumber || 0) - (a.sceneNumber || 0))
  return scored.slice(0, limit).map((x) => x.s)
}

/**
 * Continuity context for one scene, plus the research the scene is about.
 *
 * `ragOptions` is what turns the second half on:
 *   { projectId, enabled?: boolean, documentIds?: (string|number)[] }
 * Omit it — as every caller in this repo used to, passing a literal `undefined`
 * — and the writer gets prior-scene continuity only. Imported research then
 * reached the story director's plan and nothing else, so a book "grounded in"
 * a research library was written from a plan that had seen it and prose that
 * never had.
 */
async function buildRetrievalContext(
  currentScene: any,
  priorScenes: any,
  k = 5,
  ragOptions?: any,
  // Explicit budget for experiments that need to hold everything else equal and
  // vary only how much continuity the writer receives. Production leaves it
  // unset and takes `retrievalBudgetTokens()`.
  budgetTokens?: number
) {
  const baseContext = await buildBaseRetrievalContext(currentScene, priorScenes, k, budgetTokens)
  const citations = await buildResearchContext(currentScene, ragOptions)
  return [baseContext, citations].filter(Boolean).join('\n\n')
}

/**
 * Just the research half: labelled excerpts from the project's imported
 * documents that match this scene. Separate from `buildRetrievalContext` because
 * the continuation path already has its own continuity context (the prose on
 * either side of the gap) and only needs the research appended.
 *
 * Best-effort by design — retrieval failing is a reason to write the scene
 * without citations, never a reason to fail the scene.
 */
async function buildResearchContext(currentScene: any, ragOptions?: any): Promise<string> {
  if (!ragOptions || !ragOptions.projectId) return ''
  if (ragOptions.enabled === false) return ''
  try {
    const queryText = [
      currentScene.title,
      currentScene.goal || currentScene.emotionalGoal,
      currentScene.whatChanges,
      (currentScene.charactersPresent || currentScene.characters || []).join(' '),
      currentScene.location
    ]
      .filter(Boolean)
      .join(' ')
    if (queryText.trim().length < 10) return ''
    const chunks = await multiHopRetrieve({
      queries: [queryText],
      projectId: ragOptions.projectId,
      documentIds: ragOptions.documentIds,
      topK: ragOptions.topK
    })
    if (!chunks || chunks.length === 0) return ''
    return formatCitationContext(chunks)
  } catch {
    return ''
  }
}

async function buildBaseRetrievalContext(
  currentScene: any,
  priorScenes: any,
  k = 5,
  budgetTokens?: number
) {
  const budget = typeof budgetTokens === 'number' ? budgetTokens : retrievalBudgetTokens()
  if (!priorScenes || priorScenes.length === 0) return ''

  // Rank whenever there is anything to rank.
  //
  // The switch used to be "more than 25 prior scenes": under it, relevance was
  // decided by whether a scene happened to share a character name; over it, by
  // meaning. Nothing about scene 25 makes semantic retrieval start being worth
  // it — a 9-scene book has the same question, just fewer candidates. The
  // budget now decides how deep the ranked list goes; this decides only that it
  // IS ranked. Below three prior scenes there is nothing to choose between, so
  // the positional path (preceding ending + the one before it) is the whole
  // answer and costs no embedding call.
  if (priorScenes.length < 3) {
    return buildEmbeddingContext(currentScene, priorScenes, budget)
  }
  try {
    const query = [
      currentScene.title,
      currentScene.emotionalGoal || currentScene.goal,
      currentScene.whatChanges,
      (currentScene.charactersPresent || currentScene.characters || []).join(' '),
      currentScene.location
    ]
      .filter(Boolean)
      .join(' ')

    const queryEmbedding = await getEmbedding(query)
    if (!queryEmbedding) return buildEmbeddingContext(currentScene, priorScenes)

    const scored = []
    for (const s of priorScenes) {
      if (!s.summary) continue
      if (!s._summaryEmbedding) {
        try {
          s._summaryEmbedding = await getEmbedding(s.summary)
        } catch {
          s._summaryEmbedding = null
        }
      }
      if (s._summaryEmbedding) {
        scored.push({
          s,
          score: cosineSimilarity(
            queryEmbedding as unknown as number[],
            s._summaryEmbedding as unknown as number[]
          )
        })
      }
    }
    if (scored.length === 0) return buildEmbeddingContext(currentScene, priorScenes)

    scored.sort((a, b) => b.score - a.score)
    // `k` is the floor, not the ceiling: it is what callers asked for, and the
    // budget decides how many more of the ranked list actually fit.
    const top = scored.map((x) => x.s)

    let context = ''
    const preceding = priorScenes.at(-1)
    if (preceding) {
      const end =
        preceding.prose.length > PRECEDING_ENDING_CHARS
          ? '...' + preceding.prose.slice(-PRECEDING_ENDING_CHARS)
          : preceding.prose
      context += `[Ending of Preceding Scene ${preceding.sceneNumber}: "${preceding.title}"]\n${end}\n\n`
    }

    const others = top.filter((s) => s !== preceding)
    if (others.length) {
      let header = `[Semantically related earlier scenes]\n`
      let added = 0
      for (const s of others) {
        const line = `- Scene ${s.sceneNumber} ("${s.title}"): ${s.summary}\n`
        if (added >= k && estimateTokens(context + header + line) >= budget) break
        header += line
        added += 1
      }
      if (added) context += header
    }
    return context.trim()
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] retrieval context failed, using prose strategy:', err)
    return buildEmbeddingContext(currentScene, priorScenes)
  }
}

export {
  buildFactLedger,
  buildStoryStateContext,
  buildExistingEntitiesBlob,
  buildSceneEntitiesBlob,
  planConsistencyFixes,
  buildEmbeddingContext,
  selectRelevantPriorScenes,
  buildRetrievalContext,
  buildResearchContext,
  retrievalBudgetTokens,
  CONSISTENCY_FIX_ROUNDS,
  CONSISTENCY_FIX_MAX_SCENES,
  PROSE_EXCERPT_MAX_SCENES
}
