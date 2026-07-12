import { aiGenerateJson } from '../useAiService'
import { FEATURES } from '../../config/ai'

const REWRITE_SYSTEM = `You are a retrieval query optimizer for a novel-writing AI.
Given a scene brief, produce 2-3 distinct search queries that would retrieve the most relevant source material.
Each query should target a different facet: character motivations, location details, thematic/plot threads.
Return JSON array: [{ "query": "...", "focus": "characters|location|plot|theme|research" }]`

export async function rewriteQueries(scene) {
  const brief = [
    `Title: ${scene.title || ''}`,
    `Goal: ${scene.emotionalGoal || scene.goal || ''}`,
    `Characters: ${(scene.charactersPresent || scene.characters || []).join(', ')}`,
    `Location: ${scene.location || ''}`,
    `What changes: ${scene.whatChanges || ''}`,
    `Summary: ${scene.summary || ''}`
  ]
    .filter((l) => !l.endsWith(': ') && !l.endsWith(':') && l.split(': ')[1])
    .join('\n')

  if (!brief.trim().length) return [{ query: scene.title || '', focus: 'plot' }]

  try {
    const result = await aiGenerateJson(
      brief,
      REWRITE_SYSTEM,
      { feature: FEATURES.COMPACTION, temperature: 0.3, maxTokens: 300 }
    )
    const queries = Array.isArray(result) ? result : result.queries || [result]
    return queries.slice(0, 3).map((q) => ({
      query: typeof q === 'string' ? q : q.query || '',
      focus: q.focus || 'general'
    })).filter((q) => q.query)
  } catch {
    return [{ query: scene.title || scene.emotionalGoal || '', focus: 'general' }]
  }
}
