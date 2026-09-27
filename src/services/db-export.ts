import { db as _db } from './db-core'

const db = _db as any

export async function exportProject(projectId: string) {
  const project = await db.projects.get(projectId)
  const manuscript = await db.manuscripts.where('projectId').equals(projectId).first()
  const characters = await db.characters.where('projectId').equals(projectId).toArray()
  const locations = await db.locations.where('projectId').equals(projectId).toArray()
  const plotThreads = await db.plotThreads.where('projectId').equals(projectId).toArray()
  const relationships = await db.characterRelationships
    .where('projectId')
    .equals(projectId)
    .toArray()
  const storyElements = await db.storyElements.where('projectId').equals(projectId).toArray()
  const sparkHistory = await db.sparkHistory.where('projectId').equals(projectId).toArray()
  const annotations = await db.annotations.where('projectId').equals(projectId).toArray()
  const snippets = await db.snippets.where('projectId').equals(projectId).toArray()
  const volumes = await db.volumes.where('projectId').equals(projectId).toArray()
  const volumeEntities = await db.volumeEntities
    .filter((e: any) => e.projectId === projectId)
    .toArray()
  const graphEdges = await db.graphEdges.where('projectId').equals(projectId).toArray()
  const sections = await db.sections.where('projectId').equals(projectId).toArray()
  const subsections = await db.subsections.where('projectId').equals(projectId).toArray()
  const branches = await db.branches.where('projectId').equals(projectId).toArray()
  const storyDocuments = await db.storyDocuments.where('projectId').equals(projectId).toArray()
  const voiceProfiles = await db.voiceProfiles.where('projectId').equals(projectId).toArray()

  return {
    version: 5,
    exportedAt: new Date().toISOString(),
    project,
    manuscript,
    characters,
    locations,
    plotThreads,
    relationships,
    storyElements,
    sparkHistory,
    annotations,
    snippets,
    volumes,
    volumeEntities,
    graphEdges,
    sections,
    subsections,
    branches,
    storyDocuments,
    voiceProfiles
  }
}

export async function importProject(data: Record<string, any>) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid project file: not an object')
  }
  if (!data.version || typeof data.version !== 'number') {
    throw new Error('Invalid project file: missing or invalid version')
  }
  if (!data.project || typeof data.project !== 'object' || !data.project.name) {
    throw new Error('Invalid project file: missing or invalid project data')
  }

  const MAX_ITEMS = 10000
  const arraysToCheck = [
    'characters',
    'locations',
    'chapters',
    'scenes',
    'relationships',
    'storyElements',
    'sparkHistory',
    'annotations',
    'snippets',
    'volumes',
    'volumeEntities',
    'graphEdges',
    'sections',
    'subsections'
  ]
  for (const key of arraysToCheck) {
    if (data[key] && data[key].length > MAX_ITEMS) {
      throw new Error(`Invalid project file: too many ${key} (max ${MAX_ITEMS})`)
    }
  }

  const now = new Date().toISOString()
  const projectId = await db.transaction(
    'rw',
    [
      db.projects,
      db.manuscripts,
      db.characters,
      db.locations,
      db.plotThreads,
      db.characterRelationships,
      db.storyElements,
      db.sparkHistory,
      db.annotations,
      db.snippets,
      db.volumes,
      db.volumeEntities,
      db.graphEdges,
      db.sections,
      db.subsections,
      db.branches,
      db.storyDocuments,
      db.voiceProfiles
    ],
    async () => {
      const id = await db.projects.add({
        ...fresh(data.project),
        createdAt: now,
        updatedAt: now
      })
      if (data.manuscript) {
        await db.manuscripts.add({ ...fresh(data.manuscript), projectId: id })
      }

      // Rows are added one at a time so each old id can be mapped to its new
      // one; every reference below goes through these maps. The old code gave
      // every row a new id but kept the references, so scenes pointed at
      // chapters of another project (or at nothing) and the network's edges
      // at people who were not there.
      const add = async (
        table: any,
        rows: any[] | undefined,
        extra: (r: any) => any = () => ({})
      ) => {
        const map = new Map<string, any>()
        for (const r of rows || []) {
          const newId = await table.add({ ...fresh(r), projectId: id, ...extra(r) })
          if (r.id != null) map.set(String(r.id), newId)
        }
        return map
      }

      const branchMap = await add(db.branches, data.branches)
      for (const [, newId] of branchMap) {
        const b = await db.branches.get(newId)
        if (b?.sourceBranchId != null) {
          await db.branches.update(newId, { sourceBranchId: remap(branchMap, b.sourceBranchId) })
        }
      }

      const characters = await add(db.characters, data.characters)
      const locations = await add(db.locations, data.locations)
      const plotThreads = await add(db.plotThreads, data.plotThreads)
      const volumes = await add(db.volumes, data.volumes, () => ({ chapterIds: [] }))

      let sections: Map<string, any>
      if (data.version >= 4) {
        sections = await add(db.sections, data.sections, (s) => ({
          volumeId: remap(volumes, s.volumeId),
          branchId: remap(branchMap, s.branchId)
        }))
        await add(db.subsections, data.subsections, (s) => ({
          sectionId: remap(sections, s.sectionId),
          branchId: remap(branchMap, s.branchId)
        }))
      } else {
        sections = await add(db.sections, data.chapters, (c) => ({
          volumeId: remap(volumes, c.volumeId)
        }))
        await add(db.subsections, data.scenes, (s) => ({
          sectionId: remap(sections, s.chapterId),
          chapterId: undefined
        }))
      }

      const byType: Record<string, Map<string, any>> = {
        character: characters,
        location: locations,
        plotThread: plotThreads,
        plotpoint: plotThreads,
        section: sections,
        volume: volumes
      }

      const rels = (data.relationships || []).filter(
        (r: any) =>
          characters.has(String(r.fromCharacterId)) && characters.has(String(r.toCharacterId))
      )
      await add(db.characterRelationships, rels, (r) => ({
        fromCharacterId: remap(characters, r.fromCharacterId),
        toCharacterId: remap(characters, r.toCharacterId)
      }))

      if (data.version >= 3) {
        const edges = (data.graphEdges || []).filter(
          (e: any) =>
            byType[e.sourceType]?.has(String(e.sourceId)) &&
            byType[e.targetType]?.has(String(e.targetId))
        )
        await add(db.graphEdges, edges, (e) => ({
          sourceId: sameKind(e.sourceId, remap(byType[e.sourceType], e.sourceId)),
          targetId: sameKind(e.targetId, remap(byType[e.targetType], e.targetId)),
          volumeId: remap(volumes, e.volumeId)
        }))
        const ves = (data.volumeEntities || []).filter(
          (ve: any) =>
            volumes.has(String(ve.volumeId)) && byType[ve.entityType]?.has(String(ve.entityId))
        )
        await add(db.volumeEntities, ves, (ve) => ({
          volumeId: remap(volumes, ve.volumeId),
          entityId: sameKind(ve.entityId, remap(byType[ve.entityType], ve.entityId))
        }))
      }

      await add(db.storyElements, data.storyElements, (e) => {
        const d = { ...(e.data || {}) }
        if (d.sourceType && d.sourceId != null && byType[d.sourceType]) {
          d.sourceId = sameKind(d.sourceId, remap(byType[d.sourceType], d.sourceId))
        }
        if (d.sectionId != null) d.sectionId = remap(sections, d.sectionId)
        return { data: d }
      })

      await add(db.sparkHistory, data.sparkHistory)
      await add(db.annotations, data.annotations)
      await add(db.snippets, data.snippets)
      await add(db.storyDocuments, data.storyDocuments)
      await add(db.voiceProfiles, data.voiceProfiles)

      return id
    }
  )

  // Rows whose branch was not in the file (every file before version 5) join
  // the new project's main branch; a branch-filtered load cannot see them.
  const { ensureMainBranch, adoptUnbranchedRows } = await import('./db-branches')
  const main = await ensureMainBranch(projectId)
  await adoptUnbranchedRows(projectId, main.id)

  return projectId
}

// The row's identity and its link to a server record stay behind: a copy
// that kept `apiId` would sync over the project it was exported from.
const NOT_IMPORTED = ['id', 'apiId', 'syncStatus', 'lastSyncedAt', 'userId']

function fresh(row: any) {
  const out: any = {}
  for (const [k, v] of Object.entries(row || {})) if (!NOT_IMPORTED.includes(k)) out[k] = v
  return out
}

function remap(map: Map<string, any>, oldId: any) {
  if (oldId == null) return null
  return map.get(String(oldId)) ?? null
}

/** Keep a reference's type: graph edges store ids as strings. */
function sameKind(oldId: any, newId: any) {
  return newId == null ? null : typeof oldId === 'string' ? String(newId) : newId
}

export async function exportToPDF(projectId: string) {
  const project = await db.projects.get(projectId)
  const manuscript = await db.manuscripts.where('projectId').equals(projectId).first()
  const sections = await db.sections.where('projectId').equals(projectId).sortBy('order')
  const subsections = await db.subsections.where('projectId').equals(projectId).sortBy('order')
  const characters = await db.characters.where('projectId').equals(projectId).toArray()
  const locations = await db.locations.where('projectId').equals(projectId).toArray()
  const plotThreads = await db.plotThreads.where('projectId').equals(projectId).toArray()

  return { project, manuscript, sections, subsections, characters, locations, plotThreads }
}
