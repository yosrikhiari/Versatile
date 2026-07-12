import { getEmbedding } from '../../../services/embeddingService'
import { cosineSimilarity } from '../../../services/ollamaService'
import { multiHopRetrieval } from '../../../services/ragMultiHopRetrieval'
import { buildRagCitations } from '../../../services/ragCitationInjector'

const EMBEDDING_CONTEXT_MAX_CHARS = 1400
const CONSISTENCY_FIX_ROUNDS = 2
const CONSISTENCY_FIX_MAX_SCENES = 3
const PROSE_EXCERPT_MAX_SCENES = 25

function buildFactLedger(spine, writtenScenes) {
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

  const ledger = []
  const emit = (chapterNumber, facts) => {
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
        entry.keyFacts.filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim())
      )
    }
  }
  return ledger
}

function buildExistingEntitiesBlob(characterList, locationList, plotThreadList) {
  return JSON.stringify(
    {
      characters: characterList.map((c) => ({
        name: c.name,
        role: c.role,
        description: c.description,
        traits: c.traits || []
      })),
      locations: locationList.map((l) => ({
        name: l.name,
        description: l.description,
        notes: l.notes,
        traits: l.traits || []
      })),
      plotThreads: plotThreadList.map((t) => ({
        title: t.title,
        status: t.status,
        notes: t.notes,
        traits: t.traits || []
      }))
    },
    null,
    2
  )
}

function planConsistencyFixes(report, writtenScenes) {
  const fixes = new Map()
  if (!report || !Array.isArray(writtenScenes) || writtenScenes.length === 0) return fixes

  const norm = (t) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim()
  const normedProse = writtenScenes.map((s) => norm(s.prose))

  const findByExcerpt = (excerpt) => {
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

  const latestWithEntity = (name, kind) => {
    for (let i = writtenScenes.length - 1; i >= 0; i--) {
      const ws = writtenScenes[i]
      const match =
        kind === 'Character' ? (ws.characters || []).includes(name) : ws.location === name
      if (match) return i
    }
    return -1
  }

  const addReason = (idx, reason) => {
    if (idx < 0) return
    if (!fixes.has(idx)) fixes.set(idx, new Set())
    fixes.get(idx).add(reason)
  }

  const handle = (name, kind, contradictions) => {
    for (const c of contradictions || []) {
      const reason =
        `${kind} "${name}" — ${c.type || 'inconsistency'}: ${c.description || ''}`.trim()
      const idxs = (c.between || []).map(findByExcerpt).filter((i) => i >= 0)
      const target = idxs.length ? Math.max(...idxs) : latestWithEntity(name, kind)
      addReason(target, reason)
    }
  }

  for (const ci of report.characterIssues || [])
    handle(ci.character, 'Character', ci.contradictions)
  for (const li of report.locationIssues || []) handle(li.location, 'Location', li.contradictions)
  return fixes
}

function buildEmbeddingContext(currentScene, priorScenes) {
  if (priorScenes.length === 0) return ''

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
      precedingScene.prose.length > 1200
        ? '...' + precedingScene.prose.slice(-1200)
        : precedingScene.prose
    context += `[Ending of Preceding Scene ${precedingScene.sceneNumber}: "${precedingScene.title}"]\n${endingExcerpt}\n\n`
  }

  const olderScene = priorScenes.at(-2)
  if (olderScene && context.length < EMBEDDING_CONTEXT_MAX_CHARS) {
    context += `[Summary of Scene ${olderScene.sceneNumber}: "${olderScene.title}"]\n${olderScene.summary || olderScene.prose.slice(0, 300) + '...'}\n\n`
  }

  const relevant = selectRelevantPriorScenes(currentScene, priorScenes.slice(0, -2), 3)
  if (relevant.length) {
    context += `[Earlier related scenes]\n`
    for (const s of relevant) {
      if (context.length >= EMBEDDING_CONTEXT_MAX_CHARS) break
      context += `- Scene ${s.sceneNumber} ("${s.title}"): ${s.summary || s.prose.slice(0, 200) + '...'}\n`
    }
    context += '\n'
  }

  return context.trim()
}

function selectRelevantPriorScenes(currentScene, candidates, limit) {
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
    const sceneNames = (s.characters || []).map((n) => String(n).toLowerCase())
    for (const n of sceneNames) if (names.has(n)) score++
    if (loc && s.location && String(s.location).toLowerCase() === loc) score += 1
    if (score > 0) scored.push({ s, score, sceneNumber: s.sceneNumber })
  }
  scored.sort((a, b) => b.score - a.score || (b.sceneNumber || 0) - (a.sceneNumber || 0))
  return scored.slice(0, limit).map((x) => x.s)
}

async function buildRetrievalContext(currentScene, priorScenes, k = 5, ragOptions) {
  const baseContext = await buildBaseRetrievalContext(currentScene, priorScenes, k)
  if (!ragOptions || !ragOptions.projectId) return baseContext
  try {
    const queryText = [
      currentScene.title,
      currentScene.goal || currentScene.emotionalGoal,
      (currentScene.charactersPresent || currentScene.characters || []).join(' '),
      currentScene.location
    ]
      .filter(Boolean)
      .join(' ')
    if (queryText.trim().length < 10) return baseContext
    const chunks = await multiHopRetrieval({
      queries: [queryText],
      projectId: ragOptions.projectId
    })
    if (!chunks || chunks.length === 0) return baseContext
    const citations = buildRagCitations(chunks)
    return [baseContext, citations].filter(Boolean).join('\n\n')
  } catch {
    return baseContext
  }
}

async function buildBaseRetrievalContext(currentScene, priorScenes, k = 5) {
  if (!priorScenes || priorScenes.length <= PROSE_EXCERPT_MAX_SCENES) {
    return buildEmbeddingContext(currentScene, priorScenes || [])
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
        scored.push({ s, score: cosineSimilarity(queryEmbedding, s._summaryEmbedding) })
      }
    }
    if (scored.length === 0) return buildEmbeddingContext(currentScene, priorScenes)

    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, k).map((x) => x.s)

    let context = ''
    const preceding = priorScenes.at(-1)
    if (preceding) {
      const end =
        preceding.prose.length > 1200 ? '...' + preceding.prose.slice(-1200) : preceding.prose
      context += `[Ending of Preceding Scene ${preceding.sceneNumber}: "${preceding.title}"]\n${end}\n\n`
    }

    const others = top.filter((s) => s !== preceding)
    if (others.length) {
      context += `[Semantically related earlier scenes]\n`
      for (const s of others) {
        context += `- Scene ${s.sceneNumber} ("${s.title}"): ${s.summary}\n`
      }
    }
    return context.trim()
  } catch (err) {
    console.warn('[useVolumeStoryGenerator] retrieval context failed, using prose strategy:', err)
    return buildEmbeddingContext(currentScene, priorScenes)
  }
}

export {
  buildFactLedger,
  buildExistingEntitiesBlob,
  planConsistencyFixes,
  buildEmbeddingContext,
  selectRelevantPriorScenes,
  buildRetrievalContext,
  EMBEDDING_CONTEXT_MAX_CHARS,
  CONSISTENCY_FIX_ROUNDS,
  CONSISTENCY_FIX_MAX_SCENES,
  PROSE_EXCERPT_MAX_SCENES
}
