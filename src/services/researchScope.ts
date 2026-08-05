import { RESEARCH_KEYS } from '../config/researchKeys'

// One reading of "which research informs this run", shared by the story director
// (plan time) and the scene writer (write time).
//
// The director already implemented this contract inline; the writer had no
// research path at all. Now that it does, the two have to agree on what an
// omitted flag and an empty id list mean, or the generator's source picker would
// scope the outline and not the prose.

export interface ResearchScope {
  /** Omitted → fall back to the global "use research" preference. */
  enabled?: boolean
  /** Omitted or empty → every document in the project. */
  documentIds?: (string | number)[]
}

export interface ResolvedResearchScope {
  enabled: boolean
  /** Empty means "all documents", matching the input contract. */
  documentIds: (string | number)[]
}

/** The global toggle, read without a Vue reactive wrapper so services can use it. */
export function isResearchEnabledByDefault(): boolean {
  try {
    const raw = localStorage.getItem(RESEARCH_KEYS.RESEARCH_ENABLED)
    if (raw === null) return true
    return JSON.parse(raw) !== false
  } catch {
    return true
  }
}

export function resolveResearchScope(scope?: ResearchScope | null): ResolvedResearchScope {
  const enabled =
    scope && typeof scope.enabled === 'boolean' ? scope.enabled : isResearchEnabledByDefault()
  const documentIds =
    Array.isArray(scope?.documentIds) && scope!.documentIds!.length ? [...scope!.documentIds!] : []
  return { enabled, documentIds }
}

/**
 * The shape `buildRetrievalContext` expects. Returns undefined when there is
 * nothing to retrieve from, so callers can pass it straight through.
 */
export function buildRagOptions(
  projectId: string | null | undefined,
  scope?: ResearchScope | null,
  topK?: number
): { projectId: string; enabled: boolean; documentIds: (string | number)[]; topK?: number } | undefined {
  if (!projectId) return undefined
  const { enabled, documentIds } = resolveResearchScope(scope)
  if (!enabled) return undefined
  return { projectId, enabled, documentIds, topK }
}
