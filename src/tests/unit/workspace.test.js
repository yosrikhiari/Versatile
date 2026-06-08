import { describe, it, expect } from 'vitest'
import {
  WORKSPACE_TYPES,
  WORKSPACE_LABELS,
  WORKSPACE_ICONS,
  WORKSPACE_DESCRIPTIONS,
  WORKSPACE_TERMINOLOGY
} from '@/config/workspace'

describe('workspace config exports', () => {
  it('exports all expected objects', () => {
    expect(WORKSPACE_TYPES).toBeTypeOf('object')
    expect(WORKSPACE_LABELS).toBeTypeOf('object')
    expect(WORKSPACE_ICONS).toBeTypeOf('object')
    expect(WORKSPACE_DESCRIPTIONS).toBeTypeOf('object')
    expect(WORKSPACE_TERMINOLOGY).toBeTypeOf('object')
  })
})

describe('WORKSPACE_TYPES', () => {
  const expectedKeys = [
    'CREATIVE', 'NOVEL', 'SCREENPLAY', 'INVOICE', 'PRESENTATION',
    'EMAIL', 'DOCUMENTATION', 'PRESS_RELEASE', 'GRANT', 'MEETING',
    'CASE_STUDY', 'GENERAL', 'LEGAL', 'TECHNICAL', 'BUSINESS', 'RESEARCH'
  ]

  it('has all expected keys', () => {
    expect(Object.keys(WORKSPACE_TYPES).sort()).toEqual([...expectedKeys].sort())
  })

  it('maps keys to correct type strings', () => {
    expect(WORKSPACE_TYPES.CREATIVE).toBe('creative')
    expect(WORKSPACE_TYPES.NOVEL).toBe('novel')
    expect(WORKSPACE_TYPES.SCREENPLAY).toBe('screenplay')
    expect(WORKSPACE_TYPES.INVOICE).toBe('invoice')
    expect(WORKSPACE_TYPES.PRESENTATION).toBe('presentation')
    expect(WORKSPACE_TYPES.EMAIL).toBe('email')
    expect(WORKSPACE_TYPES.DOCUMENTATION).toBe('documentation')
    expect(WORKSPACE_TYPES.PRESS_RELEASE).toBe('pressRelease')
    expect(WORKSPACE_TYPES.GRANT).toBe('grant')
    expect(WORKSPACE_TYPES.MEETING).toBe('meeting')
    expect(WORKSPACE_TYPES.CASE_STUDY).toBe('caseStudy')
    expect(WORKSPACE_TYPES.GENERAL).toBe('general')
    expect(WORKSPACE_TYPES.LEGAL).toBe('legal')
    expect(WORKSPACE_TYPES.TECHNICAL).toBe('technical')
    expect(WORKSPACE_TYPES.BUSINESS).toBe('business')
    expect(WORKSPACE_TYPES.RESEARCH).toBe('research')
  })
})

describe('WORKSPACE_LABELS', () => {
  it('has correct labels for each type', () => {
    expect(WORKSPACE_LABELS.creative).toBe('Creative Writing')
    expect(WORKSPACE_LABELS.novel).toBe('Novel')
    expect(WORKSPACE_LABELS.screenplay).toBe('Screenplay / Script')
    expect(WORKSPACE_LABELS.invoice).toBe('Invoice')
    expect(WORKSPACE_LABELS.presentation).toBe('Presentation / Slide Deck')
    expect(WORKSPACE_LABELS.email).toBe('Email Campaign')
    expect(WORKSPACE_LABELS.documentation).toBe('User Guide / Documentation')
    expect(WORKSPACE_LABELS.pressRelease).toBe('Press Release')
    expect(WORKSPACE_LABELS.grant).toBe('Grant Proposal')
    expect(WORKSPACE_LABELS.meeting).toBe('Meeting Notes / Minutes')
    expect(WORKSPACE_LABELS.caseStudy).toBe('Case Study')
    expect(WORKSPACE_LABELS.general).toBe('General Document')
    expect(WORKSPACE_LABELS.legal).toBe('Legal Contracts & Agreements')
    expect(WORKSPACE_LABELS.technical).toBe('Technical Specifications')
    expect(WORKSPACE_LABELS.business).toBe('Business Reports & Documentation')
    expect(WORKSPACE_LABELS.research).toBe('Research & Academic Papers')
  })

  it('has the same number of entries as WORKSPACE_TYPES', () => {
    expect(Object.keys(WORKSPACE_LABELS).length).toBe(Object.keys(WORKSPACE_TYPES).length)
  })
})

describe('WORKSPACE_ICONS', () => {
  it('has string values for all entries', () => {
    for (const icon of Object.values(WORKSPACE_ICONS)) {
      expect(icon).toBeTypeOf('string')
    }
  })

  it('has the same number of entries as WORKSPACE_TYPES', () => {
    expect(Object.keys(WORKSPACE_ICONS).length).toBe(Object.keys(WORKSPACE_TYPES).length)
  })
})

describe('WORKSPACE_DESCRIPTIONS', () => {
  it('has string values for all entries', () => {
    for (const desc of Object.values(WORKSPACE_DESCRIPTIONS)) {
      expect(desc).toBeTypeOf('string')
    }
  })

  it('has the same number of entries as WORKSPACE_TYPES', () => {
    expect(Object.keys(WORKSPACE_DESCRIPTIONS).length).toBe(Object.keys(WORKSPACE_TYPES).length)
  })
})

describe('WORKSPACE_TERMINOLOGY', () => {
  const expectedKeys = ['bible', 'sections', 'generator', 'generatorLabel', 'entityLabel', 'characters', 'characterRole', 'locations', 'plotThreads', 'synopsisLabel']

  it('has entries for each workspace type', () => {
    for (const type of Object.keys(WORKSPACE_LABELS)) {
      expect(WORKSPACE_TERMINOLOGY[type]).toBeTypeOf('object')
    }
  })

  it('each terminology entry has expected nested keys with string values', () => {
    for (const term of Object.values(WORKSPACE_TERMINOLOGY)) {
      for (const key of expectedKeys) {
        expect(term).toHaveProperty(key)
        expect(term[key]).toBeTypeOf('string')
      }
    }
  })

  it('has the same number of entries as WORKSPACE_TYPES', () => {
    expect(Object.keys(WORKSPACE_TERMINOLOGY).length).toBe(Object.keys(WORKSPACE_TYPES).length)
  })
})
