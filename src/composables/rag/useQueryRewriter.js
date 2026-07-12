import { aiGenerateJson } from '../useAiService'

const SYSTEM_PROMPT = `You are a search query rewriter for a fiction-writing assistant.
Given a scene description, generate 1-3 search queries to retrieve relevant context from the author's research notes.
Return a JSON object: { "queries": string[] }
Each query should be a standalone search string under 80 characters.
Focus on: setting details, character knowledge, historical facts, or lore the scene depends on.`

export async function useQueryRewriter(sceneBrief) {
  if (!sceneBrief || sceneBrief.trim().length < 10) {
    return { queries: [] }
  }

  try {
    const result = await aiGenerateJson(sceneBrief, SYSTEM_PROMPT)
    const queries = Array.isArray(result.queries) ? result.queries : []
    return { queries: queries.slice(0, 3) }
  } catch {
    return { queries: [] }
  }
}
