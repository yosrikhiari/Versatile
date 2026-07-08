import { describe, it, expect } from 'vitest'
import { useResearchScope } from '@/composables/useResearchScope'

function seed(scope, docs) {
  scope.researchDocs.value = docs
  scope.selectedResearchDocIds.value = new Set(docs.map((d) => d.id))
}

describe('useResearchScope', () => {
  it('hasResearchDocs / selectedResearchCount reflect the docs and selection', () => {
    const scope = useResearchScope(() => 1)
    expect(scope.hasResearchDocs.value).toBe(false)
    seed(scope, [{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(scope.hasResearchDocs.value).toBe(true)
    expect(scope.selectedResearchCount.value).toBe(3)
  })

  it('toggleResearchDoc adds and removes a single id', () => {
    const scope = useResearchScope(() => 1)
    seed(scope, [{ id: 1 }, { id: 2 }])
    scope.toggleResearchDoc(1)
    expect(scope.selectedResearchDocIds.value.has(1)).toBe(false)
    expect(scope.selectedResearchCount.value).toBe(1)
    scope.toggleResearchDoc(1)
    expect(scope.selectedResearchDocIds.value.has(1)).toBe(true)
  })

  it('selectAllResearch / selectNoResearch set the full and empty selection', () => {
    const scope = useResearchScope(() => 1)
    seed(scope, [{ id: 1 }, { id: 2 }])
    scope.selectNoResearch()
    expect(scope.selectedResearchCount.value).toBe(0)
    scope.selectAllResearch()
    expect(scope.selectedResearchCount.value).toBe(2)
  })

  describe('buildResearchScope', () => {
    it('returns undefined when there are no docs', () => {
      const scope = useResearchScope(() => 1)
      expect(scope.buildResearchScope()).toBeUndefined()
    })

    it('returns disabled when the toggle is off', () => {
      const scope = useResearchScope(() => 1)
      seed(scope, [{ id: 1 }])
      scope.useResearch.value = false
      expect(scope.buildResearchScope()).toEqual({ enabled: false, documentIds: [] })
    })

    it('returns disabled when nothing is selected', () => {
      const scope = useResearchScope(() => 1)
      seed(scope, [{ id: 1 }, { id: 2 }])
      scope.selectNoResearch()
      expect(scope.buildResearchScope()).toEqual({ enabled: false, documentIds: [] })
    })

    it('sends empty documentIds ("use all") when every source is selected', () => {
      const scope = useResearchScope(() => 1)
      seed(scope, [{ id: 1 }, { id: 2 }])
      expect(scope.buildResearchScope()).toEqual({ enabled: true, documentIds: [] })
    })

    it('sends explicit ids once the set is narrowed', () => {
      const scope = useResearchScope(() => 1)
      seed(scope, [{ id: 1 }, { id: 2 }, { id: 3 }])
      scope.toggleResearchDoc(2)
      const result = scope.buildResearchScope()
      expect(result.enabled).toBe(true)
      expect(result.documentIds.sort()).toEqual([1, 3])
    })
  })

  it('loadResearchSources is a no-op without a project id', async () => {
    const scope = useResearchScope(() => null)
    await scope.loadResearchSources()
    expect(scope.researchDocs.value).toEqual([])
  })
})
