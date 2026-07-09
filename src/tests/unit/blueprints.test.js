import { describe, it, expect } from 'vitest'
import { BLUEPRINTS, CREATIVE_BLUEPRINTS } from '@/config/blueprints'

describe('BLUEPRINTS', () => {
  it('is exported as an object', () => {
    expect(BLUEPRINTS).toBeTypeOf('object')
  })

  const expectedTypes = [
    'novel',
    'screenplay',
    'invoice',
    'presentation',
    'email',
    'documentation',
    'pressRelease',
    'grant',
    'meeting',
    'caseStudy',
    'general',
    'creative',
    'legal',
    'technical',
    'business',
    'research'
  ]

  it('has entries for all workspace types', () => {
    for (const type of expectedTypes) {
      expect(BLUEPRINTS).toHaveProperty(type)
      expect(Array.isArray(BLUEPRINTS[type])).toBe(true)
    }
  })

  it('each type has at least one blueprint', () => {
    for (const type of expectedTypes) {
      expect(BLUEPRINTS[type].length).toBeGreaterThan(0)
    }
  })

  it('each blueprint has the expected structure', () => {
    for (const type of expectedTypes) {
      for (const blueprint of BLUEPRINTS[type]) {
        expect(blueprint).toHaveProperty('id')
        expect(blueprint).toHaveProperty('name')
        expect(blueprint).toHaveProperty('description')
        expect(blueprint).toHaveProperty('sections')
        expect(blueprint.id).toBeTypeOf('string')
        expect(blueprint.name).toBeTypeOf('string')
        expect(blueprint.description).toBeTypeOf('string')
        expect(Array.isArray(blueprint.sections)).toBe(true)
      }
    }
  })

  it('each section has title, summary, and subsections array', () => {
    for (const type of expectedTypes) {
      for (const blueprint of BLUEPRINTS[type]) {
        for (const section of blueprint.sections) {
          expect(section).toHaveProperty('title')
          expect(section).toHaveProperty('summary')
          expect(section).toHaveProperty('subsections')
          expect(section.title).toBeTypeOf('string')
          expect(section.summary).toBeTypeOf('string')
          expect(Array.isArray(section.subsections)).toBe(true)
        }
      }
    }
  })

  it('each subsection has title, summary, and content', () => {
    for (const type of expectedTypes) {
      for (const blueprint of BLUEPRINTS[type]) {
        for (const section of blueprint.sections) {
          for (const subsection of section.subsections) {
            expect(subsection).toHaveProperty('title')
            expect(subsection).toHaveProperty('summary')
            expect(subsection).toHaveProperty('content')
            expect(subsection.title).toBeTypeOf('string')
            expect(subsection.summary).toBeTypeOf('string')
            expect(subsection.content).toBeTypeOf('string')
          }
        }
      }
    }
  })
})

describe('CREATIVE_BLUEPRINTS', () => {
  it('is exported as an object', () => {
    expect(CREATIVE_BLUEPRINTS).toBeTypeOf('object')
  })

  it('has exactly 3 keys', () => {
    expect(Object.keys(CREATIVE_BLUEPRINTS).length).toBe(3)
  })

  it('has entries for creative, novel, and screenplay', () => {
    expect(CREATIVE_BLUEPRINTS).toHaveProperty('creative')
    expect(CREATIVE_BLUEPRINTS).toHaveProperty('novel')
    expect(CREATIVE_BLUEPRINTS).toHaveProperty('screenplay')
  })

  it('does not contain non-creative types', () => {
    expect(CREATIVE_BLUEPRINTS).not.toHaveProperty('legal')
    expect(CREATIVE_BLUEPRINTS).not.toHaveProperty('general')
  })

  it('each type has at least one blueprint', () => {
    for (const type of ['creative', 'novel', 'screenplay']) {
      expect(CREATIVE_BLUEPRINTS[type].length).toBeGreaterThan(0)
    }
  })

  it('each blueprint has the expected structure', () => {
    for (const type of ['creative', 'novel', 'screenplay']) {
      for (const blueprint of CREATIVE_BLUEPRINTS[type]) {
        expect(blueprint).toHaveProperty('id')
        expect(blueprint).toHaveProperty('name')
        expect(blueprint).toHaveProperty('description')
        expect(blueprint).toHaveProperty('sections')
        expect(blueprint.id).toBeTypeOf('string')
        expect(blueprint.name).toBeTypeOf('string')
        expect(blueprint.description).toBeTypeOf('string')
        expect(Array.isArray(blueprint.sections)).toBe(true)
      }
    }
  })
})
