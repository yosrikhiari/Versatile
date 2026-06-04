import { describe, it, expect } from 'vitest'
import { getFullText, getTitle, sanitizeFilename } from '@/composables/useStoryExport'

describe('getFullText', () => {
  it('returns fullText when present', () => {
    expect(getFullText({ fullText: 'hello world' })).toBe('hello world')
  })

  it('joins scene prose when no fullText', () => {
    const story = { scenes: [{ prose: 'Scene 1' }, { prose: 'Scene 2' }] }
    expect(getFullText(story)).toBe('Scene 1\n\nScene 2')
  })

  it('returns empty for story without text or scenes', () => {
    expect(getFullText({})).toBe('')
    expect(getFullText({ fullText: '', scenes: [] })).toBe('')
  })
})

describe('getTitle', () => {
  it('returns story title', () => {
    expect(getTitle({ title: 'My Story' })).toBe('My Story')
  })

  it('returns Untitled when no title', () => {
    expect(getTitle({})).toBe('Untitled')
  })
})

describe('sanitizeFilename', () => {
  it('replaces special chars', () => {
    expect(sanitizeFilename('Hello World!')).toBe('Hello_World')
  })

  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('My Great Story')).toBe('My_Great_Story')
  })

  it('trims whitespace', () => {
    expect(sanitizeFilename('  Title  ')).toBe('Title')
  })

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('')
  })
})
