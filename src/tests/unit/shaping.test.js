import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./relevance', () => ({ sortByRelevance: vi.fn((arr) => arr) }))
vi.mock('./tokenBudget', () => ({ applyTokenBudget: vi.fn((bundle) => bundle) }))

let buildEntityBlock, formatCharacter, formatLocation, formatPlotThread
beforeEach(async () => {
  vi.resetModules()
  const mod = await import('@/composables/generation/shaping/index')
  buildEntityBlock = mod.buildEntityBlock
  formatCharacter = mod.formatCharacter
  formatLocation = mod.formatLocation
  formatPlotThread = mod.formatPlotThread
})

describe('formatCharacter', () => {
  it('formats with role and goal', () => {
    const c = { name: 'John', role: 'Hero', goal: 'Save the kingdom from darkness' }
    const result = formatCharacter(c)
    expect(result).toContain('John')
    expect(result).toContain('(Hero)')
    expect(result).toContain('Save the kingdom')
  })

  it('handles missing role and goal', () => {
    expect(formatCharacter({ name: 'Jane' })).toBe('- "Jane"')
  })

  it('truncates goal to 80 chars', () => {
    const longGoal = 'x'.repeat(100)
    const result = formatCharacter({ name: 'X', goal: longGoal })
    expect(result.length).toBeLessThan(100)
  })
})

describe('formatLocation', () => {
  it('formats with description', () => {
    const l = { name: 'Forest', description: 'A dark and mysterious forest' }
    expect(formatLocation(l)).toContain('Forest')
    expect(formatLocation(l)).toContain('A dark and mysterious forest')
  })

  it('handles missing description', () => {
    expect(formatLocation({ name: 'Cave' })).toBe('- "Cave"')
  })
})

describe('formatPlotThread', () => {
  it('formats with notes', () => {
    const t = { title: 'Main Plot', notes: 'The hero journey' }
    expect(formatPlotThread(t)).toContain('Main Plot')
    expect(formatPlotThread(t)).toContain('The hero journey')
  })

  it('handles missing notes', () => {
    expect(formatPlotThread({ title: 'Subplot' })).toBe('- "Subplot"')
  })
})

describe('buildEntityBlock', () => {
  it('returns empty for empty entities', () => {
    expect(buildEntityBlock([], 'characters', formatCharacter)).toBe('')
  })

  it('builds entity block with heading and formatted items', () => {
    const entities = [{ name: 'John' }, { name: 'Jane' }]
    const result = buildEntityBlock(entities, 'characters', formatCharacter)
    expect(result).toContain('EXISTING CHARACTERS:')
    expect(result).toContain('John')
    expect(result).toContain('Jane')
  })

  it('uses default heading for plotThreads label', () => {
    const result = buildEntityBlock([{ title: 'Plot' }], 'plotThreads', formatPlotThread)
    expect(result).toContain('ACTIVE PLOT THREADS:')
  })
})
