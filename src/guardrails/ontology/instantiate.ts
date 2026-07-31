import type { OntologySnapshot, CanonicalEntity, CanonicalRelationship } from './types'

export function emptySnapshot(): OntologySnapshot {
  return {
    timestamp: 0,
    entities: new Map(),
    relationships: new Map(),
    entityByName: new Map(),
    entityByAlias: new Map(),
    entityByType: new Map(),
    relationshipsByEntity: new Map(),
  }
}

export function buildOntologySnapshot(opts: {
  getCharacters: () => Array<{ id: string; name: string; aliases?: string[] } & Record<string, unknown>>
  getLocations: () => Array<{ id: string; name: string; aliases?: string[] } & Record<string, unknown>>
  getPlotThreads: () => Array<{ id: string; name: string; aliases?: string[] } & Record<string, unknown>>
  getScenes: () => Array<{ id: string; title: string; aliases?: string[] } & Record<string, unknown>>
  getRelationships: () => Array<{ id: string; sourceId: string; targetId: string; kind: string; label: string }>
}): OntologySnapshot {
  const timestamp = Date.now()
  const entities = new Map<string, CanonicalEntity>()
  const entityByName = new Map<string, string>()
  const entityByAlias = new Map<string, string>()
  const entityByType = new Map<string, string[]>()
  const relationships = new Map<string, CanonicalRelationship>()
  const relationshipsByEntity = new Map<string, string[]>()

  const addEntities = (
    items: Array<Record<string, unknown>>,
    type: CanonicalEntity['type']
  ) => {
    const typeIds: string[] = []
    for (const item of items) {
      const id = String(item.id)
      // Scenes are keyed by `title`; every other entity type uses `name`.
      const name = String(item.name ?? item.title ?? '')
      const aliases = (item.aliases as string[] | undefined) ?? []
      const canonical: CanonicalEntity = { id, name, type, aliases, fields: { ...item } }
      entities.set(id, canonical)
      typeIds.push(id)
      // An unnamed entity must not claim the empty-string key — that would make
      // `isKnownEntityName('')` true and mask genuinely unknown references.
      if (name) entityByName.set(name.toLowerCase(), id)
      for (const alias of aliases) {
        if (alias) entityByAlias.set(alias.toLowerCase(), id)
      }
    }
    entityByType.set(type, typeIds)
  }

  addEntities(opts.getCharacters(), 'character')
  addEntities(opts.getLocations(), 'location')
  addEntities(opts.getPlotThreads(), 'plot_thread')
  addEntities(opts.getScenes(), 'scene')

  for (const rel of opts.getRelationships()) {
    const r: CanonicalRelationship = { id: rel.id, sourceId: rel.sourceId, targetId: rel.targetId, kind: rel.kind, label: rel.label }
    relationships.set(r.id, r)

    const srcList = relationshipsByEntity.get(r.sourceId) ?? []
    srcList.push(r.id)
    relationshipsByEntity.set(r.sourceId, srcList)

    const tgtList = relationshipsByEntity.get(r.targetId) ?? []
    tgtList.push(r.id)
    relationshipsByEntity.set(r.targetId, tgtList)
  }

  return { timestamp, entities, relationships, entityByName, entityByAlias, entityByType, relationshipsByEntity }
}
