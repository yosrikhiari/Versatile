import { describe, it, expect } from 'vitest'
import { buildRelationshipEdges } from '@/composables/generation/generators/relationships'

const characters = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' }
]
const locations = [{ id: 10, name: 'The Keep' }]
const plotThreads = [{ id: 100, title: 'The Prophecy' }]
const bible = { characters, locations, plotThreads }

describe('buildRelationshipEdges — Story Network name→ID reconciliation', () => {
  it('resolves char↔char names to character IDs', () => {
    const ai = {
      characterRelationships: [{ from: 'Alice', to: 'Bob', type: 'ally', description: 'friends' }]
    }
    const { characterRelationships } = buildRelationshipEdges(ai, bible)
    expect(characterRelationships).toHaveLength(1)
    expect(characterRelationships[0]).toMatchObject({
      fromCharacterId: 1,
      toCharacterId: 2,
      type: 'ally'
    })
  })

  it('drops (does not silently keep) relationships whose names do not resolve', () => {
    const ai = { characterRelationships: [{ from: 'Alice', to: 'Ghost', type: 'ally' }] }
    const { characterRelationships, dropped } = buildRelationshipEdges(ai, bible)
    expect(characterRelationships).toHaveLength(0)
    expect(dropped).toHaveLength(1)
  })

  it('is case-insensitive and dedupes reversed pairs', () => {
    const ai = {
      characterRelationships: [
        { from: 'alice', to: 'BOB', type: 'ally' },
        { from: 'Bob', to: 'Alice', type: 'rival' }
      ]
    }
    const { characterRelationships } = buildRelationshipEdges(ai, bible)
    expect(characterRelationships).toHaveLength(1)
  })

  it('ignores self-referential relationships', () => {
    const ai = { characterRelationships: [{ from: 'Alice', to: 'Alice', type: 'self' }] }
    const { characterRelationships } = buildRelationshipEdges(ai, bible)
    expect(characterRelationships).toHaveLength(0)
  })

  it('maps char↔location and char↔plotThread to typed graph edges', () => {
    const ai = {
      characterLocations: [{ character: 'Alice', location: 'The Keep', relationship: 'home' }],
      characterPlotThreads: [
        { character: 'Bob', plotThread: 'The Prophecy', involvement: 'driver' }
      ]
    }
    const { graphEdges } = buildRelationshipEdges(ai, bible)
    expect(graphEdges).toHaveLength(2)
    expect(graphEdges.find((e) => e.targetType === 'location')).toMatchObject({
      sourceId: '1',
      sourceType: 'character',
      targetId: '10',
      targetType: 'location',
      relationshipType: 'home'
    })
    expect(graphEdges.find((e) => e.targetType === 'plotThread')).toMatchObject({
      sourceId: '2',
      targetId: '100',
      relationshipType: 'driver'
    })
  })

  it('maps plotThread↔plotThread links and dedupes graph edges', () => {
    const threads = [
      { id: 100, title: 'A' },
      { id: 200, title: 'B' }
    ]
    const ai = {
      plotThreadLinks: [
        { from: 'A', to: 'B', type: 'depends_on' },
        { from: 'A', to: 'B', type: 'depends_on' }
      ]
    }
    const { graphEdges } = buildRelationshipEdges(ai, {
      characters,
      locations,
      plotThreads: threads
    })
    expect(graphEdges).toHaveLength(1)
    expect(graphEdges[0]).toMatchObject({
      sourceType: 'plotThread',
      targetType: 'plotThread',
      relationshipType: 'depends_on'
    })
  })

  it('handles an empty / partial AI result without throwing', () => {
    expect(buildRelationshipEdges({}, bible)).toMatchObject({
      characterRelationships: [],
      graphEdges: []
    })
    expect(buildRelationshipEdges(null, bible).characterRelationships).toHaveLength(0)
  })
})
