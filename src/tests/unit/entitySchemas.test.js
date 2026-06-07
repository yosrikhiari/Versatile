import { describe, it, expect } from 'vitest'
import { entitySchemaRegistry } from '../../composables/generation/schemas/index'

describe('entitySchemaRegistry', () => {
  it('has character, location, and plotThread', () => {
    expect(entitySchemaRegistry.character).toBeDefined()
    expect(entitySchemaRegistry.location).toBeDefined()
    expect(entitySchemaRegistry.plotThread).toBeDefined()
  })

  it('character schema has expected shape', () => {
    const s = entitySchemaRegistry.character
    expect(s.type).toBe('character')
    expect(s.promptKeys).toContain('name')
    expect(s.promptKeys).toContain('role')
    expect(s.fieldConstraints).toBe('character')
  })

  it('location schema has expected shape', () => {
    const s = entitySchemaRegistry.location
    expect(s.type).toBe('location')
    expect(s.promptKeys).toContain('description')
    expect(s.fieldConstraints).toBe('location')
  })

  it('plotThread schema has expected shape', () => {
    const s = entitySchemaRegistry.plotThread
    expect(s.type).toBe('plotThread')
    expect(s.promptKeys).toContain('title')
    expect(s.fieldConstraints).toBe('plotThread')
  })
})
