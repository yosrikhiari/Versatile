import { describe, it, expect } from 'vitest'
import { extractDoc, summarizeLog } from '@/composables/useStoryWriter'

describe('extractDoc', () => {
  it('extracts section by heading', () => {
    const doc = `# Style Guide\nWrite in third person.\n\n# Characters\nJohn is brave.`
    const result = extractDoc(doc, 'Style Guide')
    expect(result).toContain('Style Guide')
    expect(result).toContain('Write in third person.')
  })

  it('returns empty string for empty input', () => {
    expect(extractDoc('', 'Style Guide')).toBe('')
    expect(extractDoc(null, 'Style Guide')).toBe('')
  })

  it('returns empty string for missing heading', () => {
    const result = extractDoc('# Something Else\nContent', 'Style Guide')
    expect(result).toBe('')
  })

  it('stops at the next heading', () => {
    const doc = `# Section A\nContent A\n\n# Section B\nContent B`
    const result = extractDoc(doc, 'Section A')
    expect(result).not.toContain('Section B')
    expect(result).toContain('Content A')
  })
})

describe('summarizeLog', () => {
  it('returns empty for non-array input', () => {
    expect(summarizeLog(null)).toBe('')
    expect(summarizeLog(undefined)).toBe('')
    expect(summarizeLog('string')).toBe('')
  })

  it('joins short logs', () => {
    const result = summarizeLog(['scene 1', 'scene 2'])
    expect(result).toBe('scene 1\nscene 2')
  })

  it('summarizes long logs with count', () => {
    const log = ['s1', 's2', 's3', 's4', 's5', 's6']
    const result = summarizeLog(log)
    expect(result).toContain('s4')
    expect(result).toContain('s5')
    expect(result).toContain('s6')
    expect(result).toContain('(... plus 3 earlier scenes summarized)')
  })

  it('returns empty for empty array', () => {
    expect(summarizeLog([])).toBe('')
  })
})
