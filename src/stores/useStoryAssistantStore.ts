import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { aiGenerate } from '../services/aiService'
import { FEATURES } from '../config/ai'
import { searchStorySemantic, type StoryMatch, type ContentKind } from '../services/storyVectorIndex'
import { rerankChunks } from '../services/rerankingService'
import { useManuscriptStore } from './manuscriptStore'
import { useProjectStore } from './projectStore'

/**
 * Ask your story (Smart Chat analog, roadmap Phase 7): a question in plain
 * words, grounded in the scenes and bible entries the local index says are
 * closest, answered with numbered citations that open the scene. Distinct
 * from character chat, which is a persona; this is the manuscript answering
 * about itself.
 */
export interface Citation {
  n: number
  kind: ContentKind
  refId: string
  title: string
  text: string
  score: number
}

export interface AssistantTurn {
  id: string
  role: 'user' | 'assistant'
  text: string
  citations: Citation[]
  error?: string | null
}

/** Retrieved chunks past this are not shown to the model: the window is local. */
export const MAX_CONTEXT_CHUNKS = 6
export const MAX_CHUNK_CHARS = 900

const KIND_WORD: Record<ContentKind, string> = {
  subsection: 'Scene',
  section: 'Chapter',
  character: 'Character',
  location: 'Location',
  thread: 'Plot thread'
}

/** Pure: numbered context block + citation list from ranked matches. */
export function buildRagContext(matches: StoryMatch[]): { context: string; citations: Citation[] } {
  const citations: Citation[] = []
  const lines: string[] = []
  for (const m of (matches || []).slice(0, MAX_CONTEXT_CHUNKS)) {
    const n = citations.length + 1
    citations.push({ n, kind: m.kind, refId: m.refId, title: m.title, text: m.text, score: m.score })
    const body = String(m.text || '').slice(0, MAX_CHUNK_CHARS).trim()
    lines.push(`[${n}] ${KIND_WORD[m.kind] || m.kind}: ${m.title || m.refId}\n${body}`)
  }
  return { context: lines.join('\n\n'), citations }
}

/** Pure: the prompt. Cite by [n]; say so when the context does not answer. */
export function buildRagPrompt(question: string, context: string): { system: string; user: string } {
  return {
    system:
      'You answer questions about a novel manuscript using ONLY the numbered excerpts provided. ' +
      'Cite the excerpts you rely on with their numbers in square brackets, like [2]. ' +
      'If the excerpts do not contain the answer, say so plainly in one sentence and do not invent events. ' +
      'Be concrete and brief: two to five sentences.',
    user: `EXCERPTS\n\n${context || '(none)'}\n\nQUESTION\n${question.trim()}\n\nANSWER (with [n] citations):`
  }
}

/** Pure: which citations the answer actually used, in order of first mention. */
export function citedIn(answer: string, citations: Citation[]): Citation[] {
  const seen = new Set<number>()
  const out: Citation[] = []
  for (const m of String(answer || '').matchAll(/\[(\d+)\]/g)) {
    const n = Number(m[1])
    if (seen.has(n)) continue
    const c = citations.find((x) => x.n === n)
    if (c) {
      seen.add(n)
      out.push(c)
    }
  }
  return out
}

export const useStoryAssistantStore = defineStore('storyAssistant', () => {
  const manuscript = useManuscriptStore()
  const project = useProjectStore()

  const turns = ref<AssistantTurn[]>([])
  const isAnswering = ref(false)
  const lastError = ref<string | null>(null)

  const hasHistory = computed(() => turns.value.length > 0)

  async function retrieve(question: string): Promise<StoryMatch[]> {
    const projectId = project.currentProjectId
    if (!projectId) return []
    const hits = await searchStorySemantic(projectId, question, { limit: MAX_CONTEXT_CHUNKS * 2 })
    if (hits.length <= MAX_CONTEXT_CHUNKS) return hits
    // The reranker is best-effort and never throws; on total failure it
    // keeps the semantic order, which is already a good answer.
    const reranked = await rerankChunks({
      chunks: hits.map((h) => ({ ...h, id: `${h.kind}:${h.refId}` })),
      query: question,
      topN: MAX_CONTEXT_CHUNKS
    })
    return reranked.map(({ _rerankScore, _rerankIndex, id, ...rest }) => rest as StoryMatch)
  }

  async function ask(question: string): Promise<AssistantTurn | null> {
    const q = (question || '').trim()
    if (!q || isAnswering.value) return null
    isAnswering.value = true
    lastError.value = null
    turns.value.push({ id: crypto.randomUUID(), role: 'user', text: q, citations: [] })
    turns.value.push({ id: crypto.randomUUID(), role: 'assistant', text: '', citations: [] })
    // Mutate the reactive proxy the array holds, not the raw literal — the
    // view is watching the array, and a write to the raw object is invisible.
    const turn = turns.value[turns.value.length - 1] as AssistantTurn
    try {
      const matches = await retrieve(q)
      const { context, citations } = buildRagContext(matches)
      if (!citations.length) {
        turn.text =
          'Nothing in the indexed story is close to that question. Reindex from the Related panel if the manuscript has not been embedded yet.'
        return turn
      }
      const { system, user } = buildRagPrompt(q, context)
      const answer = await aiGenerate(user, system, { feature: FEATURES.CHARACTER_CHAT, temperature: 0.2, maxTokens: 500 })
      turn.text = String(answer || '').trim()
      turn.citations = citedIn(turn.text, citations).length ? citedIn(turn.text, citations) : citations
      return turn
    } catch (e: any) {
      const message = e?.message || 'The assistant could not answer'
      turn.error = message
      lastError.value = message
      return turn
    } finally {
      isAnswering.value = false
    }
  }

  /** Open the cited scene in the editor; entities are left to the caller (bible card). */
  function openCitation(c: Citation): { handled: boolean } {
    if (c.kind === 'subsection') {
      const sub = (manuscript.subsections as any[]).find((s) => String(s.id) === String(c.refId))
      if (sub?.sectionId) manuscript.setActiveSection(sub.sectionId)
      manuscript.setActiveSubsection(sub?.id ?? c.refId)
      return { handled: true }
    }
    if (c.kind === 'section') {
      manuscript.setActiveSection(c.refId)
      return { handled: true }
    }
    return { handled: false }
  }

  function clear() {
    turns.value = []
    lastError.value = null
  }

  return { turns, isAnswering, lastError, hasHistory, ask, openCitation, clear }
})
