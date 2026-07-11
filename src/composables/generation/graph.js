import { useStoryBibleStore } from '../../stores/storyBibleStore'
import { useStoryGraphStore } from '../../stores/storyGraphStore'

export async function buildPreliminaryEdges(projectId, volumeId, plan) {
  try {
    const bibleStore = useStoryBibleStore()
    const charByName = {}
    for (const c of bibleStore.characters) charByName[c.name.toLowerCase().trim()] = c.id
    const locByName = {}
    for (const l of bibleStore.locations) locByName[l.name.toLowerCase().trim()] = l.id

    const pairMap = new Map()
    for (const scene of plan) {
      const chars = scene.characters || scene.charactersPresent || []
      const location = scene.location || ''
      if (!location || chars.length === 0) continue
      const locId = locByName[location.toLowerCase().trim()]
      if (!locId) {
        console.warn(`[buildPreliminaryEdges] Skipping edge for unknown location "${location}"`)
        continue
      }
      for (const charName of chars) {
        const charId = charByName[charName.toLowerCase().trim()]
        if (!charId) {
          console.warn(`[buildPreliminaryEdges] Skipping edge for unknown character "${charName}"`)
          continue
        }
        const key = `${charId}|${locId}`
        if (!pairMap.has(key)) {
          pairMap.set(key, { charId, locId, charName, location })
        }
      }
    }

    if (pairMap.size === 0) return

    const graphStore = useStoryGraphStore()
    await graphStore.loadEdges(projectId)

    const existingEdgeKeys = new Set()
    for (const edge of graphStore.edges || []) {
      existingEdgeKeys.add(`${edge.sourceId}|${edge.targetId}`)
      existingEdgeKeys.add(`${edge.targetId}|${edge.sourceId}`)
    }

    for (const [key, pair] of pairMap) {
      if (!existingEdgeKeys.has(key)) {
        await graphStore.addEdgeData(projectId, {
          sourceId: String(pair.charId),
          sourceType: 'character',
          targetId: String(pair.locId),
          targetType: 'location',
          relationshipType: 'planned',
          description: `${pair.charName} visits ${pair.location} (planned)`,
          planned: true,
          volumeId: volumeId || null
        })
      }
    }
  } catch (err) {
    console.warn('[VolumeStoryGenerator] buildPreliminaryEdges failed:', err)
  }
}
