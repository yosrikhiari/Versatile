import { describe, it, expect } from 'vitest'
import {
  shapeContext,
  formatCharacter,
  formatLocation,
  formatPlotThread,
  buildEntityBlock
} from '../../composables/generation/shaping/index'

const mockContext = {
  entities: {
    characters: [],
    locations: [],
    plotThreads: []
  },
  project: {},
  relationships: '',
  manuscript: ''
}

describe('formatCharacter', () => {
  it('formats character with role and traits', () => {
    const result = formatCharacter({
      name: 'John',
      role: 'Hero',
      goal: 'Save the world',
      traits: ['brave', 'kind']
    })
    expect(result).toContain('"John"')
    expect(result).toContain('(Hero)')
    expect(result).toContain('Save the world')
    expect(result).toContain('[brave; kind]')
  })

  it('handles minimal character', () => {
    const result = formatCharacter({ name: 'Jane' })
    expect(result).toContain('"Jane"')
  })
})

describe('formatLocation', () => {
  it('formats location with description and traits', () => {
    const result = formatLocation({
      name: 'Forest',
      description: 'Dark woods',
      traits: ['magical']
    })
    expect(result).toContain('"Forest"')
    expect(result).toContain('Dark woods')
    expect(result).toContain('[magical]')
  })
})

describe('formatPlotThread', () => {
  it('formats plot thread with notes and traits', () => {
    const result = formatPlotThread({
      title: 'War',
      notes: 'Impending conflict',
      traits: ['political']
    })
    expect(result).toContain('"War"')
    expect(result).toContain('Impending conflict')
    expect(result).toContain('[political]')
  })
})

describe('buildEntityBlock', () => {
  it('returns empty for empty entities', () => {
    expect(buildEntityBlock([], 'characters', formatCharacter)).toBe('')
  })

  it('builds block with formatted entities', () => {
    const entities = [{ name: 'John', role: 'Hero' }]
    const result = buildEntityBlock(entities, 'characters', formatCharacter)
    expect(result).toContain('EXISTING CHARACTERS:')
    expect(result).toContain('John')
  })

  it('uses default heading for unknown labels', () => {
    const entities = [{ title: 'War' }]
    const result = buildEntityBlock(entities, 'plotThreads', formatPlotThread)
    expect(result).toContain('ACTIVE PLOT THREADS:')
  })
})

describe('shapeContext', () => {
  it('returns bundle with empty blocks when no data', () => {
    const result = shapeContext(mockContext)
    expect(result.projectBlock).toBe('')
    expect(result.charactersBlock).toBe('')
    expect(result.locationsBlock).toBe('')
    expect(result.plotThreadsBlock).toBe('')
    expect(result.relationshipsBlock).toBe('')
    expect(result.manuscriptBlock).toBe('')
  })

  it('includes project block when project has data', () => {
    const ctx = {
      ...mockContext,
      project: { category: 'Fantasy', description: 'A fantasy world' }
    }
    const result = shapeContext(ctx)
    expect(result.projectBlock).toContain('PROJECT CONTEXT:')
    expect(result.projectBlock).toContain('Fantasy')
    expect(result.projectBlock).toContain('A fantasy world')
  })

  it('includes manuscript block when manuscript present', () => {
    const ctx = { ...mockContext, manuscript: 'Once upon a time...' }
    const result = shapeContext(ctx)
    expect(result.manuscriptBlock).toContain('Once upon a time...')
  })

  it('sorts and limits entities', () => {
    const characters = Array.from({ length: 15 }, (_, i) => ({ name: `Char${i}`, lastEditedAt: i }))
    const ctx = { ...mockContext, entities: { ...mockContext.entities, characters } }
    const result = shapeContext(ctx)
    expect(result.charactersBlock).toContain('EXISTING CHARACTERS:')
  })
})
