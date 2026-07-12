import { cosineSimilarity } from './researchDb'

const RRF_K = 60

function rrfScore(rank) {
  return 1 / (RRF_K + rank)
}

function fuseByRRF(groups) {
  const acc = new Map()
  for (const chunks of groups) {
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i]
      const key = `${c.sourceType}:${c.sourceId}`
      if (acc.has(key)) {
        acc.get(key).rrfScore += rrfScore(i)
      } else {
        acc.set(key, { ...c, rrfScore: rrfScore(i) })
      }
    }
  }
  return [...acc.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
}

function tokenize(text) {
  return (text || '').toLowerCase().split(/\W+/).filter(Boolean)
}

function lexicalScore(queryTokens, text) {
  if (!queryTokens.length || !text) return 0
  const lower = text.toLowerCase()
  let score = 0
  for (const t of queryTokens) {
    const matches = (lower.match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
    score += matches / (t.length + 1)
  }
  return score
}

function hopBibleFacts(queries, bibleData) {
  const results = []
  for (const { query, focus } of queries) {
    const qt = tokenize(query)
    for (const char of (bibleData.characters || [])) {
      const text = [char.name, char.role, char.goal, char.personality, char.description, char.backstory].filter(Boolean).join(' ')
      const score = lexicalScore(qt, text)
      if (score > 0.5) {
        results.push({
          text,
          source: `${char.name || 'Unknown Character'} (${char.role || 'character'})`,
          sourceType: 'character',
          sourceId: String(char.id),
          hopFocus: focus
        })
      }
    }
    for (const loc of (bibleData.locations || [])) {
      const text = [loc.name, loc.type, loc.description, loc.atmosphere, loc.notableFeatures].filter(Boolean).join(' ')
      const score = lexicalScore(qt, text)
      if (score > 0.5) {
        results.push({
          text,
          source: `${loc.name || 'Unknown Location'} (location)`,
          sourceType: 'location',
          sourceId: String(loc.id),
          hopFocus: focus
        })
      }
    }
    for (const thread of (bibleData.plotThreads || [])) {
      const text = [thread.title, thread.description, thread.status].filter(Boolean).join(' ')
      const score = lexicalScore(qt, text)
      if (score > 0.3) {
        results.push({
          text,
          source: `${thread.title || 'Unknown Thread'} (plot thread)`,
          sourceType: 'thread',
          sourceId: String(thread.id),
          hopFocus: focus
        })
      }
    }
  }
  return results.sort((a, b) => b.rrfScore - a.rrfScore)
}

async function hopResearchDocs(projectId, queries, getEmbedding, { searchLexical, semanticSearch }) {
  const results = []
  const seen = new Set()
  for (const { query } of queries) {
    const lexicalHits = await searchLexical(projectId, query, 10)
    for (const h of lexicalHits) {
      const key = `research:${h.id}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        text: h.text,
        source: `Research: doc-${h.documentId}`,
        sourceType: 'research',
        sourceId: String(h.id),
        hopFocus: 'research'
      })
    }
    const emb = await getEmbedding(query)
    if (emb) {
      const semanticHits = await semanticSearch(projectId, emb, 10)
      for (const h of semanticHits) {
        const key = `research:${h.id}`
        if (seen.has(key)) continue
        seen.add(key)
        results.push({
          text: h.text,
          source: `Research: doc-${h.documentId}`,
          sourceType: 'research',
          sourceId: String(h.id),
          hopFocus: 'research'
        })
      }
    }
  }
  return results
}

async function hopPriorScenes(queries, priorScenes, getEmbedding) {
  if (!priorScenes || !priorScenes.length) return []
  const results = []
  const querySentences = queries.map((q) => q.query).filter(Boolean)
  if (!querySentences.length) return []

  const queryEmbeds = await Promise.all(querySentences.map((q) => getEmbedding(q)))
  const sceneEmbeds = await Promise.all(priorScenes.slice(-30).map((s) => getEmbedding(s.content || s.summary || s.emotionalGoal || '')))
  const sceneCache = priorScenes.slice(-30)

  for (let qi = 0; qi < querySentences.length; qi++) {
    if (!queryEmbeds[qi]) continue
    for (let si = 0; si < sceneCache.length; si++) {
      if (!sceneEmbeds[si]) continue
      const sim = cosineSimilarity(queryEmbeds[qi], sceneEmbeds[si])
      if (sim > 0.3) {
        results.push({
          text: sceneCache[si].content || sceneCache[si].summary || '',
          source: `Scene: ${sceneCache[si].title || si + 1}`,
          sourceType: 'scene',
          sourceId: sceneCache[si].sceneId || String(si),
          hopFocus: queries[qi].focus
        })
      }
    }
  }
  return results
}

export async function multiHopRetrieve({ projectId, queries, bibleData, priorScenes, getEmbedding, searchLexical, semanticSearch }) {
  const [bibleResults, researchResults, sceneResults] = await Promise.all([
    hopBibleFacts(queries, bibleData),
    hopResearchDocs(projectId, queries, getEmbedding, { searchLexical, semanticSearch }),
    hopPriorScenes(queries, priorScenes || [], getEmbedding)
  ])
  const fused = fuseByRRF([bibleResults, researchResults, sceneResults])
  return fused.slice(0, 15).map((item, i) => ({
    ...item,
    rank: i + 1
  }))
}
