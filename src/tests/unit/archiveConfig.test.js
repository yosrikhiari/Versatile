import { describe, it, expect } from 'vitest'
import { SIGNAL, ARCHIVE_TYPES, CONTEXT_SOURCES, createDryRunPreview } from '../../config/archive'

describe('SIGNAL', () => {
  it('has the expected signals', () => {
    expect(SIGNAL.ACCEPTED).toBe('accepted')
    expect(SIGNAL.PARTIAL).toBe('partial')
    expect(SIGNAL.NEUTRAL).toBe('neutral')
    expect(SIGNAL.REJECTED).toBe('rejected')
  })
})

describe('ARCHIVE_TYPES', () => {
  it('has all expected types', () => {
    const types = ['spark_prompt', 'spark_outline', 'spark_content', 'polish_analysis',
      'polish_annotation', 'revise_comment', 'entity_generation', 'entity_enhance',
      'session_end', 'state_snapshot', 'manual_state']
    for (const t of types) {
      expect(Object.values(ARCHIVE_TYPES)).toContain(t)
    }
  })
})

describe('CONTEXT_SOURCES', () => {
  it('has expected sources', () => {
    expect(CONTEXT_SOURCES.AUTHOR_PROFILE).toBe('author_profile')
    expect(CONTEXT_SOURCES.STATE_SNAPSHOT).toBe('state_snapshot')
    expect(CONTEXT_SOURCES.ARCHIVE_ENTRY).toBe('archive_entry')
  })
})

describe('createDryRunPreview', () => {
  it('transforms contextPackage into preview format', () => {
    const pkg = {
      contextText: 'some text',
      sourceDescription: 'test source',
      previewLines: [
        { source: 'a', type: 'character', signal: 'accepted', summary: 'John' },
        { source: 'b', type: 'location', signal: null, summary: 'Town' }
      ]
    }
    const result = createDryRunPreview(pkg)
    expect(result.contextText).toBe('some text')
    expect(result.sourceDescription).toBe('test source')
    expect(result.previewLines).toHaveLength(2)
    expect(result.previewLines[0].signal).toBe('accepted')
    expect(result.previewLines[1].signal).toBeNull()
    expect(result.previewLines[1].summary).toBe('Town')
  })
})
