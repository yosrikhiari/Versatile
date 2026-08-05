import { toRaw } from 'vue'
import { useStoryGraphStore } from '../stores/storyGraphStore'
import { useVolumeStore } from '../stores/volumeStore'
import { getVolumeEntities } from '../services/dbService'
import { computeVolumeGroups } from '../utils/networkGrouping'

// Canvas node ids are `${prefix}-${entityId}`, matching StoryNetwork and the
// entity bootstrapper.
const ENTITY_TYPE_TO_PREFIX: Record<string, string> = {
  character: 'char',
  location: 'loc',
  plotThread: 'thread'
}
const ENTITY_TYPES = ['character', 'location', 'plotThread'] as const

export interface VolumeGroupingResult {
  /** Nodes placed into a volume group. */
  placed: number
  /** Volumes that ended up with at least one node. */
  grouped: number
  /** Volumes that exist but hold no canvas nodes. */
  emptyVolumeIds: (string | number)[]
  /** Set when nothing could be done — 'no-project' | 'no-volumes'. */
  reason?: string
}

/**
 * Arrange the network into one group per volume, named by the volume.
 *
 * Lifted out of StoryNetwork.vue so the generation pipeline can run it too: the
 * feature already existed but only ever fired when someone clicked the toolbar
 * button, so a finished run left every generated entity ungrouped and the
 * grouping looked like it did not exist.
 *
 * Non-destructive by construction — `computeVolumeGroups` reuses each volume's
 * existing group instead of creating a duplicate, and carries manual groups
 * through untouched.
 */
export async function groupNetworkByVolume({
  projectId
}: {
  projectId: any
}): Promise<VolumeGroupingResult> {
  const empty: VolumeGroupingResult = { placed: 0, grouped: 0, emptyVolumeIds: [] }
  if (!projectId) return { ...empty, reason: 'no-project' }

  const graphStore = useStoryGraphStore()
  const volumeStore = useVolumeStore()

  if (!volumeStore.volumes.length) {
    await volumeStore.loadVolumes(projectId)
  }
  const projectVolumes = volumeStore.volumes.filter((v: any) => v.projectId === projectId)
  if (projectVolumes.length === 0) return { ...empty, reason: 'no-volumes' }

  // Resolve each volume's entities to canvas node instances, placing each
  // instance under the first volume that claims it (an entity shared across
  // volumes belongs to one box, not two).
  const assigned = new Set<string>()
  const volumeNodeIds: Record<string, string[]> = {}
  for (const vol of projectVolumes) {
    const ids: string[] = []
    for (const type of ENTITY_TYPES) {
      let ents: any[] = []
      try {
        ents = await getVolumeEntities(projectId, vol.id, type)
      } catch {
        ents = []
      }
      for (const e of ents) {
        const baseId = `${ENTITY_TYPE_TO_PREFIX[type]}-${e.id}`
        for (const instId of graphStore.nodeInstances[baseId] || []) {
          if (assigned.has(instId)) continue
          assigned.add(instId)
          ids.push(instId)
        }
      }
    }
    volumeNodeIds[vol.id] = ids
  }

  const existingGroups = await graphStore.loadGroups(projectId)
  const existingParents = await graphStore.loadNodeParents(projectId)

  const { groups, nodeParents, nodePositions, emptyVolumeIds } = computeVolumeGroups({
    volumes: projectVolumes,
    volumeNodeIds,
    existingGroups: existingGroups || [],
    existingNodeParents: existingParents || {}
  })

  await graphStore.saveGroups(projectId, groups)
  await graphStore.saveNodeParents(projectId, { ...(existingParents || {}), ...nodeParents })
  await graphStore.saveAllNodePositions(projectId, {
    ...toRaw(graphStore.nodePositions),
    ...nodePositions
  })

  return {
    placed: Object.keys(nodeParents).length,
    grouped: projectVolumes.length - emptyVolumeIds.length,
    emptyVolumeIds
  }
}
