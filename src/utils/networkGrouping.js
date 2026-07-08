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

const DEFAULT_LAYOUT = {
  groupsPerRow: 3,
  groupWidth: 360,
  gapX: 64,
  gapY: 64,
  headerH: 56, // space for the group's title bar
  padX: 20,
  padBottom: 20,
  nodeW: 160,
  nodeH: 96,
  nodesPerRow: 2,
  startX: 80,
  startY: 80,
  minHeight: 140
}

function groupInnerLayout(nodeCount, L) {
  const perRow = Math.max(1, L.nodesPerRow)
  const rows = Math.max(1, Math.ceil(Math.max(nodeCount, 1) / perRow))
  const width = L.groupWidth
  const height = Math.max(L.minHeight, L.headerH + rows * L.nodeH + L.padBottom)
  return { rows, width, height }
}

// Relative position of the i-th child node inside its group.
function childPosition(i, L) {
  const perRow = Math.max(1, L.nodesPerRow)
  const col = i % perRow
  const row = Math.floor(i / perRow)
  return { x: L.padX + col * L.nodeW, y: L.headerH + row * L.nodeH }
}

/**
 * Reconcile volume groups over the existing graph.
 *
 * @param {Object} args
 * @param {Array<{id:(string|number), title?:string, color?:string}>} args.volumes
 *   Volumes in display order. One group is produced per volume.
 * @param {Object<string|number, string[]>} args.volumeNodeIds
 *   Map of volumeId -> node instance ids that belong in that volume's group.
 *   The caller is responsible for placing each node id under exactly one volume.
 * @param {Array<Object>} [args.existingGroups]
 *   Current groups. Volume groups are matched by `volumeId` and updated in place;
 *   any non-volume (manual) groups are preserved untouched.
 * @param {Object} [args.layout] Layout overrides (see DEFAULT_LAYOUT).
 * @returns {{ groups: Array<Object>, nodeParents: Object<string,string>, nodePositions: Object<string,{x:number,y:number}>, emptyVolumeIds: Array }}
 */
export function computeVolumeGroups({ volumes, volumeNodeIds, existingGroups = [], layout } = {}) {
  const L = { ...DEFAULT_LAYOUT, ...(layout || {}) }
  const vols = Array.isArray(volumes) ? volumes : []
  const map = volumeNodeIds || {}

  // Preserve every existing group object; we mutate copies of the volume ones.
  const groups = existingGroups.map((g) => ({ ...g }))
  const volumeGroupById = new Map()
  for (const g of groups) {
    if (g && g.volumeId != null) volumeGroupById.set(String(g.volumeId), g)
  }

  const nodeParents = {}
  const nodePositions = {}
  const emptyVolumeIds = []

  // Pre-compute each volume group's size so we can pack rows without overlap.
  const sized = vols.map((vol) => {
    const nodeIds = map[vol.id] || []
    const { width, height } = groupInnerLayout(nodeIds.length, L)
    return { vol, nodeIds, width, height }
  })

  // Row-pack: each row's y-stride is the tallest group in that row.
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
        group.name = item.vol.title || group.name || `Volume`
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
        nodeParents[nodeId] = group.id
        nodePositions[nodeId] = childPosition(i, L)
      })
    })
    rowStartY += rowMaxH + L.gapY
  }

  return { groups, nodeParents, nodePositions, emptyVolumeIds }
}

/**
 * Would re-parenting `groupId` under `targetGroupId` create a cycle? A group may
 * not become a descendant of itself. `parentOf` maps groupId -> parentGroupId.
 */
export function wouldCreateCycle(groupId, targetGroupId, parentOf) {
  if (groupId == null || targetGroupId == null) return false
  if (String(groupId) === String(targetGroupId)) return true
  let cur = targetGroupId
  const seen = new Set()
  while (cur != null) {
    const key = String(cur)
    if (seen.has(key)) break // defensive: existing cycle
    seen.add(key)
    if (key === String(groupId)) return true
    cur = parentOf[cur]
  }
  return false
}

/**
 * Order groups so a parent always precedes its children — Vue Flow requires a
 * parent node to be declared before any node that references it as `parentNode`.
 */
export function sortGroupsParentFirst(groups) {
  const byId = new Map(groups.map((g) => [String(g.id), g]))
  const depth = (g) => {
    let d = 0
    let cur = g
    const seen = new Set()
    while (cur && cur.parentGroupId != null && !seen.has(String(cur.id))) {
      seen.add(String(cur.id))
      cur = byId.get(String(cur.parentGroupId))
      d++
      if (d > 1000) break // defensive against a corrupt cycle
    }
    return d
  }
  return [...groups].sort((a, b) => depth(a) - depth(b))
}
