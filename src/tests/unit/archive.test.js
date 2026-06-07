import { describe, it, expect } from 'vitest'
import { SIGNAL, ARCHIVE_TYPES, CONTEXT_SOURCES, createDryRunPreview } from '../../config/archive'

describe('archive config', () => {
  describe('SIGNAL', () => {
    it('defines ACCEPTED', () => {
      expect(SIGNAL.ACCEPTED).toBe('accepted')
    })

    it('defines REJECTED', () => {
      expect(SIGNAL.REJECTED).toBe('rejected')
    })
  })

  describe('ARCHIVE_TYPES', () => {
    it('defines SPARK_PROMPT', () => {
      expect(ARCHIVE_TYPES.SPARK_PROMPT).toBe('spark_prompt')
    })

    it('defines ENTITY_GENERATION', () => {
      expect(ARCHIVE_TYPES.ENTITY_GENERATION).toBe('entity_generation')
    })
  })

  describe('CONTEXT_SOURCES', () => {
    it('defines AUTHOR_PROFILE', () => {
      expect(CONTEXT_SOURCES.AUTHOR_PROFILE).toBe('author_profile')
    })

    it('defines STATE_SNAPSHOT', () => {
      expect(CONTEXT_SOURCES.STATE_SNAPSHOT).toBe('state_snapshot')
    })
  })

  describe('createDryRunPreview', () => {
    it('transforms contextPackage into preview', () => {
      const pkg = {
        contextText: 'some context',
        sourceDescription: 'test source',
        previewLines: [
          { source: 'src1', type: 'type1', signal: 'accepted', summary: 'line 1' },
          { source: 'src2', type: 'type2', signal: null, summary: 'line 2' }
        ]
      }
      const result = createDryRunPreview(pkg)
      expect(result.contextText).toBe('some context')
      expect(result.sourceDescription).toBe('test source')
      expect(result.previewLines).toHaveLength(2)
      expect(result.previewLines[0].signal).toBe('accepted')
      expect(result.previewLines[1].signal).toBeNull()
    })

    it('handles previewLines without signal', () => {
      const pkg = {
        contextText: 'text',
        sourceDescription: 'desc',
        previewLines: [{ source: 's', type: 't', summary: 'summary' }]
      }
      const result = createDryRunPreview(pkg)
      expect(result.previewLines[0].signal).toBeNull()
    })
  })
})
