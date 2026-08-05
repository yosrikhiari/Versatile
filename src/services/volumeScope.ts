import { db as _db } from './db-core'

const db = _db as any

/**
 * Narrow the story bible to what one volume actually needs.
 *
 * Every scene write rebuilds `buildExistingEntitiesBlob` from the WHOLE project
 * cast, so writing volume 5 shipped volume 1's entire cast to the model. That
 * was survivable at three characters; with the cast now scaled to the story's
 * scope it is the single largest avoidable block in the prompt.
 *
 * The volume boxes in the Story Network and this filter read the same table
 * (`volumeEntities`), so what you see grouped is what the model is told about.
 */

export interface ScopedBible {
  characters: any[]
  locations: any[]
  plotThreads: any[]
  /** True when the cast was actually narrowed — false means callers got everything. */
  scoped: boolean
  /** Entities withheld, for logging. */
  omitted: number
}

const TYPES = ['character', 'location', 'plotThread'] as const

export async function getProjectVolumeIds(projectId: any): Promise<string[]> {
  if (!projectId) return []
  try {
    const volumes = await db.volumes.where('projectId').equals(projectId).toArray()
    return volumes.map((v: any) => v.id)
  } catch {
    return []
  }
}

export async function getVolumeAssignments(volumeIds: string[]): Promise<any[]> {
  if (!volumeIds?.length) return []
  try {
    return await db.volumeEntities.where('volumeId').anyOf(volumeIds).toArray()
  } catch {
    return []
  }
}

/**
 * Rules, in order:
 *  1. No volume, no volumes in the project, or no assignments → everything.
 *     Scoping is opt-in through the data; a project that never assigned
 *     anything keeps exactly today's behaviour.
 *  2. Assigned to THIS volume → in. A character assigned to every volume — a
 *     protagonist — is therefore in every volume, with no extra flag needed.
 *  3. Assigned to NO volume at all → in. It never opted into a scope, so no
 *     scope may exclude it. This is what keeps hand-authored entities visible.
 *  4. Assigned only to OTHER volumes → out.
 *  5. `alwaysInclude` names override everything — the plan may legitimately
 *     name someone from an earlier volume in a later scene.
 *
 * Safety valve: if filtering would empty a list that was not already empty, that
 * list is returned whole. Handing the writer a cast of nobody is worse than
 * handing it too many — and it would mean the assignment data, not the story,
 * is wrong.
 */
export async function scopeBibleToVolume({
  projectId,
  volumeId,
  characters = [],
  locations = [],
  plotThreads = [],
  alwaysInclude = []
}: {
  projectId: any
  volumeId: any
  characters?: any[]
  locations?: any[]
  plotThreads?: any[]
  alwaysInclude?: string[]
}): Promise<ScopedBible> {
  const unscoped: ScopedBible = {
    characters,
    locations,
    plotThreads,
    scoped: false,
    omitted: 0
  }
  if (!projectId || !volumeId) return unscoped

  const volumeIds = await getProjectVolumeIds(projectId)
  if (volumeIds.length < 2) return unscoped // nothing to separate from

  const rows = await getVolumeAssignments(volumeIds)
  if (!rows.length) return unscoped

  const here: Record<string, Set<string>> = {}
  const anywhere: Record<string, Set<string>> = {}
  for (const type of TYPES) {
    here[type] = new Set()
    anywhere[type] = new Set()
  }
  for (const row of rows) {
    const type = row?.entityType
    if (!anywhere[type]) continue
    const id = String(row.entityId)
    anywhere[type].add(id)
    if (String(row.volumeId) === String(volumeId)) here[type].add(id)
  }

  const keepNames = new Set(
    (alwaysInclude || []).map((n) => String(n || '').trim().toLowerCase()).filter(Boolean)
  )

  let omitted = 0
  const filterFor = (list: any[], type: (typeof TYPES)[number], labelOf: (e: any) => string) => {
    const kept = list.filter((e: any) => {
      const id = String(e?.id)
      if (here[type].has(id)) return true
      if (!anywhere[type].has(id)) return true
      return keepNames.has(String(labelOf(e) || '').trim().toLowerCase())
    })
    // Safety valve — never narrow a non-empty list down to nothing.
    if (list.length > 0 && kept.length === 0) return list
    omitted += list.length - kept.length
    return kept
  }

  const scopedCharacters = filterFor(characters, 'character', (e) => e.name)
  const scopedLocations = filterFor(locations, 'location', (e) => e.name)
  const scopedThreads = filterFor(plotThreads, 'plotThread', (e) => e.title)

  return {
    characters: scopedCharacters,
    locations: scopedLocations,
    plotThreads: scopedThreads,
    scoped: omitted > 0,
    omitted
  }
}
