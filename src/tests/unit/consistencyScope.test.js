import { describe, it, expect } from 'vitest'
import {
  scopeEntitiesToScenes,
  entitiesToRecheck
} from '@/composables/generation/consistency/ConsistencyService'

// The audit is one model call per entity. These pin the two filters that keep
// it from re-auditing the whole cast at every chapter boundary and after every
// fix round.

const chars = [{ name: 'Ines' }, { name: 'Tomas' }, { name: 'The Harbourmaster' }]
const locs = [{ name: 'The Docks' }, { name: 'Customs Shed' }, { name: 'The Skiff' }]

describe('scopeEntitiesToScenes', () => {
  it('keeps only entities the given scenes touch', () => {
    const scenes = [
      { characters: ['Ines'], location: 'The Docks' },
      { charactersPresent: ['tomas '], location: '' }
    ]
    const { characters, locations } = scopeEntitiesToScenes(chars, locs, scenes)
    expect(characters.map((c) => c.name)).toEqual(['Ines', 'Tomas'])
    expect(locations.map((l) => l.name)).toEqual(['The Docks'])
  })

  it('returns nothing for no scenes, and tolerates holes', () => {
    expect(scopeEntitiesToScenes(chars, locs, [])).toEqual({ characters: [], locations: [] })
    expect(scopeEntitiesToScenes(chars, locs, [null, undefined])).toEqual({
      characters: [],
      locations: []
    })
  })
})

describe('entitiesToRecheck', () => {
  const report = {
    characterIssues: [{ character: 'Ines', contradictions: ['x'] }],
    locationIssues: [{ location: 'the skiff', contradictions: ['y'] }]
  }

  it('rechecks what was flagged', () => {
    const { characters, locations } = entitiesToRecheck(report, chars, locs)
    expect(characters.map((c) => c.name)).toEqual(['Ines'])
    expect(locations.map((l) => l.name)).toEqual(['The Skiff'])
  })

  it('also rechecks whatever the rewritten scenes touch', () => {
    const rewritten = [{ characters: ['The Harbourmaster'], location: 'Customs Shed' }]
    const { characters, locations } = entitiesToRecheck(report, chars, locs, rewritten)
    expect(characters.map((c) => c.name)).toEqual(['Ines', 'The Harbourmaster'])
    expect(locations.map((l) => l.name)).toEqual(['Customs Shed', 'The Skiff'])
  })

  it('rechecks nothing for a clean report and no rewrites', () => {
    expect(entitiesToRecheck({ characterIssues: [], locationIssues: [] }, chars, locs)).toEqual({
      characters: [],
      locations: []
    })
  })
})

describe('scenesCarryCast', () => {
  it('is false when no scene names anyone or anywhere — the audit then covers everything', async () => {
    const { scenesCarryCast } =
      await import('@/composables/generation/consistency/ConsistencyService')
    expect(scenesCarryCast([{ prose: 'x' }, null])).toBe(false)
    expect(scenesCarryCast([{ prose: 'x', characters: ['Ines'] }])).toBe(true)
    expect(scenesCarryCast([{ prose: 'x', location: 'The Docks' }])).toBe(true)
  })
})
