export interface CanonicalEntity {
  id: string
  name: string
  type: 'character' | 'location' | 'plot_thread' | 'scene'
  aliases: string[]
  fields: Record<string, unknown>
}

export interface CanonicalRelationship {
  id: string
  sourceId: string
  targetId: string
  kind: string
  label: string
}

export interface OntologySnapshot {
  timestamp: number
  entities: Map<string, CanonicalEntity>
  relationships: Map<string, CanonicalRelationship>
  entityByName: Map<string, string>
  entityByAlias: Map<string, string>
  entityByType: Map<string, string[]>
  relationshipsByEntity: Map<string, string[]>
}
