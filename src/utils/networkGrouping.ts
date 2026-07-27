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
  volumeId?: string | number
  parentGroupId: string | null
}

interface ComputeVolumeGroupsArgs {
  volumes?: Volume[]
  volumeNodeIds?: Record<string | number, string[]>
  existingGroups?: Group[]
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
  width: number
  height: number
}

function groupInnerLayout(nodeCount: number, L: Layout): { rows: number; width: number; height: number } {
  const perRow = Math.max(1, L.nodesPerRow)
  const rows = Math.max(1, Math.ceil(Math.max(nodeCount, 1) / perRow))
  const width = L.groupWidth
  const height = Math.max(L.minHeight, L.headerH + rows * L.nodeH + L.padBottom)
  return { rows, width, height }
}

function childPosition(i: number, L: Layout): { x: number; y: number } {
  const perRow = Math.max(1, L.nodesPerRow)
  const col = i % perRow
  const row = Math.floor(i / perRow)
  return { x: L.padX + col * L.nodeW, y: L.headerH + row * L.nodeH }
}

export function computeVolumeGroups({
  volumes,
  volumeNodeIds,
  existingGroups = [],
  layout
}: ComputeVolumeGroupsArgs = {}): ComputeVolumeGroupsResult {
  const L = { ...DEFAULT_LAYOUT, ...(layout || {}) }
  const vols = Array.isArray(volumes) ? volumes : []
  const map = volumeNodeIds || {}

  const groups: Group[] = existingGroups.map((g) => ({ ...g }))
  const volumeGroupById = new Map<string, Group>()
  for (const g of groups) {
    if (g && g.volumeId != null) volumeGroupById.set(String(g.volumeId), g)
  }

  const nodeParents: Record<string, string> = {}
  const nodePositions: Record<string, { x: number; y: number }> = {}
  const emptyVolumeIds: (string | number)[] = []

  const sized: SizedVolume[] = vols.map((vol) => {
    const nodeIds = map[vol.id] || []
    const { width, height } = groupInnerLayout(nodeIds.length, L)
    return { vol, nodeIds, width, height }
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
      let group = volumeGroupById.get(volKey)
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
          id: `group-vol-${item.vol.id}`,
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
      item.nodeIds.forEach((nodeId, i) => {
        nodeParents[nodeId] = group!.id
        nodePositions[nodeId] = childPosition(i, L)
      })
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
