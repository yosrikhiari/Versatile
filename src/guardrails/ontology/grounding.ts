import type { OntologySnapshot } from './types'
import { emptySnapshot } from './instantiate'

export class GroundingService {
  private snapshot: OntologySnapshot = emptySnapshot()
  private build: (() => OntologySnapshot) | null = null

  setBuilder(build: () => OntologySnapshot): void {
    this.build = build
  }

  refresh(): void {
    if (this.build) {
      this.snapshot = this.build()
    }
  }

  getSnapshot(): OntologySnapshot {
    return this.snapshot
  }

  findEntityByName(name: string): string | undefined {
    const lower = name.toLowerCase()
    return this.snapshot.entityByName.get(lower) ?? this.snapshot.entityByAlias.get(lower)
  }

  getEntity(id: string) {
    return this.snapshot.entities.get(id)
  }

  getRelationshipsForEntity(entityId: string) {
    const relIds = this.snapshot.relationshipsByEntity.get(entityId) ?? []
    return relIds.map(id => this.snapshot.relationships.get(id)).filter(Boolean)
  }

  getEntitiesByType(type: string) {
    const ids = this.snapshot.entityByType.get(type) ?? []
    return ids.map(id => this.snapshot.entities.get(id)).filter(Boolean)
  }

  /** Check whether a name refers to a known entity (O(1) lookup). */
  isKnownEntityName(name: string): boolean {
    const lower = name.toLowerCase()
    return this.snapshot.entityByName.has(lower) || this.snapshot.entityByAlias.has(lower)
  }

  /** Find the canonical name for a given name or alias. */
  resolveName(name: string): string | undefined {
    const lower = name.toLowerCase()
    const id = this.snapshot.entityByName.get(lower) ?? this.snapshot.entityByAlias.get(lower)
    if (!id) return undefined
    return this.snapshot.entities.get(id)?.name
  }

  /** Get all entity names (canonical + aliases) as a Set of lowercase strings. */
  allKnownNames(): Set<string> {
    const names = new Set(this.snapshot.entityByName.keys())
    for (const alias of this.snapshot.entityByAlias.keys()) {
      names.add(alias)
    }
    return names
  }
}
