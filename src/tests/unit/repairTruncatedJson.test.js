import { describe, it, expect } from 'vitest'
import { repairTruncatedJson } from '@/services/ai/aiHelpers'

describe('repairTruncatedJson', () => {
  it('returns well-formed JSON unchanged', () => {
    expect(repairTruncatedJson('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] })
  })

  it('recovers completed chapters from a plan cut off mid-object', () => {
    // The real failure: grammar-constrained output hits num_predict partway
    // through chapter 3. Chapters 1-2 are complete and must survive.
    const truncated = `{"chapters":[
      {"chapterNumber":1,"title":"The Arrival","hookEnding":"A knock at midnight"},
      {"chapterNumber":2,"title":"Cold Water","hookEnding":"The boat is gone"},
      {"chapterNumber":3,"title":"Half Writ`
    const repaired = repairTruncatedJson(truncated)
    expect(repaired.chapters).toHaveLength(2)
    expect(repaired.chapters[1].title).toBe('Cold Water')
  })

  it('drops a trailing element cut off after a complete field', () => {
    const truncated = '{"scenes":[{"title":"One","tension":"high"},{"title":"Two",'
    const repaired = repairTruncatedJson(truncated)
    expect(repaired.scenes).toHaveLength(1)
    expect(repaired.scenes[0].title).toBe('One')
  })

  it('closes a nested object left open', () => {
    const truncated = '{"storyArc":{"premise":"A drowned town","genre":"Gothic"'
    const repaired = repairTruncatedJson(truncated)
    expect(repaired.storyArc.genre).toBe('Gothic')
  })

  it('strips a markdown fence before repairing', () => {
    const truncated = '```json\n{"chapters":[{"title":"Only One"}'
    const repaired = repairTruncatedJson(truncated)
    expect(repaired.chapters[0].title).toBe('Only One')
  })

  it('handles braces and brackets inside string values', () => {
    const truncated = '{"chapters":[{"title":"A } tricky [ title","goal":"esc\\"aped"}'
    const repaired = repairTruncatedJson(truncated)
    expect(repaired.chapters[0].title).toBe('A } tricky [ title')
    expect(repaired.chapters[0].goal).toBe('esc"aped')
  })

  it('returns null when there is nothing recoverable', () => {
    expect(repairTruncatedJson('not json at all')).toBeNull()
    expect(repairTruncatedJson('')).toBeNull()
    expect(repairTruncatedJson(null)).toBeNull()
    expect(repairTruncatedJson(undefined)).toBeNull()
  })

  it('recovers an empty array rather than failing outright', () => {
    expect(repairTruncatedJson('{"chapters":[')).toEqual({ chapters: [] })
  })
})
