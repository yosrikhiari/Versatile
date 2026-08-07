import { describe, it, expect } from 'vitest'
import {
  makeRelationshipSchema,
  estimateRelationshipTokens,
  missingCategories
} from '@/composables/generation/generators/relationships'

describe('makeRelationshipSchema', () => {
  it('makes an empty network structurally unrepresentable', () => {
    // The observed failure: "[generateRelationships] attempt 1 returned no
    // connections; retrying." An unbounded array let the grammar satisfy itself
    // with `{"characterRelationships": []}`, which the prompt actively invited.
    const schema = makeRelationshipSchema({
      characterNames: ['A', 'B', 'C', 'D'],
      locationNames: ['L1', 'L2'],
      threadTitles: ['T1', 'T2']
    })
    expect(schema.properties.characterRelationships.minItems).toBe(1)
  })

  it('caps relationships at the number of pairs that actually exist', () => {
    const schema = makeRelationshipSchema({ characterNames: ['A', 'B', 'C'] })
    // 3 characters → 3 possible pairs; asking for more would be invented.
    expect(schema.properties.characterRelationships.maxItems).toBe(3)
  })

  it('keeps a large cast bounded so decoding cannot run away', () => {
    const schema = makeRelationshipSchema({
      characterNames: Array.from({ length: 40 }, (_, i) => `C${i}`),
      locationNames: Array.from({ length: 30 }, (_, i) => `L${i}`),
      threadTitles: Array.from({ length: 20 }, (_, i) => `T${i}`)
    })
    expect(schema.properties.characterRelationships.maxItems).toBe(40)
    expect(schema.properties.characterLocations.maxItems).toBe(40)
    expect(schema.properties.characterPlotThreads.maxItems).toBe(40)
    expect(schema.properties.plotThreadLinks.maxItems).toBe(20)
  })

  it('stays satisfiable for the smallest cast the caller allows through', () => {
    // generateRelationships returns early below two characters, so two is the
    // floor — minItems must not exceed maxItems there.
    const schema = makeRelationshipSchema({ characterNames: ['A', 'B'] })
    expect(schema.properties.characterRelationships.minItems).toBe(1)
    expect(schema.properties.characterRelationships.maxItems).toBeGreaterThanOrEqual(1)
  })

  it('pins every name field to the committed cast', () => {
    // Observed on phi4-mini: it answered the wrong question in the right shape,
    // putting the relationship into the name slot —
    // `"location": "Avoids The Pier, frequents Marine Research Facility"`.
    // That parses, then gets silently dropped for matching no entity. An enum
    // makes it unrepresentable instead of filtering it after the fact.
    const schema = makeRelationshipSchema({
      characterNames: ['Mara', 'Ines'],
      locationNames: ['The Pier'],
      threadTitles: ['The reef', 'The boat']
    })
    const p = schema.properties
    expect(p.characterRelationships.items.properties.from.enum).toEqual(['Mara', 'Ines'])
    expect(p.characterRelationships.items.properties.to.enum).toEqual(['Mara', 'Ines'])
    expect(p.characterLocations.items.properties.location.enum).toEqual(['The Pier'])
    expect(p.characterPlotThreads.items.properties.plotThread.enum).toEqual([
      'The reef',
      'The boat'
    ])
    expect(p.plotThreadLinks.items.properties.from.enum).toEqual(['The reef', 'The boat'])
  })

  it('omits arrays whose entity list is empty rather than emitting an unsatisfiable enum', () => {
    const schema = makeRelationshipSchema({ characterNames: ['A', 'B'] })
    expect(schema.properties.characterLocations).toBeUndefined()
    expect(schema.properties.characterPlotThreads).toBeUndefined()
    expect(schema.properties.plotThreadLinks).toBeUndefined()
  })

  it('omits plot-thread links when there is only one thread to link', () => {
    const schema = makeRelationshipSchema({
      characterNames: ['A', 'B'],
      threadTitles: ['Only one']
    })
    expect(schema.properties.characterPlotThreads).toBeDefined()
    expect(schema.properties.plotThreadLinks).toBeUndefined()
  })

  it('requires every category whose entities exist, not just character links', () => {
    // The observed failure: locations and plot threads sitting on the canvas
    // with no edges at all. Only `characterRelationships` was required, so the
    // grammar was fully satisfied by character↔character links and a small
    // local model stopped there.
    const schema = makeRelationshipSchema({
      characterNames: ['A', 'B', 'C'],
      locationNames: ['L'],
      threadTitles: ['T1', 'T2']
    })
    expect(schema.required).toEqual([
      'characterRelationships',
      'characterLocations',
      'characterPlotThreads',
      'plotThreadLinks'
    ])
    expect(schema.properties.characterRelationships.items.required).toEqual(['from', 'to', 'type'])
  })

  it('gives every required category a non-empty floor', () => {
    const schema = makeRelationshipSchema({
      characterNames: ['A', 'B', 'C'],
      locationNames: ['L1', 'L2'],
      threadTitles: ['T1', 'T2']
    })
    for (const key of schema.required) {
      expect(schema.properties[key].minItems).toBe(1)
    }
  })

  it('never requires a category it did not ask for', () => {
    // `required` naming an absent property is an unsatisfiable schema.
    const schema = makeRelationshipSchema({ characterNames: ['A', 'B'] })
    expect(schema.required).toEqual(['characterRelationships'])
    for (const key of schema.required) {
      expect(schema.properties[key]).toBeDefined()
    }
  })

  it('keeps every floor satisfiable against its own ceiling', () => {
    // minItems > maxItems is unsatisfiable; the smallest cast is the risky case.
    const schema = makeRelationshipSchema({
      characterNames: ['A', 'B'],
      locationNames: ['L'],
      threadTitles: ['T1', 'T2']
    })
    for (const key of schema.required) {
      const prop = schema.properties[key]
      expect(prop.maxItems).toBeGreaterThanOrEqual(prop.minItems)
    }
  })
})

describe('missingCategories', () => {
  const expected = ['characterRelationships', 'characterLocations', 'characterPlotThreads']

  it('names the categories a partial response left empty', () => {
    // This is the exact shape that produced orphaned nodes: character links
    // present, everything else absent. countAiConnections() sums all four and
    // saw a positive total, so the old gate accepted it as a success.
    const missing = missingCategories(
      { characterRelationships: [{ from: 'A', to: 'B', type: 'ally' }] },
      expected
    )
    expect(missing).toEqual(['characterLocations', 'characterPlotThreads'])
  })

  it('treats a full response as complete', () => {
    const missing = missingCategories(
      {
        characterRelationships: [{ from: 'A', to: 'B', type: 'ally' }],
        characterLocations: [{ character: 'A', location: 'L' }],
        characterPlotThreads: [{ character: 'A', plotThread: 'T' }]
      },
      expected
    )
    expect(missing).toEqual([])
  })

  it('treats a failed call as missing everything', () => {
    expect(missingCategories(null, expected)).toEqual(expected)
  })

  it('counts an explicitly empty array as missing', () => {
    const missing = missingCategories(
      { characterRelationships: [], characterLocations: [], characterPlotThreads: [] },
      expected
    )
    expect(missing).toEqual(expected)
  })
})

describe('estimateRelationshipTokens', () => {
  it('scales the budget with the cast rather than using a blind default', () => {
    const small = estimateRelationshipTokens({
      characterCount: 2,
      locationCount: 1,
      threadCount: 1
    })
    const large = estimateRelationshipTokens({
      characterCount: 20,
      locationCount: 10,
      threadCount: 8
    })
    expect(large).toBeGreaterThan(small)
  })

  it('never asks for so little that the response truncates', () => {
    expect(
      estimateRelationshipTokens({ characterCount: 2, locationCount: 0, threadCount: 0 })
    ).toBeGreaterThanOrEqual(1024)
  })

  it('stays well under the provider output cap for a huge cast', () => {
    const budget = estimateRelationshipTokens({
      characterCount: 100,
      locationCount: 50,
      threadCount: 40
    })
    expect(budget).toBeLessThanOrEqual(8192)
  })
})
