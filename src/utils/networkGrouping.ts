// Pure helpers for the Story Network's volume grouping and group nesting.
// Kept free of Vue/DB so the layout math is unit-testable in isolation.

export const VOLUME_GROUP_COLORS = [
  '#4fc3f7',
  '#80cbc4',
  '#aed581',
  '#f48fb1',
  '#ce93d8',
  '#ff7043',
  '#90a4ae',
  '#ba68c8'
]

interface Layout {
  groupsPerRow: number
  groupWidth: number
  gapX: number
  gapY: number
  headerH: number
  padX: number
  padBottom: number
  nodeW: number
  nodeH: number
  nodesPerRow: number
  startX: number
  startY: number
  minHeight: number
}

const DEFAULT_LAYOUT: Layout = {
  groupsPerRow: 3,
  groupWidth: 360,
  gapX: 64,
  gapY: 64,
  headerH: 56,
  padX: 20,
  padBottom: 20,
  nodeW: 160,
  nodeH: 96,
  nodesPerRow: 2,
  startX: 80,
  startY: 80,
  minHeight: 140
}

interface Volume {
  id: string | number
  title?: string
  color?: string
}

interface Group {
  id: string
  name: string
  color: string
  x: number
  y: number
  width: number
  height: number
  /** Set when this group IS a volume's box. */
  volumeId?: string | number
  /** Set when this group belongs INSIDE a volume's box (a faction). */
  parentVolumeId?: string | number | null
  parentGroupId: string | null
}

interface ComputeVolumeGroupsArgs {
  volumes?: Volume[]
  volumeNodeIds?: Record<string | number, string[]>
  existingGroups?: Group[]
  /** Current node→group map, so nodes already inside a faction are not reclaimed. */
  existingNodeParents?: Record<string, string>
  layout?: Partial<Layout>
}

interface ComputeVolumeGroupsResult {
  groups: Group[]
  nodeParents: Record<string, string>
  nodePositions: Record<string, { x: number; y: number }>
  emptyVolumeIds: (string | number)[]
}

interface SizedVolume {
  vol: Volume
  nodeIds: string[]
  loose: string[]
  subs: Group[]
  members: Map<string, string[]>
  width: number
  height: number
}

function childPosition(i: number, L: Layout): { x: number; y: number } {
  const perRow = Math.max(1, L.nodesPerRow)
  const col = i % perRow
  const row = Math.floor(i / perRow)
  return { x: L.padX + col * L.nodeW, y: L.headerH + row * L.nodeH }
}

/** A faction box sits inset inside its volume box, so it is narrower. */
function subGroupWidth(L: Layout): number {
  return Math.max(L.nodeW + L.padX * 2, L.groupWidth - L.padX * 2)
}

function subGroupNodesPerRow(L: Layout): number {
  return Math.max(1, Math.floor((subGroupWidth(L) - L.padX) / L.nodeW))
}

function subGroupHeight(memberCount: number, L: Layout): number {
  const rows = Math.max(1, Math.ceil(Math.max(memberCount, 1) / subGroupNodesPerRow(L)))
  return Math.max(L.minHeight, L.headerH + rows * L.nodeH + L.padBottom)
}

/**
 * Height of a volume box: its loose nodes stacked at the top, then each faction
 * box below. Sizing the parent from its children is what stops a nested group
 * from spilling out of the box that owns it.
 */
function volumeInnerLayout(
  looseCount: number,
  subs: Group[],
  members: Map<string, string[]>,
  L: Layout
): { looseRows: number; height: number } {
  const looseRows = looseCount > 0 ? Math.ceil(looseCount / Math.max(1, L.nodesPerRow)) : 0
  let height = L.headerH + looseRows * L.nodeH
  for (const sub of subs) {
    height += subGroupHeight((members.get(sub.id) || []).length, L) + L.padBottom
  }
  return { looseRows, height: Math.max(L.minHeight, height + L.padBottom) }
}

/** Deterministic id for a volume's group, so regrouping reuses it rather than duplicating. */
export function volumeGroupId(volumeId: string | number): string {
  return `group-vol-${volumeId}`
}

export function computeVolumeGroups({
  volumes,
  volumeNodeIds,
  existingGroups = [],
  existingNodeParents = {},
  layout
}: ComputeVolumeGroupsArgs = {}): ComputeVolumeGroupsResult {
  const L = { ...DEFAULT_LAYOUT, ...(layout || {}) }
  const vols = Array.isArray(volumes) ? volumes : []
  const map = volumeNodeIds || {}

  const groups: Group[] = existingGroups.map((g) => ({ ...g }))
  const volumeGroupById = new Map<string, Group>()
  const groupsByNodeId = new Map<string, Group>()
  for (const g of groups) {
    if (!g) continue
    if (g.volumeId != null) volumeGroupById.set(String(g.volumeId), g)
    if (g.id != null) groupsByNodeId.set(String(g.id), g)
  }

  // Adopt a volume group that lost its `volumeId` — groups persisted before that
  // field round-tripped come back with it null, and matching on volumeId alone
  // would build a second group carrying the same deterministic `group-vol-N` id.
  // Two rows, one primary key, and the bulkAdd that saves them throws.
  const claimVolumeGroup = (volumeId: string | number): Group | undefined => {
    const byVolume = volumeGroupById.get(String(volumeId))
    if (byVolume) return byVolume
    const byId = groupsByNodeId.get(volumeGroupId(volumeId))
    if (byId) {
      byId.volumeId = volumeId
      volumeGroupById.set(String(volumeId), byId)
      return byId
    }
    return undefined
  }

  const nodeParents: Record<string, string> = {}
  const nodePositions: Record<string, { x: number; y: number }> = {}
  const emptyVolumeIds: (string | number)[] = []

  // Sub-groups are factions: a group that belongs INSIDE a volume's box rather
  // than being one. `parentVolumeId` marks them, so the cast expander can create
  // "The Shadow Court" during planning and name the volume box it belongs to
  // before that box exists — this pass resolves the nesting.
  const subGroupsByVolume = new Map<string, Group[]>()
  for (const g of groups) {
    if (!g || g.parentVolumeId == null || g.volumeId != null) continue
    const key = String(g.parentVolumeId)
    if (!subGroupsByVolume.has(key)) subGroupsByVolume.set(key, [])
    subGroupsByVolume.get(key)!.push(g)
  }

  const sized: SizedVolume[] = vols.map((vol) => {
    const nodeIds = map[vol.id] || []
    const subs = subGroupsByVolume.get(String(vol.id)) || []

    // A node already inside one of this volume's factions stays there; only the
    // unclaimed ones are laid out directly in the volume box. Without this the
    // volume pass would flatten every faction it was meant to contain.
    const subIds = new Set(subs.map((s) => s.id))
    const members = new Map<string, string[]>()
    const loose: string[] = []
    for (const nodeId of nodeIds) {
      const parent = existingNodeParents[nodeId]
      if (parent && subIds.has(parent)) {
        if (!members.has(parent)) members.set(parent, [])
        members.get(parent)!.push(nodeId)
      } else {
        loose.push(nodeId)
      }
    }

    const { height } = volumeInnerLayout(loose.length, subs, members, L)
    return { vol, nodeIds, loose, subs, members, width: L.groupWidth, height }
  })

  let rowStartY = L.startY
  for (let r = 0; r * L.groupsPerRow < sized.length || (r === 0 && sized.length === 0); r++) {
    const rowItems = sized.slice(r * L.groupsPerRow, (r + 1) * L.groupsPerRow)
    if (rowItems.length === 0) break
    let rowMaxH = L.minHeight
    rowItems.forEach((item, ci) => {
      const x = L.startX + ci * (L.groupWidth + L.gapX)
      const y = rowStartY
      rowMaxH = Math.max(rowMaxH, item.height)

      const volKey = String(item.vol.id)
      let group = claimVolumeGroup(item.vol.id)
      const color =
        (group && group.color) ||
        item.vol.color ||
        VOLUME_GROUP_COLORS[(r * L.groupsPerRow + ci) % VOLUME_GROUP_COLORS.length]

      if (group) {
        group.name = item.vol.title || group.name || 'Volume'
        group.x = x
        group.y = y
        group.width = item.width
        group.height = item.height
        group.color = color
        group.parentGroupId = group.parentGroupId ?? null
      } else {
        group = {
          id: volumeGroupId(item.vol.id),
          name: item.vol.title || 'Volume',
          color,
          x,
          y,
          width: item.width,
          height: item.height,
          volumeId: item.vol.id,
          parentGroupId: null
        }
        groups.push(group)
        volumeGroupById.set(volKey, group)
      }

      if (item.nodeIds.length === 0) emptyVolumeIds.push(item.vol.id)

      // Loose nodes fill the top of the box…
      item.loose.forEach((nodeId, i) => {
        nodeParents[nodeId] = group!.id
        nodePositions[nodeId] = childPosition(i, L)
      })

      // …then each faction box stacks beneath them, with its members laid out
      // relative to it. Positions of nested nodes are parent-relative in Vue
      // Flow, so a faction's members are positioned against the faction, not
      // the volume.
      const { looseRows } = volumeInnerLayout(item.loose.length, item.subs, item.members, L)
      let subY = L.headerH + looseRows * L.nodeH
      const perRow = subGroupNodesPerRow(L)
      for (const sub of item.subs) {
        const memberIds = item.members.get(sub.id) || []
        sub.parentGroupId = group!.id
        sub.x = L.padX
        sub.y = subY
        sub.width = subGroupWidth(L)
        sub.height = subGroupHeight(memberIds.length, L)
        memberIds.forEach((nodeId, i) => {
          nodeParents[nodeId] = sub.id
          nodePositions[nodeId] = {
            x: L.padX + (i % perRow) * L.nodeW,
            y: L.headerH + Math.floor(i / perRow) * L.nodeH
          }
        })
        subY += sub.height + L.padBottom
      }
    })
    rowStartY += rowMaxH + L.gapY
  }

  return { groups, nodeParents, nodePositions, emptyVolumeIds }
}

export function wouldCreateCycle(
  groupId: string | number | null | undefined,
  targetGroupId: string | number | null | undefined,
  parentOf: Record<string, string | null | undefined>
): boolean {
  if (groupId == null || targetGroupId == null) return false
  if (String(groupId) === String(targetGroupId)) return true
  let cur: string | number | null | undefined = targetGroupId
  const seen = new Set<string>()
  while (cur != null) {
    const key = String(cur)
    if (seen.has(key)) break
    seen.add(key)
    if (key === String(groupId)) return true
    cur = parentOf[cur]
  }
  return false
}

export function sortGroupsParentFirst(groups: Group[]): Group[] {
  const byId = new Map(groups.map((g) => [String(g.id), g]))
  const depth = (g: Group): number => {
    let d = 0
    let cur: Group | undefined = g
    const seen = new Set<string>()
    while (cur && cur.parentGroupId != null && !seen.has(String(cur.id))) {
      seen.add(String(cur.id))
      cur = byId.get(String(cur.parentGroupId))
      d++
      if (d > 1000) break
    }
    return d
  }
  return [...groups].sort((a, b) => depth(a) - depth(b))
}
