import { installGuardrails, buildOntologySnapshot, emptySnapshot } from './setup'
import { setGuardrailEnforcement, type GuardrailEnforcement } from './integration/aiGuardrails'
import { useStoryBibleStore } from '../stores/storyBibleStore'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import type { GroundingService } from './ontology/grounding'
import type { OntologySnapshot } from './ontology/types'

/**
 * Wires the guardrail registry to the live Pinia stores and installs the full
 * guard catalog. Call once, after `app.use(pinia)`.
 *
 * Importing the store modules is inert — `defineStore` only returns a factory.
 * The factories are *called* inside the snapshot builder, which runs on demand
 * via `grounding.refresh()`, so an active Pinia is required at that point and
 * not at import time.
 */
export function bootstrapGuardrails(
  options: { enforcement?: GuardrailEnforcement; llmBudget?: number } = {}
): GroundingService {
  if (options.enforcement) setGuardrailEnforcement(options.enforcement)

  return installGuardrails({
    llmBudget: options.llmBudget,
    buildSnapshot,
    getPronouns,
  })
}

function buildSnapshot(): OntologySnapshot {
  try {
    const bible = useStoryBibleStore()
    const graph = useStoryGraphStore()

    return buildOntologySnapshot({
      getCharacters: () => normalize(bible.characters),
      getLocations: () => normalize(bible.locations),
      getPlotThreads: () => normalize(bible.plotThreads),
      getScenes: () => [],
      getRelationships: () => normalizeEdges(graph.edges),
    })
  } catch {
    // No active Pinia yet, or the bible has not loaded. An empty ontology means
    // the entity guard has nothing to check against — it must not take down the
    // generation that triggered the refresh.
    return emptySnapshot()
  }
}

function getPronouns(): Record<string, string> {
  try {
    const bible = useStoryBibleStore()
    const map: Record<string, string> = {}
    for (const c of bible.characters ?? []) {
      if (c?.name && c?.pronouns) map[c.name] = String(c.pronouns)
    }
    return map
  } catch {
    return {}
  }
}

function normalize(items: unknown): Array<{ id: string; name: string; aliases?: string[] }> {
  if (!Array.isArray(items)) return []
  return items
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const row = item as Record<string, unknown>
      return {
        ...row,
        id: String(row.id ?? ''),
        name: String(row.name ?? row.title ?? ''),
        aliases: Array.isArray(row.aliases) ? (row.aliases as string[]).map(String) : [],
      }
    })
}

function normalizeEdges(
  edges: unknown
): Array<{ id: string; sourceId: string; targetId: string; kind: string; label: string }> {
  if (!Array.isArray(edges)) return []
  return edges
    .filter(edge => edge && typeof edge === 'object')
    .map((edge, i) => {
      const row = edge as Record<string, unknown>
      return {
        id: String(row.id ?? `edge-${i}`),
        sourceId: String(row.sourceId ?? row.source ?? row.from ?? ''),
        targetId: String(row.targetId ?? row.target ?? row.to ?? ''),
        kind: String(row.kind ?? row.type ?? row.relationshipType ?? 'related'),
        label: String(row.label ?? row.description ?? ''),
      }
    })
    .filter(edge => edge.sourceId && edge.targetId)
}
