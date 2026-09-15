/**
 * Pure helpers for the Story Network's filters and local view (Obsidian
 * Graph analog, roadmap Phase 5). No Vue, no Dexie: rendered edges and
 * nodes in, sets and maps out — so the render loop does lookups in `Map`s
 * the way `AGENTS.md` asks, and every rule is unit-testable.
 */

export interface RenderedEdge {
  id?: string
  source: string
  target: string
  data?: { relationshipType?: string; [k: string]: unknown }
  relationshipType?: string
}

export interface RenderedNode {
  id: string
  label?: string
  name?: string
  data?: { label?: string; sublabel?: string; [k: string]: unknown }
}

export function edgeType(edge: RenderedEdge): string {
  return String(edge?.data?.relationshipType ?? edge?.relationshipType ?? '')
}

function edgeKey(edge: RenderedEdge): string {
  return edge.id ?? `${edge.source}->${edge.target}`
}

/** Distinct relationship types, sorted, empty strings dropped. */
export function collectRelationshipTypes(edges: RenderedEdge[]): string[] {
  const set = new Set<string>()
  for (const e of edges || []) {
    const t = edgeType(e)
    if (t) set.add(t)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** Undirected adjacency: node → (neighbour → edge ids joining them). */
export function buildAdjacency(edges: RenderedEdge[]): Map<string, Map<string, string[]>> {
  const adj = new Map<string, Map<string, string[]>>()
  const link = (a: string, b: string, id: string) => {
    let row = adj.get(a)
    if (!row) {
      row = new Map()
      adj.set(a, row)
    }
    const list = row.get(b)
    if (list) list.push(id)
    else row.set(b, [id])
  }
  for (const e of edges || []) {
    if (!e?.source || !e?.target) continue
    const id = edgeKey(e)
    link(e.source, e.target, id)
    link(e.target, e.source, id)
  }
  return adj
}

/**
 * The neighbourhood of `focusId` within `depth` hops. Every edge incident
 * to a reached node is included (so edges between two neighbours are kept);
 * new nodes are enqueued only while the frontier is inside the depth.
 */
export function computeLocalGraph(
  focusId: string | null | undefined,
  edges: RenderedEdge[],
  depth = 1
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  if (!focusId) return { nodeIds, edgeIds }
  const adj = buildAdjacency(edges)
  const radius = Math.max(0, Math.floor(depth))
  nodeIds.add(focusId)
  let frontier = [focusId]
  for (let d = 0; d < radius && frontier.length; d++) {
    const next: string[] = []
    for (const n of frontier) {
      const row = adj.get(n)
      if (!row) continue
      for (const [neighbour, ids] of row) {
        for (const id of ids) edgeIds.add(id)
        if (!nodeIds.has(neighbour)) {
          nodeIds.add(neighbour)
          next.push(neighbour)
        }
      }
    }
    frontier = next
  }
  // Edges between two reached nodes at the boundary (both at depth N).
  for (const n of nodeIds) {
    const row = adj.get(n)
    if (!row) continue
    for (const [neighbour, ids] of row) {
      if (nodeIds.has(neighbour)) for (const id of ids) edgeIds.add(id)
    }
  }
  return { nodeIds, edgeIds }
}

/** Case-insensitive match on label / sublabel / name; empty query → nothing. */
export function findNodesByName(nodes: RenderedNode[], query: string): RenderedNode[] {
  const q = String(query || '')
    .trim()
    .toLowerCase()
  if (!q) return []
  return (nodes || []).filter((n) => {
    const hay = [n?.data?.label, n?.data?.sublabel, n?.label, n?.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return hay.includes(q)
  })
}
